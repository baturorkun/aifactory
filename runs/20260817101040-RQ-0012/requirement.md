---
id: RQ-0012
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur.orkun@brado."
createdAt: "2026-08-17T10:09:58.718Z"
branch: "factory/RQ-0012"
createdFromCommit: "f58146754da3fccb65c95262fd039be2e1a1669f"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/5"
githubPullRequestIid: 5
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/4"
githubIssueIid: 4
repositoryProvider: github
---
# RQ-0012 - Generate project-root-safe agent lifecycle guidance

Generated project guidelines must prevent local AI Factory lifecycle commands
from resolving `targetProject.root: "."` against the sibling AI Factory
repository. The generated `AGENTS.md` should require execution from the target
project root, prohibit the `pnpm --dir ../aifactory ...` form locally, provide
a copyable direct CLI entrypoint, and require repository/branch verification
before lifecycle mutations.

## Acceptance Criteria

- Newly scaffolded projects instruct agents to run local lifecycle commands
  from the generated project root.
- Generated guidance explains why local `pnpm --dir ../aifactory ...` is unsafe
  when `targetProject.root` is `"."`.
- Generated guidance provides the sibling AI Factory `tsx` CLI invocation with
  `--project .` and requires repo-root/branch verification.
- Scaffold regression tests assert the safety guidance and correct invocation.
