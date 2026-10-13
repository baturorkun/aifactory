-- A requirement named by its identifier is looked up among the chunks' labels
-- (RQ-0038). Only requirement chunks carry the label, so the index is small.
CREATE INDEX IF NOT EXISTS idx_rag_chunks_requirement_identifier
  ON rag_chunks (lower(metadata->>'requirement'))
  WHERE status = 'active' AND metadata ? 'requirement';
