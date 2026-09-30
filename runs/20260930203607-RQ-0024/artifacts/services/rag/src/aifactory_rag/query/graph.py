"""Walking the symbol graph (RQ-0024).

Edges are resolved by name: a call to `recv` reaches every definition whose
short name is `recv` in the same source. Every row names where it is (input,
path, line) and, for code from a repository, the commit it was computed at.
"""

from __future__ import annotations

from typing import Any

import psycopg

from aifactory_rag.ingest.code_graph import short_name
from aifactory_rag.query.retriever import RetrievedChunk

REFERENCE_KINDS = ("reads", "writes")
IMPACT_KINDS = ("calls", "reads", "writes")
MAX_IMPACT_DEPTH = 10

_LOCATION = """
    d.source_id,
    CASE WHEN d.input_key = '' THEN 'path' ELSE d.input_key END AS input,
    d.relative_path AS path,
    d.metadata->>'repository' AS repository,
    d.metadata->>'ref' AS ref,
    d.metadata->>'commit' AS commit
"""


def _sources_filter(alias: str, source_ids: list[str] | None) -> tuple[str, list[Any]]:
    if not source_ids:
        return "", []
    return f" AND {alias}.source_id = ANY(%s)", [source_ids]


def find_symbols(conn: psycopg.Connection, name: str, source_ids: list[str] | None = None) -> list[dict[str, Any]]:
    """Definitions of a name, qualified (`hw::Uart::recv`) or short (`recv`)."""
    where, params = _sources_filter("s", source_ids)
    column = "s.name" if short_name(name) != name else "s.short_name"
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT s.name AS symbol, s.kind, s.signature, s.start_line, s.end_line, {_LOCATION}
            FROM rag_symbols s JOIN rag_documents d ON d.id = s.document_id AND d.status = 'active'
            WHERE {column} = %s{where}
            ORDER BY d.source_id, input, path, s.start_line
            """,
            (name, *params),
        )
        return list(cur.fetchall())


def callers(conn: psycopg.Connection, name: str, source_ids: list[str] | None = None) -> list[dict[str, Any]]:
    return _edges_to(conn, name, ("calls",), source_ids)


def references(conn: psycopg.Connection, name: str, source_ids: list[str] | None = None) -> list[dict[str, Any]]:
    return _edges_to(conn, name, REFERENCE_KINDS, source_ids)


def _edges_to(conn: psycopg.Connection, name: str, kinds: tuple[str, ...], source_ids: list[str] | None) -> list[dict[str, Any]]:
    where, params = _sources_filter("e", source_ids)
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT e.from_symbol AS symbol, e.kind, e.line, e.resolution, {_LOCATION}
            FROM rag_edges e JOIN rag_documents d ON d.id = e.document_id AND d.status = 'active'
            WHERE e.kind = ANY(%s) AND e.to_name = %s{where}
            ORDER BY d.source_id, input, path, e.line
            """,
            (list(kinds), short_name(name), *params),
        )
        return list(cur.fetchall())


