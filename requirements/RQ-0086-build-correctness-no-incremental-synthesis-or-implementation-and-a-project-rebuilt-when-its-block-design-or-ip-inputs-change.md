---
id: RQ-0086
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-22T07:56:00.805Z"
branch: "factory/RQ-0086"
createdFromCommit: "7b8f27af22c4a3539d0efe33df02bf58d3ab3187"
completedRunId: "20261022075909-RQ-0086"
completedBy: "Batur Orkun"
completedAt: "2026-10-22T08:06:09.069Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/151"
githubPullRequestIid: 151
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/150"
githubIssueIid: 150
repositoryProvider: github
---
# RQ-0086 - Build correctness: no incremental synthesis or implementation, and a project rebuilt when its block design or IP inputs change

From Kaan's RQ-0009 report (22 October 2026, embedded1, items #7 and A1):
twice a `handoff-finish` fpgaBuild passed, and the bitstream's processor
hung at its first PL access (an empty console on the board); a clean build
gave a working bitstream both times. Those builds ran in an existing copy
with implementation's automatic incremental flow on (RQ-0080) and
synthesis' on (Vivado's default).

A second cause fits the same evidence: `project_open` runs the block design
script only into an empty project, so a copy whose project exists keeps the
block design, and the IP that script packages, from before; a change to
`bd.tcl` or to a design's own IP is not built until a clean.

## What it does

- Neither run is incremental: `AUTO_INCREMENTAL_CHECKPOINT` is set to 0 on
  `synth_1` and `impl_1` where Vivado has it (a project an earlier template
  set it on is set back), and an `INCREMENTAL_CHECKPOINT` left on a run is
  cleared. Neither flow saved time on these designs.
- `flow.mjs` passes `--inputs`: a hash of what makes the block design and
  IP (the design's `project.tcl`, `tcl/` and `ip/`, the project's `ip/`,
  `common/boards`, `common/flow_lib.tcl`; not Markdown). `flow.tcl` keeps
  it in `out/<design>/project.inputs`; when it differs, or a project has
  none, the project is removed and made again before it is opened. HDL and
  constraints are not inputs: the project reads them where they are.

## Acceptance Criteria

- `projectInputs` is the same for the same files; it does not change for a
  design's HDL or software, another design, or Markdown under `ip/`; it
  changes for `bd.tcl`, a file under `ip/`, `project.tcl` and a board file.
- The Vivado command carries `--inputs`; `flow_lib.tcl` removes the project
  directory before opening when the stamp differs, and writes the stamp.
- No `AUTO_INCREMENTAL_CHECKPOINT 1` in the template.
