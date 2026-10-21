---
id: RQ-0079
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T15:02:12.425Z"
branch: "factory/RQ-0079"
createdFromCommit: "4891a61a8a0b6c7a0ea9380629599f5fb19cab7b"
completedRunId: "20261021150406-RQ-0079"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T15:09:15.338Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/137"
githubPullRequestIid: 137
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/136"
githubIssueIid: 136
repositoryProvider: github
---
# RQ-0079 - Vivado threads per run: VIVADO_THREADS, 8 by default, in synthesis and implementation runs

Found on 21 October 2026 in embedded1's builds: every synthesis and
implementation said "Multithreading enabled ... a maximum of 2 processes".
Nothing sets Vivado's `general.maxThreads`, and its default on Windows is 2;
the lab builder has 16 cores. `VIVADO_JOBS` (`launch_runs -jobs`) is how
many runs go at once, not how many threads one run uses.

## What it does

- `flow.mjs --threads n`, else `VIVADO_THREADS` from `.env`, else 8; 1 to
  32. Passed to `flow.tcl` as `--threads n`.
- `flow.tcl` sets `general.maxThreads` in its own session (non-project
  designs run there) and, in project mode, writes `out/<design>/threads.tcl`
  and sets it as the `TCL.PRE` hook of `synth_1`'s synthesis and `impl_1`'s
  first step, since those runs are Vivado processes of their own. A hook the
  design set itself is left as it is, with a warning.
- `.env.example` names `VIVADO_THREADS`.

## Acceptance Criteria

- `vivadoThreads`: 8 with nothing set, `VIVADO_THREADS` when set,
  `--threads` over it; 0 or 64 are refused naming the range.
- The Vivado command carries `--threads <n>`; `flow_lib.tcl` takes the
  option, sets the parameter, and hooks `synth_1`/`SYNTH_DESIGN` and
  `impl_1`/`INIT_DESIGN` from `project_open`.
- On the lab builder a CI build's synthesis and route logs say 8, not 2.
