---
id: RQ-0072
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T12:40:08.941Z"
branch: "factory/RQ-0072"
createdFromCommit: "d08d6f8b474699842f8c522e4f39910d5edd5e63"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/123"
githubPullRequestIid: 123
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/122"
githubIssueIid: 122
repositoryProvider: github
---
# RQ-0072 - RAG: source slots 9 to 12 in factory.config.json; DO-254 as source 9 (do254)

Batur wants DO-254 (`/mnt/fs1/1000 AR-GE/1010 STANDARDS/DO-254`, one PDF,
RTCA/DO-254 of 19 April 2000, 137 pages, text extractable) as a RAG source,
next to `do178c`. The root `factory.config.json` names eight source slots and
all eight are taken.

## What it does

- `factory.config.json` names source slots 9 to 12, the same as 1 to 8
  (`RAG_SOURCE_<n>_ID`, `_PATH`, `_EXCLUDE_ADDITIONS`, the `RAG_SOURCE_<n>`
  prefix for repositories, groups and DOORS). A slot with no input is left
  out when the config is loaded, so the empty ones change nothing.
- The server's `.env` sets slot 9: `RAG_SOURCE_9_ID=do254`, its path the
  DO-254 folder. The copy carries a personal-use licence stamp (Collins
  Aerospace); Batur decided to add it.

## Acceptance Criteria

- The root config has slots 1 to 12; a slot set in the environment is loaded,
  an unset one is not.
- After deploy and ingest, `do254` is `current` and a question about DO-254
  design assurance levels is answered from it.
