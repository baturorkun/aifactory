-- The symbol graph (RQ-0024): definitions and the edges that leave them, per
-- document, so an incremental ingest replaces the graph of changed files only
-- and a deleted document takes its graph with it.
CREATE TABLE IF NOT EXISTS rag_symbols (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
  document_id BIGINT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  signature TEXT,
  start_line INTEGER,
  end_line INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rag_symbols_source_short ON rag_symbols(source_id, short_name);
CREATE INDEX IF NOT EXISTS idx_rag_symbols_source_name ON rag_symbols(source_id, name);
CREATE INDEX IF NOT EXISTS idx_rag_symbols_document ON rag_symbols(document_id);

-- Edges are resolved by name: `to_name` is the name as used (called, read,
-- written, included), and a query links it to every definition of that name.
CREATE TABLE IF NOT EXISTS rag_edges (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
  document_id BIGINT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  from_symbol TEXT,
  kind TEXT NOT NULL,
  to_name TEXT NOT NULL,
  line INTEGER,
  resolution TEXT NOT NULL DEFAULT 'name'
);
CREATE INDEX IF NOT EXISTS idx_rag_edges_source_kind_to ON rag_edges(source_id, kind, to_name);
CREATE INDEX IF NOT EXISTS idx_rag_edges_source_from ON rag_edges(source_id, from_symbol);
CREATE INDEX IF NOT EXISTS idx_rag_edges_document ON rag_edges(document_id);
