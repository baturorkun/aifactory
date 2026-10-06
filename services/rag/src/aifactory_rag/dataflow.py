"""Data-flow and coupling questions about code, answered by Joern (RQ-0025, RQ-0032).

Joern runs as the `joern` service of infra/rag/compose.yaml, in server mode on
the loopback interface. A script sent to `/query-sync` runs in its console;
the reply carries only the console echo, so every script here writes its
result as JSON into the shared workspace and the RAG reads that file.

Each code input of a source marked for data-flow gets one code property graph
(a Joern project) per language family it holds - C/C++, TypeScript/JavaScript,
C# - each built by that family's frontend and named after the input, the state
it was built from and the family, so a new commit builds new graphs and the
old ones are deleted. The prepared queries that mean something for a family
then run against its projects.

Joern is not a qualified tool (DO-330): its findings guide the engineer and
point at code, and every answer built on them says so.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

NOTICE = (
    "Joern is not a qualified tool (DO-330): these findings guide review and point at code; "
    "they are not certification evidence."
)
QUERIES = ("unchecked-input", "shared-state", "coupling")

# Language families: the Joern frontend that builds each, and the prepared
# queries that apply to it. `shared-state` is about interrupt handlers: C only.
FAMILIES = ("c", "js", "cs")
FAMILY_NAMES = {"c": "C/C++", "js": "TypeScript/JavaScript", "cs": "C#"}
FRONTENDS = {"c": "c", "js": "jssrc", "cs": "csharpsrc"}
FAMILY_QUERIES = {"c": QUERIES, "js": ("unchecked-input", "coupling"), "cs": ("unchecked-input", "coupling")}
_FAMILY_BY_LANGUAGE = {"c": "c", "cpp": "c", "javascript": "js", "typescript": "js", "tsx": "js", "csharp": "cs"}

DEFAULT_SOURCES = r"(?i).*(read|receive|recv|rx).*"
DEFAULT_SINKS = r"memcpy|memmove|memset"
DEFAULT_ISR = r"(?i).*(_irqhandler|isr).*"
DEFAULT_CRITICAL = r"(?i).*(disable_irq|disableirq|disable_interrupt|enter_critical|set_primask).*"
DEFAULT_EXCLUDE = r".*(/|^)(thirdParty|third_party|vendor|node_modules|dist|build)/.*"
# TypeScript/JavaScript: numbers read from a file's bytes, and where an offset,
# a length or a size goes. A call matching the sinks is checked at every
# argument after the receiver; `new` of an array or a buffer at its size.
DEFAULT_JS_SOURCES = r"(?i)(get(U?Int|Float|BigU?Int)\d+|read(U?Int|Float|Double|BigU?Int)\w*|parseInt|parseFloat)"
DEFAULT_JS_SINKS = (
    r"slice|subarray|copy|copyWithin|fill|alloc|allocUnsafe|"
    r"(get|set)(U?Int|Float|BigU?Int)\d+|(read|write)(U?Int|Float|Double|BigU?Int)\w*"
)
# C#: the parameters of the bus access methods of a Renode peripheral and of
# the callbacks given to its register definitions, and where they index,
# copy or size.
DEFAULT_CS_SOURCES = r"Write(Byte|Word|DoubleWord|QuadWord)?"
DEFAULT_CS_CALLBACKS = r"With\w*"
DEFAULT_CS_SINKS = r"Copy|BlockCopy|ConstrainedCopy|CopyTo|Fill|Slice|AsSpan|GetRange|RemoveRange|InsertRange|ElementAt"
_DEFAULTS = {
    "c": {"SOURCES": DEFAULT_SOURCES, "SINKS": DEFAULT_SINKS, "ISR": DEFAULT_ISR, "CRITICAL": DEFAULT_CRITICAL, "GLOBALS": "<global>"},
    "js": {"SOURCES": DEFAULT_JS_SOURCES, "SINKS": DEFAULT_JS_SINKS, "GLOBALS": ":program"},
    "cs": {"SOURCES": DEFAULT_CS_SOURCES, "SINKS": DEFAULT_CS_SINKS, "CALLBACKS": DEFAULT_CS_CALLBACKS, "GLOBALS": "<global>"},
}

_ANSI = re.compile(r"\x1b\[[0-9;]*m")
# Joern serves one console: scripts run one after another, and each opens the
# project it needs first, but two scripts from this process must not interleave
# their open and their query.
_LOCK = threading.Lock()


class JoernError(RuntimeError):
    pass


@dataclass(frozen=True)
class JoernSettings:
    url: str = "http://127.0.0.1:8090"
    # The workspace as the RAG host sees it, and as the container mounts it.
    workspace: str = "/srv/rag-sources/joern"
    container_workspace: str = "/workspace"
    timeout_seconds: float = 900.0


def scala_string(value: str) -> str:
    """A Scala string literal: JSON escaping is valid Scala for these values."""
    return json.dumps(value)


def family_for(relative_path: str) -> str | None:
    """The language family a file's data-flow graph is built in, if any."""
    from aifactory_rag.ingest.code_chunker import language_for

    return _FAMILY_BY_LANGUAGE.get(language_for(relative_path) or "")


