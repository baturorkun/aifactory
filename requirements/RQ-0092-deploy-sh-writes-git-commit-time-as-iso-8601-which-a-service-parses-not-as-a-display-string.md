---
id: RQ-0092
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T14:45:12.710Z"
branch: "factory/RQ-0092"
createdFromCommit: "36e570dea84e0edd7d281015baf5eb364a747463"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/163"
githubPullRequestIid: 163
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/162"
githubIssueIid: 162
repositoryProvider: github
---
# RQ-0092 - deploy.sh writes GIT_COMMIT_TIME as ISO 8601, which a service parses, and leaves DEPLOY_EXCLUDE's committed paths off the wire

`scripts/deploy.sh`'s compose target writes `GIT_COMMIT_TIME` into the
stack's `runtime.env` as `2026-10-23-17-28`, a display form. NetForgeSH reads
it with `datetime.fromisoformat` to show its build time, so the first deploy
with the template would have stopped the app at boot. The value is data for
the service, not a label.

## Acceptance Criteria

- `GIT_COMMIT_TIME` is the commit's time in ISO 8601 with its offset
  (`git log -1 --format=%cI`, e.g. `2026-10-23T17:45:26+03:00`), parsed by
  `datetime.fromisoformat` and `Date.parse` alike.
- `DEPLOY_EXCLUDE`: space-separated Git pathspec globs a compose build does
  not send. NetForgeSH commits its run records (`runs/` 74 MB,
  `handoffs/` 29 MB), and a development deploy over a VPN carried them every
  time. Without the setting nothing changes.
- `scripts/deploy.sh` stays byte-identical in `vanilla-ts` and
  `python-service`. `tests/deploy.test.sh` of `python-service` checks the time
  form and the exclusion. `deploy/dev.env.example` and `deploy/README.md` list
  `DEPLOY_EXCLUDE`.
