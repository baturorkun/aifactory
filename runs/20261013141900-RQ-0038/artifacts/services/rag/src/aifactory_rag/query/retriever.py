from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from aifactory_rag.config import RagConfig, require_ingest_config, searchable_source_ids
from aifactory_rag.db import connect, require_schema, vector_literal
from aifactory_rag.embeddings import create_embedding_adapter
from aifactory_rag.query.path_filter import exclusion_regexes

PAGE_MARKER = re.compile(r"\[page\s+(\d+)\]", re.IGNORECASE)

# What can be a requirement's identifier (RQ-0038): a word that starts with a
# letter, its parts joined by - _ or . (BFI-SRS-1296, BFI_HLR_235, REQ12). It
# counts when it holds two letters and a digit, which leaves v2.3 and 3.5.1 out.
IDENTIFIER = re.compile(r"(?<![\w.-])[A-Za-z][A-Za-z0-9]*(?:[-_.][A-Za-z0-9]+)*(?![\w-])")
MAX_IDENTIFIERS = 20
# How a chunk found by its identifier is marked, for the answer and its source list.
FOUND_BY_IDENTIFIER = "identifier"


def identifiers_in(question: str) -> list[str]:
    """The tokens of a question that can be requirement identifiers, lower-cased,
    in the order they appear."""
    found: list[str] = []
    for match in IDENTIFIER.finditer(question):
        token = match.group(0).lower()
        if sum(character.isalpha() for character in token) >= 2 and any(character.isdigit() for character in token):
            if token not in found:
                found.append(token)
    return found[:MAX_IDENTIFIERS]


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
    exclude_paths: list[str] | None = None,
) -> list[RetrievedChunk]:
    require_ingest_config(config)
    require_schema(config.database.connection_string)
    # Passive sources are never searched; asking only for them finds nothing.
    source_ids = searchable_source_ids(config, source_ids)
    if source_ids == []:
        return []
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
            # Paths left out (RQ-0034): a requirement's grounding must not find
            # the requirement's own file.
            path_regexes = exclusion_regexes(exclude_paths)
            path_filter = " AND NOT (d.relative_path ~ ANY(%s))" if path_regexes else ""
            filter_params: list[Any] = []
            if source_ids:
                filter_params.append(source_ids)
            if exclude_content_types:
                filter_params.append(exclude_content_types)
            if path_regexes:
                filter_params.append(path_regexes)
            params: list[Any] = [
                vector_literal(embedding), len(embedding), *filter_params, vector_literal(embedding), config.retrieval.top_k,
            ]
            dims = len(embedding)
            # A requirement named by its identifier is looked up, not searched
            # for (RQ-0038): a number means nothing to an embedding model, and
            # "BFI-SRS-1296 ne diyor?" brought back twelve other requirements.
            identifiers = identifiers_in(question)
            named: list[dict[str, Any]] = []
            if identifiers:
                cur.execute(
                    f"""
                    SELECT
                      c.id AS chunk_id,
                      c.document_id,
                      c.source_id,
                      d.relative_path,
                      c.text,
                      c.metadata,
                      c.chunk_index,
                      lower(c.metadata->>'requirement') AS identifier,
                      1 - ((c.embedding::halfvec({dims})) <=> %s::halfvec({dims})) AS score
                    FROM rag_chunks c
                    JOIN rag_documents d ON d.id = c.document_id
                    WHERE c.status = 'active'
                      AND d.status = 'active'
                      AND c.embedding IS NOT NULL
                      AND vector_dims(c.embedding) = %s
                      -- as the index is written (migration 009)
                      AND c.metadata ? 'requirement'
                      AND lower(c.metadata->>'requirement') = ANY(%s)
                      {source_filter}{content_filter}{path_filter}
                    """,
                    (vector_literal(embedding), len(embedding), identifiers, *filter_params),
                )
                named = sorted(
                    cur.fetchall(),
                    key=lambda row: (identifiers.index(row["identifier"]), row["relative_path"], row["chunk_index"]),
                )[: config.retrieval.top_k]
            # The HNSW scan finds the nearest ef_search (40) chunks of the whole
            # index and filters them afterwards. "kac tip container var" asked
            # of arinc came back empty: its 40 nearest were all Ballard C#
            # examples in aselsan-bfi. An iterative scan keeps walking the graph
            # until the filters leave enough rows (pgvector 0.8+).
            cur.execute("SET LOCAL hnsw.iterative_scan = strict_order")
            # The index is approximate: with the default 40 candidates it does
            # not always reach the true nearest chunks (see RagRetrievalConfig).
            cur.execute(f"SET LOCAL hnsw.ef_search = {int(config.retrieval.ef_search)}")
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
                  1 - ((c.embedding::halfvec({dims})) <=> %s::halfvec({dims})) AS score
                FROM rag_chunks c
                JOIN rag_documents d ON d.id = c.document_id
                WHERE c.status = 'active'
                  AND d.status = 'active'
                  AND c.embedding IS NOT NULL
                  -- Chunks written by a different embedding model are simply not
                  -- comparable: PostgreSQL raises on mixed widths and the whole
                  -- query dies. Ignoring them instead keeps the service answering
                  -- from whatever is already in the current model's space, which
                  -- is what makes it possible to change models one corpus at a
                  -- time, or to leave a corpus behind on the old one.
                  AND vector_dims(c.embedding) = %s
                  {source_filter}{content_filter}{path_filter}
                -- Written against the same expression the HNSW index is built
                -- on (db.ensure_vector_index: the halfvec cast), because a
                -- plain `c.embedding <=> ...` cannot use it: the column is
                -- dimensionless, so the index is on the cast. The difference
                -- is a sequential scan over every chunk versus an index
                -- lookup, measured at 555 ms against 1.9 ms.
                ORDER BY (c.embedding::halfvec({dims})) <=> %s::halfvec({dims})
                LIMIT %s
                """,
                tuple(params),
            )
            rows = cur.fetchall()

    def chunk(row: dict[str, Any], found_by: str | None = None) -> RetrievedChunk:
        return RetrievedChunk(
            chunk_id=int(row["chunk_id"]),
            document_id=int(row["document_id"]),
            source_id=row["source_id"],
            relative_path=row["relative_path"],
            text=row["text"],
            score=float(row["score"]),
            metadata={**(row["metadata"] or {}), **({"foundBy": found_by} if found_by else {})},
            page_numbers=infer_page_numbers(row["text"], row.get("previous_page_text")),
        )

    # What was named comes first and is not weighed by its score; the search
    # fills what is left of topK, without repeating a chunk.
    by_identifier = [chunk(row, FOUND_BY_IDENTIFIER) for row in named]
    taken = {found.chunk_id for found in by_identifier}
    searched = [chunk(row) for row in rows if int(row["chunk_id"]) not in taken]
    if config.retrieval.min_score is not None:
        searched = [found for found in searched if found.score >= config.retrieval.min_score]
    return [*by_identifier, *searched][: config.retrieval.top_k]
