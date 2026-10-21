---
id: RQ-0074
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T12:55:12.868Z"
branch: "factory/RQ-0074"
createdFromCommit: "3a63c95b95c17a27b12a09dc4a782be300ede31e"
completedRunId: "20261021125711-RQ-0074"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T13:00:06.604Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/127"
githubPullRequestIid: 127
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/126"
githubIssueIid: 126
repositoryProvider: github
---
# RQ-0074 - Coding standard: report only (codingStandard.enforce false), the gate and CI report the violations without failing

embedded1 took the coding standard cstd (misra, bytecraft) on 21 October
2026; its first report has 90 violations, all in `hdmi_colorbar/sw/src/main.c`.
Batur: merge the choice now, keeping the code to it is a separate matter. With
the standard in force the `codingStandard` gate and the CI job fail on every
violation, so the requirement could not be approved, its merge request not
merged, and main would be red on every push.

## What it does

- `codingStandard.enforce` in `factory.config.json` (default `true`, shown in
  the empty field too). `false` makes the standard report only: the check runs
  as before and writes its report, the status is `reported` (report.md:
  "REPORTED (not enforced: enforce is false in factory.config.json)"), and
  the gate and CI pass. Waiver problems and every violation stay listed.
- `factory new … --report-only`, `factory standard use … --report-only`, and
  `--enforce` to turn it back; `standard use` from the config keeps the flag.
- AGENTS.md says so when it is report only, and that new and changed code
  keeps the rules all the same; the requirement draft's standard line says
  "report only".

## Acceptance Criteria

- With `enforce: false` the check exits 0 with the same violations, status
  `reported`; with `true` it fails as before.
- `standard use --report-only` writes `enforce: false`, a use from the config
  keeps it, `--enforce` sets it back; AGENTS.md says report only.
