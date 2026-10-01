---
id: RQ-0027
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-01T13:28:23.762Z"
branch: "factory/RQ-0027"
createdFromCommit: "eca9044f84dcb882d4bb54dbd9256d01fb704c6b"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/33"
githubPullRequestIid: 33
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/32"
githubIssueIid: 32
repositoryProvider: github
---
# RQ-0027 - Resolve code graph edges precisely from a SCIP index published with the release

RQ-0024 resolves code graph edges by name: a call to `a429HardwareUpdate`
links to every function of that name, so `#ifdef` variants and test stubs all
appear as candidates. `aselsan/bfi-sw` now publishes a SCIP index of its
firmware build (`scip-clang` over the `armDebug` compilation database, job
`scip-index`, bfi-sw MR !3): `index.scip` is uploaded to the release's generic
package next to the firmware, and kept as an artifact of every pipeline. The
index knows, for every use of a function, macro, global or field, which
definition the compiler actually saw.

Measured on pipeline 1392 (`project-initialization`): 53 documents, the
firmware sources and their headers, paths relative to the repository root as
the RAG stores them; functions carry a disambiguator, so two `static`
functions of one name are two symbols; a macro is identified by the file, line
and column of its `#define`. The index marks definitions and uses only: it has
no read or write roles, so reads and writes keep coming from tree-sitter and
SCIP only makes their target exact.

## What it does

**Find the index of the commit being ingested.** For a repository input, after
its files are ingested, the RAG looks for a file named `index.scip`:

1. in the generic packages of the project whose version is the resolved tag
   (a `@last-release` or tag `REF`), then
2. among the job artifacts of the commit's latest successful pipeline.

Both use the entry's own token (`read_api`). No project-specific package or
job name is configured; the file name is the contract. No index means the
input keeps name-resolved edges, as today.

**Make edges precise where the index covers them.** The index is read with a
small protobuf decoder (no generated code). For each document the index
covers, each tree-sitter edge (`calls`, `reads`, `writes`) is matched to the
SCIP use at the same line with the same name; when that use's symbol has a
definition in the index, the edge records the definition's path and line and
becomes `resolution: precise`. Edges the index does not cover keep
`resolution: name`. The overlay is recomputed at every ingest for all files of
the input, so a file whose definitions moved, or that left the index, never
keeps a stale target.

**Queries use the exact target.** `/callees` lists, for a precise call, only
the definition it reaches; `/callers` and `/references` accept an optional
`path` to ask about one definition of a shared name, and then return the
precise edges to that definition and the name-resolved ones that may reach it;
`/impact` follows precise edges to their definition only. Results show the
resolution and, for precise edges, the target path and line.

## Acceptance Criteria

- With an `index.scip` in the release package (or the commit's pipeline
  artifacts), ingesting the repository marks the matched edges of the covered
  files `precise` with the definition's path and line; files the index does
  not cover keep `name` edges.
- A call to a name that two `static` functions share, or that a test stub
  shares, resolves to the one the build compiled, and `/callees` lists only
  that definition.
- `/callers?name=X&path=P` returns the precise calls to the definition in `P`
  and not the precise calls to a same-named definition elsewhere.
- Reads and writes keep their kind from tree-sitter and gain the precise
  target of the register macro, global or field they touch.
- No index, an unreadable index, or a token without `read_api` leaves the
  input on name-resolved edges and the ingest succeeds; the report says which.
- Re-ingesting after a new release recomputes the overlay; an edge whose file
  left the index returns to `name`.
- The index of one commit is never applied to another commit's files.
