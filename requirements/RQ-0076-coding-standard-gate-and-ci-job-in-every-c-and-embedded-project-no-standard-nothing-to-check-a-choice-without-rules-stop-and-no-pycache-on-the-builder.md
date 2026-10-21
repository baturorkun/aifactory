---
id: RQ-0076
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T13:33:43.918Z"
branch: "factory/RQ-0076"
createdFromCommit: "849fcd5a33f2fecac7f6346d04db6b66287ce073"
completedRunId: "20261021134004-RQ-0076"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T14:01:03.653Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/131"
githubPullRequestIid: 131
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/130"
githubIssueIid: 130
repositoryProvider: github
---
# RQ-0076 - Coding standard gate and CI job in every c and embedded project (no standard: nothing to check; a choice without rules: stop), and no __pycache__ on the builder

Two gaps from 21 October 2026.

A standard written into `factory.config.json` by hand, without `factory
standard use`, was checked by nothing: the gate command and the CI job's
rule (`exists: coding-standard/rules.json`) came only with `standard use`,
so the project looked as if it followed a standard and was never checked.

Every `sw` run through the bot said "1 file no longer here removed": Vitis'
Python leaves `scripts/__pycache__` beside `vitis_sw.py` in the builder's
copy, and the next sync removed it.

## What it does

- Every c and embedded project has the `codingStandard` gate (`pnpm
  standard`) and the `coding_standard` CI job. `scripts/coding-standard.mjs
  --in-force` answers 0 when a standard is chosen, 10 when none; the job
  passes on 10 and installs cppcheck only on 0. The check without a standard
  passes saying there is nothing to check; with a standard whose rules were
  not made it stops (exit 2) naming `standard use`. `template update` adds
  the gate command to a project that lacks it and never changes one it has.
- The check compares real paths before it runs: a symlinked path (macOS
  `/var`) made it exit 0 having checked nothing.
- `__pycache__` is no source: not in the list sent to the builder, and the
  sync neither removes nor counts one in the copy.
- `enforce` is untouched: a project with `enforce: false` still only reports.

## Acceptance Criteria

- A c project without a standard has the gate command; `--in-force` exits 10,
  the check exits 0; a standard named by hand without its rules stops the
  check with "coding-standard/rules.json is missing … run pnpm factory --
  standard use"; the CI job has no `exists` rule and asks `--in-force` first.
- A `__pycache__` in the builder's copy stays and is not counted as removed.
