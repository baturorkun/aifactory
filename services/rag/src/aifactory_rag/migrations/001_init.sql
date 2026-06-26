CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  root_path TEXT NOT NULL,
  include_globs JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclude_globs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  modified_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_ingested_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, relative_path)
);

CREATE TABLE IF NOT EXISTS rag_ingest_runs (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT REFERENCES rag_sources(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS rag_ingest_errors (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES rag_ingest_runs(id) ON DELETE CASCADE,
  source_id TEXT,
  path TEXT,
  stage TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding vector,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS rag_queries (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_documents_source_status ON rag_documents(source_id, status);
CREATE INDEX IF NOT EXISTS idx_rag_documents_source_path ON rag_documents(source_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source_status ON rag_chunks(source_id, status);
