from __future__ import annotations

import hashlib
import json
import uuid
import re
from dataclasses import dataclass, field, replace
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from llama_index.llms.anthropic import Anthropic
from llama_index.llms.openai import OpenAI

from aifactory_rag.config import RagConfig, require_query_config, searchable_source_ids
from aifactory_rag.db import connect, vector_literal
from aifactory_rag.embeddings import create_embedding_adapter
from aifactory_rag import dataflow
from aifactory_rag.query import graph
from aifactory_rag.query.path_filter import excluded, exclusion_regexes
from aifactory_rag.query.retriever import (
    FOUND_BY_IDENTIFIER,
    FOUND_BY_REPOSITORY,
    RetrievedChunk,
    repositories_named,
    retrieve,
)

# How a part brought in beside a hit on its section is marked (RQ-0042).
FOUND_BY_SECTION = "section"
# How the best chunk of a file whose path holds the question's terms is marked (RQ-0042).
FOUND_BY_PATH = "path"
# The file whose path matches the question's terms best brings this many chunks.
TOP_FILE_CHUNKS = 3


def answer_question(
    config: RagConfig,
    question: str,
    user_id: str | None = None,
    source_ids: list[str] | None = None,
    exclude_content_types: list[str] | None = None,
    expand_graph: bool = True,
    exclude_paths: list[str] | None = None,
) -> dict:
    require_query_config(config)
    plan = _search_plan(config, question)
    chunks = _retrieve_all(
        config, plan.queries, source_ids=source_ids, exclude_content_types=exclude_content_types, exclude_paths=exclude_paths,
    )
    chunks, named = _focus_repositories(
        config, question, chunks, source_ids, exclude_content_types, exclude_paths, queries=plan.queries,
    )
    chunks = _add_path_matches(config, plan, chunks, source_ids, exclude_content_types, exclude_paths, named)
    chunks = _expand_sections(config, chunks)
    if expand_graph:
        chunks = _expand_with_graph(config, chunks, exclude_paths)
    findings = _dataflow_findings(config, question, source_ids, chunks)
    answer = _generate_answer(config, question, chunks, [text for text, _ in findings])
    if findings and dataflow.NOTICE not in answer:
        answer = f"{answer}\n\n> {dataflow.NOTICE}"
    sources = [
        {
            "sourceId": chunk.source_id,
            "documentId": chunk.document_id,
            "chunkId": chunk.chunk_id,
            "relativePath": chunk.relative_path,
            "pageNumbers": list(chunk.page_numbers),
            "score": chunk.score,
            **code_location(chunk.relative_path, chunk.metadata),
            **({"graphRelation": chunk.metadata["graphRelation"]} if chunk.metadata.get("graphRelation") else {}),
            **({"foundBy": chunk.metadata["foundBy"]} if chunk.metadata.get("foundBy") else {}),
        }
        for chunk in chunks
    ]
    sources.extend(location for _, location in findings)
    share_id = _record_query(config, question, answer, sources, user_id)
    return {"answer": answer, "sources": sources, "shareId": share_id}


MAX_DATAFLOW_FINDINGS = 6


