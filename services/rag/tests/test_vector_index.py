"""The index the retrieval query depends on, and why it is built this way.

The embedding column is dimensionless so one database can hold vectors from
more than one model while a corpus is moved between them. pgvector cannot index
a dimensionless column, so the index is built on the cast to a fixed width, the
query must be written against that same expression, and the width comes from
whatever model is configured rather than from a migration.
"""

from __future__ import annotations

import unittest
from unittest import mock

from aifactory_rag import db


class EnsureVectorIndexTests(unittest.TestCase):
    def _connection(self, existing: bool):
        cursor = mock.MagicMock()
        cursor.fetchone.return_value = (existing,)
        cursor.__enter__ = mock.Mock(return_value=cursor)
        cursor.__exit__ = mock.Mock(return_value=False)
        connection = mock.MagicMock()
        connection.cursor.return_value = cursor
        connection.__enter__ = mock.Mock(return_value=connection)
        connection.__exit__ = mock.Mock(return_value=False)
        return connection, cursor

    def test_builds_an_index_named_and_shaped_for_the_configured_width(self) -> None:
        connection, cursor = self._connection(existing=False)
        with mock.patch.object(db.psycopg, "connect", return_value=connection) as connect:
            created = db.ensure_vector_index("postgresql://x", 1536)

        self.assertTrue(created)
        self.assertTrue(connect.call_args.kwargs["autocommit"], "CREATE INDEX CONCURRENTLY needs it")
        statements = " ".join(str(call.args[0]) for call in cursor.execute.call_args_list)
        self.assertIn("idx_rag_chunks_embedding_hnsw_1536", statements)
        self.assertIn("USING hnsw ((embedding::vector(1536)) vector_cosine_ops)", statements)
        self.assertIn("vector_dims(embedding) = 1536", statements)
        self.assertIn("CONCURRENTLY", statements)
        # A parallel build needs a shared-memory segment that a container's
        # 64 MB /dev/shm cannot give it.
        self.assertIn("max_parallel_maintenance_workers = 0", statements)

    def test_an_existing_index_is_left_alone(self) -> None:
        connection, cursor = self._connection(existing=True)
        with mock.patch.object(db.psycopg, "connect", return_value=connection):
            created = db.ensure_vector_index("postgresql://x", 1536)

        self.assertFalse(created)
        statements = " ".join(str(call.args[0]) for call in cursor.execute.call_args_list)
        self.assertNotIn("CREATE INDEX", statements)

    def test_each_width_gets_its_own_index(self) -> None:
        connection, cursor = self._connection(existing=False)
        with mock.patch.object(db.psycopg, "connect", return_value=connection):
            db.ensure_vector_index("postgresql://x", 384)

        statements = " ".join(str(call.args[0]) for call in cursor.execute.call_args_list)
        self.assertIn("idx_rag_chunks_embedding_hnsw_384", statements)
        self.assertIn("vector(384)", statements)


if __name__ == "__main__":
    unittest.main()
