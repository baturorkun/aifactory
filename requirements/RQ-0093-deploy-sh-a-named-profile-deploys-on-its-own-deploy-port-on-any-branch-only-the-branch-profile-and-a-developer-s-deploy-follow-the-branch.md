---
id: RQ-0093
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T14:57:03.002Z"
branch: "factory/RQ-0093"
createdFromCommit: "c3b13ac0bdf89a187fa8f248244271aa497c2a42"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/165"
githubPullRequestIid: 165
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/164"
githubIssueIid: 164
repositoryProvider: github
---
# RQ-0093 - deploy.sh: a named profile deploys on its own DEPLOY_PORT on any branch; only the branch profile and a developer's deploy follow the branch

NetForgeSH's first development deploy with the template, from its
requirement branch `factory/RQ-0164` with `--profile test`, was given port
8264 (`DEPLOY_BRANCH_PORT_BASE` 8100 + 164) instead of the test stack's 9000:
the branch rule decided the port of a named, fixed place. A test stack,
main and a release are places with their own port, whatever branch they are
deployed from. Only a branch preview and a developer's own deploy follow the
branch.

## Acceptance Criteria

- With `--profile <name>` (or `DEPLOY_PROFILE`) other than `branch`, the port
  is the profile's `DEPLOY_PORT` on any branch. `--port` still wins.
- `--profile branch` and a deploy without a profile keep the rule as it was:
  the default branch gives `DEPLOY_PORT`, `factory/RQ-N` gives base + N,
  another branch in CI gives 20000 + the run id.
- `--dry-run` of the compose target names each compose file with its `-f`.
- `scripts/deploy.sh` stays byte-identical in both templates, and both
  templates' deploy tests pass. The `python-service` test shows a named
  profile on an RQ branch keeping its port.
