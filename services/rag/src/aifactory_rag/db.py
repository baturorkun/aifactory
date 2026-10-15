from __future__ import annotations

from importlib import resources
from typing import Any, Iterable

import psycopg
from psycopg.rows import dict_row


def connect(connection_string: str) -> psycopg.Connection:
    return psycopg.connect(connection_string, row_factory=dict_row)


# How long a migration waits for a table it has to lock. A running ingest keeps
# a transaction open while it parses a file, minutes for a scanned PDF; a
# migration queued behind it would block every question behind itself. Better
# that it fails and is run again when no ingest runs.
MIGRATION_LOCK_TIMEOUT = "10s"


def migrate(connection_string: str) -> None:
    migration_root = resources.files("aifactory_rag.migrations")
    with connect(connection_string) as conn:
        with conn.cursor() as cur:
            cur.execute(f"SET lock_timeout = '{MIGRATION_LOCK_TIMEOUT}'")
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
        "rag_source_inputs",
        "rag_symbols",
        "rag_edges",
        "rag_dataflow_graphs",
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


# How the index's graph is built: links per chunk and candidates weighed for
# each. With pgvector's defaults (16 and 64) the index did not return some
# chunks that exact search ranks first, whatever hnsw.ef_search was set to (3
# of 150 requirements asked for by their own sentence, 13 Oct 2026, on 290k
# chunks after months of re-embedding). The numbers are part of the index's
# name, so changing them builds a new index and drops the one before.
HNSW_M = 24
HNSW_EF_CONSTRUCTION = 200


def vector_index_name(dimensions: int) -> str:
    return f"idx_rag_chunks_embedding_hnsw_half_{dimensions}_m{HNSW_M}c{HNSW_EF_CONSTRUCTION}"


def ensure_vector_index(connection_string: str, dimensions: int) -> bool:
    """Make sure the current embedding width has an index to search through.

    The embedding column is dimensionless so that one database can hold more
    than one model's vectors while a corpus is moved between them. pgvector
    cannot index such a column, which is why the index is built on the cast to
    a fixed width and why the retrieval query must be written the same way.
    Without it every question is a sequential scan of every chunk: measured at
    555 ms against 1.9 ms on a quarter of a million rows.

    The cast is to halfvec: the vectors are stored with 16-bit components
    already (Qwen3 2000-wide), so a full-precision index only doubles the
    bytes per row. Measured on 285k rows of width 2000: 3.8 GB as vector,
    about half as halfvec, same neighbours.

    The indexes of the same width built earlier (full precision, or with
    other graph parameters) are dropped once this one is valid, and not
    before: until then they are what questions are answered through. An index
    another session is still building is left to it.

    Returns True when an index was created, False otherwise.
    """
    name = vector_index_name(dimensions)
    earlier = (f"idx_rag_chunks_embedding_hnsw_half_{dimensions}", f"idx_rag_chunks_embedding_hnsw_{dimensions}")
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction, and it lets the
    # ingest keep writing while the index is built.
    with psycopg.connect(connection_string, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT i.indisvalid,
                       EXISTS (SELECT 1 FROM pg_stat_progress_create_index p WHERE p.index_relid = i.indexrelid)
                FROM pg_index i
                WHERE i.indexrelid = to_regclass(%s)
                """,
                (name,),
            )
            state = cur.fetchone()
            if state and state[0]:
                for old in earlier:
                    cur.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {old}")
                return False
            if state and state[1]:
                return False  # being built elsewhere; the earlier index serves until it is done
            if state:
                # Left invalid by a build that was interrupted.
                cur.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
            # A parallel build allocates a shared-memory segment as large as
            # the working memory, and a container's /dev/shm is far smaller.
            # One worker keeps the working memory private to the process.
            cur.execute("SET max_parallel_maintenance_workers = 0")
            # The graph is built in memory while it fits: 2.2 GB for 290k
            # chunks of width 2000.
            cur.execute("SET maintenance_work_mem = '4GB'")
            cur.execute(
                f"""
                CREATE INDEX CONCURRENTLY IF NOT EXISTS {name}
                ON rag_chunks USING hnsw ((embedding::halfvec({dimensions})) halfvec_cosine_ops)
                WITH (m = {HNSW_M}, ef_construction = {HNSW_EF_CONSTRUCTION})
                WHERE status = 'active' AND vector_dims(embedding) = {dimensions}
                """
            )
            for old in earlier:
                cur.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {old}")
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
