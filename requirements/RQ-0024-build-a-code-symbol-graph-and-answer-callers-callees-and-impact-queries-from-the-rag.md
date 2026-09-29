---
id: RQ-0024
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-29T15:32:26.767Z"
branch: "factory/RQ-0024"
createdFromCommit: "6e2391ba656180ed8548caf66ac99fdc63acd70f"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/27"
githubPullRequestIid: 27
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/26"
githubIssueIid: 26
repositoryProvider: github
---
# RQ-0024 - Build a code symbol graph and answer callers, callees and impact queries from the RAG

RQ-0023 puts GitLab code into the RAG one chunk per symbol, which answers
"show me this function". It does not answer the questions an engineer asks
next: who calls it, what it calls, where a register or global is written,
which header declares it, and what else a change to it touches. Vector search
finds text that looks like the question; it does not follow a call.

This is the second of three code layers. It stores the relations between
symbols next to the chunks, in the same Postgres, and lets both the API and the
answering LLM walk them.

## What it does

**A symbol graph per source and commit.** From the same parse RQ-0023 does,
the ingest records each symbol definition (the chunk it lives in) and the edges
`calls`, `references` (reads or writes of a global, a struct field or a
register macro), `includes` / `imports`, `declares` (header to
implementation) and `contains` (file, class or namespace to member). Edges are
stored in Postgres tables beside `rag_chunks`; no separate graph database. An
incremental ingest replaces the edges of changed files only.

**Precise resolution where a build exists, names where it does not.**
Tree-sitter gives edges resolved by name, marked `resolution: name`. Where an
index is available, SCIP replaces them with `resolution: precise` edges:
`scip-typescript` for TS/JS, and `scip-clang` for C/C++ when the repository
provides a `compile_commands.json`. Embedded C built with a cross-compiler
often has none; those repositories keep name-resolved edges, and an ambiguous
name links to every candidate rather than guessing one.

**Graph endpoints.** `GET /symbols?name=` finds definitions;
`/callers`, `/callees` and `/references` return one hop with file, line and
resolution; `/impact` returns the transitive callers and referrers of a
symbol up to a depth limit, grouped by repository and file. Every result
names the commit it was computed at.

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
- A TS repository and a C repository with `compile_commands.json` produce
  `precise` edges; a C repository without one produces `name` edges, and two
  functions of the same name are both linked, not one chosen.
- Changing one file and re-ingesting updates only that file's symbols and
  edges; edges into deleted symbols are removed.
- A `/query` about a function includes its callers and callees in the
  context and citations; the same query with expansion off does not.
- Graph queries on a corpus of at least one million edges answer one-hop
  requests in under a second on the RAG host.