def project_name(input_key: str, state: str, family: str = "c") -> str:
    """`rag-<input>-<state>-<family>`: one graph per input, commit (or folder state) and family."""
    slug = re.sub(r"[^A-Za-z0-9]+", "-", input_key).strip("-").lower()[:60] or "input"
    return f"rag-{slug}-{state[:12]}-{family}"


def project_prefix(input_key: str) -> str:
    return project_name(input_key, "x", "c")[:-4]


def folder_state(files: list[tuple[str, int, float]]) -> str:
    """A fingerprint of a folder's code files of one family: path, size and modification time."""
    digest = hashlib.sha256()
    for path, size, modified in sorted(files):
        digest.update(f"{path}\0{size}\0{modified}\n".encode())
    return digest.hexdigest()


class JoernClient:
    def __init__(self, settings: JoernSettings) -> None:
        self.settings = settings

    def run(self, body: str) -> Any:
        """Run a script; it must write its result with `emit(...)`."""
        name = f"{uuid.uuid4().hex}.json"
        container_file = f"{self.settings.container_workspace}/out/{name}"
        host_file = Path(self.settings.workspace) / "out" / name
        host_file.parent.mkdir(parents=True, exist_ok=True)
        script = (
            f"def emit(value: ujson.Value): Unit = os.write.over(os.Path({scala_string(container_file)}), value.render())\n"
            f"{body}\n"
        )
        try:
            with _LOCK:
                response = httpx.post(
                    f"{self.settings.url}/query-sync", json={"query": script}, timeout=self.settings.timeout_seconds,
                )
        except httpx.HTTPError as exc:
            raise JoernError(f"Joern is not reachable at {self.settings.url}: {exc.__class__.__name__}") from None
        try:
            if not host_file.exists():
                echo = _ANSI.sub("", (response.json() or {}).get("stdout", ""))
                detail = " ".join(line.strip() for line in echo.splitlines() if "error" in line.lower())[-500:]
                raise JoernError(f"Joern produced no result: {detail or 'no detail'}")
            result = json.loads(host_file.read_text(encoding="utf-8"))
        finally:
            host_file.unlink(missing_ok=True)
        if isinstance(result, dict) and result.get("error"):
            raise JoernError(str(result["error"]))
        return result

    def ensure_project(self, name: str, input_path: str, exclude: str = DEFAULT_EXCLUDE, family: str = "c") -> bool:
        """Build the graph unless it exists; delete the input's older graphs of the family. True when built.

        A graph named before families existed (`rag-<input>-<state>`) counts
        as C, so the first family-named C graph replaces it.
        """
        if family not in FRONTENDS:
            raise ValueError(f"Unknown language family {family}; use one of {', '.join(FAMILIES)}")
        base = name[: -len(family) - 1] if name.endswith(f"-{family}") else name
        prefix = base.rsplit("-", 1)[0] + "-"
        result = self.run(f"""
val wanted = {scala_string(name)}
def familyOf(n: String) = if (n.endsWith("-js")) "js" else if (n.endsWith("-cs")) "cs" else "c"
val built = if (workspace.project(wanted).isDefined) false else {{
  importCode.{FRONTENDS[family]}(inputPath = {scala_string(input_path)}, projectName = wanted, args = List("--exclude-regex", {scala_string(exclude)}))
  true
}}
workspace.projects.map(_.name).filter(n => n.startsWith({scala_string(prefix)}) && n != wanted && familyOf(n) == {scala_string(family)}).toList.foreach(n => delete(n))
emit(ujson.Obj("built" -> built, "exists" -> workspace.project(wanted).isDefined))
""")
        if not result.get("exists"):
            raise JoernError(f"Joern could not build a graph of {input_path}")
        return bool(result.get("built"))

    def query(self, project: str, name: str, params: dict[str, str] | None = None, family: str = "c") -> dict[str, Any]:
        if name not in QUERIES:
            raise ValueError(f"Unknown data-flow query {name}; use one of {', '.join(QUERIES)}")
        if name not in FAMILY_QUERIES.get(family, ()):
            raise ValueError(f"{name} does not apply to {FAMILY_NAMES.get(family, family)} code")
        values = {
            "COMPONENT": "", **_DEFAULTS[family],
            **{key.upper(): value for key, value in (params or {}).items() if value},
        }
        body = _QUERIES[(family, name)] if (family, name) in _QUERIES else _QUERIES[name]
        for key, value in values.items():
            body = body.replace(f"__{key}__", scala_string(value))
        result = self.run(f"""
if (open({scala_string(project)}).isEmpty || project.name != {scala_string(project)}) {{
  emit(ujson.Obj("error" -> ("graph " + {scala_string(project)} + " is not available")))
}} else {{
{body}
}}
""")
        if family == "cs":
            _shift_lines(result, 1)  # csharpsrc2cpg (v4.0.644) numbers lines from 0
        return result


