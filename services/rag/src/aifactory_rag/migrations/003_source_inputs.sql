-- A source holds a folder, GitLab repositories, or both (RQ-0023). A document
-- is identified by its input and its path: the same path in the folder and in
-- a repository, or in two repositories, is two documents. The folder is the
-- input with the empty key, so every existing document keeps its identity.
ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS input_key TEXT NOT NULL DEFAULT '';
ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_source_id_relative_path_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rag_documents_source_input_path
  ON rag_documents(source_id, input_key, relative_path);

-- The commit each repository was last ingested at.
CREATE TABLE IF NOT EXISTS rag_source_inputs (
  source_id TEXT NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
  input_key TEXT NOT NULL,
  entry TEXT NOT NULL,
  url TEXT NOT NULL,
  ref TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, input_key)
);
