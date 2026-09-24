from __future__ import annotations

from importlib import resources
from typing import Any, Iterable

import psycopg
from psycopg.rows import dict_row


def connect(connection_string: str) -> psycopg.Connection:
    return psycopg.connect(connection_string, row_factory=dict_row)


def migrate(connection_string: str) -> None:
    migration_root = resources.files("aifactory_rag.migrations")
    with connect(connection_string) as conn:
        with conn.cursor() as cur:
            for migration in sorted(item for item in migration_root.iterdir() if item.name.endswith(".sql")):
                cur.execute(migration.read_text(encoding="utf-8"))
        conn.commit()


def require_schema(connection_string: str) -> None:
    required_tables = {
        "rag_sources",
        "rag_documents",
        "rag_chunks",
        "rag_ingest_runs",
        "rag_ingest_errors",
        "rag_queries",
    }
    try:
        with connect(connection_string) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = ANY(%s)
                    """,
                    (list(required_tables),),
                )
                existing = {row["table_name"] for row in cur.fetchall()}
    except psycopg.Error as exc:
        raise RuntimeError(
            "RAG database is not reachable. Start PostgreSQL + pgvector first with: "
            "pnpm factory rag env up"
        ) from exc

    missing = sorted(required_tables - existing)
    if missing:
        raise RuntimeError(
            "RAG database schema is not migrated. Missing tables: "
            + ", ".join(missing)
            + ". Run: pnpm factory rag db migrate"
        )


def ensure_vector_index(connection_string: str, dimensions: int) -> bool:
    """Make sure the current embedding width has an index to search through.

    The embedding column is dimensionless so that one database can hold more
    than one model's vectors while a corpus is moved between them. pgvector
    cannot index such a column, which is why the index is built on the cast to
    a fixed width and why the retrieval query must be written the same way.
    Without it every question is a sequential scan of every chunk: measured at
    555 ms against 1.9 ms on a quarter of a million rows.

    Returns True when an index was created, False when one already existed.
    """
    name = f"idx_rag_chunks_embedding_hnsw_{dimensions}"
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction, and it lets the
    # ingest keep writing while the index is built.
    with psycopg.connect(connection_string, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass(%s) IS NOT NULL AS present", (name,))
            row = cur.fetchone()
            if row and row[0]:
                return False
            # A parallel build allocates a shared-memory segment, and a
            # container's /dev/shm is 64 MB whatever the host has. One worker
            # keeps the working memory private to the process instead.
            cur.execute("SET max_parallel_maintenance_workers = 0")
            cur.execute("SET maintenance_work_mem = '2GB'")
            cur.execute(
                f"""
                CREATE INDEX CONCURRENTLY IF NOT EXISTS {name}
                ON rag_chunks USING hnsw ((embedding::vector({dimensions})) vector_cosine_ops)
                WHERE status = 'active' AND vector_dims(embedding) = {dimensions}
                """
            )
    return True


def vector_literal(values: Iterable[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def fetch_one(conn: psycopg.Connection, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()


def fetch_all(conn: psycopg.Connection, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(query, params)
        return list(cur.fetchall())
