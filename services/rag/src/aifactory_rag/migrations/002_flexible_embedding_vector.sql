-- The embedding column takes vectors of any width, so one database can hold
-- more than one model's vectors while a corpus moves between them.
--
-- Only when it is not so already. Migrations run again at every `db migrate`,
-- and ALTER COLUMN ... USING rewrites the whole table and rebuilds every index
-- on it, the vector index included, with the table locked throughout: on 15 Oct
-- 2026 a migrate for an unrelated column held 290k chunks (5.3 GB) and every
-- question for minutes, until it was cancelled.
DO $$
BEGIN
  IF (SELECT format_type(atttypid, atttypmod) FROM pg_attribute
      WHERE attrelid = 'rag_chunks'::regclass AND attname = 'embedding') <> 'vector' THEN
    DROP INDEX IF EXISTS idx_rag_chunks_embedding_hnsw;
    ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector USING embedding::vector;
  END IF;
END
$$;
