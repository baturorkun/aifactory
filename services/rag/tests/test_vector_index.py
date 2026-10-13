"""The index the retrieval query depends on, and why it is built this way.

The embedding column is dimensionless so one database can hold vectors from
more than one model while a corpus is moved between them. pgvector cannot index
a dimensionless column, so the index is built on the cast to a fixed width (a
halfvec: the stored components are 16-bit already, a full-precision index only
doubles the bytes per row), the query must be written against that same
expression, and the width comes from whatever model is configured rather than
from a migration.
"""

from __future__ import annotations

import unittest
from unittest import mock

from aifactory_rag import db


class EnsureVectorIndexTests(unittest.TestCase):
    """`state` is what the database says about the index: None when it is not
    there, else (valid, being built)."""

    def _connection(self, state: tuple[bool, bool] | None):
        cursor = mock.MagicMock()
        cursor.fetchone.return_value = state
        cursor.__enter__ = mock.Mock(return_value=cursor)
        cursor.__exit__ = mock.Mock(return_value=False)
        connection = mock.MagicMock()
        connection.cursor.return_value = cursor
        connection.__enter__ = mock.Mock(return_value=connection)
        connection.__exit__ = mock.Mock(return_value=False)
        return connection, cursor

    def _ensure(self, state: tuple[bool, bool] | None, dimensions: int = 1536) -> tuple[bool, list[str], mock.Mock]:
        connection, cursor = self._connection(state)
        with mock.patch.object(db.psycopg, "connect", return_value=connection) as connect:
            created = db.ensure_vector_index("postgresql://x", dimensions)
        return created, [" ".join(str(call.args[0]).split()) for call in cursor.execute.call_args_list], connect

    def test_builds_an_index_named_and_shaped_for_the_configured_width(self) -> None:
        created, statements, connect = self._ensure(None)

        self.assertTrue(created)
        self.assertTrue(connect.call_args.kwargs["autocommit"], "CREATE INDEX CONCURRENTLY needs it")
        build = next(statement for statement in statements if statement.startswith("CREATE INDEX"))
        self.assertIn("CONCURRENTLY IF NOT EXISTS idx_rag_chunks_embedding_hnsw_half_1536_m24c200 ", build)
        self.assertIn("USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)", build)
        self.assertIn("vector_dims(embedding) = 1536", build)
        # A parallel build needs a shared-memory segment that a container's
        # /dev/shm cannot give it.
        self.assertIn("SET max_parallel_maintenance_workers = 0", statements)

    def test_the_graph_is_built_denser_than_the_default_and_the_name_says_so(self) -> None:
        """With 16 links and 64 candidates the index did not return chunks that
        exact search ranks first, at any ef_search."""
        _, statements, _ = self._ensure(None, 2000)

        build = next(statement for statement in statements if statement.startswith("CREATE INDEX"))
        self.assertIn("WITH (m = 24, ef_construction = 200)", build)
        self.assertEqual(db.vector_index_name(2000), "idx_rag_chunks_embedding_hnsw_half_2000_m24c200")

    def test_the_earlier_indexes_go_only_after_the_new_one_is_built(self) -> None:
        _, statements, _ = self._ensure(None)

        build = next(n for n, statement in enumerate(statements) if statement.startswith("CREATE INDEX"))
        drops = [n for n, statement in enumerate(statements) if statement.startswith("DROP INDEX")]
        self.assertEqual(
            [statements[n] for n in drops],
            ["DROP INDEX CONCURRENTLY IF EXISTS idx_rag_chunks_embedding_hnsw_half_1536",
             "DROP INDEX CONCURRENTLY IF EXISTS idx_rag_chunks_embedding_hnsw_1536"],
        )
        self.assertTrue(all(n > build for n in drops))

    def test_a_valid_index_is_left_alone_and_the_earlier_ones_go(self) -> None:
        created, statements, _ = self._ensure((True, False))

        self.assertFalse(created)
        self.assertFalse([statement for statement in statements if statement.startswith("CREATE INDEX")])
        self.assertIn("DROP INDEX CONCURRENTLY IF EXISTS idx_rag_chunks_embedding_hnsw_half_1536", statements)
        self.assertIn("DROP INDEX CONCURRENTLY IF EXISTS idx_rag_chunks_embedding_hnsw_1536", statements)

    def test_an_index_another_session_is_building_is_left_to_it_and_nothing_is_dropped(self) -> None:
        """Dropping the earlier index now would leave every question to a
        sequential scan until the build is done."""
        created, statements, _ = self._ensure((False, True))

        self.assertFalse(created)
        self.assertEqual(len(statements), 1)  # the look at its state, nothing else

    def test_an_index_left_invalid_by_an_interrupted_build_is_built_again(self) -> None:
        created, statements, _ = self._ensure((False, False))

        self.assertTrue(created)
        first_drop = statements.index("DROP INDEX CONCURRENTLY IF EXISTS idx_rag_chunks_embedding_hnsw_half_1536_m24c200")
        build = next(n for n, statement in enumerate(statements) if statement.startswith("CREATE INDEX"))
        self.assertLess(first_drop, build)

    def test_each_width_gets_its_own_index(self) -> None:
        _, statements, _ = self._ensure(None, 384)

        build = next(statement for statement in statements if statement.startswith("CREATE INDEX"))
        self.assertIn("idx_rag_chunks_embedding_hnsw_half_384_m24c200", build)
        self.assertIn("halfvec(384)", build)


if __name__ == "__main__":
    unittest.main()
