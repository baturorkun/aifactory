"""An answer on the RAG page can be shared by its link (RQ-0041)."""

from __future__ import annotations

import json
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.config import RagConfig
from aifactory_rag.query import responder
from aifactory_rag.query.responder import _record_query, shared_answer

MIGRATIONS = Path(responder.__file__).resolve().parents[1] / "migrations"


class Cursor:
    def __init__(self, store: "Store") -> None:
        self.store = store

    def __enter__(self) -> "Cursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, statement: str, params: tuple[object, ...] = ()) -> None:
        self.store.executed.append((" ".join(statement.split()), params))
        if statement.lstrip().startswith("INSERT INTO rag_queries"):
            user, question, answer, sources, share_id = params
            self.store.rows.append({"question": question, "answer": answer, "sources": json.loads(str(sources)),
                                    "share_id": share_id, "created_at": datetime(2026, 10, 15, 16, 0, tzinfo=timezone.utc)})
        elif statement.lstrip().startswith("SELECT question"):
            self.store.found = next((r for r in self.store.rows if r["share_id"] == params[0]), None)

    def fetchone(self) -> dict[str, object] | None:
        return self.store.found


class Connection:
    def __init__(self, store: "Store") -> None:
        self.store = store

    def __enter__(self) -> "Connection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> Cursor:
        return Cursor(self.store)

    def commit(self) -> None:
        return None


class Store:
    def __init__(self) -> None:
        self.rows: list[dict[str, object]] = []
        self.executed: list[tuple[str, tuple[object, ...]]] = []
        self.found: dict[str, object] | None = None


class SharedAnswerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = Store()
        patcher = patch("aifactory_rag.query.responder.connect", side_effect=lambda _: Connection(self.store))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.config = RagConfig()

    def test_a_recorded_answer_gets_a_random_share_identifier(self) -> None:
        first = _record_query(self.config, "Q1", "A1", [], None)
        second = _record_query(self.config, "Q2", "A2", [], None)

        self.assertEqual(str(uuid.UUID(first)), first)
        self.assertNotEqual(first, second)
        self.assertEqual([row["share_id"] for row in self.store.rows], [first, second])

    def test_a_shared_answer_comes_back_as_it_was_recorded(self) -> None:
        sources = [{"sourceId": "2d-ge-ipc", "relativePath": "SOTA/deck.pptx", "score": 0.7}]
        share_id = _record_query(self.config, "D/AVE 2D nedir?", "Bir 2D grafik IP'si.", sources, "batur")

        found = shared_answer(self.config, share_id)

        self.assertEqual(found, {
            "shareId": share_id, "question": "D/AVE 2D nedir?", "answer": "Bir 2D grafik IP'si.",
            "sources": sources, "askedAt": "2026-10-15T16:00:00+00:00",
        })

    def test_an_identifier_written_in_capitals_is_the_same_answer(self) -> None:
        share_id = _record_query(self.config, "Q", "A", [], None)
        self.assertEqual(shared_answer(self.config, share_id.upper())["shareId"], share_id)

    def test_an_unknown_or_invalid_identifier_finds_nothing(self) -> None:
        _record_query(self.config, "Q", "A", [], None)

        self.assertIsNone(shared_answer(self.config, str(uuid.uuid4())))
        before = len(self.store.executed)
        self.assertIsNone(shared_answer(self.config, "1' OR '1'='1"))
        self.assertIsNone(shared_answer(self.config, "42"))
        self.assertEqual(len(self.store.executed), before, "an invalid identifier does not reach the database")


class MigrationTests(unittest.TestCase):
    def test_the_identifier_column_is_added_once_without_rewriting_the_rows(self) -> None:
        sql = (MIGRATIONS / "011_shared_answers.sql").read_text()
        statements = "\n".join(line for line in sql.splitlines() if not line.lstrip().startswith("--"))
        self.assertIn("ADD COLUMN IF NOT EXISTS share_id UUID;", statements)
        self.assertNotIn("DEFAULT", statements.upper(), "a default would rewrite every row")
        self.assertIn("CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_queries_share_id", statements)


if __name__ == "__main__":
    unittest.main()
