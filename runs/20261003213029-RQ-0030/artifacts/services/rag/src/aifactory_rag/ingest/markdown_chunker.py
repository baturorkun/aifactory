"""Markdown chunked by section, code blocks kept whole (RQ-0030).

Cutting every N characters split a `docker run` command in a README between
two chunks, its heading and first lines in one and its end in the next; the
question matched the second and the answer could only quote the tail. Here a
file is cut where its author structured it: each heading starts a section, a
fenced code block is never split, a long section is packed paragraph by
paragraph, and every chunk opens with the file and its heading path.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

from aifactory_rag.ingest.code_chunker import CodeChunk

MARKDOWN_CHUNKER = "markdown-v1"
MARKDOWN_EXTENSIONS = {".md", ".markdown"}
# A single code block may grow a chunk up to this many chunk sizes before it
# is split; a command or a register table is worth an oversized chunk.
CODE_BLOCK_LIMIT = 4

_HEADING = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.+?)[ \t#]*$")
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")


@dataclass
class _Block:
    lines: list[str]
    start: int  # 1-based line of the first line
    code: bool = False

    @property
    def text(self) -> str:
        return "\n".join(self.lines)


@dataclass
class _Section:
    path: list[str]
    level: int
    start: int
    blocks: list[_Block] = field(default_factory=list)


def is_markdown(relative_path: str) -> bool:
    return PurePosixPath(relative_path).suffix.lower() in MARKDOWN_EXTENSIONS


def chunk_markdown(text: str, relative_path: str, chunk_size: int) -> list[CodeChunk]:
    sections = _sections(text.splitlines())
    chunks: list[CodeChunk] = []
    for section in sections:
        if not any(block.text.strip() for block in section.blocks):
            continue
        heading = " > ".join(section.path)
        header = f"{relative_path} > {heading}" if heading else relative_path
        parts = _pack(section.blocks, chunk_size - len(header) - 2, chunk_size)
        for number, blocks in enumerate(parts, start=1):
            body = "\n\n".join(block.text for block in blocks).strip("\n")
            metadata: dict[str, Any] = {
                "section": heading or None,
                "headingLevel": section.level,
                "startLine": blocks[0].start,
                "endLine": blocks[-1].start + len(blocks[-1].lines) - 1,
            }
            if len(parts) > 1:
                metadata.update({"part": number, "parts": len(parts)})
            chunks.append(CodeChunk(f"{header}\n\n{body}", {k: v for k, v in metadata.items() if v is not None}))
    return chunks


def _sections(lines: list[str]) -> list[_Section]:
    """Split at headings outside code blocks; each section holds its blocks."""
    sections = [_Section(path=[], level=0, start=1)]
    stack: list[tuple[int, str]] = []
    paragraph: list[str] = []
    paragraph_start = 1
    fence: str | None = None
    code: list[str] = []
    code_start = 1

    def flush_paragraph() -> None:
        nonlocal paragraph
        if any(line.strip() for line in paragraph):
            sections[-1].blocks.append(_Block(paragraph, paragraph_start))
        paragraph = []

    for number, line in enumerate(lines, start=1):
        if fence is not None:
            code.append(line)
            match = _FENCE.match(line)
            if match and match.group(1)[0] == fence[0] and len(match.group(1)) >= len(fence) and not line.strip()[len(match.group(1)):].strip():
                sections[-1].blocks.append(_Block(code, code_start, code=True))
                fence, code = None, []
            continue
        opening = _FENCE.match(line)
        if opening:
            flush_paragraph()
            fence, code, code_start = opening.group(1), [line], number
            continue
        heading = _HEADING.match(line)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, heading.group(2).strip()))
            sections.append(_Section(path=[title for _, title in stack], level=level, start=number))
            sections[-1].blocks.append(_Block([line], number))
            continue
        if not line.strip():
            flush_paragraph()
            paragraph_start = number + 1
            continue
        if not paragraph:
            paragraph_start = number
        paragraph.append(line)

    flush_paragraph()
    if fence is not None:  # an unclosed fence runs to the end of the file
        sections[-1].blocks.append(_Block(code, code_start, code=True))
    return sections


def _pack(blocks: list[_Block], budget: int, chunk_size: int) -> list[list[_Block]]:
    """Paragraphs and code blocks into parts up to the budget, never splitting a block
    except a code block beyond CODE_BLOCK_LIMIT chunk sizes, or a paragraph beyond one."""
    units: list[_Block] = []
    for block in blocks:
        limit = chunk_size * CODE_BLOCK_LIMIT if block.code else budget
        units.extend(_split_block(block, limit, budget) if len(block.text) > limit else [block])
    parts: list[list[_Block]] = []
    current: list[_Block] = []
    size = 0
    for unit in units:
        length = len(unit.text) + 2
        if current and size + length > budget:
            parts.append(current)
            current, size = [], 0
        current.append(unit)
        size += length
    if current:
        parts.append(current)
    return parts


def _split_block(block: _Block, limit: int, budget: int) -> list[_Block]:
    """Cut an oversized block at line ends; a code block's parts reopen its fence."""
    fence = block.lines[0].strip() if block.code else ""
    closing = _FENCE.match(fence).group(1) if block.code else ""
    lines = block.lines[1:-1] if block.code and len(block.lines) > 1 else block.lines
    first = block.start + (1 if block.code else 0)
    room = (budget if not block.code else max(budget, limit // CODE_BLOCK_LIMIT)) - len(fence) - len(closing) - 4
    pieces: list[_Block] = []
    current: list[str] = []
    start = first
    size = 0
    for offset, line in enumerate(lines):
        if current and size + len(line) + 1 > room:
            pieces.append(_wrap(current, start, fence, closing))
            current, size, start = [], 0, first + offset
        current.append(line)
        size += len(line) + 1
    if current:
        pieces.append(_wrap(current, start, fence, closing))
    return pieces


def _wrap(lines: list[str], start: int, fence: str, closing: str) -> _Block:
    if not fence:
        return _Block(lines, start)
    return _Block([fence, *lines, closing], start - 1, code=True)
