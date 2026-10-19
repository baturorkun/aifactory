"""Files that used to keep a source red although the corpus was fine (RQ-0050):
an empty file, a JSON with comments, and a run a service restart cut short."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from aifactory_rag.ingest.parsers import parse_file
from aifactory_rag.ingest.pipeline import _ingest_file
from aifactory_rag.ingest.sources import SourceFile
from aifactory_rag.webhook import IngestQueue, resume_interrupted


class UnreadableFileTests(unittest.TestCase):
    def test_json_with_comments_is_read_as_text(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "devcontainer.json"
            path.write_text('// the build container\n{\n    "name": "tes-sdk",\n}\n', encoding="utf-8")
            text = parse_file(path)
            self.assertIn("// the build container", text)
            self.assertIn('"name": "tes-sdk"', text)

            plain = Path(root) / "settings.json"
            plain.write_text('{"a":1}', encoding="utf-8")
            self.assertEqual(parse_file(plain), '{\n  "a": 1\n}')

    def test_an_empty_file_is_skipped_without_being_opened(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "BGGS-SSDD-001 copy.docx"
            path.write_bytes(b"")
            file = SourceFile(path=path, relative_path=path.name, size=0, modified_timestamp=0.0)
            # No database, config or embedder: an empty file never reaches them.
            self.assertEqual(_ingest_file(None, None, None, file, None, False), ("skipped", False))  # type: ignore[arg-type]


class ResumeInterruptedTests(unittest.TestCase):
    def test_each_enabled_source_is_ingested_once_for_its_latest_run(self) -> None:
        runs: list[tuple[str, str | None]] = []
        queue = IngestQueue(lambda source_id, who: runs.append((source_id, who)))
        trigger_calls: list[tuple[str, str | None]] = []
        queue.trigger = lambda source_id, started_by=None: trigger_calls.append((source_id, started_by)) or "started"  # type: ignore[method-assign]

        started = resume_interrupted(
            [(360, "aselsan-bfi"), (362, "aselsan-bfi"), (357, "2d-ge-ipc"), (300, "old")],
            queue,
            enabled=lambda source_id: source_id != "old",
        )
        self.assertEqual(started, ["2d-ge-ipc", "aselsan-bfi"])
        self.assertEqual(trigger_calls, [
            ("2d-ge-ipc", "service restart (run 357 was interrupted)"),
            ("aselsan-bfi", "service restart (run 362 was interrupted)"),
        ])

    def test_nothing_interrupted_starts_nothing(self) -> None:
        queue = IngestQueue(lambda source_id, who: None)
        self.assertEqual(resume_interrupted([], queue, enabled=lambda _: True), [])


if __name__ == "__main__":
    unittest.main()
