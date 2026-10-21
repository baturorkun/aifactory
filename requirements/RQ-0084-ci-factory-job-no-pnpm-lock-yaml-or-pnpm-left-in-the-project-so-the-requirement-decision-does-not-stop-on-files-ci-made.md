---
id: RQ-0084
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T20:59:19.691Z"
branch: "factory/RQ-0084"
createdFromCommit: "a8d2b30258a3ee2ae84b7eeaf201af28c90c383a"
completedRunId: "20261021210019-RQ-0084"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T21:03:31.287Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/147"
githubPullRequestIid: 147
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/146"
githubIssueIid: 146
repositoryProvider: github
---
# RQ-0084 - CI factory job: no pnpm-lock.yaml or .pnpm/ left in the project, so the requirement decision does not stop on files CI made

Found on 21 October 2026 with embedded1 pipeline 2794 (RQ-0009), and the
same on 20 October with RQ-0004 (jobs 6581, 6598, 6666). A push to a
requirement branch that changes the requirement file runs the
`ai_factory_requirement_branch` job. Its `before_script` installs the
project with `pnpm install --no-frozen-lockfile` when the project has no
`pnpm-lock.yaml`, which writes one; `requirement decision` then stops with
"Only requirements/RQ-n-… may have uncommitted changes before submit:
pnpm-lock.yaml" (with `.pnpm/` too on RQ-0004: CI keeps `PNPM_HOME` in the
project for its cache). The job failed on files CI itself made.

## What it does

- The generated GitLab job, and the GitHub workflow likewise, install a
  project without a lockfile with `pnpm install --no-lockfile`, which writes
  none; a project with one still installs `--frozen-lockfile`.
- The generated `.gitignore` ignores `.pnpm/` and `.pnpm-store/`; `template
  update` adds those lines to an embedded project that lacks them.

## Acceptance Criteria

- The generated `.gitlab-ci.yml` has `else pnpm install --no-lockfile; fi`
  and no `--no-frozen-lockfile`.
- In a generated project committed to Git, files under `.pnpm/` and
  `.pnpm-store/` leave `git status --porcelain` empty.
