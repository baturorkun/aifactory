"""How fresh each source is, for the web page (RQ-0029)."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from aifactory_rag.status import summarize

NOW = datetime(2026, 10, 2, 9, 0, tzinfo=timezone.utc)


def run(run_id: int, source: str, status: str, started: datetime, finished: datetime | None, scanned: int = 10, errors: int = 0) -> dict:
    return {
        "id": run_id, "source_id": source, "status": status, "started_at": started, "finished_at": finished,
        "scanned_count": scanned, "inserted_count": 1, "updated_count": 2, "skipped_count": 7, "deleted_count": 0, "error_count": errors,
    }


class SummaryTests(unittest.TestCase):
    def test_states_from_the_last_runs(self) -> None:
        done = NOW - timedelta(minutes=5)
        latest = [
            run(1, "current", "passed", done - timedelta(seconds=30), done),
            run(2, "file-errors", "failed", done, done, scanned=1236, errors=5),
            run(3, "broken", "failed", done, done, scanned=1, errors=1),
            run(5, "updating", "running", NOW - timedelta(seconds=20), None),
            run(6, "stale", "running", NOW - timedelta(hours=7), None),
        ]
        finished = [r for r in latest if r["finished_at"]] + [run(4, "updating", "passed", done, done)]
        states = {item["sourceId"]: item["state"] for item in summarize(
            ["current", "file-errors", "broken", "updating", "stale", "never"], latest, finished, [], [], NOW)}
        self.assertEqual(states, {
            "current": "current", "file-errors": "file-errors", "broken": "failed",
            "updating": "updating", "stale": "stale", "never": "never",
        })

    def test_a_running_source_keeps_its_last_finished_update(self) -> None:
        done = NOW - timedelta(hours=1)
        [item] = summarize(["s"], [run(9, "s", "running", NOW, None)], [run(8, "s", "passed", done, done)], [], [], NOW)
        self.assertEqual(item["checkedAt"], done.isoformat())
        self.assertEqual(item["running"]["id"], 9)
        self.assertEqual(item["lastRun"]["id"], 8)

    def test_each_input_says_when_it_last_changed_and_a_repository_its_commit(self) -> None:
        committed = NOW - timedelta(hours=2)
        folder_change = NOW - timedelta(days=7)
        inputs = [{
            "source_id": "aselsan-bfi", "input_key": "gitlab.bc.int/aselsan/bfi-sw", "url": "http://gitlab.bc.int/aselsan/bfi-sw",
            "ref": "project-initialization", "commit_sha": "0acecaf696e7abc", "committed_at": committed, "ingested_at": NOW, "file_count": 399,
        }]
        changes = [
            {"source_id": "aselsan-bfi", "input_key": "gitlab.bc.int/aselsan/bfi-sw", "documents": 399, "last_change": NOW - timedelta(hours=1)},
            {"source_id": "aselsan-bfi", "input_key": "", "documents": 1230, "last_change": folder_change},
        ]
        graphs = [{"source_id": "aselsan-bfi", "input_key": "", "project": "rag-x", "ref": None, "commit_sha": None, "built_at": NOW}]
        [item] = summarize(["aselsan-bfi"], [], [], inputs, graphs, NOW, changes=changes)
        folder, repository = item["inputs"]
        self.assertEqual((folder["label"], folder["documents"], folder["lastChange"]), ("folder", 1230, folder_change.isoformat()))
        self.assertNotIn("commit", folder)
        self.assertEqual((repository["label"], repository["ref"], repository["committedAt"]), ("git: bfi-sw", "project-initialization", committed.isoformat()))
        self.assertEqual(repository["commitUrl"], "http://gitlab.bc.int/aselsan/bfi-sw/-/commit/0acecaf696e7abc")
        self.assertEqual(item["dataflow"][0]["input"], "path")
        self.assertEqual(item["state"], "never")


if __name__ == "__main__":
    unittest.main()
