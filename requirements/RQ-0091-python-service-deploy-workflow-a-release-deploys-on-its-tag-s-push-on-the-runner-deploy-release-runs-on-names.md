---
id: RQ-0091
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T14:27:21.811Z"
branch: "factory/RQ-0091"
createdFromCommit: "621c5d93cd7186906329228c03a93a5ad8fb6e36"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/161"
githubPullRequestIid: 161
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/160"
githubIssueIid: 160
repositoryProvider: github
---
# RQ-0091 - python-service deploy workflow: a release deploys on its tag's push, on the runner DEPLOY_RELEASE_RUNS_ON names

RQ-0090's Deploy workflow released only by hand, on the runner every deploy
job uses. NetForgeSH releases when a tag is pushed, and its production host is
reachable only from inside the customer's network (over a VPN from outside):
the lab runner that runs its tests cannot reach it. The release is to run on a
runner on the production host itself, deploying there with
`DEPLOY_ACCESS=local`, with no key and no VPN.

## Acceptance Criteria

- `.github/workflows/deploy.yml` of the `python-service` template also runs on
  a pushed tag `v*`, and the `release` job runs for it (as well as by hand for
  a tag), in the `release` environment as before.
- The `release` job runs on the runner named by the repository variable
  `DEPLOY_RELEASE_RUNS_ON` (a JSON list of labels), else `DEPLOY_RUNS_ON`,
  else `["self-hosted"]`. The other jobs are unchanged.
- A pushed tag in a project without `deploy/release.env` deploys nothing and
  does not fail; a release started by hand without it fails as before.
- A tag's push never runs the `main` job.
- `deploy/README.md` and the root README say so; the template test checks the
  trigger, the runner choice and the missing-profile rule.
