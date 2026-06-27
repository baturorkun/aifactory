from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from aifactory_rag.config import RagConfig, require_ingest_config
from aifactory_rag.db import connect, require_schema, vector_literal
from aifactory_rag.embeddings import create_embedding_adapter


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: int
    document_id: int
    source_id: str
    relative_path: str
    text: str
    score: float
    metadata: dict[str, Any]


def retrieve(config: RagConfig, question: str) -> list[RetrievedChunk]:
    require_ingest_config(config)
    require_schema(config.database.connection_string)
    embed_model = create_embedding_adapter(config.embedding)
    embedding = embed_model.embed_query(question)

    with connect(config.database.connection_string) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  c.id AS chunk_id,
                  c.document_id,
                  c.source_id,
                  d.relative_path,
                  c.text,
                  c.metadata,
                  1 - (c.embedding <=> %s::vector) AS score
                FROM rag_chunks c
                JOIN rag_documents d ON d.id = c.document_id
                WHERE c.status = 'active'
                  AND d.status = 'active'
                  AND c.embedding IS NOT NULL
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
                """,
                (
                    vector_literal(embedding),
                    vector_literal(embedding),
                    config.retrieval.top_k,
                ),
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
        )
        for row in rows
    ]
    if config.retrieval.min_score is None:
        return chunks
    return [chunk for chunk in chunks if chunk.score >= config.retrieval.min_score]