def _shift_lines(value: Any, offset: int) -> None:
    if isinstance(value, dict):
        if isinstance(value.get("line"), (int, float)) and value["line"] >= 0:
            value["line"] = int(value["line"]) + offset
        for item in value.values():
            _shift_lines(item, offset)
    elif isinstance(value, list):
        for item in value:
            _shift_lines(item, offset)


_PRELUDE = """
import io.shiftleft.codepropertygraph.generated.nodes.{AstNode, CfgNode, Identifier, Call, Method}
def where(e: AstNode) = { val l = e.location; ujson.Obj("file" -> l.filename, "method" -> l.methodShortName, "line" -> l.lineNumber.map(_.toInt).getOrElse(-1), "code" -> e.code.stripPrefix("<global> ").take(200)) }
"""

_UNCHECKED = _PRELUDE + """
val sourceRe = __SOURCES__
val boundOps = "<operator>.(lessThan|lessEqualsThan|greaterThan|greaterEqualsThan)"
def sources = cpg.call.name(sourceRe).filterNot(_.name.startsWith("<operator>")).flatMap(c => Iterator(c) ++ c.argument.isCall.name("<operator>.addressOf").argument)
def sinks = cpg.call.name("<operator>.(indirectIndexAccess|indexAccess)").argument(2) ++ cpg.call.name(__SINKS__).argument(3)
val bySink = sinks.reachableByFlows(sources).l.groupBy(f => (f.elements.last.location.filename, f.elements.last.lineNumber, f.elements.last.code))
val findings = bySink.values.toList.map(_.minBy(_.elements.size)).map { f =>
  val sink = f.elements.last
  val names = f.elements.collect { case i: Identifier => i.name }.toSet
  val guards = sink match {
    case c: CfgNode => c.dominatedBy.isCall.name(boundOps).code.l.filter(code => names.exists(n => code.contains(n)))
    case _ => Nil
  }
  (guards, ujson.Obj("kind" -> "unchecked-input", "sink" -> where(sink), "source" -> where(f.elements.head),
    "path" -> ujson.Arr(f.elements.map(where)*), "guards" -> ujson.Arr(guards.map(ujson.Str(_))*)))
}
emit(ujson.Obj(
  "findings" -> ujson.Arr(findings.filter(_._1.isEmpty).map(_._2).sortBy(o => (o("sink")("file").str, o("sink")("line").num))*),
  "checked" -> findings.count(_._1.nonEmpty)))
"""

