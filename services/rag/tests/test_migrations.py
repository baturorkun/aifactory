"""Migrations run again at every `db migrate`, so running one again must be cheap."""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest import mock

from aifactory_rag import db

MIGRATIONS = Path(db.__file__).resolve().parent / "migrations"


class MigrationTests(unittest.TestCase):
    def test_the_column_change_that_rewrites_the_table_runs_only_when_it_is_needed(self) -> None:
        """On 15 Oct 2026 a migrate for an unrelated column rewrote 290k chunks and
        locked every question until it was cancelled."""
        sql = (MIGRATIONS / "002_flexible_embedding_vector.sql").read_text()
        self.assertIn("IF (SELECT format_type(atttypid, atttypmod) FROM pg_attribute", sql)
        self.assertIn("<> 'vector' THEN", sql)
        self.assertLess(sql.index("IF (SELECT"), sql.index("ALTER TABLE rag_chunks ALTER COLUMN"))

    def test_no_migration_changes_a_column_type_unconditionally(self) -> None:
        for path in sorted(MIGRATIONS.glob("*.sql")):
            sql = "\n".join(line for line in path.read_text().splitlines() if not line.lstrip().startswith("--"))
            if "ALTER COLUMN" in sql:
                self.assertIn("IF ", sql[: sql.index("ALTER COLUMN")], f"{path.name} would rewrite its table at every migrate")

    def test_a_migration_gives_up_on_a_lock_instead_of_queueing_behind_an_ingest(self) -> None:
        cursor = mock.MagicMock()
        cursor.__enter__ = mock.Mock(return_value=cursor)
        cursor.__exit__ = mock.Mock(return_value=False)
        connection = mock.MagicMock()
        connection.cursor.return_value = cursor
        connection.__enter__ = mock.Mock(return_value=connection)
        connection.__exit__ = mock.Mock(return_value=False)
        with mock.patch.object(db, "connect", return_value=connection):
            db.migrate("postgresql://x")

        statements = [str(call.args[0]) for call in cursor.execute.call_args_list]
        self.assertEqual(statements[0], "SET lock_timeout = '10s'")
        self.assertEqual(len(statements), 1 + len(list(MIGRATIONS.glob("*.sql"))))


if __name__ == "__main__":
    unittest.main()
