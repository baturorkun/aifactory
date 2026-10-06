-- One Joern graph per input and language family (RQ-0032): C/C++ ('c'),
-- TypeScript/JavaScript ('js') and C# ('cs'). Graphs recorded before
-- families existed are C.
ALTER TABLE rag_dataflow_graphs ADD COLUMN IF NOT EXISTS family TEXT NOT NULL DEFAULT 'c';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rag_dataflow_graphs_pkey'
      AND pg_get_constraintdef(oid) LIKE '%family%'
  ) THEN
    ALTER TABLE rag_dataflow_graphs DROP CONSTRAINT IF EXISTS rag_dataflow_graphs_pkey;
    ALTER TABLE rag_dataflow_graphs ADD PRIMARY KEY (source_id, input_key, family);
  END IF;
END $$;