_SHARED = _PRELUDE + """
val isrRe = __ISR__
val criticalRe = __CRITICAL__
val writeOps = "<operator>.(assignment.*|postIncrement|preIncrement|postDecrement|preDecrement)"
val globals = cpg.method.name("<global>").local.l.groupBy(_.name)
def isWrite(i: Identifier) = i.argumentIndex == 1 && (i.astParent match { case c: Call => c.name.matches(writeOps); case _ => false })
val accesses = cpg.identifier.filter(i => globals.contains(i.name) && i.method.name != "<global>").l
val shared = accesses.groupBy(_.name).toList.flatMap { case (name, uses) =>
  val (inIsr, outside) = uses.partition(_.method.name.matches(isrRe))
  if (!inIsr.exists(isWrite) || outside.isEmpty) None
  else {
    val declared = globals(name)
    val volatile = declared.exists(l => (l.code + " " + l.typeFullName).contains("volatile"))
    def use(i: Identifier) = where(i).obj ++ Map(
      "access" -> ujson.Str(if (isWrite(i)) "write" else "read"),
      "inInterrupt" -> ujson.Bool(i.method.name.matches(isrRe)),
      "criticalSection" -> ujson.Bool(i.method.call.name(criticalRe).nonEmpty))
    Some(ujson.Obj("kind" -> "shared-state", "variable" -> name, "volatile" -> volatile,
      "declaration" -> ujson.Str(declared.head.code),
      "accesses" -> ujson.Arr(uses.sortBy(i => (i.location.filename, i.lineNumber.getOrElse(0))).map(i => ujson.Obj.from(use(i)))*)))
  }
}
emit(ujson.Obj("findings" -> ujson.Arr(shared.sortBy(_("variable").str)*)))
"""

_UNCHECKED_JS = _PRELUDE + """
val sourceRe = __SOURCES__
val boundOps = "<operator>.(lessThan|lessEqualsThan|greaterThan|greaterEqualsThan)"
val allocRe = "(?s)new\\\\s+(Array|ArrayBuffer|SharedArrayBuffer|DataView|Buffer|(Ui|I)nt(8|16|32)(Clamped)?Array|Float(32|64)Array|Big(Ui|I)nt64Array)\\\\b.*"
def sources = cpg.call.name(sourceRe).filterNot(_.name.startsWith("<operator>"))
// jssrc2cpg carries no flow into an expression such as `table + i`, only
// into its identifiers: those are the sink points, reported as their call.
val sinkArgs = cpg.call.name("<operator>.indexAccess").l.flatMap(c => c.argument.filter(_.argumentIndex == 2).l.map(a => (c, a))) ++
  cpg.call.name(__SINKS__).l.flatMap(c => c.argument.filter(_.argumentIndex >= 1).l.map(a => (c, a))) ++
  cpg.call.name("<operator>.new").filter(_.code.matches(allocRe)).l.flatMap(c => c.argument.filter(_.argumentIndex >= 1).l.map(a => (c, a)))
val sinkOf = sinkArgs.flatMap { case (c, a) => a.ast.isIdentifier.l.map(i => i.id -> c) }.toMap
val points = cpg.identifier.filter(i => sinkOf.contains(i.id)).l
val bySink = points.reachableByFlows(sources).l.groupBy(f => sinkOf(f.elements.last.id))
def mentions(code: String, name: String) = ("\\\\b" + java.util.regex.Pattern.quote(name) + "\\\\b").r.findFirstIn(code).isDefined
// A sink is unchecked when one of the values reaching it is: a bound on the
// loop counter `i` says nothing of the `table` added to it.
val findings = bySink.toList.map { case (sink, flows) =>
  val bounds = sink.dominatedBy.isCall.name(boundOps).code.l
  val judged = flows.map { f =>
    val names = f.elements.collect { case i: Identifier => i.name }.toSet
    (f, bounds.filter(code => names.exists(n => mentions(code, n))))
  }
  val open = judged.filter(_._2.isEmpty)
  val (f, guards) = if (open.nonEmpty) (open.minBy(_._1.elements.size)._1, Nil) else judged.minBy(_._1.elements.size)
  (guards, ujson.Obj("kind" -> "unchecked-input", "sink" -> where(sink), "source" -> where(f.elements.head),
    "path" -> ujson.Arr((f.elements.map(where) :+ where(sink))*), "guards" -> ujson.Arr(guards.map(ujson.Str(_))*)))
}
emit(ujson.Obj(
  "findings" -> ujson.Arr(findings.filter(_._1.isEmpty).map(_._2).sortBy(o => (o("sink")("file").str, o("sink")("line").num))*),
  "checked" -> findings.count(_._1.nonEmpty)))
"""