def callees(conn: psycopg.Connection, name: str, source_ids: list[str] | None = None) -> list[dict[str, Any]]:
    """What a function calls, each with the definitions its name reaches.

    A callee with no definition in the source is external (a library call).
    """
    where, params = _sources_filter("e", source_ids)
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT e.from_symbol AS symbol, e.to_name AS callee, e.line, e.resolution, {_LOCATION},
              COALESCE((
                SELECT json_agg(json_build_object(
                  'symbol', t.name, 'kind', t.kind, 'path', td.relative_path,
                  'input', CASE WHEN td.input_key = '' THEN 'path' ELSE td.input_key END,
                  'startLine', t.start_line, 'endLine', t.end_line
                ) ORDER BY td.relative_path, t.start_line)
                FROM rag_symbols t JOIN rag_documents td ON td.id = t.document_id AND td.status = 'active'
                WHERE t.source_id = e.source_id AND t.short_name = e.to_name AND t.kind IN ('function', 'method', 'macro')
              ), '[]'::json) AS definitions
            FROM rag_edges e JOIN rag_documents d ON d.id = e.document_id AND d.status = 'active'
            WHERE e.kind = 'calls' AND {_from_symbol_matches('e')}{where}
            ORDER BY d.source_id, input, path, e.line
            """,
            (name, name, name, *params),
        )
        return list(cur.fetchall())


def _from_symbol_matches(alias: str) -> str:
    # `recv` names `hw::Uart::recv` and `Service.run` names itself.
    return f"({alias}.from_symbol = %s OR {alias}.from_symbol LIKE '%%::' || %s OR {alias}.from_symbol LIKE '%%.' || %s)"


def impact(conn: psycopg.Connection, name: str, source_ids: list[str] | None = None, depth: int = 3) -> dict[str, Any]:
    """Everything that calls, reads or writes a symbol, transitively, up to `depth`.

    Recursion in the code cannot loop the walk: each step goes one level
    deeper and the walk stops at the limit.
    """
    depth = max(1, min(int(depth), MAX_IMPACT_DEPTH))
    where, params = _sources_filter("e", source_ids)
    with conn.cursor() as cur:
        cur.execute(
            f"""
            WITH RECURSIVE walk(symbol, document_id, depth) AS (
              SELECT %s::text, NULL::bigint, 0
              UNION
              SELECT e.from_symbol, e.document_id, w.depth + 1
              FROM walk w
              JOIN rag_edges e
                ON e.to_name = regexp_replace(w.symbol, '^.*(::|[.])', '')
               AND e.kind = ANY(%s)
               AND e.from_symbol IS NOT NULL{where}
              JOIN rag_documents d ON d.id = e.document_id AND d.status = 'active'
              WHERE w.depth < %s
            )
            SELECT w.symbol, min(w.depth) AS depth, {_LOCATION},
                   min(s.start_line) AS start_line, max(s.end_line) AS end_line
            FROM walk w
            JOIN rag_documents d ON d.id = w.document_id
            LEFT JOIN rag_symbols s ON s.document_id = w.document_id AND s.name = w.symbol
            WHERE w.depth > 0
            GROUP BY w.symbol, d.source_id, d.input_key, d.relative_path, d.metadata
            ORDER BY depth, input, path, w.symbol
            """,
            (name, list(IMPACT_KINDS), *params, depth),
        )
        rows = list(cur.fetchall())
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        key = (row["input"], row["path"])
        group = grouped.setdefault(key, {
            "sourceId": row["source_id"], "input": row["input"], "path": row["path"],
            "repository": row["repository"], "ref": row["ref"], "commit": row["commit"], "symbols": [],
        })
        group["symbols"].append({"symbol": row["symbol"], "depth": row["depth"], "startLine": row["start_line"], "endLine": row["end_line"]})
    return {"symbol": name, "depth": depth, "files": list(grouped.values())}


def neighbor_chunks(conn: psycopg.Connection, chunks: list[RetrievedChunk], limit: int) -> list[RetrievedChunk]:
    """The callers and callees of the symbols the best code hits are about.

    Up to `limit` chunks: for each symbol in retrieval order its first caller,
    first callee with a definition, and the header that declares it, then the
    next symbol, so one busy function cannot take the whole budget.
    """
    if limit <= 0:
        return []
    seen = {chunk.chunk_id for chunk in chunks}
    wanted: list[tuple[str, str, int, str]] = []  # (source, symbol, document, relation)
    symbols = []
    for chunk in chunks:
        symbol = chunk.metadata.get("symbol")
        if symbol and chunk.metadata.get("symbolKind") in {"function", "method"} and (chunk.source_id, symbol) not in symbols:
            symbols.append((chunk.source_id, symbol))
    found: list[RetrievedChunk] = []
    with conn.cursor() as cur:
        for source_id, symbol in symbols[:3]:
            for relation, query, args in (
                (f"calls {symbol}", _CALLER_CHUNK, (source_id, short_name(symbol))),
                (f"called by {symbol}", _CALLEE_CHUNK, (source_id, symbol, symbol, symbol)),
                (f"declares {symbol}", _HEADER_CHUNK, (f"%{short_name(symbol)}%", source_id, short_name(symbol))),
            ):
                cur.execute(query, args)
                for row in cur.fetchall():
                    if row["chunk_id"] in seen:
                        continue
                    seen.add(row["chunk_id"])
                    found.append(RetrievedChunk(
                        chunk_id=int(row["chunk_id"]),
                        document_id=int(row["document_id"]),
                        source_id=row["source_id"],
                        relative_path=row["relative_path"],
                        text=row["text"],
                        score=0.0,
                        metadata={**(row["metadata"] or {}), "graphRelation": relation},
                    ))
                    break
                if len(found) >= limit:
                    return found
    return found


_CHUNK_COLUMNS = "c.id AS chunk_id, c.document_id, c.source_id, d.relative_path, c.text, c.metadata"

_CALLER_CHUNK = f"""
    SELECT {_CHUNK_COLUMNS}
    FROM rag_edges e
    JOIN rag_documents d ON d.id = e.document_id AND d.status = 'active'
    JOIN rag_chunks c ON c.document_id = e.document_id AND c.status = 'active' AND c.metadata->>'symbol' = e.from_symbol
    WHERE e.source_id = %s AND e.kind = 'calls' AND e.to_name = %s AND e.from_symbol IS NOT NULL
    ORDER BY d.relative_path, e.line, c.chunk_index
    LIMIT 5
"""

_CALLEE_CHUNK = f"""
    SELECT {_CHUNK_COLUMNS}
    FROM rag_edges e
    JOIN rag_symbols t ON t.source_id = e.source_id AND t.short_name = e.to_name AND t.kind IN ('function', 'method')
    JOIN rag_documents d ON d.id = t.document_id AND d.status = 'active'
    JOIN rag_chunks c ON c.document_id = t.document_id AND c.status = 'active' AND c.metadata->>'symbol' = t.name
    WHERE e.source_id = %s AND e.kind = 'calls'
      AND (e.from_symbol = %s OR e.from_symbol LIKE '%%::' || %s OR e.from_symbol LIKE '%%.' || %s)
    ORDER BY e.line, c.chunk_index
    LIMIT 5
"""

_HEADER_CHUNK = f"""
    SELECT {_CHUNK_COLUMNS}
    FROM rag_edges e
    JOIN rag_documents d ON d.id = e.document_id AND d.status = 'active'
    JOIN rag_chunks c ON c.document_id = e.document_id AND c.status = 'active' AND c.text LIKE %s
    WHERE e.source_id = %s AND e.kind = 'declares' AND e.to_name = %s
    ORDER BY d.relative_path, c.chunk_index
    LIMIT 5
"""
