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

One symbol can be defined in several places. scip-clang names a C function
by its name alone, so separate programs in one repository (bfi-sumilator's
probes each have a `board_uart_init`) share a symbol. A use then reaches the
definition nearest to it - the one sharing the longest directory with the
using file. scip-clang also marks a header's `extern` declaration as a
definition, so a tie goes to the one source file among the nearest, and
stays unresolved when there is not exactly one.
"""

from __future__ import annotations

from dataclasses import dataclass, field

DEFINITION_ROLE = 0x1
HEADER_SUFFIXES = (".h", ".hh", ".hpp", ".hxx")


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
    # symbol -> (path, 1-based line) of its definition, for symbols defined once
    definitions: dict[str, tuple[str, int]] = field(default_factory=dict)
    # symbol -> every (path, line) defining it, for symbols defined more than once
    ambiguous: dict[str, list[tuple[str, int]]] = field(default_factory=dict)

    def definition_for(self, symbol: str, path: str) -> tuple[str, int] | None:
        """The definition a use of `symbol` in `path` reaches, or None."""
        definition = self.definitions.get(symbol)
        if definition is not None:
            return definition
        candidates = self.ambiguous.get(symbol)
        if not candidates:
            return None
        depth = {candidate: _shared_depth(candidate[0], path) for candidate in candidates}
        best = max(depth.values())
        nearest = [candidate for candidate, value in depth.items() if value == best]
        if len(nearest) > 1:
            nearest = [candidate for candidate in nearest if not candidate[0].lower().endswith(HEADER_SUFFIXES)]
        return nearest[0] if len(nearest) == 1 else None


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
                _add_definition(index, occurrence.symbol, (path, occurrence.line))
    return index


def _add_definition(index: ScipIndex, symbol: str, location: tuple[str, int]) -> None:
    candidates = index.ambiguous.get(symbol)
    if candidates is not None:
        if location not in candidates:
            candidates.append(location)
        return
    first = index.definitions.get(symbol)
    if first is None:
        index.definitions[symbol] = location
    elif first != location:
        del index.definitions[symbol]
        index.ambiguous[symbol] = [first, location]


def _shared_depth(left: str, right: str) -> int:
    """How many leading directories two paths share."""
    depth = 0
    for a, b in zip(left.split("/")[:-1], right.split("/")[:-1]):
        if a != b:
            break
        depth += 1
    return depth


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
