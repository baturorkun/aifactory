---
id: RQ-0064
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T16:56:46.995Z"
branch: "factory/RQ-0064"
createdFromCommit: "8a86305c610733907e409becd7168e5a7b8083e5"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/107"
githubPullRequestIid: 107
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/106"
githubIssueIid: 106
repositoryProvider: github
---
# RQ-0064 - RAG: C tables chunked whole (file-scope initialized arrays as symbols) and a split symbol's parts brought along

Kaan's agent asked the RAG for the ADV7511 init values of the ZedBoard HDMI
demo (`amd/zedboard/prj-2dge-zed/sw/src/main.c` in
`kavci/bytecraft-dev-environment`) and got the table up to register 0x25; it
filled 0x26-0x2F with "standard" BT.709 values of its own. The table,
`static const uint8_t adv_cfg[][2] = {...}`, is a file-scope array: the code
chunker made symbols of functions, types and macros only, so the array went
to the file-level text, cut by size. Chunk 11 of the file ended in
`{0x25, 0x24}, {0` and held the file's "ADV7511 HDMI" comment, so it was
found; chunk 12 held the rest with neither the table's name nor ADV7511, so it
never was.

## What it does

- In C and C++ a file-scope declaration with a brace initializer (a table, a
  struct constant) is a symbol of kind `variable`, named by its declarator
  (`adv_cfg`, `hdmi::modes`), with its leading comment, like a function. A
  plain global (`static unsigned count = 3;`) stays in the file-level chunk.
- A table too long for one chunk is cut at line ends, as a long function is:
  every part opens with the declaration and `part n/m`.
- A retrieved part of a split code symbol brings the symbol's other parts
  along, the way a document section's parts are brought (RQ-0042,
  `sectionParts`, within the same quarter of top-k).
- Only C and C++ files are chunked again on the next ingest (their chunker
  is `symbol-v2`); TypeScript, JavaScript and C# keep `symbol-v1` and are not
  embedded again.

## Acceptance Criteria

- Kaan's `main.c` gives one `variable adv_cfg` chunk holding every element
  from 0x41 to 0xAF with its ADV7511 comment.
- A table longer than the chunk size comes in parts cut at line ends, each
  part naming the table; every element is in one of them.
- A retrieved part of a split symbol brings its other parts.
- `.c`, `.h` and `.cpp` files ingested with `symbol-v1` are chunked again;
  `.ts`, `.js` and `.cs` are not.
