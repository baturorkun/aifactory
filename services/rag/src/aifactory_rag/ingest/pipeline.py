from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg

from aifactory_rag.config import RagConfig, RagSourceConfig, find_source, require_ingest_config
from aifactory_rag.db import connect, vector_literal
from aifactory_rag.embeddings import EmbeddingAdapter, create_embedding_adapter
from aifactory_rag.ingest.chunker import chunk_text
from aifactory_rag.ingest.parsers import parse_file
from aifactory_rag.ingest.sources import SourceFile, scan_files


@dataclass
class IngestSummary:
    run_id: int
    source_id: str
    status: str
    scanned_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    deleted_count: int = 0
    error_count: int = 0


def ingest_source(config: RagConfig, source_id: str, force: bool = False) -> IngestSummary:
    require_ingest_config(config)
    source = find_source(config, source_id)
    print(f"RAG ingest source : {source.id}", flush=True)
    print(f"RAG ingest root   : {source.root_path}", flush=True)
    print(f"RAG include       : {', '.join(source.include) if source.include else '(all files)'}", flush=True)
    print(f"RAG exclude       : {', '.join(source.exclude) if source.exclude else '(none)'}", flush=True)
    files = scan_files(source)
    print(f"RAG matched files : {len(files)}", flush=True)
    for file in files[:10]:
        print(f"  - {file.relative_path}", flush=True)
    if len(files) > 10:
        print(f"  ... {len(files) - 10} more", flush=True)

    with connect(config.database.connection_string) as conn:
        _upsert_source(conn, source)
        run_id = _start_run(conn, source.id)
        summary = IngestSummary(run_id=run_id, source_id=source.id, status="running", scanned_count=len(files))
        conn.commit()

        embed_model = create_embedding_adapter(config.embedding)
        seen = set()

        try:
            for file in files:
                seen.add(file.relative_path)
                try:
                    outcome = _ingest_file(conn, config, source, file, embed_model, force)
                    if outcome == "inserted":
                        summary.inserted_count += 1
                    elif outcome == "updated":
                        summary.updated_count += 1
                    elif outcome == "skipped":
                        summary.skipped_count += 1
                    conn.commit()
                except Exception as exc:
                    conn.rollback()
                    summary.error_count += 1
                    _record_file_error(conn, run_id, source.id, file.relative_path, "ingest", exc)
                    conn.commit()

            summary.deleted_count = _mark_deleted(conn, source.id, seen)
            summary.status = "failed" if summary.error_count else "passed"
            _finish_run(conn, summary)
            conn.commit()
            return summary
        except Exception as exc:
            conn.rollback()
            summary.status = "failed"
            _finish_run(conn, summary, error=str(exc))
            conn.commit()
            raise


def _ingest_file(
    conn: psycopg.Connection,
    config: RagConfig,
    source: RagSourceConfig,
    file: SourceFile,
    embed_model: EmbeddingAdapter,
    force: bool,
) -> str:
    existing = _find_document(conn, source.id, file.relative_path)
    modified_at = datetime.fromtimestamp(file.modified_timestamp, tz=timezone.utc)

    if existing and not force:
        same_fast_fingerprint = (
            existing["file_size"] == file.size
            and existing["modified_at"].replace(tzinfo=timezone.utc) == modified_at
            and existing["status"] == "active"
        )
        if same_fast_fingerprint:
            return "skipped"

    content_hash = _sha256(file.path)
    if existing and not force and existing["content_hash"] == content_hash and existing["status"] == "active":
        _touch_document(conn, int(existing["id"]), file.size, modified_at)
        return "skipped"

    text = parse_file(file.path)
    chunks = chunk_text(text, config.ingest.chunk_size, config.ingest.chunk_overlap)
    document_id = _upsert_document(conn, source, file, modified_at, content_hash, existing)
    _replace_chunks(conn, document_id, source.id, file.relative_path, chunks, embed_model)
    return "updated" if existing else "inserted"


def _replace_chunks(
    conn: psycopg.Connection,
    document_id: int,
    source_id: str,
    relative_path: str,
    chunks: list[str],
    embed_model: EmbeddingAdapter,
) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE rag_chunks SET status = 'replaced' WHERE document_id = %s AND status = 'active'", (document_id,))
        embeddings = embed_model.embed_documents(chunks) if chunks else []
        for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            metadata = {"relativePath": relative_path}
            cur.execute(
                """
                INSERT INTO rag_chunks(document_id, source_id, chunk_index, text, embedding, metadata, status)
                VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb, 'active')
                ON CONFLICT(document_id, chunk_index)
                DO UPDATE SET text = EXCLUDED.text,
                              embedding = EXCLUDED.embedding,
                              metadata = EXCLUDED.metadata,
                              status = 'active',
                              created_at = now()
                """,
                (document_id, source_id, index, chunk, vector_literal(embedding), json.dumps(metadata)),
            )