# csharpsrc2cpg (Joern v4.0.644) does not link `var x = ...` to its local, so
# Joern's own data-flow stops at every declaration. A bus value is followed by
# name instead, within the method it arrives in: through assignments, to the
# index, copy and size arguments it reaches.
_UNCHECKED_CS = _PRELUDE + """
import io.shiftleft.codepropertygraph.generated.nodes.MethodParameterIn
def mentions(code: String, name: String) = ("\\\\b" + java.util.regex.Pattern.quote(name) + "\\\\b").r.findFirstIn(code).isDefined
val boundOps = "<operator>.(lessThan|lessEqualsThan|greaterThan|greaterEqualsThan)"
val entries: List[(Method, List[MethodParameterIn])] =
  cpg.method.name(__SOURCES__).isExternal(false).l.map(m => m -> m.parameter.nameNot("this").l) ++
  cpg.call.name(__CALLBACKS__).argument.isMethodRef.referencedMethod.l.map(m => m -> m.parameter.filterNot(_.name.matches("_+")).l)
val findings = entries.distinctBy(_._1.id).flatMap { case (m, params) =>
  val origin = scala.collection.mutable.Map.from(params.map(p => p.name -> p))
  val assigns = m.call.name("<operator>.assignment.*").l.flatMap(a =>
    a.argument(1).ast.isIdentifier.name.headOption.map(l => (l, a.argument(2).ast.isIdentifier.name.l)))
  var changed = true
  while (changed) {
    changed = false
    assigns.foreach { case (l, rs) => if (!origin.contains(l)) rs.find(origin.contains).foreach { r => origin(l) = origin(r); changed = true } }
  }
  val sinks = m.call.name("<operator>.indexAccess").l.flatMap(c => c.argument.filter(_.argumentIndex == 2).l.map(a => (c, a))) ++
    m.call.name(__SINKS__).l.flatMap(c => c.argument.filter(_.argumentIndex >= 1).l.map(a => (c, a)))
  sinks.groupBy(_._1).toList.flatMap { case (c, args) =>
    val names = args.flatMap(_._2.ast.isIdentifier.name.l).distinct.filter(origin.contains)
    if (names.isEmpty) None else {
      val bounds = c.dominatedBy.isCall.name(boundOps).code.l
      val open = names.filterNot(n => bounds.exists(code => mentions(code, n)))
      val guards = if (open.nonEmpty) Nil else bounds.filter(code => names.exists(n => mentions(code, n)))
      val source = origin((if (open.nonEmpty) open else names).head)
      Some((guards, ujson.Obj("kind" -> "unchecked-input", "sink" -> where(c), "source" -> where(source),
        "path" -> ujson.Arr(where(source), where(c)), "via" -> ujson.Arr(names.map(ujson.Str(_))*),
        "guards" -> ujson.Arr(guards.map(ujson.Str(_))*))))
    }
  }
}
emit(ujson.Obj(
  "findings" -> ujson.Arr(findings.filter(_._1.isEmpty).map(_._2).sortBy(o => (o("sink")("file").str, o("sink")("line").num))*),
  "checked" -> findings.count(_._1.nonEmpty)))
"""

