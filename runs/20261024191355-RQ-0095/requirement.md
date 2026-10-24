---
id: RQ-0095
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-24T19:11:33.148Z"
branch: "factory/RQ-0095"
createdFromCommit: "40b24fcdd0ef67c7c791de97872429cd784789cc"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/169"
githubPullRequestIid: 169
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/168"
githubIssueIid: 168
repositoryProvider: github
---
# RQ-0095 - requirement complete refuses a branch that has not taken main's code or template changes; handoff-finish warns

Decided on 24 October 2026 with embedded1. A requirement branch is tested
with the template and code it carries; main moves meanwhile (template
updates, other requirements). Nothing asked the branch to take main before
completion, so what was merged had never run with main's changes, and a
mismatch would show on main, after the merge, where it stops everyone.

## What it does

- `requirement complete` fetches the base branch and refuses when it has
  commits this branch has not taken that change anything outside the
  requirement records (`requirements/`, `runs/`, `handoffs/`): "main has
  changes this branch has not taken (N commit(s): files…). Take them first:
  git fetch origin && git merge origin/main && git push, then rerun
  completion when the pipeline is green." Nothing is written or pushed
  before that check.
- Records-only commits on main (another requirement's draft reservation,
  run artifacts) do not refuse: every open requirement would be behind by
  those.
- `handoff-finish` makes the same check after the gates and only warns,
  naming the files and the commands, so the owner knows before approval.
- No bypass flag: the way is to take main.

## Acceptance Criteria

- With a records-only commit on main, `baseChangesNotTaken` lists no files
  and completion goes on; with a code commit it lists the files and
  completion throws the message above, leaving the requirement `ready`;
  after `git merge origin/main` and a push, completion completes.
