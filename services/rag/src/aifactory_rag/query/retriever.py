from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from aifactory_rag.config import RagConfig, require_ingest_config
from aifactory_rag.db import connect, require_schema, vector_literal
from aifactory_rag.embeddings import create_embedding_adapter

PAGE_MARKER = re.compile(r"\[page\s+(\d+)\]", re.IGNORECASE)


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: int
    document_id: int
    source_id: str
    relative_path: str
    text: str
    score: float
    metadata: dict[str, Any]
    page_numbers: tuple[int, ...] = ()


def infer_page_numbers(text: str, previous_page_text: str | None = None) -> tuple[int, ...]:
    """Return every PDF page represented by a chunk, preserving document order."""
    matches = list(PAGE_MARKER.finditer(text))
    pages: list[int] = []

    # A chunk can start in the middle of a page and reach the next page marker.
    # In that case the preceding marker identifies the initial text's page.
    starts_mid_page = not matches or bool(text[:matches[0].start()].strip())
    if starts_mid_page and previous_page_text:
        previous_matches = list(PAGE_MARKER.finditer(previous_page_text))
        if previous_matches:
            pages.append(int(previous_matches[-1].group(1)))

    pages.extend(int(match.group(1)) for match in matches)
    return tuple(dict.fromkeys(pages))


def retrieve(
    config: RagConfig,
    question: str,
    source_ids: list[str] | None = None,
    exclude_content_types: list[str] | None = None,
) -> list[RetrievedChunk]:
    require_ingest_config(config)
    require_schema(config.database.connection_string)
    embed_model = create_embedding_adapter(config.embedding)
    embedding = embed_model.embed_query(question)

    with connect(config.database.connection_string) as conn:
        with conn.cursor() as cur:
            source_filter = " AND c.source_id = ANY(%s)" if source_ids else ""
            # A source that mixes code with documentation labels each document by its
            # top-level directory. Unlabelled sources must survive the filter.
            content_filter = (
                " AND (c.metadata->>'contentType' IS NULL"
                " OR NOT (c.metadata->>'contentType' = ANY(%s)))"
                if exclude_content_types
                else ""
            )
            params: list[Any] = [vector_literal(embedding)]
            if source_ids:
                params.append(source_ids)
            if exclude_content_types:
                params.append(exclude_content_types)
            params.extend([vector_literal(embedding), config.retrieval.top_k])
            cur.execute(
                f"""
                SELECT
                  c.id AS chunk_id,
                  c.document_id,
                  c.source_id,
                  d.relative_path,
                  c.text,
                  c.metadata,
                  (
                    SELECT previous.text
                    FROM rag_chunks previous
                    WHERE previous.document_id = c.document_id
                      AND previous.chunk_index < c.chunk_index
                      AND previous.text ~ '\\[page [0-9]+\\]'
                    ORDER BY previous.chunk_index DESC
                    LIMIT 1
                  ) AS previous_page_text,
                  1 - (c.embedding <=> %s::vector) AS score
                FROM rag_chunks c
                JOIN rag_documents d ON d.id = c.document_id
                WHERE c.status = 'active'
                  AND d.status = 'active'
                  AND c.embedding IS NOT NULL
                  {source_filter}{content_filter}
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
                """,
                tuple(params),
            )
            rows = cur.fetchall()

    chunks = [
        RetrievedChunk(
            chunk_id=int(row["chunk_id"]),
            document_id=int(row["document_id"]),
            source_id=row["source_id"],
            relative_path=row["relative_path"],
            text=row["text"],
            score=float(row["score"]),
            metadata=row["metadata"] or {},
            page_numbers=infer_page_numbers(row["text"], row.get("previous_page_text")),
        )
        for row in rows
    ]
    if config.retrieval.min_score is None:
        return chunks
    return [chunk for chunk in chunks if chunk.score >= config.retrieval.min_score]
