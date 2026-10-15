-- An answer can be shared by its link (RQ-0041). The identifier is random, so
-- links cannot be counted through; answers recorded before have none. No
-- default: a column added with one rewrites every row of the table.
ALTER TABLE rag_queries ADD COLUMN IF NOT EXISTS share_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_queries_share_id ON rag_queries(share_id) WHERE share_id IS NOT NULL;
