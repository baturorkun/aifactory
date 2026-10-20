---
id: RQ-0059
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T09:44:57.569Z"
branch: "factory/RQ-0059"
createdFromCommit: "5e627da41bfcb0f65c3a1bc974d2c57a65828163"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/97"
githubPullRequestIid: 97
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/96"
githubIssueIid: 96
repositoryProvider: github
---
# RQ-0059 - RAG: index FPGA sources, constraints and Tcl by default (xdc, sdc, pdc, ucf, qsf, tcl, v, sv, vhd)

A developer's agent working on a ZedBoard HDMI design in embedded1 asked the
`2d-ge-ipc` corpus for the board's HDMI pins. The corpus holds the reference
design (`amd/zedboard/prj-2dge-zed`, from the repository
`kavci/bytecraft-dev-environment`) but not its `hw/constraints/io.xdc`: the
default include list has no constraint, Tcl or HDL type, so the pins were
known only by the README's description of the file. The agent rightly would
not make pin numbers up, and stopped.

The parser already reads Verilog and VHDL as plain text (added for Renode's
co-simulation examples); only the include list leaves them out.

## What it does

- The RAG's default include list takes HDL (`*.v`, `*.vh`, `*.sv`, `*.svh`,
  `*.vhd`, `*.vhdl`), constraints (`*.xdc`, `*.sdc`, `*.pdc`, `*.ucf`,
  `*.qsf`, `*.lpf`) and Tcl (`*.tcl`). Each is read as plain text and labelled
  `code`, as the firmware sources are.
- A new project's RAG source in `factory.config.json` takes the same types.
- Sources with their own include list keep it.

Deployed to the RAG server and `2d-ge-ipc` ingested again: unchanged files are
skipped, the new types are added; the other sources take them in the nightly
ingest.

## Not covered

- Chunking C so a long initialiser table is not cut between two chunks (the
  `adv_cfg` table of the same design came back cut at register 0x25): a
  requirement of its own.
- Block designs saved as `.bd` (JSON) and IP `.xci` files.

## Acceptance Criteria

- `*.xdc`, `*.sdc`, `*.pdc`, `*.ucf`, `*.qsf`, `*.lpf`, `*.tcl`, `*.v`, `*.vh`,
  `*.sv`, `*.svh`, `*.vhd`, `*.vhdl` are in the default include list, are
  parsed, and are labelled `code`.
- After deploy and ingest, a `2d-ge-ipc` query for the ZedBoard HDMI pins
  quotes `PACKAGE_PIN` lines of `amd/zedboard/prj-2dge-zed/hw/constraints/io.xdc`.
