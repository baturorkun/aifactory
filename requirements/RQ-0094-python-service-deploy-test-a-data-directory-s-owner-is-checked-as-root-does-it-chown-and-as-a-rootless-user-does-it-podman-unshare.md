---
id: RQ-0094
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T21:22:41.773Z"
branch: "factory/RQ-0094"
createdFromCommit: "925844a7dc77aadd495d6a6f2dff481f42f3b160"
completedRunId: "20261023212355-RQ-0094"
completedBy: "Batur Orkun"
completedAt: "2026-10-23T21:29:49.011Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/167"
githubPullRequestIid: 167
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/166"
githubIssueIid: 166
repositoryProvider: github
---
# RQ-0094 - python-service deploy test: a data directory's owner is checked as root does it (chown) and as a rootless user does it (podman unshare)

NetForgeSH's CI ran the `python-service` template's `tests/deploy.test.sh`
on its self-hosted runner, which runs as root, and it failed: the test
expected `podman unshare chown` for a data directory, which is what a rootless
user does. As root, `scripts/deploy.sh` gives the directory to the uid with
`chown`, which is right. The test, not the script, assumed who runs it.

## Acceptance Criteria

- `tests/deploy.test.sh` checks a data directory's owner the way the user
  running it does it:
  - as root, the directory belongs to the uid and no `podman unshare` was
    called;
  - rootless, `podman unshare chown <uid>:<uid>` was called.
- The test passes as a user (macOS, `sh` and `dash`) and as root (a Linux CI
  runner). `scripts/deploy.sh` does not change.
