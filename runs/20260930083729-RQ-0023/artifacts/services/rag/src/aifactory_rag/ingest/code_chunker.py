"""One chunk per symbol for C, C++, TypeScript and JavaScript.

Size-based chunking cuts code wherever the character count runs out: a chunk
starts in the middle of one function and ends in the next and carries no
symbol name, so a question about a function by name retrieves whatever text
happens to sit near the name. Here the file is parsed with tree-sitter and cut
at symbol boundaries instead: each function, method, class, struct, enum,
typedef and macro becomes its own chunk with its name, kind, signature and line
range, and whatever lies between them (includes, imports, globals) is kept in
file-level chunks. The chunking depends on the language only, never on where
the file came from.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import PurePosixPath
from typing import Any

from aifactory_rag.ingest.chunker import chunk_text

# Recorded on every document. A file whose recorded chunker differs from the
# one its type now gets is chunked again on the next ingest, even when the file
# itself did not change; documents ingested before this field existed count as
# SIZE_CHUNKER.
SIZE_CHUNKER = "size-v1"
SYMBOL_CHUNKER = "symbol-v1"

LANGUAGE_BY_EXTENSION = {
    # A .h is read as C: the embedded firmware these corpora hold is C, and the
    # C grammar reads a C header more reliably than the C++ one does.
    ".c": "c",
    ".h": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".hh": "cpp",
    ".hpp": "cpp",
    ".hxx": "cpp",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".tsx": "tsx",
}

# Nodes whose children are read as if they were at the top level: include
# guards and conditional blocks, extern "C", namespaces, exports.
CONTAINERS = {
    "translation_unit",
    "program",
    "preproc_ifdef",
    "preproc_if",
    "preproc_else",
    "preproc_elif",
    "preproc_elifdef",
    "linkage_specification",
    "declaration_list",
    "statement_block",
}

MACRO_KINDS = {"preproc_def", "preproc_function_def"}


@dataclass
class CodeChunk:
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class _Symbol:
    kind: str
    name: str
    start_byte: int
    end_byte: int
    start_line: int  # 1-based
    end_line: int
    signature: str
    body_start_byte: int | None = None
    members: list[_Symbol] = field(default_factory=list)
    names: list[str] = field(default_factory=list)


def language_for(relative_path: str) -> str | None:
    return LANGUAGE_BY_EXTENSION.get(PurePosixPath(relative_path).suffix.lower())


def expected_chunker(relative_path: str) -> str:
    return SYMBOL_CHUNKER if language_for(relative_path) else SIZE_CHUNKER


def chunk_code(text: str, relative_path: str, chunk_size: int, chunk_overlap: int) -> list[CodeChunk] | None:
    """Chunk a source file by symbol; None when the file cannot be read that way.

    None sends the caller back to size-based chunking, so a file the parser
    cannot handle is still ingested, never dropped.
    """
    language = language_for(relative_path)
    if language is None:
        return None
    try:
        return _chunk(text, relative_path, language, chunk_size, chunk_overlap)
    except Exception:  # a parser defect must cost the symbols, not the file
        return None


def _chunk(text: str, relative_path: str, language: str, chunk_size: int, chunk_overlap: int) -> list[CodeChunk] | None:
    source = text.encode("utf-8")
    tree = _parser(language).parse(source)
    root = tree.root_node
    symbols = _merge_macros(_collect(root, source, "", language), source, chunk_size)
    if not symbols and root.has_error:
        return None

    chunks: list[CodeChunk] = []
    covered: list[tuple[int, int]] = []
    for symbol in symbols:
        chunks.extend(_symbol_chunks(symbol, source, relative_path, language, chunk_size))
        covered.append((symbol.start_byte, symbol.end_byte))

    remainder = _remainder(source, covered)
    for part in chunk_text(remainder, chunk_size, chunk_overlap):
        chunks.append(CodeChunk(part, {"language": language, "symbolKind": "file"}))
    return chunks


@lru_cache(maxsize=None)
def _parser(language: str) -> Any:
    import tree_sitter

    if language == "c":
        import tree_sitter_c as grammar

        handle = grammar.language()
    elif language == "cpp":
        import tree_sitter_cpp as grammar

        handle = grammar.language()
    elif language == "javascript":
        import tree_sitter_javascript as grammar

        handle = grammar.language()
    else:
        import tree_sitter_typescript as grammar

        handle = grammar.language_tsx() if language == "tsx" else grammar.language_typescript()
    return tree_sitter.Parser(tree_sitter.Language(handle))


def _node_text(source: bytes, node: Any) -> str:
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _collect(node: Any, source: bytes, scope: str, language: str) -> list[_Symbol]:
    symbols: list[_Symbol] = []
    children = list(node.named_children)
    for index, child in enumerate(children):
        kind = child.type
        if kind in CONTAINERS:
            symbols.extend(_collect(child, source, scope, language))
            continue
        if kind == "namespace_definition" or kind in {"internal_module", "module"}:
            name = _field_text(child, source, "name")
            body = child.child_by_field_name("body")
            if body is not None:
                symbols.extend(_collect(body, source, _qualify(scope, name, language), language))
            continue
        if kind == "export_statement":
            inner = child.child_by_field_name("declaration")
            if inner is not None:
                found = _symbol(inner, source, scope, language)
                if found:
                    # The chunk keeps the `export` keyword and any decorators.
                    found.start_byte = child.start_byte
                    found.start_line = child.start_point[0] + 1
                    symbols.append(_with_leading_comments(found, children, index, source))
            continue
        found = _symbol(child, source, scope, language)
        if found:
            symbols.append(_with_leading_comments(found, children, index, source))
    return symbols


def _symbol(node: Any, source: bytes, scope: str, language: str) -> _Symbol | None:
    kind = node.type
    if kind == "template_declaration":
        inner = next((child for child in node.named_children if child.type in {
            "function_definition", "class_specifier", "struct_specifier", "declaration",
        }), None)
        if inner is None:
            return None
        found = _symbol(inner, source, scope, language)
        if found:
            found.start_byte = node.start_byte
            found.start_line = node.start_point[0] + 1
            found.signature = _signature(node, source, found.body_start_byte)
        return found

    if kind == "function_definition":
        name = _declarator_name(node.child_by_field_name("declarator"), source)
        if not name:
            return None
        # `Uart::recv` defined outside its class is a method; a function in
        # a namespace is still a function.
        symbol_kind = "method" if "::" in name else "function"
        return _make(node, source, symbol_kind, _qualify(scope, name, language), node.child_by_field_name("body"))

    if kind in {"struct_specifier", "union_specifier", "enum_specifier", "class_specifier"}:
        body = node.child_by_field_name("body")
        if body is None:
            return None  # a forward declaration or a use, not a definition
        name = _field_text(node, source, "name") or "(anonymous)"
        symbol_kind = kind.split("_")[0]
        symbol = _make(node, source, symbol_kind, _qualify(scope, name, language), body)
        _take_semicolon(symbol, source)
        if kind in {"class_specifier", "struct_specifier"} and language == "cpp":
            symbol.members = _members(body, source, symbol.name, language)
        return symbol

    if kind == "type_definition":
        declarators = node.children_by_field_name("declarator")
        name = _node_text(source, declarators[-1]) if declarators else ""
        type_node = node.child_by_field_name("type")
        body = type_node.child_by_field_name("body") if type_node is not None else None
        return _make(node, source, "typedef", _qualify(scope, name.strip() or "(anonymous)", language), body)

    if kind in MACRO_KINDS:
        name = _field_text(node, source, "name")
        return _make(node, source, "macro", name, None) if name else None

    if kind in {"function_declaration", "generator_function_declaration"}:
        name = _field_text(node, source, "name")
        return _make(node, source, "function", _qualify(scope, name, language), node.child_by_field_name("body")) if name else None

    if kind in {"class_declaration", "abstract_class_declaration", "class"}:
        name = _field_text(node, source, "name") or "(anonymous)"
        body = node.child_by_field_name("body")
        symbol = _make(node, source, "class", _qualify(scope, name, language), body)
        if body is not None:
            symbol.members = _members(body, source, symbol.name, language)
        return symbol

    if kind in {"interface_declaration", "type_alias_declaration", "enum_declaration"}:
        name = _field_text(node, source, "name")
        symbol_kind = {"interface_declaration": "interface", "type_alias_declaration": "type", "enum_declaration": "enum"}[kind]
        return _make(node, source, symbol_kind, _qualify(scope, name, language), node.child_by_field_name("body")) if name else None

    if kind in {"lexical_declaration", "variable_declaration"}:
        # `const handler = () => {...}` is a function in all but syntax.
        for declarator in node.named_children:
            if declarator.type != "variable_declarator":
                continue
            value = declarator.child_by_field_name("value")
            if value is not None and value.type in {"arrow_function", "function_expression", "function", "generator_function"}:
                name = _field_text(declarator, source, "name")
                if name:
                    return _make(node, source, "function", _qualify(scope, name, language), value.child_by_field_name("body"))
        return None

    return None


def _members(body: Any, source: bytes, owner: str, language: str) -> list[_Symbol]:
    members: list[_Symbol] = []
    children = list(body.named_children)
    for index, child in enumerate(children):
        name = ""
        target = child
        if child.type == "method_definition":
            name = _field_text(child, source, "name")
        elif child.type == "function_definition":
            name = _declarator_name(child.child_by_field_name("declarator"), source)
        elif child.type == "template_declaration":
            inner = next((item for item in child.named_children if item.type == "function_definition"), None)
            if inner is not None:
                name = _declarator_name(inner.child_by_field_name("declarator"), source)
                target = inner
        if not name:
            continue
        member = _make(child, source, "method", _qualify(owner, name, language), target.child_by_field_name("body"))
        members.append(_with_leading_comments(member, children, index, source))
    return members


def _make(node: Any, source: bytes, kind: str, name: str, body: Any) -> _Symbol:
    body_start = body.start_byte if body is not None else None
    return _Symbol(
        kind=kind,
        name=name,
        start_byte=node.start_byte,
        end_byte=node.end_byte,
        start_line=node.start_point[0] + 1,
        end_line=node.end_point[0] + 1 if node.end_point[1] > 0 or node.end_point[0] == node.start_point[0] else node.end_point[0],
        signature=_signature(node, source, body_start),
        body_start_byte=body_start,
        names=[name],
    )


def _take_semicolon(symbol: _Symbol, source: bytes) -> None:
    """`struct foo {...};` parses with the `;` outside the specifier."""
    rest = source[symbol.end_byte:symbol.end_byte + 64]
    stripped = rest.lstrip(b" \t")
    if stripped.startswith(b";"):
        symbol.end_byte += len(rest) - len(stripped) + 1


def _with_leading_comments(symbol: _Symbol, siblings: list[Any], index: int, source: bytes) -> _Symbol:
    """Take the comment block that sits directly above a symbol into its chunk."""
    line = symbol.start_line - 1  # 0-based row the symbol starts on
    position = index - 1
    while position >= 0:
        sibling = siblings[position]
        if sibling.type != "comment" or sibling.end_point[0] < line - 1:
            break
        symbol.start_byte = sibling.start_byte
        symbol.start_line = sibling.start_point[0] + 1
        line = sibling.start_point[0]
        position -= 1
    return symbol


def _signature(node: Any, source: bytes, body_start: int | None) -> str:
    end = body_start if body_start is not None else node.end_byte
    head = source[node.start_byte:end].decode("utf-8", errors="replace")
    if body_start is None:
        head = head.splitlines()[0] if head else ""
    collapsed = " ".join(head.split()).rstrip(" {=")
    return collapsed if len(collapsed) <= 300 else f"{collapsed[:297]}..."


def _field_text(node: Any, source: bytes, name: str) -> str:
    child = node.child_by_field_name(name)
    return _node_text(source, child).strip() if child is not None else ""


def _declarator_name(node: Any, source: bytes) -> str:
    """Walk pointer/function/reference declarators down to the declared name."""
    while node is not None:
        if node.type in {"identifier", "field_identifier", "qualified_identifier", "destructor_name", "operator_name", "template_function"}:
            return _node_text(source, node).strip()
        inner = node.child_by_field_name("declarator")
        if inner is None:
            named = [child for child in node.named_children if child.type != "parameter_list"]
            inner = named[0] if named else None
        node = inner
    return ""


def _qualify(scope: str, name: str, language: str) -> str:
    if not scope or not name:
        return name or scope
    separator = "::" if language in {"c", "cpp"} else "."
    return f"{scope}{separator}{name}"


def _merge_macros(symbols: list[_Symbol], source: bytes, chunk_size: int) -> list[_Symbol]:
    """Adjacent macros become one block: a register map is read together."""
    merged: list[_Symbol] = []
    for symbol in symbols:
        previous = merged[-1] if merged else None
        if (
            previous is not None
            and symbol.kind == "macro"
            and previous.kind == "macro"
            and symbol.start_line <= previous.end_line + 2
            and symbol.end_byte - previous.start_byte <= chunk_size
            # Only macros and blank lines between: an #include or a
            # declaration in the gap belongs to the file-level text.
            and not source[previous.end_byte:symbol.start_byte].strip()
        ):
            previous.end_byte = symbol.end_byte
            previous.end_line = symbol.end_line
            previous.names.append(symbol.name)
            continue
        merged.append(symbol)
    return merged


def _symbol_chunks(symbol: _Symbol, source: bytes, relative_path: str, language: str, chunk_size: int) -> list[CodeChunk]:
    text = source[symbol.start_byte:symbol.end_byte].decode("utf-8", errors="replace").rstrip()
    base = {
        "language": language,
        "symbol": symbol.name,
        "symbolKind": symbol.kind,
        "signature": symbol.signature,
    }
    if len(symbol.names) > 1:
        base["symbols"] = symbol.names
    header = f"// {relative_path}: {symbol.kind} {symbol.name}"

    if len(text) + len(header) + 1 <= chunk_size or not text:
        return [CodeChunk(f"{header}\n{text}", {**base, "startLine": symbol.start_line, "endLine": symbol.end_line})]

    if symbol.members:
        return _split_by_members(symbol, source, relative_path, language, chunk_size, base, header)
    return _split_by_lines(text, symbol, chunk_size, base, header)


def _split_by_members(
    symbol: _Symbol,
    source: bytes,
    relative_path: str,
    language: str,
    chunk_size: int,
    base: dict[str, Any],
    header: str,
) -> list[CodeChunk]:
    """A class too large for one chunk: each method alone, the rest as the class."""
    chunks: list[CodeChunk] = []
    covered: list[tuple[int, int]] = []
    for member in symbol.members:
        chunks.extend(_symbol_chunks(member, source, relative_path, language, chunk_size))
        covered.append((member.start_byte, member.end_byte))
    shell = _remainder(source[:symbol.end_byte], [(0, symbol.start_byte), *covered])
    shell_symbol = _Symbol(symbol.kind, symbol.name, 0, len(shell), symbol.start_line, symbol.end_line, symbol.signature)
    chunks[:0] = _split_by_lines(shell.rstrip(), shell_symbol, chunk_size, base, header) if len(shell) + len(header) >= chunk_size else [
        CodeChunk(f"{header}\n{shell.rstrip()}", {**base, "startLine": symbol.start_line, "endLine": symbol.end_line})
    ]
    return chunks


def _split_by_lines(text: str, symbol: _Symbol, chunk_size: int, base: dict[str, Any], header: str) -> list[CodeChunk]:
    """Cut an over-long symbol at line ends; every part opens with its signature."""
    lines = text.splitlines()
    parts: list[tuple[int, int]] = []  # (first line index, last line index), inclusive
    budget = max(chunk_size - len(header) - len(symbol.signature) - 40, chunk_size // 3)
    start = 0
    size = 0
    for index, line in enumerate(lines):
        if size and size + len(line) + 1 > budget:
            parts.append((start, index - 1))
            start, size = index, 0
        size += len(line) + 1
    parts.append((start, len(lines) - 1))

    chunks: list[CodeChunk] = []
    total = len(parts)
    for number, (first, last) in enumerate(parts, start=1):
        body = "\n".join(lines[first:last + 1])
        if number > 1:
            body = f"{symbol.signature}\n    /* ... continued, part {number}/{total} */\n{body}"
        chunks.append(CodeChunk(
            f"{header}\n{body}",
            {
                **base,
                "startLine": symbol.start_line + first,
                "endLine": symbol.start_line + last,
                "part": number,
                "parts": total,
            },
        ))
    return chunks


BLANK_RUNS = re.compile(r"\n{3,}")


def _remainder(source: bytes, covered: list[tuple[int, int]]) -> str:
    """The text of the file outside every symbol: includes, imports, globals."""
    pieces: list[bytes] = []
    position = 0
    for start, end in sorted(covered):
        if start > position:
            pieces.append(source[position:start])
        position = max(position, end)
    pieces.append(source[position:])
    text = b"".join(pieces).decode("utf-8", errors="replace")
    return BLANK_RUNS.sub("\n\n", text).strip()
