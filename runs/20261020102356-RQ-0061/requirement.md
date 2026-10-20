---
id: RQ-0061
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T10:21:19.981Z"
branch: "factory/RQ-0061"
createdFromCommit: "12674404d9cff0c9922e481e32d88dd429a85ca5"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/101"
githubPullRequestIid: 101
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/100"
githubIssueIid: 100
repositoryProvider: github
---
# RQ-0061 - Embedded: the Vivado parallel jobs from .env (VIVADO_JOBS), filled from the lab inventory

Every build ran `launch_runs -jobs 4`, a number written into `flow.mjs` and
`flow_lib.tcl`. The lab builder has 16 logical cores and 64 GB: a block
design's ten out-of-context IP syntheses went four at a time while most of
the machine waited.

## What it does

- `VIVADO_JOBS` in `.env` sets how many Vivado runs go at once; `--jobs n`
  on the command line still wins; empty means 4, as before. A value that is
  not a positive integer is an error naming the setting.
- The lab inventory gives the Vivado host's number (`vivado.jobs`, 8 for the
  builder: two developers building together fill its 16 cores and do not
  overload it), and a new project's `.env` takes it.
- CI keeps 4: the instance-level CI/CD variables are not changed.

## Acceptance Criteria

- With `VIVADO_JOBS=8` and no `--jobs`, Vivado gets `--jobs 8`; `--jobs 2`
  wins; empty gives 4; `VIVADO_JOBS=many` is an error naming it.
- A project made with `--board zedboard` has `VIVADO_JOBS=8`; the
  `.env.example` describes it.
