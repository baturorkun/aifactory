---
id: RQ-0022
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-27T15:40:15.055Z"
branch: "factory/RQ-0022"
createdFromCommit: "7803dedb346a31f3fb3f4ed4190e68bb6cc7d33b"
completedRunId: "20260927154048-RQ-0022"
completedBy: "Batur Orkun"
completedAt: "2026-09-27T16:19:00.849Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/23"
githubPullRequestIid: 23
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/22"
githubIssueIid: 22
repositoryProvider: github
---
# RQ-0022 - Label the source issue while its requirement is in progress and once it is resolved

RQ-0021 lets a requirement be opened from an existing Issue — a bug report
someone filed — and closes that Issue when the requirement merges. What it
does not do is say so on the Issue list. A source Issue keeps only the
labels its author gave it: NetForgeSH #134 was fixed by RQ-0068 and closed,
and still reads just `bug`, the same as an Issue closed by hand, closed as a
duplicate, or closed because nobody will fix it. While the work is under
way the list does not show that anyone has picked it up either. The
project's work arrives mostly as bug Issues, so this is the list people read.

## What it does

Two labels on the **source** Issue, next to the author's own:

* `factory::in-progress` — added when a requirement is opened from the
  Issue (`requirement new --from-issue`), and restored by `platform-sync`
  if missing.
* `factory::resolved` — replaces `factory::in-progress` when the requirement
  completes, whether the merge or `complete` closed the Issue.

When the requirement is **cancelled**, `factory::in-progress` is removed and
the source Issue stays open, because nothing resolved it.

The author's labels (`bug`, `enhancement`, …) are never removed or changed,
and the requirement's own Issue keeps its lifecycle labels as today. Both
names come from the platform settings, like the lifecycle labels, with the
defaults above; a project that renames them gets its own names.

## Acceptance Criteria

- `requirement new --from-issue` adds `factory::in-progress` to the source
  Issue and leaves its other labels as they were.
- `requirement complete` leaves the source Issue with `factory::resolved`
  and without `factory::in-progress`, on GitHub and on GitLab, whether the
  merge or `complete` closed it.
- `requirement cancel` removes `factory::in-progress` from the source Issue
  and does not close it.
- `requirement platform-sync` restores a missing `factory::in-progress`
  without duplicating it.
- Both label names are configurable in the platform settings, with these
  defaults; the scaffold and the CLI reference document them.
- A requirement not opened from an Issue behaves exactly as before.
