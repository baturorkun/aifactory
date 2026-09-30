"""The symbol graph of one source file (RQ-0024).

From the same tree-sitter parse the symbol chunker uses, a file yields its
symbol definitions and the edges that leave it:

* `calls` - a call inside a function, to the name called;
* `reads` / `writes` - an identifier used inside a function that is not one of
  its parameters or locals (a global, an enum constant, a register macro), or
  a struct field / object property; `writes` on the left of an assignment and
  under `++`/`--`;
* `includes` / `imports` - `#include` paths and ES module sources;
* `declares` - a function prototype outside any body (a header declaring what
  a `.c` implements);
* `contains` - a class or struct to its methods.

Edges are resolved by name only (`resolution: name`): a call records the name
it calls, and the query side links it to every definition of that name in the
source, so two functions of the same name are both reached, never one guessed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from aifactory_rag.ingest.code_chunker import (
    CONTAINERS,
    _collect,
    _declarator_name,
    _node_text,
    _parser,
    _Symbol,
    language_for,
)

# Recorded on each code document; a document whose value differs gets its graph
# rebuilt on the next ingest without being re-embedded.
GRAPH_VERSION = "graph-v1"

FUNCTION_NODES = {
    "function_definition",
    "method_definition",
    "function_declaration",
    "generator_function_declaration",
    "arrow_function",
    "function_expression",
    "function",
    "generator_function",
}
ASSIGNMENTS = {"assignment_expression", "augmented_assignment_expression"}
MEMBER_ACCESS = {"field_expression", "member_expression"}
NAME_NODES = {"identifier", "field_identifier", "property_identifier", "shorthand_property_identifier"}


@dataclass
class GraphSymbol:
    name: str
    kind: str
    signature: str
    start_line: int
    end_line: int

    @property
    def short_name(self) -> str:
        return short_name(self.name)


@dataclass(frozen=True)
class GraphEdge:
    from_symbol: str | None
    kind: str
    to_name: str
    line: int


@dataclass
class FileGraph:
    symbols: list[GraphSymbol] = field(default_factory=list)
    edges: list[GraphEdge] = field(default_factory=list)


def short_name(name: str) -> str:
    """`hw::Uart::recv` and `Service.run` are called as `recv` and `run`."""
    return name.replace("::", ".").rsplit(".", 1)[-1]


def extract_graph(text: str, relative_path: str) -> FileGraph | None:
    """The symbols and edges of a C, C++, TS or JS file; None when it cannot be read."""
    language = language_for(relative_path)
    if language is None:
        return None
    try:
        return _extract(text.encode("utf-8"), language)
    except Exception:  # a parser defect must cost the graph, not the ingest
        return None


def _extract(source: bytes, language: str) -> FileGraph:
    root = _parser(language).parse(source).root_node
    top = _collect(root, source, "", language)
    symbols: list[_Symbol] = []
    graph = FileGraph()
    edges: set[GraphEdge] = set()
    for symbol in top:
        symbols.append(symbol)
        for member in symbol.members:
            symbols.append(member)
            edges.add(GraphEdge(symbol.name, "contains", short_name(member.name), member.start_line))
    graph.symbols = [GraphSymbol(s.name, s.kind, s.signature, s.start_line, s.end_line) for s in symbols]
    graph.symbols.extend(_globals(root, source))

    functions = sorted(
        (s for s in symbols if s.kind in {"function", "method"}),
        key=lambda s: s.end_byte - s.start_byte,
    )

    def enclosing(byte: int) -> str | None:
        for symbol in functions:  # smallest first: a method before its class
            if symbol.start_byte <= byte < symbol.end_byte:
                return symbol.name
        return None

    # (node, inside-a-function locals or None, write context)
    stack: list[tuple[Any, set[str] | None, bool]] = [(root, None, False)]
    skip: set[tuple[int, int]] = set()  # name nodes already recorded as calls
    while stack:
        node, local_names, writing = stack.pop()
        kind = node.type
        line = node.start_point[0] + 1

        if kind == "preproc_include":
            path = node.child_by_field_name("path")
            if path is not None:
                edges.add(GraphEdge(None, "includes", _node_text(source, path).strip('<>"'), line))
            continue
        if kind in {"import_statement", "export_statement"} and node.child_by_field_name("source") is not None:
            edges.add(GraphEdge(enclosing(node.start_byte), "imports", _node_text(source, node.child_by_field_name("source")).strip("'\"`"), line))
            if kind == "import_statement":
                continue

        if kind in FUNCTION_NODES:
            local_names = set(local_names or ()) | _parameters(node, source)
        elif local_names is None and kind in {"declaration", "field_declaration"} and _declares_function(node):
            name = _declarator_name(node.child_by_field_name("declarator"), source)
            if name:
                edges.add(GraphEdge(None, "declares", short_name(name), line))

        if kind == "call_expression" and local_names is None:
            callee, _ = _callee(node, source)
            if callee == "require":  # a module-level `const fs = require('fs')`
                edges.add(GraphEdge(None, "imports", _first_argument(node, source), line))

        if local_names is not None:
            if kind == "declaration" or kind == "variable_declarator":
                local_names.update(_declared_names(node, source))
            elif kind in {"call_expression", "new_expression"}:
                callee, name_node = _callee(node, source)
                if callee == "require":
                    edges.add(GraphEdge(enclosing(node.start_byte), "imports", _first_argument(node, source), line))
                elif callee:
                    edges.add(GraphEdge(enclosing(node.start_byte), "calls", callee, line))
                if name_node is not None:
                    skip.add((name_node.start_byte, name_node.end_byte))
            elif kind in NAME_NODES and (node.start_byte, node.end_byte) not in skip:
                name = _node_text(source, node)
                is_member = kind in {"field_identifier", "property_identifier"}
                if (is_member or name not in local_names) and _is_reference(node):
                    edges.add(GraphEdge(enclosing(node.start_byte), "writes" if writing else "reads", name, line))

        children = list(node.named_children)
        left = node.child_by_field_name("left") if kind in ASSIGNMENTS else None
        base = None
        if kind in MEMBER_ACCESS:
            base = node.child_by_field_name("argument") or node.child_by_field_name("object")
        for child in reversed(children):
            child_writes = writing
            if left is not None:
                child_writes = child == left
            elif kind == "update_expression":
                child_writes = True
            if base is not None and child == base:
                child_writes = False  # `s->field = x` writes the field, reads `s`
            stack.append((child, local_names, child_writes))

    graph.edges = sorted(edges, key=lambda edge: (edge.line, edge.kind, edge.to_name))
    return graph


def _first_argument(node: Any, source: bytes) -> str:
    arguments = node.child_by_field_name("arguments")
    if arguments is None or not arguments.named_child_count:
        return ""
    return _node_text(source, arguments.named_children[0]).strip("'\"`")


def _globals(root: Any, source: bytes) -> list[GraphSymbol]:
    """File-scope variables, so `/symbols` can say where a global is defined."""
    found: list[GraphSymbol] = []
    stack = [root]
    while stack:
        node = stack.pop()
        if node.type in CONTAINERS or node.type == "export_statement":
            stack.extend(reversed(node.named_children))
            continue
        if node.type == "declaration" and not _declares_function(node):
            names = [_declarator_name(d, source) for d in node.children_by_field_name("declarator")]
        elif node.type in {"lexical_declaration", "variable_declaration"}:
            names = []
            for declarator in node.named_children:
                value = declarator.child_by_field_name("value") if declarator.type == "variable_declarator" else None
                if declarator.type == "variable_declarator" and (value is None or value.type not in FUNCTION_NODES):
                    target = declarator.child_by_field_name("name")
                    if target is not None and target.type == "identifier":
                        names.append(_node_text(source, target))
        else:
            continue
        line = node.start_point[0] + 1
        signature = " ".join(_node_text(source, node).split())[:300]
        for name in names:
            if name:
                found.append(GraphSymbol(name, "variable", signature, line, node.end_point[0] + 1))
    return found


def _callee(node: Any, source: bytes) -> tuple[str, Any]:
    target = node.child_by_field_name("function") or node.child_by_field_name("constructor")
    if target is None:
        return "", None
    if target.type in {"identifier", "field_identifier", "property_identifier"}:
        return _node_text(source, target), target
    if target.type in MEMBER_ACCESS:
        member = target.child_by_field_name("field") or target.child_by_field_name("property")
        return (_node_text(source, member), member) if member is not None else ("", None)
    if target.type in {"qualified_identifier", "template_function", "scoped_identifier"}:
        return short_name(_node_text(source, target).split("<", 1)[0]), target
    return "", None


def _parameters(node: Any, source: bytes) -> set[str]:
    names: set[str] = set()
    declarator = node.child_by_field_name("declarator")
    parameters = node.child_by_field_name("parameters")
    if parameters is None and declarator is not None:
        # C: function_definition -> (pointer_declarator ->) function_declarator -> parameters
        current = declarator
        while current is not None and parameters is None:
            parameters = current.child_by_field_name("parameters")
            current = current.child_by_field_name("declarator")
    if parameters is None:
        parameter = node.child_by_field_name("parameter")  # `x => ...`
        if parameter is not None and parameter.type == "identifier":
            names.add(_node_text(source, parameter))
        return names
    for parameter in parameters.named_children:
        declared = parameter.child_by_field_name("declarator")
        if declared is not None:
            name = _declarator_name(declared, source)
            if name:
                names.add(name)
            continue
        for identifier in _identifiers(parameter, source, skip_types=True):
            names.add(identifier)
    return names


def _declared_names(node: Any, source: bytes) -> set[str]:
    if node.type == "variable_declarator":
        target = node.child_by_field_name("name")
        return set(_identifiers(target, source, skip_types=True)) if target is not None else set()
    names: set[str] = set()
    for declarator in node.children_by_field_name("declarator"):
        name = _declarator_name(declarator, source)
        if name:
            names.add(name)
    return names


def _identifiers(node: Any, source: bytes, skip_types: bool) -> list[str]:
    found: list[str] = []
    stack = [node]
    while stack:
        current = stack.pop()
        if skip_types and current.type in {"type_annotation", "type_identifier", "primitive_type"}:
            continue
        if current.type in {"identifier", "shorthand_property_identifier_pattern"}:
            found.append(_node_text(source, current))
        stack.extend(current.named_children)
    return found


def _declares_function(node: Any) -> bool:
    current = node.child_by_field_name("declarator")
    while current is not None:
        if current.type == "function_declarator":
            return True
        current = current.child_by_field_name("declarator")
    return False


def _is_reference(node: Any) -> bool:
    """Leave out names that declare something rather than use it."""
    parent = node.parent
    if parent is None:
        return False
    declarator_parents = {
        "init_declarator", "declaration", "pointer_declarator", "array_declarator",
        "function_declarator", "parameter_declaration", "reference_declarator",
    }
    if parent.type in declarator_parents and parent.child_by_field_name("declarator") == node:
        return False
    if parent.type in {"variable_declarator", "required_parameter", "optional_parameter"} and (
        parent.child_by_field_name("name") == node or parent.child_by_field_name("pattern") == node
    ):
        return False
    if parent.type in {"field_designator", "pair", "labeled_statement", "goto_statement", "formal_parameters"}:
        return False
    if parent.type in FUNCTION_NODES or parent.type in CONTAINERS:
        return False
    if parent.type in {"method_definition", "class_declaration", "class", "function_declaration"} and parent.child_by_field_name("name") == node:
        return False
    return True
