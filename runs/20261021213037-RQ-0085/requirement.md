---
id: RQ-0085
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T21:29:09.428Z"
branch: "factory/RQ-0085"
createdFromCommit: "e5e582b0ee311211ade0649a0d80691fad6abdb6"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/149"
githubPullRequestIid: 149
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/148"
githubIssueIid: 148
repositoryProvider: github
---
# RQ-0085 - Coding standard report only: no cppcheck on a developer's machine is not a failure; CI's coding_standard job reports

Found on 21 October 2026 with embedded1's RQ-0009 on Kaan's machine:
`handoff-finish` stopped at the codingStandard gate with "cppcheck is not
installed", after designCheck, hdlSim, fpgaBuild and firmwareBuild had
passed, and boardTest did not run. embedded1's standard is report only
(`enforce: false`, RQ-0074: it must not hold back the gates), and a
developer's machine is for code: the tools run on the lab hosts. CI's
`coding_standard` job installs cppcheck and reports.

## What it does

- With `enforce: false`, no cppcheck on the machine, and not in CI
  (`CI` unset), `scripts/coding-standard.mjs` writes a report saying it was
  not run here and why (`status: not-run`), prints "CODING STANDARD: not
  run here — …", and exits 0.
- An enforced standard without cppcheck still stops (exit 2), as does a
  report-only one in CI; the message names CI's job that installs it.
- With cppcheck present nothing changes.

## Acceptance Criteria

- With a PATH holding node alone: enforced → exit 2 naming cppcheck and CI's
  job; `enforce: false` → exit 0, "not run here", report status `not-run`;
  `enforce: false` with `CI=true` → exit 2.
