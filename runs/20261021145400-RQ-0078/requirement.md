---
id: RQ-0078
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T14:50:25.145Z"
branch: "factory/RQ-0078"
createdFromCommit: "d71a0621dd58781c25afa1235b1e555e1774f2ec"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/135"
githubPullRequestIid: 135
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/134"
githubIssueIid: 134
repositoryProvider: github
---
# RQ-0078 - Embedded build reused when its inputs were already built: no second Vivado build on main or the completion commit

Found on 21 October 2026 with embedded1. Merging MR !11 started the main
pipeline, whose `embedded_build` ran Vivado and Vitis again for 30 minutes
on exactly the content the merge request pipeline (2761) had built: the
branch was opened from main and main had not moved. A requirement's
completion commit does the same: it changes only the requirement's own file
and its merge request pipeline builds the design again.

## What it does

- `embedded_build` first asks whether these inputs were built before. The
  inputs are the commit's files (`git ls-tree`) without `requirements/`,
  `runs/` and `handoffs/`, plus `VIVADO_BIN` and `VITIS_BIN`; their SHA-256
  is the key. A build that passed stores its `out/*/artifacts/` under that
  key in the project's generic package registry
  (`embedded_build/<key>/artifacts.tar.gz`), with the CI job token and no
  other credential.
- When the key is there, the job takes those artifacts, rewrites the
  coding standard's compile database for this checkout, says which job built
  them, and ends without Vivado. Twin, board and coding standard jobs get the
  same files as from a build.
- When it is not there, or the registry cannot be reached, the build runs as
  before; storing never fails a job. A main that moved while the merge
  request was open is different content and is built.
- A requirement branch whose requirement names no build phase neither takes
  nor stores anything: the stage is passed over as before.
- Outside CI (no `CI_JOB_TOKEN`) nothing is asked or stored.
- `embedded_sim` (about a minute) is unchanged.

## Acceptance Criteria

- The generated `embedded_build` job runs `node scripts/build-reuse.mjs
  restore` first (exit 0: taken, the job ends; 10: build), then build and sw,
  then `node scripts/build-reuse.mjs save`.
- The key is the same for two commits that differ only under
  `requirements/`, `runs/` or `handoffs/`, and differs for any other file,
  or for another `VIVADO_BIN`.
- Against a registry stand-in: save uploads with `JOB-TOKEN`; a second
  checkout with the same inputs restores the same files and exits 0; another
  key exits 10; an unreachable registry exits 10 on restore and 0 on save.
- `template update` delivers `scripts/build-reuse.mjs` with the CI file.
