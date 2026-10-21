---
id: RQ-0082
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T18:18:14.588Z"
branch: "factory/RQ-0082"
createdFromCommit: "3eed78d94781975c65dc628e80f74a2d100b0e83"
completedRunId: "20261021182347-RQ-0082"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T18:29:52.298Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/143"
githubPullRequestIid: 143
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/142"
githubIssueIid: 142
repositoryProvider: github
---
# RQ-0082 - Designs built at once on the build host: sources synced once, each design's Vivado and Vitis run in parallel, VIVADO_PARALLEL

Measured on 21 October 2026, embedded1 job 7136 (31 minutes): the stage
built its designs one after the other on the 16-core builder, hdmi_colorbar
18 minutes, hello_ps 7.5, led_counter 3, then Vitis for two designs, about 2.
Eight threads per run (RQ-0079) changed little: these designs spend their time
in work that is not parallel inside one run. Running the designs at once
makes a stage as long as its longest design.

Each run synced the sources itself and replaced the copy's `designs/`,
`scripts/` … before its command, so two runs at once in one copy would
replace files under each other's Vivado.

## What it does

- `sim`, `synth`, `impl`, `bit`, `xsa`, `build` and `sw` with more than one
  design run them at once, `VIVADO_PARALLEL` at a time (`.env`; else 3 on a
  remote host, 1 on this machine, 1 to 16). `all`, `twin` and `board` are
  unchanged.
- The copy on the host is synced once, with no command; each design then
  runs in it without the sources (SSH: no archive, the script runs the
  command only; bot: no diff/sync step, the start step makes its job
  directory). Job numbers never repeat within a process.
- Each design's output lines are prefixed `[<design>] `. Every design runs to
  its end; the stage then fails naming each design that failed, with the
  first one's exit code.
- One design, or `VIVADO_PARALLEL=1`: as before.

## Acceptance Criteria

- `parallelDesigns`: 3 remote, 1 local, `VIVADO_PARALLEL` when set, 0
  refused; `.env.example` names it.
- With a stand-in Vivado and `VIVADO_PARALLEL=2`, two designs start before
  either ends, their lines carry their names; one failing leaves the other
  to end and fails the stage naming it; `VIVADO_PARALLEL=1` runs them in
  turn, unlabelled.
- Over a stand-in bot, two designs at once take one diff and one sync, then
  a start, collect and cleanup each.
- The SSH scripts run under bash and pwsh: synced with no command, and a
  command with no archive (its exit code kept).
- On the lab builder, embedded1's build stage takes about as long as
  hdmi_colorbar alone.
