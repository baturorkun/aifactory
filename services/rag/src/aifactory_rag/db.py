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
