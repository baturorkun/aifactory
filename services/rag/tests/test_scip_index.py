"""Precise edge targets from the SCIP index a release publishes (RQ-0027)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.ingest.git_inputs import RepositoryInput, RepositoryTree, find_scip_index
from aifactory_rag.ingest.pipeline import _uses_by_line
from aifactory_rag.ingest.scip_index import read_index


def _varint(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        out.append(byte | (0x80 if value else 0))
        if not value:
            return bytes(out)


def _field(number: int, payload: bytes) -> bytes:
    return _varint(number << 3 | 2) + _varint(len(payload)) + payload


def _occurrence(line: int, start: int, end: int, symbol: str, definition: bool = False, end_line: int | None = None) -> bytes:
    span = [line, start, end] if end_line is None else [line, start, end_line, end]
    body = _field(1, b"".join(_varint(v) for v in span)) + _field(2, symbol.encode())
    if definition:
        body += _varint(3 << 3) + _varint(1)
    return body


def _document(path: str, *occurrences: bytes) -> bytes:
    return _field(1, path.encode()) + b"".join(_field(2, occurrence) for occurrence in occurrences)


def _index(*documents: bytes) -> bytes:
    return b"".join(_field(2, document) for document in documents)


SERIALIZE = "cxx . . $ ReverseLabelBits(aaaa)."
DESERIALIZE = "cxx . . $ ReverseLabelBits(bbbb)."
FPGA_BASE = "cxx . . $ `Development/CommDrivers/CoreArinc429/core_arinc429_regs.h:58:9`!"

INDEX = _index(
    _document(
        "src/serialize.c",
        _occurrence(2, 11, 27, SERIALIZE, definition=True, end_line=4),
        _occurrence(9, 4, 20, SERIALIZE),
        _occurrence(9, 25, 34, "local 3"),
    ),
    _document("src/regs.h", _occurrence(57, 8, 17, FPGA_BASE, definition=True)),
    _document("src/deserialize.c", _occurrence(2, 11, 27, DESERIALIZE, definition=True), _occurrence(12, 4, 13, FPGA_BASE)),
)


class ReadIndexTests(unittest.TestCase):
    def test_documents_uses_and_definitions(self) -> None:
        index = read_index(INDEX)

        self.assertEqual(set(index.documents), {"src/serialize.c", "src/regs.h", "src/deserialize.c"})
        self.assertEqual(index.definitions[SERIALIZE], ("src/serialize.c", 3))  # 1-based
        self.assertEqual(index.definitions[DESERIALIZE], ("src/deserialize.c", 3))
        # function-locals are never targets
        self.assertNotIn("local 3", {o.symbol for o in index.documents["src/serialize.c"]})
        multi_line = index.documents["src/serialize.c"][0]
        self.assertEqual((multi_line.line, multi_line.start, multi_line.end), (3, 11, 27))

    def test_uses_are_keyed_by_line_and_the_text_they_cover(self) -> None:
        index = read_index(INDEX)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "src" / "serialize.c"
            path.parent.mkdir()
            lines = [""] * 12
            lines[9] = "    ReverseLabelBits(word, label);"
            path.write_text("\n".join(lines), encoding="utf-8")

            uses = _uses_by_line(Path(directory), "src/serialize.c", index.documents["src/serialize.c"], index)

        # the static in this file, not the same-named one in deserialize.c
        self.assertEqual(uses, {(10, "ReverseLabelBits"): ("src/serialize.c", 3)})


BOARD_UART_INIT = "cxx . . $ board_uart_init(49f6e7a06ebc5aa8)."
PROBES = _index(
    _document("probes/boot-console/board.c", _occurrence(79, 5, 20, BOARD_UART_INIT, definition=True)),
    _document("probes/a429-lite/board.c", _occurrence(48, 5, 20, BOARD_UART_INIT, definition=True)),
    _document("probes/a429-lite/main.c", _occurrence(19, 4, 19, BOARD_UART_INIT)),
    _document("probes/shared/a/board.c", _occurrence(9, 5, 20, BOARD_UART_INIT, definition=True)),
)
PROBE_STEPS = "cxx . . $ probe_steps."
STEPS = _index(
    _document("probes/a429-lite/probe.h", _occurrence(47, 33, 44, PROBE_STEPS, definition=True)),
    _document("probes/a429-lite/main.c", _occurrence(34, 18, 29, PROBE_STEPS, definition=True)),
    _document("probes/boot-console/probe.h", _occurrence(47, 33, 44, PROBE_STEPS, definition=True)),
    _document("probes/boot-console/main.c", _occurrence(20, 18, 29, PROBE_STEPS, definition=True)),
)


class AmbiguousSymbolTests(unittest.TestCase):
    """bfi-sumilator's probes are separate programs; scip-clang gives their
    same-named C functions one symbol."""

    def test_a_symbol_defined_twice_is_not_a_single_definition(self) -> None:
        index = read_index(PROBES)
        self.assertNotIn(BOARD_UART_INIT, index.definitions)
        self.assertEqual(len(index.ambiguous[BOARD_UART_INIT]), 3)

    def test_a_use_reaches_the_definition_in_its_own_directory(self) -> None:
        index = read_index(PROBES)
        self.assertEqual(
            index.definition_for(BOARD_UART_INIT, "probes/a429-lite/main.c"), ("probes/a429-lite/board.c", 49)
        )

    def test_a_tie_stays_unresolved(self) -> None:
        index = read_index(PROBES)
        self.assertIsNone(index.definition_for(BOARD_UART_INIT, "probes/timer-uarts/main.c"))

    def test_a_tie_goes_to_the_source_file_over_its_header_extern(self) -> None:
        index = read_index(STEPS)
        self.assertEqual(index.definition_for(PROBE_STEPS, "probes/a429-lite/probe.c"), ("probes/a429-lite/main.c", 35))

    def test_the_same_location_twice_is_one_definition(self) -> None:
        header = _document("src/regs.h", _occurrence(57, 8, 17, FPGA_BASE, definition=True))
        index = read_index(_index(header, header))  # two indexes concatenated
        self.assertEqual(index.definitions[FPGA_BASE], ("src/regs.h", 58))


class Response:
    def __init__(self, status_code: int, payload: object = None, content: bytes = b"") -> None:
        self.status_code = status_code
        self._payload = payload
        self.content = content

    def json(self) -> object:
        return self._payload


class FakeClient:
    def __init__(self, routes: dict[str, Response]) -> None:
        self.routes = routes
        self.requested: list[str] = []

    def __call__(self, **_: object) -> "FakeClient":
        return self

    def __enter__(self) -> "FakeClient":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def get(self, url: str, params: object = None) -> Response:
        self.requested.append(url)
        for suffix, response in self.routes.items():
            if url.endswith(suffix):
                return response
        return Response(404)


REPOSITORY = RepositoryInput(
    entry="RAG_SOURCE_3_REPO_1", key="gitlab.bc.int/aselsan/bfi-sw", project_path="aselsan/bfi-sw",
    clone_url="http://gitlab.bc.int/aselsan/bfi-sw.git", web_url="http://gitlab.bc.int/aselsan/bfi-sw",
    token_env="RAG_SOURCE_3_REPO_1_TOKEN", ref="@last-release",
)
ENV = {"RAG_SOURCE_3_REPO_1_TOKEN": "glpat-test"}


def tree(is_tag: bool) -> RepositoryTree:
    return RepositoryTree(worktree=Path("/nowhere"), ref="1.2.0" if is_tag else "main", commit="c0ffee" * 6 + "abcd", blobs={}, is_tag=is_tag)


class FindIndexTests(unittest.TestCase):
    def _find(self, routes: dict[str, Response], is_tag: bool = True):
        client = FakeClient(routes)
        with patch("aifactory_rag.ingest.git_inputs.httpx.Client", client):
            data, origin = find_scip_index(REPOSITORY, tree(is_tag), ENV)
        return data, origin, client.requested

    def test_a_release_package_holding_index_scip_is_used(self) -> None:
        data, origin, _ = self._find({
            "/packages": Response(200, [{"id": 7, "name": "bfi-firmware"}]),
            "/packages/7/package_files": Response(200, [{"file_name": "bfiFirmware.elf"}, {"file_name": "index.scip"}]),
            "/packages/generic/bfi-firmware/1.2.0/index.scip": Response(200, content=b"SCIP"),
        })
        self.assertEqual((data, origin), (b"SCIP", "package bfi-firmware 1.2.0"))

    def test_without_a_package_the_commits_pipeline_artifacts_are_searched(self) -> None:
        data, origin, requested = self._find({
            "/packages": Response(200, []),
            "/pipelines": Response(200, [{"id": 1393, "status": "running"}, {"id": 1392, "status": "failed"}]),
            "/pipelines/1392/jobs": Response(200, [
                {"id": 1, "name": "build-firmware", "status": "success", "artifacts": [{"file_type": "archive"}]},
                {"id": 3, "name": "smoke", "status": "failed", "artifacts": [{"file_type": "archive"}]},
                {"id": 2, "name": "scip-index", "status": "success", "artifacts": [{"file_type": "archive"}]},
            ]),
            "/jobs/2/artifacts/index.scip": Response(200, content=b"SCIP"),
        })
        self.assertEqual((data, origin), (b"SCIP", "pipeline 1392 job scip-index"))
        self.assertTrue(any(url.endswith("/jobs/1/artifacts/index.scip") for url in requested))
        # a failed job's artifacts are not read, and a running pipeline is not used
        self.assertFalse(any(url.endswith("/jobs/3/artifacts/index.scip") for url in requested))
        self.assertFalse(any("/pipelines/1393/" in url for url in requested))

    def test_a_branch_skips_the_packages(self) -> None:
        _, _, requested = self._find({"/pipelines": Response(200, [])}, is_tag=False)
        self.assertFalse(any(url.endswith("/packages") for url in requested))

    def test_no_index_and_no_api_access_are_notes_not_errors(self) -> None:
        data, origin, _ = self._find({"/packages": Response(200, []), "/pipelines": Response(200, [])})
        self.assertIsNone(data)
        self.assertIn("no SCIP index for 1.2.0", origin)

        data, origin, _ = self._find({"/packages": Response(403)})
        self.assertIsNone(data)
        self.assertIn("RAG_SOURCE_3_REPO_1_TOKEN cannot read the packages (needs read_api)", origin)


if __name__ == "__main__":
    unittest.main()