def _upsert_source(conn: psycopg.Connection, source: RagSourceConfig) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rag_sources(id, type, root_path, include_globs, exclude_globs, updated_at)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, now())
            ON CONFLICT(id) DO UPDATE SET
              type = EXCLUDED.type,
              root_path = EXCLUDED.root_path,
              include_globs = EXCLUDED.include_globs,
              exclude_globs = EXCLUDED.exclude_globs,
              updated_at = now()
            """,
            (source.id, source.type, source.root_path, json.dumps(source.include), json.dumps(source.exclude)),
        )


def _find_document(conn: psycopg.Connection, source_id: str, relative_path: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM rag_documents WHERE source_id = %s AND relative_path = %s",
            (source_id, relative_path),
        )
        return cur.fetchone()


def _upsert_document(
    conn: psycopg.Connection,
    source: RagSourceConfig,
    file: SourceFile,
    modified_at: datetime,
    content_hash: str,
    existing: dict[str, Any] | None,
) -> int:
    metadata = {"extension": file.path.suffix.lower()}
    with conn.cursor() as cur:
        if existing:
            cur.execute(
                """
                UPDATE rag_documents
                SET path = %s,
                    file_size = %s,
                    modified_at = %s,
                    content_hash = %s,
                    status = 'active',
                    last_ingested_at = now(),
                    last_error = NULL,
                    metadata = %s::jsonb,
                    updated_at = now()
                WHERE id = %s
                RETURNING id
                """,
                (str(file.path), file.size, modified_at, content_hash, json.dumps(metadata), existing["id"]),
            )
        else:
            cur.execute(
                """
                INSERT INTO rag_documents(
                  source_id, path, relative_path, file_size, modified_at, content_hash,
                  status, last_ingested_at, metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, 'active', now(), %s::jsonb)
                RETURNING id
                """,
                (source.id, str(file.path), file.relative_path, file.size, modified_at, content_hash, json.dumps(metadata)),
            )
        row = cur.fetchone()
        return int(row["id"])


def _touch_document(conn: psycopg.Connection, document_id: int, size: int, modified_at: datetime) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE rag_documents
            SET file_size = %s, modified_at = %s, updated_at = now()
            WHERE id = %s
            """,
            (size, modified_at, document_id),
        )


def _mark_deleted(conn: psycopg.Connection, source_id: str, seen: set[str]) -> int:
    with conn.cursor() as cur:
        if seen:
            cur.execute(
                """
                UPDATE rag_documents
                SET status = 'deleted', updated_at = now()
                WHERE source_id = %s AND status <> 'deleted' AND NOT (relative_path = ANY(%s))
                RETURNING id
                """,
                (source_id, list(seen)),
            )
        else:
            cur.execute(
                """
                UPDATE rag_documents
                SET status = 'deleted', updated_at = now()
                WHERE source_id = %s AND status <> 'deleted'
                RETURNING id
                """,
                (source_id,),
            )
        rows = cur.fetchall()
        document_ids = [row["id"] for row in rows]
        if document_ids:
            cur.execute(
                "UPDATE rag_chunks SET status = 'deleted' WHERE document_id = ANY(%s)",
                (document_ids,),
            )
        return len(document_ids)


def _start_run(conn: psycopg.Connection, source_id: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO rag_ingest_runs(source_id, status) VALUES (%s, 'running') RETURNING id",
            (source_id,),
        )
        row = cur.fetchone()
        return int(row["id"])


def _finish_run(conn: psycopg.Connection, summary: IngestSummary, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE rag_ingest_runs
            SET status = %s,
                finished_at = now(),
                scanned_count = %s,
                inserted_count = %s,
                updated_count = %s,
                skipped_count = %s,
                deleted_count = %s,
                error_count = %s,
                error = %s
            WHERE id = %s
            """,
            (
                summary.status,
                summary.scanned_count,
                summary.inserted_count,
                summary.updated_count,
                summary.skipped_count,
                summary.deleted_count,
                summary.error_count,
                error,
                summary.run_id,
            ),
        )


def _record_file_error(
    conn: psycopg.Connection,
    run_id: int,
    source_id: str,
    path: str,
    stage: str,
    exc: Exception,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rag_ingest_errors(run_id, source_id, path, stage, error)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (run_id, source_id, path, stage, str(exc)),
        )
        cur.execute(
            """
            UPDATE rag_documents
            SET last_error = %s, updated_at = now()
            WHERE source_id = %s AND relative_path = %s
            """,
            (str(exc), source_id, path),
        )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
