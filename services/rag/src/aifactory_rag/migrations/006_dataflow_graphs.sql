-- The Joern graph each code input of a data-flow source was last built into
-- (RQ-0025): the folder input's key is '', a repository's its input key.
CREATE TABLE IF NOT EXISTS rag_dataflow_graphs (
  source_id TEXT NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
  input_key TEXT NOT NULL,
  project TEXT NOT NULL,
  input_path TEXT NOT NULL,
  ref TEXT,
  commit_sha TEXT,
  repository_url TEXT,
  built_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, input_key)
);
