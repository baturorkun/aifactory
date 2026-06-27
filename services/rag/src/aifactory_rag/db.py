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
