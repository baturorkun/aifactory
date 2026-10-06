---
id: RQ-0032
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-06T09:24:29.984Z"
branch: "factory/RQ-0032"
createdFromCommit: "20adf1c0100db5445dcca082b270847dc030be46"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/43"
githubPullRequestIid: 43
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/42"
githubIssueIid: 42
repositoryProvider: github
---
# RQ-0032 - Data-flow and symbol chunks for TypeScript, JavaScript and C# code

The three code layers (RQ-0023 symbol chunks, RQ-0024/0027 symbol graph and
SCIP, RQ-0025 Joern data-flow) are complete only for C. Two gaps remain:

- **Data-flow is C only.** `dataflow.py` always builds the graph with
  `importCode.c`, and its three prepared queries are written for embedded C
  (`memcpy` sinks, ISRs, `extern` globals). arinc661-studio is TypeScript:
  `RAG_SOURCE_1_DATAFLOW=on` would build an empty graph. Yet its riskiest
  code is exactly the kind data-flow is for: `font-file-parsing.ts` and the
  ARINC 661 definition-file readers take offsets and lengths from the bytes
  of a file and use them to index and slice buffers.
- **C# is chunked by size.** The hardware twin's Renode peripherals are C#
  (185 `.cs` files in the aselsan-bfi folder, 3 in bfi-sumilator). They are
  cut every 1200 characters, a `WriteDoubleWord` split across chunks, with
  no symbols and no graph edges, so "what does a write to this register do"
  finds half a method.

The Joern image already ships `jssrc2cpg` (with `astgen`) and
`csharpsrc2cpg`; no new service is needed.

## What it does

**C# is chunked by symbol and joins the symbol graph.** The tree-sitter C#
grammar is added next to C, C++, JavaScript and TypeScript. Classes,
structs, interfaces, enums, methods, constructors and properties become
symbol chunks like the other languages (`symbol-v1`, re-chunked once on the
next ingest without `--force`), and the symbol graph records their
`declares`/`contains` edges, `calls` between methods and `imports` for
`using` directives. Edges stay name-resolved (no SCIP for C#).

**Data-flow picks the Joern frontend by language.** For each code input of a
source with `DATAFLOW=on`, one graph is built per language family present:
C/C++ with `c2cpg` (as today), TypeScript/JavaScript with `jssrc2cpg`, C#
with `csharpsrc2cpg`. A family with no files builds nothing. The project name
carries the family (`rag-<input>-<state>-<c|js|cs>`), so one input with C
probes, `.mjs` scripts and C# peripherals (bfi-sumilator) gets three graphs,
each rebuilt and pruned with the commit as today. The `--exclude-regex` and
the 4 GB memory limit apply to every frontend.

**Each family runs the queries that mean something for it.**

- C/C++: `unchecked-input`, `shared-state`, `coupling`, unchanged.
- TypeScript/JavaScript, `unchecked-input`: values read from external bytes
  or text reaching an index, an offset or a size without a bound check on
  the path. Default sources: `DataView.get*`, `Buffer.read*`, typed-array and
  `Uint8Array` element reads, `readFile*`/`arrayBuffer()`/`text()` results,
  `JSON.parse` and `parseInt`/`Number` of such values. Default sinks: element
  access, `slice`/`subarray`/`copy`/`set` offsets and lengths,
  `new ArrayBuffer`/typed-array/`Array` sizes, `DataView` offsets.
- TypeScript/JavaScript and C#, `coupling`: calls and shared module-level
  state across directories, as for C.
- C#, `unchecked-input`: values written by the bus (the `value` and `offset`
  arguments of Renode `Write*` methods and register `writeCallback`s)
  reaching an array or collection index, an allocation size or
  `Array.Copy`/`Buffer.BlockCopy` without a bound check.

`shared-state` stays C only (ISRs). `_SOURCES`/`_SINKS` overrides apply per
family as `RAG_SOURCE_N_DATAFLOW_<C|JS|CS>_SOURCES` / `_SINKS`; the existing
unsuffixed variables keep meaning C. The answer's data-flow findings and the
`/dataflow` endpoint name the family of each finding, and the DO-330 notice
is unchanged.

## Acceptance Criteria

- A `.cs` file is chunked by symbol: a Renode peripheral's `WriteDoubleWord`
  is one chunk with its class in the path, and the symbol graph has its
  `contains` and `calls` edges; existing `.cs` documents are re-chunked on
  the next ingest without `--force`.
- With `RAG_SOURCE_1_DATAFLOW=on`, arinc661-studio gets a `js` graph built
  with `jssrc2cpg`, and `unchecked-input` reports at least one flow from a
  file's bytes to a buffer index, offset or size in its font or definition
  file parsing, or a fixture shows the query finds such a flow and the
  report lists what it checked.
- bfi-sumilator gets `c`, `js` and `cs` graphs on one ingest, named per
  family, each rebuilt on a new commit and the previous one deleted; an
  input with no files of a family builds no graph for it.
- The C# `unchecked-input` query finds a bus-written value reaching an array
  index in a fixture peripheral, and none when the index is bounds-checked.
- The C results for bfi-sw and the aselsan-bfi folder are unchanged.
- The answer and `/dataflow` name the language family of every finding and
  keep the DO-330 notice.
