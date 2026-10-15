-- Who started an ingest run and where it is while it runs (RQ-0040): the
-- page said "Updating now" for an hour with every count at 0.
ALTER TABLE rag_ingest_runs ADD COLUMN IF NOT EXISTS started_by TEXT;
ALTER TABLE rag_ingest_runs ADD COLUMN IF NOT EXISTS progress JSONB;
