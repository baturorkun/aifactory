---
id: RQ-0025
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-29T15:33:05.880Z"
branch: "factory/RQ-0025"
createdFromCommit: "ceb1fa84ce515c4ec20ee7a2b05c287054105c41"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/29"
githubPullRequestIid: 29
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/28"
githubIssueIid: 28
repositoryProvider: github
---
# RQ-0025 - Answer data-flow and coupling questions about C code with Joern

RQ-0023 and RQ-0024 answer where code is and what calls what. Safety-critical
C work also asks how data moves: which components exchange which data and
under what control (DO-178C data coupling and control coupling analysis),
whether a length or index that arrives on an external bus (ARINC-429, UART)
reaches a buffer access without a bound check, and which variables an ISR and
the main loop share. These are data-flow questions; a call graph does not
answer them.

Joern builds a code property graph (AST, control flow and data dependence
together) from C/C++ source without a build, and answers such questions. It is
the third of three code layers and the only one that is not embedded: it is
run on demand and its results are cited, not retrieved by similarity.

Joern is not a qualified tool (DO-330). Its results guide the engineer and
point at code; they are never presented as certification evidence, and every
answer that uses them says so.

## What it does

**A code property graph per C/C++ repository and commit.** For the `git`
sources of RQ-0023 marked for it, the RAG host builds a Joern CPG of each
repository at the ingested commit and keeps the latest one. Joern runs in a
container from its published image, so the host needs no JVM, with a memory
limit taken from the configuration. A build that fails or runs out of memory
fails that repository only and is reported.

**Prepared data-flow queries behind an endpoint.** `POST /dataflow` takes a
query name and its parameters and returns the flows it finds, each as a path
of steps with repository, commit, file, line and code excerpt. The first set:

* `coupling` — for a component (a directory or a set of files), the globals,
  parameters and return values through which it exchanges data with the
  others, and the conditions under which it calls them;
* `unchecked-input` — flows from configured sources (register reads, receive
  functions of a bus driver) to array indexing, pointer arithmetic or
  `memcpy`/`memset` sizes with no dominating bound check on the path;
* `shared-state` — variables written in an interrupt handler and read or
  written outside it, with whether each access is `volatile` and whether it
  is inside a critical section.

Sources, sinks and handler names are configurable per repository.

**The answering LLM can call it.** A `/query` classified as a data-flow
question calls `/dataflow` as a tool, cites the returned paths like chunks,
and states that the result is a tool finding, not verified evidence.

## Acceptance Criteria

- After ingesting a C repository marked for data-flow, a CPG exists for its
  ingested commit and a re-ingest at a new commit replaces it.
- Joern runs only in its container with the configured memory limit; the
  host has no Java installed for it.
- `unchecked-input` on a fixture with one unchecked and one checked index from
  a receive function reports the first and not the second, with the full path.
- `shared-state` on a fixture with an ISR reports the shared variable, its
  accesses, and the non-`volatile` one.
- `coupling` on a fixture of two components lists the data they exchange and
  the conditional calls between them.
- A data-flow question to `/query` returns an answer that cites the paths and
  carries the not-qualified-tool notice.
- A failed or out-of-memory CPG build is reported for that repository and does
  not affect other repositories or the rest of the RAG.
