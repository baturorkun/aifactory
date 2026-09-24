from __future__ import annotations

import unittest
from unittest.mock import patch

from aifactory_rag.config import RagConfig
from aifactory_rag.query.retriever import retrieve


class FakeEmbeddingAdapter:
    def embed_query(self, _question: str) -> list[float]:
        return [1.0, 2.0, 3.0]


class FakeCursor:
    def __init__(self) -> None:
        self.statement = ""
        self.params: tuple[object, ...] = ()

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, statement: str, params: tuple[object, ...]) -> None:
        self.statement = statement
        self.params = params

    def fetchall(self) -> list[dict[str, object]]:
        return []


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self._cursor


def config() -> RagConfig:
    return RagConfig.model_validate(
        {
            "database": {"connectionString": "postgresql://test"},
            "embedding": {"provider": "ollama", "model": "fake", "dimensions": 3},
        }
    )


class SourceFilterTests(unittest.TestCase):
    def run_retrieve(self, source_ids: list[str] | None) -> FakeCursor:
        cursor = FakeCursor()
        connection = FakeConnection(cursor)
        with (
            patch("aifactory_rag.query.retriever.require_schema"),
            patch(
                "aifactory_rag.query.retriever.create_embedding_adapter",
                return_value=FakeEmbeddingAdapter(),
            ),
            patch("aifactory_rag.query.retriever.connect", return_value=connection),
        ):
            retrieve(config(), "question", source_ids=source_ids)
        return cursor

    def test_retrieval_limits_chunks_to_requested_sources(self) -> None:
        cursor = self.run_retrieve(["source-a"])

        self.assertIn("c.source_id = ANY(%s)", cursor.statement)
        # params: query vector, embedding width, the source list, vector again, limit
        self.assertEqual(cursor.params[2], ["source-a"])

    def test_retrieval_has_no_source_clause_without_filter(self) -> None:
        cursor = self.run_retrieve(None)

        self.assertNotIn("c.source_id = ANY(%s)", cursor.statement)
        self.assertEqual(len(cursor.params), 4)

    def test_retrieval_ignores_chunks_from_another_embedding_model(self) -> None:
        """Mixed vector widths make PostgreSQL raise, which would take the whole
        query down; the width predicate keeps the service answering while a
        corpus is being moved to a new model, or left behind on the old one."""
        cursor = self.run_retrieve(["source-a"])

        self.assertIn("vector_dims(c.embedding) = %s", cursor.statement)
        self.assertIsInstance(cursor.params[1], int)


if __name__ == "__main__":
    unittest.main()