def _dataflow_findings(
    config: RagConfig, question: str, source_ids: list[str] | None, chunks: list[RetrievedChunk] | None = None,
) -> list[tuple[str, dict[str, Any]]]:
    """Run the prepared Joern query a data-flow question asks for (RQ-0025).

    Each finding becomes context text and a citation. All findings are
    gathered first and the most relevant kept: those in files the retrieval
    also found, then those that share words with the question, so a noisy
    input cannot crowd out the one the question is about. Joern being down or
    a source without a graph costs these findings, never the answer.
    """
    kinds = dataflow.classify(question)
    if not kinds:
        return []
    candidates = [s for s in config.sources if s.dataflow and s.enabled and (not source_ids or s.id in source_ids)]
    settings = dataflow.JoernSettings(url=config.joern.url, workspace=config.joern.workspace)
    found: list[tuple[str, dict[str, Any]]] = []
    retrieved = {chunk.relative_path for chunk in chunks or []}
    words = {word.lower() for word in re.findall(r"[A-Za-z_][A-Za-z0-9_]{2,}", question)}

    def relevance(item: tuple[str, dict[str, Any]]) -> tuple[int, int]:
        text, location = item
        lowered = text.lower()
        return (int(location.get("relativePath") in retrieved), sum(word in lowered for word in words))

    try:
        with connect(config.database.connection_string) as conn:
            for source in candidates:
                for kind in kinds:
                    result = dataflow.run_dataflow(conn, settings, source, kind)
                    for item in result["inputs"]:
                        for finding in item["findings"]:
                            text, anchor = dataflow.describe(finding)
                            found.append((
                                f"[data-flow finding by static analysis ({kind}, {item.get('language', 'C/C++')}), not a qualified tool; input {item['input']}"
                                f"{' @ ' + str(item.get('ref')) if item.get('ref') else ''}"
                                f"{' (' + str(item['commit'])[:8] + ')' if item.get('commit') else ''}]\n{text}",
                                {
                                    "sourceId": source.id, "relativePath": anchor.get("file", ""), "dataflow": kind,
                                    "language": item.get("language", "C/C++"),
                                    "symbol": anchor.get("method"), "startLine": anchor.get("line"), "endLine": anchor.get("line"),
                                    **({"webUrl": anchor["webUrl"]} if anchor.get("webUrl") else {}),
                                    **({"repository": item["input"]} if item["input"] != "path" else {}),
                                },
                            ))
    except Exception as exc:  # noqa: BLE001 - findings are an addition to the answer
        print(f"Data-flow findings skipped: {exc}", flush=True)
    return sorted(found, key=relevance, reverse=True)[:MAX_DATAFLOW_FINDINGS]


@dataclass(frozen=True)
class SearchPlan:
    """What one question is searched with (RQ-0042): the question itself, and,
    when the model could give them, an English search query and terms."""

    queries: list[str]
    terms: list[str] = field(default_factory=list)


_REWRITE_PROMPT = (
    "You help search a code and documentation index of software and hardware projects "
    "(firmware, simulators, interface documents). Rewrite the user's question as one English "
    "search query, and list 3 to 8 short terms that would appear in the relevant file names, "
    "identifiers or headings (abbreviations included, e.g. A429 for ARINC 429). Use only what the "
    "question implies. Answer with JSON only: {\"query\": \"...\", \"terms\": [\"...\"]}\n\nQuestion:\n"
)
# Path words too common to say anything about a file.
_COMMON_TERMS = {"src", "test", "tests", "doc", "docs", "code", "file", "files", "source", "the", "and", "for", "data", "main"}
TERM = re.compile(r"[a-z0-9][a-z0-9._-]{1,40}")


def _search_plan(config: RagConfig, question: str) -> SearchPlan:
    """The question, and its English search query and terms (RQ-0042).

    A question in Turkish, in the asker's words, sits far from code written
    in English in the asker's colleagues' words: "arinc 429 ip davranislari
    nasil" put the twin's A429Lite.cs ninth among its repository's code, the
    English question with the model's terms second. One short completion
    gives both; without it (turned off, or a model that fails) the question
    is searched alone, as before.
    """
    if not config.retrieval.rewrite:
        return SearchPlan(queries=[question])
    try:
        rewriter = config
        if config.retrieval.rewrite_model:
            rewriter = config.model_copy(update={"llm": config.llm.model_copy(update={"model": config.retrieval.rewrite_model})})
        reply = _complete(rewriter, _REWRITE_PROMPT + question, session_key="rewrite")
        found = json.loads(reply[reply.index("{"): reply.rindex("}") + 1])
    except Exception as exc:  # noqa: BLE001 - the rewrite is an addition to the search
        print(f"Question rewrite skipped: {exc}", flush=True)
        return SearchPlan(queries=[question])
    query = str(found.get("query") or "").strip()
    terms: list[str] = []
    for term in found.get("terms") or []:
        word = str(term).strip().lower()
        if TERM.fullmatch(word) and word not in _COMMON_TERMS and word not in terms:
            terms.append(word)
    queries = [question, query] if query and query.lower() != question.lower() else [question]
    return SearchPlan(queries=queries, terms=terms[:8])


