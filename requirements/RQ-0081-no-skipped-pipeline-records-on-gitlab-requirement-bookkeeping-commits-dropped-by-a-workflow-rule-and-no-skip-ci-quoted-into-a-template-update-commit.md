---
id: RQ-0081
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T15:16:05.330Z"
branch: "factory/RQ-0081"
createdFromCommit: "93e3e22e48dec4154a9f3d1990226af19aadd23b"
completedRunId: "20261021151841-RQ-0081"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T15:20:30.277Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/141"
githubPullRequestIid: 141
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/140"
githubIssueIid: 140
repositoryProvider: github
---
# RQ-0081 - No skipped pipeline records on GitLab: requirement bookkeeping commits dropped by a workflow rule, and no [skip ci] quoted into a template update commit

Found on 21 October 2026 in embedded1's pipeline list. GitLab keeps every
`[skip ci]` commit as a "skipped" pipeline: each `requirement new` left four
to six of them (the draft reservation on main, the repository links on the
branch, and their merge request pipelines). And MR !12, Kaan's `template
update`, ran no pipeline at all: its commit quotes aifactory's last subject,
which was "requirement(RQ-0078): reserve draft [skip ci]".

## What it does

- The generated `.gitlab-ci.yml` workflow drops the requirement bookkeeping
  commits (`requirement(RQ-n): reserve draft`, `requirement: link repository
  metadata`, `requirement(RQ-n): cancel`) for every pipeline source. A
  pipeline dropped by a workflow rule is not created, so nothing is recorded.
- Those commits leave `[skip ci]` out when the project's `.gitlab-ci.yml`
  has that rule, and keep it otherwise (GitHub projects, and GitLab projects
  before their next `template update`).
- `template update` quotes aifactory's last subject without `[skip ci]`,
  `[ci skip]`, `[no ci]`, `[skip actions]` or `[actions skip]`.

## Acceptance Criteria

- A generated `.gitlab-ci.yml` has the bookkeeping rule ahead of `when:
  always`; `skipCiMarker` is empty for that project and ` [skip ci]` for a
  directory without the rule.
- With aifactory's last commit "requirement(RQ-0078): reserve draft [skip
  ci]", the template update commit and merge request name the subject
  without the marker.
