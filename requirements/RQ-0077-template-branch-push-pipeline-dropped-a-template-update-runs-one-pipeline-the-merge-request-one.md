---
id: RQ-0077
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T14:34:38.009Z"
branch: "factory/RQ-0077"
createdFromCommit: "85757206740fb262d61d0d473f64bd38c208e533"
completedRunId: "20261021143532-RQ-0077"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T14:44:32.397Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/133"
githubPullRequestIid: 133
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/132"
githubIssueIid: 132
repositoryProvider: github
---
# RQ-0077 - Template branch push pipeline dropped: a template update runs one pipeline, the merge request one

Found on 21 October 2026 with embedded1's MR !11. `factory template update`
pushes `template/aifactory-<commit>` and then opens its merge request. The
push started a branch pipeline (2761) and the merge request a second one
(2762) on the same commit. On an embedded project the second Vivado build
waited for the first on the branch's resource group and then built the same
commit again, about half an hour for nothing.

## What it does

- The generated `.gitlab-ci.yml` `workflow` drops the push pipeline of a
  `template/` branch, as it already drops the push pipeline of a
  requirement's approve/complete commit. The merge request pipeline still
  runs and is the one the merge request shows.
- A project gets the rule with its next `template update`; nothing else
  changes.

## Acceptance Criteria

- Every generated `.gitlab-ci.yml` has a workflow rule
  `$CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH =~ /^template\//` →
  `when: never`, ahead of `when: always`.
- Pipelines of other branches, merge requests, main and pipelines started
  by hand are unchanged.