def _retrieve_all(config: RagConfig, queries: list[str], limit: int | None = None, **options: Any) -> list[RetrievedChunk]:
    """Each query's nearest chunks, merged: a chunk keeps its best score; what
    the first query looked up by its identifier stays first."""
    top_k = limit or config.retrieval.top_k
    first = retrieve(config, queries[0], limit=limit, **options)
    if len(queries) == 1:
        return first
    identified = [found for found in first if found.metadata.get("foundBy") == FOUND_BY_IDENTIFIER]
    best: dict[int, RetrievedChunk] = {}
    for found in [*first, *(found for query in queries[1:] for found in retrieve(config, query, limit=limit, **options))]:
        if found.chunk_id not in best or found.score > best[found.chunk_id].score:
            best[found.chunk_id] = found
    taken = {found.chunk_id for found in identified}
    ranked = sorted((found for found in best.values() if found.chunk_id not in taken), key=lambda found: -found.score)
    return [*identified, *ranked][:top_k]


def _focus_repositories(
    config: RagConfig,
    question: str,
    chunks: list[RetrievedChunk],
    source_ids: list[str] | None,
    exclude_content_types: list[str] | None,
    exclude_paths: list[str] | None,
    queries: list[str] | None = None,
) -> tuple[list[RetrievedChunk], list[str]]:
    """Search the repository the question names as well (RQ-0042).

    "bfi-simulator kodunda arinc 429 ip davranislari nasil" found none of the
    twin's A429 model: one top-k over every source, ranked by the embedding
    alone, gave its places to documents that shared the question's words. A
    repository the sources hold, named in the question, gets a second search
    of its own, whose best chunks take up to half of top-k; what was looked up
    by its identifier stays first. Without such a name nothing changes.
    """
    try:
        searchable = searchable_source_ids(config, source_ids)
        with connect(config.database.connection_string) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT DISTINCT metadata->>'repository' AS repository FROM rag_documents"
                    " WHERE status = 'active' AND metadata ? 'repository'"
                    + (" AND source_id = ANY(%s)" if searchable else ""),
                    (searchable,) if searchable else (),
                )
                known = [row["repository"] for row in cur.fetchall() if row["repository"]]
    except Exception as exc:  # noqa: BLE001 - the focus is an addition to the answer
        print(f"Repository focus skipped: {exc}", flush=True)
        return chunks, []
    named = repositories_named(question, known)
    if not named:
        return chunks, []
    top_k = config.retrieval.top_k
    scoped = _retrieve_all(
        config, queries or [question], limit=max(1, top_k // 2), source_ids=source_ids,
        exclude_content_types=exclude_content_types, exclude_paths=exclude_paths, repositories=named,
    )
    scoped = [
        found if found.metadata.get("foundBy") else replace(found, metadata={**found.metadata, "foundBy": FOUND_BY_REPOSITORY})
        for found in scoped
    ]
    taken = {found.chunk_id for found in scoped}
    identified = [found for found in chunks if found.metadata.get("foundBy") == FOUND_BY_IDENTIFIER and found.chunk_id not in taken]
    taken |= {found.chunk_id for found in identified}
    rest = [found for found in chunks if found.chunk_id not in taken]
    return [*identified, *scoped, *rest][:top_k], named


_PATH_MATCHES = """
    WITH docs AS MATERIALIZED (
      SELECT d.id, (SELECT count(*) FROM unnest(%(terms)s::text[]) t WHERE lower(d.relative_path) LIKE '%%' || t || '%%') AS hits
      FROM rag_documents d
      WHERE d.status = 'active'
        AND lower(d.relative_path) LIKE ANY (SELECT '%%' || t || '%%' FROM unnest(%(terms)s::text[]) t)
        {document_filter}
      ORDER BY hits DESC, d.id
      LIMIT 40
    ),
    scored AS MATERIALIZED (
      SELECT
        c.id AS chunk_id, c.document_id, c.source_id, d.relative_path, c.text, c.metadata, docs.hits,
        1 - ((c.embedding::halfvec({dims})) <=> %(embedding)s::halfvec({dims})) AS score
      FROM rag_chunks c
      JOIN docs ON docs.id = c.document_id
      JOIN rag_documents d ON d.id = c.document_id
      WHERE c.status = 'active' AND c.embedding IS NOT NULL AND vector_dims(c.embedding) = %(dims)s
        {chunk_filter}
    ),
    ranked AS (
      SELECT *, row_number() OVER (PARTITION BY document_id ORDER BY score DESC) AS rank_in_file,
             max(score) OVER (PARTITION BY document_id) AS file_score
      FROM scored
    )
    SELECT * FROM ranked WHERE rank_in_file <= %(top_file)s
    ORDER BY hits DESC, file_score DESC, document_id, rank_in_file
"""


def _add_path_matches(
    config: RagConfig,
    plan: SearchPlan,
    chunks: list[RetrievedChunk],
    source_ids: list[str] | None,
    exclude_content_types: list[str] | None,
    exclude_paths: list[str] | None,
    repositories: list[str],
) -> list[RetrievedChunk]:
    """Files whose path holds the question's terms (RQ-0042).

    A file is often named for what it is about (peripherals/A429Lite.cs,
    RQ-0006-a429-lite-fifo-...); an embedding of its code does not say so.
    The files whose paths hold most of the plan's terms bring chunks, up to a
    third of top-k (three at least): the file that matches best its best
    TOP_FILE_CHUNKS, every other file its best one (A429Lite.cs brought only
    its header comment, and the answer said the code was missing). They come
    after what was named by identifier; within the repository the question
    names, if it names one. The filters of the search apply.
    """
    if not plan.terms:
        return chunks
    top_k = config.retrieval.top_k
    limit = max(3, top_k // 3)
    searchable = searchable_source_ids(config, source_ids)
    document_filter = ""
    chunk_filter = ""
    params: dict[str, Any] = {"terms": plan.terms, "top_file": TOP_FILE_CHUNKS}
    if searchable:
        document_filter += " AND d.source_id = ANY(%(sources)s)"
        params["sources"] = searchable
    if repositories:
        document_filter += " AND d.metadata->>'repository' = ANY(%(repositories)s)"
        params["repositories"] = repositories
    if exclude_content_types:
        chunk_filter += " AND (c.metadata->>'contentType' IS NULL OR NOT (c.metadata->>'contentType' = ANY(%(types)s)))"
        params["types"] = exclude_content_types
    regexes = exclusion_regexes(exclude_paths)
    if regexes:
        document_filter += " AND NOT (d.relative_path ~ ANY(%(paths)s))"
        params["paths"] = regexes
    try:
        embedding = create_embedding_adapter(config.embedding).embed_query(plan.queries[-1])
        params.update({"embedding": vector_literal(embedding), "dims": len(embedding)})
        statement = _PATH_MATCHES.format(document_filter=document_filter, chunk_filter=chunk_filter, dims=len(embedding))
        with connect(config.database.connection_string) as conn:
            with conn.cursor() as cur:
                cur.execute(statement, params)
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001 - path matches are an addition to the answer
        print(f"Path matches skipped: {exc}", flush=True)
        return chunks
    seen = {found.chunk_id for found in chunks}
    first_file = rows[0]["document_id"] if rows else None
    matched: list[RetrievedChunk] = []
    for row in rows:
        if len(matched) >= limit:
            break
        if int(row["chunk_id"]) in seen or (row["document_id"] != first_file and int(row["rank_in_file"]) > 1):
            continue
        matched.append(RetrievedChunk(
            chunk_id=int(row["chunk_id"]), document_id=int(row["document_id"]), source_id=row["source_id"],
            relative_path=row["relative_path"], text=row["text"], score=float(row["score"]),
            metadata={**(row["metadata"] or {}), "foundBy": FOUND_BY_PATH},
        ))
    if not matched:
        return chunks
    identified = [found for found in chunks if found.metadata.get("foundBy") == FOUND_BY_IDENTIFIER]
    rest = [found for found in chunks if found.metadata.get("foundBy") != FOUND_BY_IDENTIFIER]
    return [*identified, *matched, *rest][:top_k]


_SECTION_PARTS = """
    SELECT c.id AS chunk_id, c.document_id, c.source_id, d.relative_path, c.text, c.metadata
    FROM rag_chunks c
    JOIN rag_documents d ON d.id = c.document_id
    WHERE c.document_id = %s
      AND c.status = 'active'
      AND d.status = 'active'
      AND c.metadata->>'section' = %s
      AND c.metadata ? 'part'
    ORDER BY abs((c.metadata->>'part')::int - %s), (c.metadata->>'part')::int
    LIMIT %s
"""


def _expand_sections(config: RagConfig, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """Bring a hit's section along (RQ-0042).

    A section split into parts reached the answer one part at a time: the
    developer guide's "ARINC 429 in: UDP 5429" came as its heading alone,
    without the part that said anything. Each hit that is a part of a split
    section brings up to sectionParts of the section's other parts from the
    same document, nearest first, placed right after it; all hits together
    bring at most a quarter of top-k (two at least), the best hits first, and
    the weakest hits make room, so the answer keeps its top-k and is not all
    one section's parts. A part is never added twice. Being
    of the same document, the parts share its path and content type, so no
    filter can be undone this way.
    """
    limit = config.retrieval.section_parts
    split = [found for found in chunks if int(found.metadata.get("parts") or 0) > 1 and found.metadata.get("section")]
    if limit <= 0 or not split:
        return chunks
    budget = max(2, config.retrieval.top_k // 4)
    seen = {found.chunk_id for found in chunks}
    added: dict[int, list[RetrievedChunk]] = {}
    total = 0
    try:
        with connect(config.database.connection_string) as conn:
            with conn.cursor() as cur:
                for hit in split:
                    if total >= budget:
                        break
                    cur.execute(_SECTION_PARTS, (hit.document_id, hit.metadata["section"], int(hit.metadata.get("part") or 1), limit + 1))
                    for row in cur.fetchall():
                        if int(row["chunk_id"]) in seen or len(added.get(hit.chunk_id, [])) >= limit or total >= budget:
                            continue
                        seen.add(int(row["chunk_id"]))
                        total += 1
                        added.setdefault(hit.chunk_id, []).append(RetrievedChunk(
                            chunk_id=int(row["chunk_id"]),
                            document_id=int(row["document_id"]),
                            source_id=row["source_id"],
                            relative_path=row["relative_path"],
                            text=row["text"],
                            score=0.0,
                            metadata={**(row["metadata"] or {}), "foundBy": FOUND_BY_SECTION},
                        ))
    except Exception as exc:  # noqa: BLE001 - the section is an addition to the answer
        print(f"Section expansion skipped: {exc}", flush=True)
        return chunks
    if not added:
        return chunks
    expanded: list[RetrievedChunk] = []
    for found in chunks:
        expanded.append(found)
        expanded.extend(added.get(found.chunk_id, []))
    return expanded[: config.retrieval.top_k]


def _expand_with_graph(
    config: RagConfig, chunks: list[RetrievedChunk], exclude_paths: list[str] | None = None,
) -> list[RetrievedChunk]:
    """Add the callers and callees of the functions found, within the top-k budget.

    A third of the budget (at least two) goes to the graph; the weakest
    retrieval hits make room for it. The graph is an addition, never a reason
    to fail an answer.
    """
    top_k = config.retrieval.top_k
    limit = max(2, top_k // 3)
    try:
        with connect(config.database.connection_string) as conn:
            neighbors = graph.neighbor_chunks(conn, chunks, limit)
    except Exception as exc:  # noqa: BLE001 - e.g. a database not yet migrated
        print(f"Graph expansion skipped: {exc}", flush=True)
        return chunks
    regexes = exclusion_regexes(exclude_paths)
    neighbors = [chunk for chunk in neighbors if not excluded(chunk.relative_path, regexes)]
    if not neighbors:
        return chunks
    return chunks[: max(1, top_k - len(neighbors))] + neighbors


def code_location(relative_path: str, metadata: dict[str, Any]) -> dict[str, Any]:
    """Where a code chunk sits, and its GitLab link when it came from a repository."""
    location: dict[str, Any] = {}
    for key in ("repository", "commit", "symbol", "symbolKind", "section", "startLine", "endLine", "doorsModule", "requirement"):
        if metadata.get(key) is not None:
            location[key] = metadata[key]
    repository_url = metadata.get("repositoryUrl")
    commit = metadata.get("commit")
    if repository_url and commit and str(repository_url).startswith(("http://", "https://")):
        anchor = ""
        if metadata.get("startLine"):
            anchor = f"#L{metadata['startLine']}-{metadata.get('endLine') or metadata['startLine']}"
        location["webUrl"] = f"{repository_url}/-/blob/{commit}/{quote(relative_path)}{anchor}"
    return location


def citation_label(relative_path: str, metadata: dict[str, Any], page_numbers: tuple[int, ...] = ()) -> str:
    """How a chunk is named to the model, and so how the answer cites it.

    `<repository>@<short commit>:<path>:<start>-<end> (<symbol>)` for code from
    a repository, `<path>:<start>-<end> (<symbol>)` for code from a folder, and
    the file name with its pages for everything else. A requirement of a DOORS
    module (RQ-0037) is `DOORS <module> <identifier>`.
    """
    if metadata.get("doorsModule") and metadata.get("requirement"):
        label = f"DOORS {metadata['doorsModule']} {metadata['requirement']}"
        if metadata.get("section"):
            label += f" § {metadata['section'].split(' > ')[-1]}"
        return label
    label = relative_path
    if metadata.get("repository") and metadata.get("commit"):
        label = f"{metadata['repository']}@{str(metadata['commit'])[:8]}:{relative_path}"
    if metadata.get("startLine"):
        label += f":{metadata['startLine']}-{metadata.get('endLine') or metadata['startLine']}"
    if metadata.get("symbol"):
        label += f" ({metadata['symbol']})"
    elif metadata.get("section"):
        label += f" § {metadata['section'].split(' > ')[-1]}"
    if page_numbers:
        noun = "page" if len(page_numbers) == 1 else "pages"
        label += f"; {noun} {', '.join(str(page) for page in page_numbers)}"
    return label


def _generate_answer(config: RagConfig, question: str, chunks: list[RetrievedChunk], findings: list[str] | None = None) -> str:
    if not chunks and not findings:
        return "No matching source content was found for this question."

    context_parts: list[str] = []
    for chunk in chunks:
        label = citation_label(chunk.relative_path, chunk.metadata, chunk.page_numbers)
        if chunk.metadata.get("graphRelation"):
            label += f"; found through the code graph: {chunk.metadata['graphRelation']}"
        if chunk.metadata.get("foundBy") == "identifier":
            label += "; the requirement the question names"
        context_parts.append(f"[document: {label}]\n{chunk.text}")
    context_parts.extend(findings or [])
    context = "\n\n".join(context_parts)
    prompt = (
        "Answer the question using only the provided source context. "
        "If the context is insufficient, say so. Cite supporting evidence using the document "
        "filename and page number when available; cite code by the location in its document label, "
        "exactly as given. Do not use source numbers such as 'source 1'. A data-flow finding by static "
        "analysis is a tool finding, not verified evidence: say so when you use one.\n\n"
        f"Question:\n{question}\n\n"
        f"Source context:\n{context}"
    )

    return _complete(config, prompt, session_key=",".join(sorted({chunk.source_id for chunk in chunks})) or "*")


def _complete(config: RagConfig, prompt: str, session_key: str | None = None) -> str:
    """One completion from the configured model."""
    if config.llm.provider == "ollama":
        return _complete_with_ollama(config, prompt)
    if config.llm.provider == "gemini":
        return _complete_with_gemini(config, prompt)
    if config.llm.provider == "claude-cli":
        return _complete_with_claude_cli(config, prompt, session_key=session_key)
    if config.llm.provider == "claude":
        llm = Anthropic(model=config.llm.model, api_key=config.llm.api_key, temperature=config.llm.temperature)
    else:
        llm = OpenAI(model=config.llm.model, api_key=config.llm.api_key, temperature=config.llm.temperature)

    response = llm.complete(prompt)
    return str(response).strip()


# One seed session per source set, so a question against the same corpora reuses
# a warm prefix instead of paying for a cold one. Measured on the CLI: a fresh
# session writes about 5.8k cache tokens and costs roughly $0.073, while a fork
# of an existing session writes about 0.3k and costs roughly $0.021. The seeds
# live for the life of this process; losing them only makes the next call the
# expensive kind again.
_CLAUDE_CLI_SEEDS: dict[str, str] = {}


def _claude_cli_session_dir(session_key: str) -> str:
    """A stable directory per source set.

    The CLI scopes its sessions to the working directory, so a throwaway
    temporary directory would make `--resume` unable to find the seed. The
    directory is outside any project, which keeps a project's CLAUDE.md out of
    the prompt: the retrieved context stays the only thing the model can answer
    from.
    """
    digest = hashlib.sha256(session_key.encode("utf-8")).hexdigest()[:16]
    path = Path(tempfile.gettempdir()) / f"aifactory-rag-claude-cli-{digest}"
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def _complete_with_claude_cli(config: RagConfig, prompt: str, session_key: str | None = None) -> str:
    """Answer through the Claude Code CLI instead of an HTTP API.

    The point of this provider is that it needs no API key: the CLI uses the
    Claude session of whoever is signed in on the machine running this service.

    Each call carries the CLI's own harness prompt, about 35k input tokens. That
    prefix is cached, so the cost of a call depends on whether it can reuse a
    warm one. This is why a seed session is kept per source set and every answer
    is a **fork** of it: a fork reads the seed's prefix from cache and writes its
    own turn into a new session, so the seed never grows and one answer can never
    leak into the next. Resuming without forking would be equally cheap and
    would accumulate history, which for a service whose contract is "answer only
    from the provided context" is a correctness risk, not an optimisation.

    `--bare` would strip the harness entirely but reads only an API key and never
    the signed-in session, so it cannot be used here.

    Every tool is denied and nothing may stop to ask, which makes this a plain
    completion.
    """
    key = session_key or "*"
    workdir = _claude_cli_session_dir(key)
    seed = _CLAUDE_CLI_SEEDS.get(key)

    envelope = _run_claude_cli(config, prompt, workdir, seed)
    if envelope is None:
        # The seed is gone: the host restarted, or the session was pruned. Start
        # a fresh one and remember it.
        _CLAUDE_CLI_SEEDS.pop(key, None)
        seed = None  # this call is now the opening one, so its id becomes the seed
        envelope = _run_claude_cli(config, prompt, workdir, None)
        if envelope is None:
            raise RuntimeError("Claude CLI could not start a session.")

    answer = envelope.get("result")
    answer = answer.strip() if isinstance(answer, str) else ""
    # An unauthenticated or refused run still exits 0 and says so in the
    # envelope, so the envelope decides, not the exit code.
    if envelope.get("is_error"):
        raise RuntimeError(f"Claude CLI reported an error: {answer or 'no detail'}")
    if not answer:
        raise RuntimeError("Claude CLI returned an empty result.")

    # The first answer for a source set becomes its seed; later answers fork it
    # and must not replace it, or the prefix would drift and grow.
    if seed is None:
        session_id = envelope.get("session_id")
        if isinstance(session_id, str) and session_id:
            _CLAUDE_CLI_SEEDS[key] = session_id
    return answer


def _run_claude_cli(
    config: RagConfig, prompt: str, workdir: str, seed: str | None
) -> dict[str, Any] | None:
    """One CLI invocation. Returns None when a named seed could not be resumed."""
    denied = (
        "Bash Edit Write Read Glob Grep WebFetch WebSearch Task NotebookEdit "
        "TodoWrite Artifact Skill"
    )
    command = [
        config.llm.executable,
        "--print",
        "--output-format",
        "json",
        "--model",
        config.llm.model,
        "--permission-prompts",
        "none",
        "--disallowedTools",
        denied,
    ]
    if config.llm.effort:
        command += ["--effort", config.llm.effort]
    if seed:
        command += ["--resume", seed, "--fork-session"]

    try:
        completed = subprocess.run(  # noqa: S603 - the command is built here, not taken from input
            command,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=config.llm.timeout_seconds,
            cwd=workdir,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Claude CLI not found ({config.llm.executable}). Install Claude Code on the host "
            "running this service and sign in there."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"Claude CLI did not answer within {config.llm.timeout_seconds} seconds."
        ) from exc

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()[-2000:]
        if seed:
            return None  # most likely the seed no longer exists; the caller retries clean
        raise RuntimeError(f"Claude CLI exited with {completed.returncode}: {detail}")

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Claude CLI did not return JSON: {completed.stdout.strip()[:500]}"
        ) from exc


def _complete_with_gemini(config: RagConfig, prompt: str) -> str:
    if not config.llm.api_key:
        raise RuntimeError("GEMINI_API_KEY is required for Gemini LLM responses.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.llm.model}:generateContent"
    response = httpx.post(
        url,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": config.llm.api_key,
        },
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": config.llm.temperature},
        },
        timeout=120,
    )
    response.raise_for_status()
    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini response did not include candidates.")
    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [part.get("text", "") for part in parts if part.get("text")]
    if not texts:
        raise RuntimeError("Gemini response did not include text.")
    return "\n".join(texts).strip()


def _complete_with_ollama(config: RagConfig, prompt: str) -> str:
    base_url = (config.llm.base_url or "http://localhost:11434").rstrip("/")
    response = httpx.post(
        f"{base_url}/api/generate",
        json={
            "model": config.llm.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": config.llm.temperature},
        },
        timeout=180,
    )
    response.raise_for_status()
    data = response.json()
    answer = data.get("response")
    if not answer:
        raise RuntimeError("Ollama response did not include generated text.")
    return str(answer).strip()


def _record_query(config: RagConfig, question: str, answer: str, sources: list[dict], user_id: str | None) -> str:
    """Record a question and its answer; the returned identifier shares it (RQ-0041)."""
    share_id = str(uuid.uuid4())
    with connect(config.database.connection_string) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO rag_queries(user_id, question, answer, sources, share_id)
                VALUES (%s, %s, %s, %s::jsonb, %s)
                """,
                (user_id, question, answer, json.dumps(sources), share_id),
            )
        conn.commit()
    return share_id


# The page keeps at most this much of an answer in its local chat history.
STORED_ANSWER_CHARS = 40000


def share_recorded_answer(config: RagConfig, question: str, answer: str) -> str | None:
    """The share identifier of an answer recorded before identifiers existed,
    found by its exact question and answer and given one the first time it is
    asked for (RQ-0041). The latest of identical records is the one shared;
    None when the service has no such record."""
    with connect(config.database.connection_string) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, share_id FROM rag_queries
                WHERE question = %s AND left(answer, %s) = left(%s, %s)
                ORDER BY created_at DESC LIMIT 1
                """,
                (question, STORED_ANSWER_CHARS, answer, STORED_ANSWER_CHARS),
            )
            row = cur.fetchone()
            if not row:
                return None
            if row["share_id"]:
                return str(row["share_id"])
            share_id = str(uuid.uuid4())
            cur.execute("UPDATE rag_queries SET share_id = %s WHERE id = %s AND share_id IS NULL", (share_id, row["id"]))
        conn.commit()
    return share_id


def shared_answer(config: RagConfig, share_id: str) -> dict[str, Any] | None:
    """A recorded question and answer, by its share identifier (RQ-0041); None
    for an identifier that is not a UUID or not known."""
    try:
        key = str(uuid.UUID(share_id))
    except (ValueError, TypeError, AttributeError):
        return None
    with connect(config.database.connection_string) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT question, answer, sources, created_at FROM rag_queries WHERE share_id = %s",
                (key,),
            )
            row = cur.fetchone()
    if not row:
        return None
    asked = row["created_at"]
    return {
        "shareId": key,
        "question": row["question"],
        "answer": row["answer"],
        "sources": row["sources"] or [],
        "askedAt": asked.isoformat() if hasattr(asked, "isoformat") else asked,
    }
