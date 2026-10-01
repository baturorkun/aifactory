-- Precise edge targets from a SCIP index (RQ-0027): the path and line of the
-- definition an edge reaches, when the compiler-backed index says which one.
-- A name-resolved edge leaves both empty.
ALTER TABLE rag_edges ADD COLUMN IF NOT EXISTS to_path TEXT;
ALTER TABLE rag_edges ADD COLUMN IF NOT EXISTS to_line INTEGER;
CREATE INDEX IF NOT EXISTS idx_rag_edges_source_to_path ON rag_edges(source_id, to_path);
