-- When a repository input's commit was made (RQ-0029), so the web page can
-- say how recent the code is, not only when it was last checked.
ALTER TABLE rag_source_inputs ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_rag_documents_source_input_ingested
  ON rag_documents(source_id, input_key, last_ingested_at);
