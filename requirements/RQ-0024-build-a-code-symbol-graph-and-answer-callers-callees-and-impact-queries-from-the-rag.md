---
id: RQ-0024
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-29T15:32:26.767Z"
branch: "factory/RQ-0024"
createdFromCommit: "6e2391ba656180ed8548caf66ac99fdc63acd70f"
completedRunId: "20260930203607-RQ-0024"
completedBy: "Batur Orkun"
completedAt: "2026-09-30T20:50:58.078Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/27"
githubPullRequestIid: 27
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/26"
githubIssueIid: 26
repositoryProvider: github
---
# RQ-0024 - Build a code symbol graph and answer callers, callees and impact queries from the RAG

RQ-0023 puts code into the RAG one chunk per symbol, from folders and GitLab
repositories alike, which answers
"show me this function". It does not answer the questions an engineer asks
next: who calls it, what it calls, where a register or global is written,
which header declares it, and what else a change to it touches. Vector search
finds text that looks like the question; it does not follow a call.

This is the second of three code layers. It stores the relations between
symbols next to the chunks, in the same Postgres, and lets both the API and the
answering LLM walk them.

## What it does

**A symbol graph per source, across its inputs.** From the same parse RQ-0023
does, over every code input of a source (folder and repositories alike, so a
call from one repository into another, or into code in the folder, is linked),
the ingest records each symbol definition (the chunk it lives in) and the edges
`calls`, `references` (reads or writes of a global, a struct field or a
register macro), `includes` / `imports`, `declares` (header to
implementation) and `contains` (file, class or namespace to member). Edges are
stored in Postgres tables beside `rag_chunks`; no separate graph database. An
incremental ingest replaces the edges of changed files only.

**Edges are resolved by name.** Tree-sitter gives edges resolved by name,
marked `resolution: name`, and an ambiguous name links to every candidate
rather than guessing one. Precise resolution through SCIP (`scip-typescript`,
`scip-clang` with a `compile_commands.json`) is left to a later requirement:
the first corpus, `aselsan/bfi-sw`, has no TypeScript and no compilation
database, and its C is cross-compiled, so SCIP would need a toolchain on the
shared RAG host for no gain today. The `resolution` field is there for it.

**References are the reads and writes inside functions.** An identifier used in
a function body that is not one of that function's parameters or locals is a
reference to something outside it (a global, an enum constant, a register
macro), recorded as `reads` or, on the left of an assignment or in `++`/`--`,
`writes`; struct fields and object properties likewise.

**Graph endpoints.** `GET /symbols?name=` finds definitions;
`/callers`, `/callees` and `/references` return one hop with file, line and
resolution; `/impact` returns the transitive callers and referrers of a
symbol up to a depth limit, grouped by input and file. Every result names the
commit it was computed at for code from a repository.

**Graph-expanded answers.** A `/query` whose best hits are code chunks adds
the direct callers and callees of those symbols (and the header that declares
them) to the context within the existing top-k budget, and the answer cites
them like any chunk. The expansion can be switched off per query.

## Acceptance Criteria

- After ingesting a C repository and a TS repository, `/callers` and
  `/callees` of a function return its call sites and callees with path, line
  and resolution.
- `/references` of a global variable or register macro lists where it is read
  and where it is written.
- `/impact` of a function lists every transitive caller up to the requested
  depth, stops at the limit and never loops on recursion.
- Every edge carries `resolution: name`, and a call to a name two functions
  share is linked to both, not one chosen.
- Changing one file and re-ingesting updates only that file's symbols and
  edges; edges into deleted symbols are removed.
- Code already ingested before this change gets its symbols and edges on the
  next ingest without being re-embedded.
- A `/query` about a function includes its callers and callees in the
  context and citations; the same query with expansion off does not.
- Graph queries on a corpus of at least one million edges answer one-hop
  requests in under a second on the RAG host.
