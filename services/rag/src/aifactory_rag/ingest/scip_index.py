"""Reading a SCIP index (RQ-0027).

SCIP is protobuf. Only a handful of fields are needed - each document's path
and its occurrences (range, symbol, roles) - so they are read with a small
wire-format decoder instead of generated code and a protobuf dependency:

    Index       documents = 2
    Document    relative_path = 1, occurrences = 2
    Occurrence  range = 1 (packed int32: line, start, [end_line,] end),
                symbol = 2, symbol_roles = 3

Lines and characters are 0-based in SCIP and 1-based here. A symbol starting
with `local ` is a function-local and never an edge target.
"""

from __future__ import annotations

from dataclasses import dataclass, field

DEFINITION_ROLE = 0x1


@dataclass(frozen=True)
class Occurrence:
    line: int  # 1-based
    start: int  # 0-based character
    end: int
    symbol: str
    is_definition: bool


@dataclass
class ScipIndex:
    documents: dict[str, list[Occurrence]] = field(default_factory=dict)
    # symbol -> (path, 1-based line) of its definition
    definitions: dict[str, tuple[str, int]] = field(default_factory=dict)


def read_index(data: bytes) -> ScipIndex:
    index = ScipIndex()
    for number, _, value in _fields(data):
        if number != 2:
            continue
        path = ""
        occurrences: list[Occurrence] = []
        for field_number, _, item in _fields(value):
            if field_number == 1:
                path = item.decode("utf-8")
            elif field_number == 2:
                occurrence = _occurrence(item)
                if occurrence is not None:
                    occurrences.append(occurrence)
        if not path:
            continue
        index.documents.setdefault(path, []).extend(occurrences)
        for occurrence in occurrences:
            if occurrence.is_definition:
                index.definitions.setdefault(occurrence.symbol, (path, occurrence.line))
    return index


def _occurrence(data: bytes) -> Occurrence | None:
    span: list[int] = []
    symbol = ""
    roles = 0
    for number, wire, value in _fields(data):
        if number == 1:
            span = _packed(value) if wire == 2 else span + [value]
        elif number == 2:
            symbol = value.decode("utf-8")
        elif number == 3:
            roles = value
    if not symbol or symbol.startswith("local ") or len(span) < 3:
        return None
    end = span[3] if len(span) >= 4 else span[2]
    return Occurrence(line=span[0] + 1, start=span[1], end=end, symbol=symbol, is_definition=bool(roles & DEFINITION_ROLE))


def _varint(data: bytes, position: int) -> tuple[int, int]:
    result = shift = 0
    while True:
        byte = data[position]
        position += 1
        result |= (byte & 0x7F) << shift
        shift += 7
        if byte < 0x80:
            return result, position


def _fields(data: bytes):
    position = 0
    while position < len(data):
        key, position = _varint(data, position)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, position = _varint(data, position)
        elif wire == 2:
            length, position = _varint(data, position)
            value = data[position:position + length]
            position += length
        elif wire == 1:
            value, position = data[position:position + 8], position + 8
        elif wire == 5:
            value, position = data[position:position + 4], position + 4
        else:
            raise ValueError(f"unsupported protobuf wire type {wire}")
        yield number, wire, value


def _packed(data: bytes) -> list[int]:
    values: list[int] = []
    position = 0
    while position < len(data):
        value, position = _varint(data, position)
        values.append(value)
    return values
