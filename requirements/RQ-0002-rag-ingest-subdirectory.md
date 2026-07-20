# RQ-0002 - RAG Ingest Subdirectory Filter

## Goal

Allow an operator to ingest only one selected directory below a configured RAG filesystem source.

## Requirements

- Add an optional `--subdir <path>` parameter to `pnpm factory rag ingest` and the Python RAG CLI.
- Add an optional `subdir` field to the ingest API request.
- Resolve the selected directory relative to the configured source root.
- Reject absolute paths, missing directories, non-directory paths, and traversal or symbolic-link paths that resolve outside the source root.
- Preserve document paths relative to the configured source root so later full-source ingest runs refer to the same database records.
- Apply existing include and exclude patterns to the source-relative paths.
- Limit missing-document deletion to the selected subdirectory; documents elsewhere in the same source shall remain unchanged.
- Print the active subdirectory filter and include it in the ingest summary.
- When the parameter is omitted, preserve full-source ingest behavior.

## Acceptance Criteria

- `pnpm factory rag ingest --source arinc --subdir "ARINC 661"` scans only that directory tree.
- `--subdir ../outside` and absolute paths are rejected.
- A subdirectory ingest does not mark documents from sibling directories as deleted.
- File-level progress uses paths relative to the configured source root.
- Type checking and Python syntax validation pass.
