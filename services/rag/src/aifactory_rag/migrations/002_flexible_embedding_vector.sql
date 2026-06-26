DROP INDEX IF EXISTS idx_rag_chunks_embedding_hnsw;

ALTER TABLE rag_chunks
  ALTER COLUMN embedding TYPE vector
  USING embedding::vector;
