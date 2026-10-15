"""A running ingest says who started it and where it is (RQ-0040)."""

from __future__ import annotations

import json
import os
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.cli import _command_line_user
from aifactory_rag.config import RagConfig
from aifactory_rag.ingest import pipeline
from aifactory_rag.ingest.pipeline import IngestSummary, _finish_run, _report_progress, _start_run
from aifactory_rag.status import summarize


class Cursor:
    def __init__(self, connection: "Connection") -> None:
        self.connection = connection

    def __enter__(self) -> "Cursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, statement: str, params: tuple[object, ...] = ()) -> None:
        self.connection.executed.append((" ".join(statement.split()), params))

    def fetchone(self) -> dict[str, object]:
        return {"id": 315}


class Connection:
    closed = False

    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[object, ...]]] = []
        self.commits = 0

    def cursor(self) -> Cursor:
        return Cursor(self)

    def commit(self) -> None:
        self.commits += 1


class RunRecordTests(unittest.TestCase):
    def test_a_run_records_who_started_it(self) -> None:
        connection = Connection()
        self.assertEqual(_start_run(connection, "2d-ge-ipc", "command line (batur)"), 315)  # type: ignore[arg-type]
        statement, params = connection.executed[0]
        self.assertIn("INSERT INTO rag_ingest_runs(source_id, status, started_by)", statement)
        self.assertEqual(params, ("2d-ge-ipc", "command line (batur)"))

    def test_progress_is_written_with_the_counts_so_far(self) -> None:
        connection = Connection()
        summary = IngestSummary(run_id=315, source_id="2d-ge-ipc", status="running", scanned_count=207, inserted_count=192, error_count=1)
        progress = {"kind": "git", "input": "gitlab.bc.int/2d-ge-ipc/teydeb-2d-ge-ipc", "file": "a.pdf", "index": 193, "total": 207}

        _report_progress(connection, RagConfig(), summary, progress)  # type: ignore[arg-type]

        statement, params = connection.executed[0]
        self.assertIn("SET progress = %s::jsonb, scanned_count = %s, inserted_count = %s", statement)
        self.assertEqual(json.loads(str(params[0])), progress)
        self.assertEqual(params[1:], (207, 192, 0, 0, 0, 1, 315))
        self.assertEqual(connection.commits, 1)

    def test_progress_is_cleared_when_a_run_ends_or_is_found_interrupted(self) -> None:
        connection = Connection()
        _finish_run(connection, IngestSummary(run_id=315, source_id="s", status="passed"))  # type: ignore[arg-type]
        self.assertIn("progress = NULL", connection.executed[0][0])
        source = Path(pipeline.__file__).read_text(encoding="utf-8")
        self.assertIn("SET status = 'failed', finished_at = now(), progress = NULL", source)

    def test_the_command_line_names_the_user_behind_sudo(self) -> None:
        with patch.dict(os.environ, {"SUDO_USER": "batur"}):
            self.assertEqual(_command_line_user(), "command line (batur)")
        with patch.dict(os.environ, {}, clear=True), patch("getpass.getuser", return_value="root"):
            self.assertEqual(_command_line_user(), "command line (root)")


class StatusTests(unittest.TestCase):
    NOW = datetime(2026, 10, 15, 9, 30, tzinfo=timezone.utc)

    def run_row(self, **values: object) -> dict[str, object]:
        return {
            "id": 315, "source_id": "2d-ge-ipc", "status": "running", "started_at": datetime(2026, 10, 15, 7, 52, tzinfo=timezone.utc),
            "finished_at": None, "scanned_count": 207, "inserted_count": 192, "updated_count": 0, "skipped_count": 84,
            "deleted_count": 0, "error_count": 1, **values,
        }

    def test_a_running_ingest_gives_who_started_it_and_where_it_is(self) -> None:
        progress = {"kind": "git", "input": "gitlab.bc.int/2d-ge-ipc/teydeb-2d-ge-ipc", "step": "fetching"}
        running = self.run_row(started_by="GitLab push by Batur Orkun to 2d-ge-ipc/teydeb-2d-ge-ipc", progress=progress)

        [item] = summarize(["2d-ge-ipc"], [running], [], [], [], self.NOW, live={"2d-ge-ipc"})

        self.assertEqual(item["running"]["startedBy"], "GitLab push by Batur Orkun to 2d-ge-ipc/teydeb-2d-ge-ipc")
        self.assertEqual(item["running"]["progress"], progress)
        self.assertEqual((item["running"]["inserted"], item["running"]["errors"]), (192, 1), "the counts so far")

    def test_a_finished_run_gives_who_started_it_and_no_progress(self) -> None:
        done = self.run_row(status="passed", finished_at=self.NOW, started_by="command line (batur)", progress=None)

        [item] = summarize(["2d-ge-ipc"], [done], [done], [], [], self.NOW)

        self.assertEqual(item["lastRun"]["startedBy"], "command line (batur)")
        self.assertNotIn("progress", item["lastRun"])

    def test_a_run_recorded_before_this_change_is_shown_as_before(self) -> None:
        old = self.run_row(status="passed", finished_at=self.NOW)

        [item] = summarize(["2d-ge-ipc"], [old], [old], [], [], self.NOW)

        self.assertNotIn("startedBy", item["lastRun"])
        self.assertNotIn("progress", item["lastRun"])


class MigrationTests(unittest.TestCase):
    def test_the_columns_are_added_once_however_often_it_runs(self) -> None:
        sql = (Path(pipeline.__file__).resolve().parents[1] / "migrations/010_ingest_progress.sql").read_text()
        self.assertIn("ADD COLUMN IF NOT EXISTS started_by TEXT", sql)
        self.assertIn("ADD COLUMN IF NOT EXISTS progress JSONB", sql)


if __name__ == "__main__":
    unittest.main()
