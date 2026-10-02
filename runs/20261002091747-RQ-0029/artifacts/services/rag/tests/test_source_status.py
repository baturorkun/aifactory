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
        self.assertEqual(item["updatedAt"], done.isoformat())
        self.assertEqual(item["running"]["id"], 9)
        self.assertEqual(item["lastRun"]["id"], 8)

    def test_inputs_carry_their_commit_and_link(self) -> None:
        inputs = [{
            "source_id": "aselsan-bfi", "input_key": "gitlab.bc.int/aselsan/bfi-sw", "url": "http://gitlab.bc.int/aselsan/bfi-sw",
            "ref": "project-initialization", "commit_sha": "0acecaf696e7abc", "ingested_at": NOW, "file_count": 399,
        }]
        graphs = [{"source_id": "aselsan-bfi", "input_key": "", "project": "rag-x", "ref": None, "commit_sha": None, "built_at": NOW}]
        [item] = summarize(["aselsan-bfi"], [], [], inputs, graphs, NOW)
        self.assertEqual(item["inputs"][0]["commitUrl"], "http://gitlab.bc.int/aselsan/bfi-sw/-/commit/0acecaf696e7abc")
        self.assertEqual(item["dataflow"][0]["input"], "path")
        self.assertEqual(item["state"], "never")


if __name__ == "__main__":
    unittest.main()