_COUPLING = _PRELUDE + """
val only = __COMPONENT__
val globalMethod = __GLOBALS__
def component(file: String) = { val i = file.lastIndexOf('/'); if (i < 0) "." else file.substring(0, i) }
val definedGlobals = cpg.method.name(globalMethod).local.filterNot(_.code.contains("extern")).l.map(l => l.name -> component(l.method.filename.headOption.getOrElse(""))).toMap
val calls = cpg.call.filterNot(_.name.startsWith("<operator>")).l.flatMap { c =>
  c.callee.isExternal(false).l.headOption.map(m => (component(c.method.filename), component(m.filename), c, m))
}.filter { case (from, to, _, _) => from != to }
val data = cpg.identifier.filter(i => definedGlobals.contains(i.name) && i.method.name != globalMethod).l
  .map(i => (component(i.method.filename), definedGlobals(i.name), i)).filter { case (from, to, _) => from != to }
val pairs = (calls.map(c => (c._1, c._2)) ++ data.map(d => (d._1, d._2))).distinct
  .filter { case (from, to) => only.isEmpty || from == only || to == only }
val findings = pairs.sorted.map { case (from, to) =>
  ujson.Obj("kind" -> "coupling", "from" -> from, "to" -> to,
    "calls" -> ujson.Arr(calls.filter(c => c._1 == from && c._2 == to).map { case (_, _, c, m) =>
      val conditions = c.controlledBy.isCall.code.l.distinct
      ujson.Obj.from(where(c).obj ++ Map(
        "callee" -> ujson.Str(m.name), "signature" -> ujson.Str(m.code.takeWhile(_ != '{').trim.take(200)),
        "returnUsed" -> ujson.Bool(!c.astParent.isInstanceOf[io.shiftleft.codepropertygraph.generated.nodes.Block]),
        "conditional" -> ujson.Bool(conditions.nonEmpty), "conditions" -> ujson.Arr(conditions.map(ujson.Str(_))*)))
    }*),
    "globals" -> ujson.Arr(data.filter(d => d._1 == from && d._2 == to).groupBy(_._3.name).toList.sortBy(_._1).map { case (name, uses) =>
      ujson.Obj("variable" -> name, "uses" -> ujson.Arr(uses.map(u => where(u._3)).distinctBy(o => (o("file").str, o("line").num))*))
    }*))
}
emit(ujson.Obj("findings" -> ujson.Arr(findings*)))
"""

_QUERIES = {
    "unchecked-input": _UNCHECKED, "shared-state": _SHARED, "coupling": _COUPLING,
    ("js", "unchecked-input"): _UNCHECKED_JS, ("cs", "unchecked-input"): _UNCHECKED_CS,
}


# --- Answering: graphs of a source, prepared queries, links ------------------

QUESTION_KINDS = (
    ("shared-state", re.compile(r"(?i)\b(isr|interrupt|irq|kesme|volatile|race|critical section|shared (state|variable)|paylaşılan)")),
    ("unchecked-input", re.compile(
        r"(?i)(bound(s)? check|unchecked|overflow|out of bounds|taint|input validation|sınır kontrol|taşma|"
        r"reaches .*(memcpy|buffer|index)|(index|length|size) .*(from|off) the (bus|wire|uart|arinc))")),
    ("coupling", re.compile(r"(?i)(data coupling|control coupling|\bcoupling\b|bağlaşım|modül(ler)? arası|between (components|modules))")),
)


def classify(question: str) -> list[str]:
    """The prepared queries a question asks for, if it is a data-flow question."""
    return [name for name, pattern in QUESTION_KINDS if pattern.search(question)]


def source_params(source: Any, family: str = "c") -> dict[str, str]:
    """A source's own patterns for one family: the unsuffixed ones are C's."""
    if family == "c":
        return {
            key: value for key, value in (
                ("sources", getattr(source, "dataflow_sources", None)),
                ("sinks", getattr(source, "dataflow_sinks", None)),
                ("isr", getattr(source, "dataflow_isr", None)),
            ) if value
        }
    return {key: value for key, value in (getattr(source, "dataflow_families", None) or {}).get(family, {}).items() if value}


