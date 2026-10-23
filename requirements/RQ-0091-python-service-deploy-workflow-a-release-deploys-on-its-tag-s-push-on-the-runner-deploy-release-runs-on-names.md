---
id: RQ-0091
status: ready
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
# RQ-0091 - A release on a host behind a VPN: the image carries its deploy kit, release-here.sh on the host pulls the tag and deploys it, CI never does

RQ-0090's Deploy workflow releases by hand, on a runner that reaches the
release host. NetForgeSH's production host is reachable only from inside the
customer's network, over a VPN from outside, and it is to have no runner, no
checkout and no deploy key. The operator logs in there and updates the stack
from the registry: CI builds and publishes the image on the tag, and a script
on the host pulls that version and deploys it.

## Acceptance Criteria

- `scripts/release-here.sh` (template-owned) runs on the release host:
  `sh release-here.sh --image <name> <tag>` the first time,
  `sh release-here.sh <tag> [--dry-run]` after.
  - It pulls `<name>:<tag>` with podman (else docker) and copies the deploy
    kit out of the image's `/opt/aifactory-deploy`.
  - It then runs the kit's `scripts/deploy.sh --profile release --image
    <name>:<tag>` on this host, in the script's own directory unless the
    profile names `DEPLOY_DIR`.
  - The image's name is kept in `release-here.image`. The script replaces
    itself with the tag's copy.
  - It stops, naming why, on:
    - a missing name, or a name with a tag;
    - a branch instead of a tag;
    - a failed pull;
    - an image without a kit;
    - a kit profile that is not `DEPLOY_ACCESS=local` and `DEPLOY_BY=host`.
- `DEPLOY_BY` (`ci`, default, or `host`) in a profile: `scripts/deploy.sh`
  refuses a `DEPLOY_BY=host` profile when it runs in GitHub Actions or GitLab
  CI, so no pipeline deploys such a release. The same `deploy.sh` stays
  byte-identical in both templates.
- `deploy.sh` writes `GIT_COMMIT_SHA`/`GIT_COMMIT_TIME` only from a Git
  checkout: a kit out of an image has none, and its image carries its own.
- The `python-service` scaffold's `Dockerfile` copies the kit
  (`compose.yml`, `pyproject.toml`, `deploy/`, `scripts/deploy.sh`,
  `scripts/release-here.sh`) into `/opt/aifactory-deploy`.
- `deploy/README.md`, the workflow's header, the generated AGENTS.md section
  and the root README say how.
- `tests/deploy.test.sh` tests the release script (fake podman with
  `pull`/`create`/`cp`, no checkout, no git) and the `DEPLOY_BY` refusal in
  both CIs.
