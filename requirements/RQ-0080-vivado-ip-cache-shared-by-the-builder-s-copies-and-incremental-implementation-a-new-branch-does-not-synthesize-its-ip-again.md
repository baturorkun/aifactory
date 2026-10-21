---
id: RQ-0080
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T15:10:09.893Z"
branch: "factory/RQ-0080"
createdFromCommit: "a8791629f3a723eaa8bf75c80d60ba361ffe6294"
completedRunId: "20261021151133-RQ-0080"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T15:16:37.263Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/139"
githubPullRequestIid: 139
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/138"
githubIssueIid: 138
repositoryProvider: github
---
# RQ-0080 - Vivado IP cache shared by the builder's copies and incremental implementation: a new branch does not synthesize its IP again

Measured on 21 October 2026 with embedded1's builds on the lab builder. A
new branch's copy (job 7056, 30 minutes) waited 7.5 minutes for
`hdmi_colorbar`'s block design IP (VTC, video out, clocking, PS7) and 1.5
for `hello_ps`'s PS7, synthesized out of context; main's existing copy (job
7049, 19.6 minutes) had them already. Synthesis already runs Vivado's
automatic incremental flow (it found no benefit on these small designs);
implementation's was off ("Incremental flow is disabled").

## What it does

- One out-of-context IP cache for every copy on a build host: `flow.mjs`
  passes `--ip-cache`, `<VIVADO_REMOTE_BASE_PATH>\.ipc` on a remote host
  (beside the copies, so pruning a copy keeps it), `out/ip_cache` on a local
  run. `flow.tcl` runs `config_ip_cache -use_cache_location` before the
  block design's output products are made, so a new copy takes IP another
  copy synthesized with the same configuration.
- Project-mode `impl_1` gets `AUTO_INCREMENTAL_CHECKPOINT 1` when Vivado
  has the property: Vivado starts implementation from the copy's last routed
  result when it judges that worth it, and runs the full flow otherwise.
- Non-project designs are unchanged.

## Acceptance Criteria

- `ipCachePath`: `C:\ab\.ipc` for a Windows host with base `C:\ab` (a
  trailing separator or not), `<base>/.ipc` on Linux, `out/ip_cache` locally;
  the Vivado command carries it as `--ip-cache`.
- `flow_lib.tcl` takes `--ip-cache`, sets the cache before `generate_target`,
  and sets `AUTO_INCREMENTAL_CHECKPOINT` on `impl_1` only when it exists.
- On the lab builder, a second new branch builds `hdmi_colorbar` without the
  7.5-minute wait for its IP.