def run_dataflow(conn: Any, settings: JoernSettings, source: Any, query: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    """A prepared query over every graph of a source, with links into GitLab."""
    if query not in QUERIES:
        raise ValueError(f"Unknown data-flow query {query}; use one of {', '.join(QUERIES)}")
    with conn.cursor() as cur:
        cur.execute(
            "SELECT input_key, family, project, ref, commit_sha, repository_url FROM rag_dataflow_graphs "
            "WHERE source_id = %s ORDER BY input_key, family",
            (source.id,),
        )
        graphs = list(cur.fetchall())
    client = JoernClient(settings)
    inputs: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for graph in graphs:
        family = graph.get("family") or "c"
        if query not in FAMILY_QUERIES.get(family, ()):
            continue  # shared-state has no meaning for TypeScript or C#
        label = graph["input_key"] or "path"
        merged = {**source_params(source, family), **{k: v for k, v in (params or {}).items() if v}}
        try:
            result = client.query(graph["project"], query, merged, family)
        except JoernError as exc:
            errors.append({"input": label, "family": family, "error": str(exc)})
            continue
        findings = result.get("findings", [])
        for finding in findings:
            finding["family"] = family
        _link(findings, graph.get("repository_url"), graph.get("commit_sha"))
        inputs.append({
            "input": label, "family": family, "language": FAMILY_NAMES[family], "ref": graph.get("ref"),
            "commit": graph.get("commit_sha"), "findings": findings,
            **({"checked": result["checked"]} if "checked" in result else {}),
        })
    if not graphs:
        errors.append({"input": "(none)", "error": f"source {source.id} has no data-flow graph; set its DATAFLOW=on and ingest it"})
    return {"query": query, "sourceId": source.id, "notice": NOTICE, "inputs": inputs, "errors": errors}


def _link(value: Any, repository_url: str | None, commit: str | None) -> None:
    """Give every location (a dict with file and line) a GitLab link at the graph's commit."""
    if not repository_url or not commit or not str(repository_url).startswith(("http://", "https://")):
        return
    if isinstance(value, dict):
        if isinstance(value.get("file"), str) and isinstance(value.get("line"), (int, float)) and value["line"] > 0:
            from urllib.parse import quote

            value["webUrl"] = f"{repository_url}/-/blob/{commit}/{quote(value['file'])}#L{int(value['line'])}"
        for item in value.values():
            _link(item, repository_url, commit)
    elif isinstance(value, list):
        for item in value:
            _link(item, repository_url, commit)


def describe(finding: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """A finding as context text for the answer, and the location it is cited at."""
    text, anchor = _describe(finding)
    family = finding.get("family")
    return (f"({FAMILY_NAMES[family]}) {text}" if family in FAMILY_NAMES else text), anchor


def _describe(finding: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    kind = finding.get("kind")
    if kind == "unchecked-input":
        sink, origin = finding["sink"], finding["source"]
        steps = " -> ".join(f"{s['file']}:{s['line']} {s['code']}" for s in finding.get("path", [])[:12])
        return (
            f"{sink['file']}:{sink['line']} in {sink['method']}: `{sink['code']}` is used as an index, offset or size "
            f"with no bound check dominating it; the value comes from `{origin['code']}` at {origin['file']}:{origin['line']}.\n"
            f"Path: {steps}",
            sink,
        )
    if kind == "shared-state":
        lines = "; ".join(
            f"{a['access']} in {a['method']} at {a['file']}:{a['line']}"
            f"{' (interrupt)' if a.get('inInterrupt') else ''}{' (critical section)' if a.get('criticalSection') else ''}"
            for a in finding.get("accesses", [])
        )
        anchor = next((a for a in finding.get("accesses", []) if not a.get("inInterrupt")), (finding.get("accesses") or [{}])[0])
        return (
            f"`{finding['variable']}` ({finding.get('declaration', '')}) is written in an interrupt handler and used outside it; "
            f"{'declared volatile' if finding.get('volatile') else 'NOT declared volatile'}. Accesses: {lines}",
            anchor,
        )
    calls = "; ".join(
        f"{c['method']} calls {c['callee']} at {c['file']}:{c['line']}"
        f"{' when ' + ' and '.join(c['conditions']) if c.get('conditional') else ' unconditionally'}"
        for c in finding.get("calls", [])
    )
    data = "; ".join(f"{g['variable']} used at " + ", ".join(f"{u['file']}:{u['line']}" for u in g.get("uses", [])) for g in finding.get("globals", []))
    anchor = (finding.get("calls") or [{}])[0] or ((finding.get("globals") or [{}])[0].get("uses") or [{}])[0]
    return (
        f"Component {finding['from']} -> {finding['to']}. Control coupling: {calls or 'none'}. Data coupling through globals: {data or 'none'}.",
        anchor,
    )
