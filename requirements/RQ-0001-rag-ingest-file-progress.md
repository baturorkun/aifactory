# RQ-0001 - RAG Ingest File Progress

## Goal

Make long-running RAG ingestion observable from the terminal at file granularity.

## Requirements

- Print the current file index, total matched file count, and relative path immediately before processing each file.
- Print the outcome (`inserted`, `updated`, or `skipped`) and elapsed processing time after each successful file.
- Print the relative path, elapsed processing time, and error message when a file fails.
- Continue processing subsequent files after a file-level error, preserving the existing behavior.
- Print the final ingest status and total elapsed time.
- Include total elapsed seconds in the final CLI/API ingest summary without changing the database schema.
- Flush progress messages immediately so they remain visible in interactive shells, CI logs, and service logs.

## Acceptance Criteria

- A run with multiple files produces paired `START` and `DONE` lines in scan order for every successful file.
- A failed file produces an `ERROR` line and ingestion continues with the next file.
- Every completion line contains a human-readable duration.
- The final JSON summary contains `duration_seconds`.
- Existing inserted, updated, skipped, deleted, and error counters remain correct.
