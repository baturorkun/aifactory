"""One chunk per requirement of an IBM DOORS module export (RQ-0037).

A module leaves DOORS as a file of JSON lines, `<module>.doors.jsonl`, written
by `doors_client/export.dxl`: the module first, then every object with its
identifier, number, level, heading, text, attributes and links. A requirement
is a sentence or two, and a size chunker would glue a dozen of them together
and cut the thirteenth in half; here each object with text is its own chunk,
headed by the module and the headings above it, so an answer can cite the
requirement by its identifier.

The object's attributes and links are stored under its text, for the answer,
but are not embedded: a dozen attribute lines that hardly differ from one
requirement to the next would outweigh the one sentence that does.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from aifactory_rag.ingest.chunker import chunk_text
from aifactory_rag.ingest.code_chunker import CodeChunk

DOORS_CHUNKER = "doors-v1"
DOORS_SUFFIX = ".doors.jsonl"

# What DOORS keeps about an object for itself: who made it and when, how its
# table cell is drawn, whether it holds a picture. Not part of the requirement.
BOOKKEEPING_ATTRIBUTES = frozenset({
    "Created By", "Created On", "Created Thru", "Last Modified By", "Last Modified On",
    "OLE", "OLEIconic", "Picture",
})
BOOKKEEPING_PREFIX = "Table"

# The least room a requirement's text gets under a long heading trail.
MIN_TEXT_BUDGET = 200


class DoorsExportError(ValueError):
    """A file named like a DOORS export that is not one."""


@dataclass(frozen=True)
class DoorsExport:
    path: str  # the module's full name in DOORS, /PROJECT/Folder/Module
    name: str
    prefix: str
    objects: list[dict[str, Any]]


def is_doors_export(relative_path: str) -> bool:
    return relative_path.lower().endswith(DOORS_SUFFIX)


def read_export(text: str) -> DoorsExport:
    """The module and its objects; an error names the line that is wrong."""
    module: dict[str, Any] | None = None
    objects: list[dict[str, Any]] = []
    for number, line in enumerate(text.lstrip("﻿").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise DoorsExportError(f"line {number}: not JSON ({exc.msg})") from exc
        if not isinstance(row, dict):
            raise DoorsExportError(f"line {number}: not a JSON object")
        if module is None:
            if row.get("kind") != "module" or not row.get("path"):
                raise DoorsExportError(f"line {number}: not a DOORS export, the module line comes first")
            module = row
        elif row.get("kind") == "object":
            objects.append(row)
        else:
            raise DoorsExportError(f"line {number}: neither the module nor an object")
    if module is None:
        raise DoorsExportError("line 1: not a DOORS export, the file is empty")
    return DoorsExport(
        path=str(module["path"]),
        name=str(module.get("name") or str(module["path"]).rsplit("/", 1)[-1]),
        prefix=str(module.get("prefix") or ""),
        objects=objects,
    )


def chunk_doors(text: str, chunk_size: int) -> list[CodeChunk]:
    export = read_export(text)
    chunks: list[CodeChunk] = []
    trail: list[tuple[int, str]] = []  # the headings above the current object
    index = 0
    while index < len(export.objects):
        item = export.objects[index]
        index += 1
        level = _level(item)
        while trail and trail[-1][0] >= level:
            trail.pop()
        section = " > ".join(title for _, title in trail)
        heading = str(item.get("heading") or "").strip()
        if heading:
            trail.append((level, f"{item.get('number') or ''} {heading}".strip()))
        if item.get("shape") == "table":
            rows: list[str] = []
            cells: list[str] = []
            while index < len(export.objects) and export.objects[index].get("shape") in {"row", "cell"}:
                part = export.objects[index]
                index += 1
                if part.get("shape") == "row":
                    rows.append(" | ".join(cells))
                    cells = []
                else:
                    cells.append(" ".join(str(part.get("text") or "").split()))
            rows.append(" | ".join(cells))
            body = "\n".join(row for row in rows if row.replace("|", "").strip())
        else:
            body = str(item.get("text") or "").strip()
            if heading and body:
                section = " > ".join(title for _, title in trail)
        if body:
            chunks.extend(_chunks(export, item, section, body, chunk_size))
    return chunks


def _chunks(export: DoorsExport, item: dict[str, Any], section: str, body: str, chunk_size: int) -> list[CodeChunk]:
    identifier = str(item.get("id") or f"{export.prefix}{item.get('absno', '')}")
    header = f"{export.path} > {section}" if section else export.path
    details = _details(item)
    parts = chunk_text(body, max(chunk_size - len(header) - len(identifier) - 4, MIN_TEXT_BUDGET), 0)
    chunks: list[CodeChunk] = []
    for number, part in enumerate(parts, start=1):
        embedded = f"{header}\n{identifier}\n\n{part}"
        metadata: dict[str, Any] = {
            "doorsModule": export.path,
            "requirement": identifier,
            "section": section or None,
            "number": item.get("number") or None,
        }
        if len(parts) > 1:
            metadata.update({"part": number, "parts": len(parts)})
        chunks.append(CodeChunk(
            f"{embedded}\n\n{details}" if details else embedded,
            {key: value for key, value in metadata.items() if value is not None},
            embedding_text=embedded if details else None,
        ))
    return chunks


def _details(item: dict[str, Any]) -> str:
    """The requirement's own attributes and its links, one per line."""
    lines: list[str] = []
    attributes = item.get("attributes")
    for name, value in (attributes.items() if isinstance(attributes, dict) else ()):
        if name in BOOKKEEPING_ATTRIBUTES or name.startswith(BOOKKEEPING_PREFIX):
            continue
        shown = ", ".join(part.strip() for part in str(value).splitlines() if part.strip())
        if shown:
            lines.append(f"{name}: {shown}")
    for label, key in (("Links to", "outLinks"), ("Linked from", "inLinks")):
        links = [f"{link.get('module')} {link.get('absno')}" for link in item.get(key) or [] if isinstance(link, dict)]
        if links:
            lines.append(f"{label}: {'; '.join(links)}")
    return "\n".join(lines)


def _level(item: dict[str, Any]) -> int:
    try:
        return int(item.get("level") or 1)
    except (TypeError, ValueError):
        return 1
