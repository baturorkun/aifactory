---
id: RQ-0021
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-27T09:35:57.405Z"
branch: "factory/RQ-0021"
createdFromCommit: "58a277038be6be3ea038097fa51ed22cefede6b8"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/21"
githubPullRequestIid: 21
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/20"
githubIssueIid: 20
repositoryProvider: github
---
# RQ-0021 - Open a requirement from an existing issue and link the two

Most work arrives as an issue someone already opened: a bug report, a
request written in the tracker. `requirement new` always creates its own
Issue, and `platform-sync` refuses to adopt any Issue whose title does not
start with `RQ-xxxx -` and whose body lacks the aifactory marker — rightly,
since it must not rewrite a person's Issue. So today the requirement and
the Issue it came from are two unrelated items. The link exists only as a
line of prose in the requirement ("GitLab source issue: #35"), nothing
closes the source when the work merges, and source Issues are left open:
on arinc661-studio 41 of 93 Issues were opened by hand, every one linked
only in text, closed by hand when anyone remembered — #74 is still open
though its requirement merged. NetForgeSH #134 needed a hand-edited
"Closes #134" in the PR to close with its fix.

## What it does

`factory requirement new --from-issue <number> <title>` works exactly as
`requirement new` does — the requirement still gets its own Issue and Draft
PR/MR, owned and verified the way they are today — and in addition:

* **Links the two on the platform**, with the platform's own relation:
  * GitHub: the requirement's Issue becomes a **sub-issue** of the source
    Issue. GitHub has no "related" link type; sub-issue is its native
    parent/child relation and shows progress on the source.
  * GitLab: a **relates to** link between the two Issues (the link type
    every tier supports; parent/child and "blocks" are paid or a different
    work-item type).
* **Records the source** in the requirement's front matter
  (`sourceIssueIid`, `sourceIssueUrl`), so `platform-sync` can restore the
  link and `complete` knows what to close.
* **Writes "Closes #N"** for the source Issue into the PR/MR description,
  beside the requirement's own Issue.
* **Comments on the source Issue**: which requirement handles it, with the
  branch and the Draft PR/MR.
* **Closes the source Issue on `complete`**, explicitly, after the merge —
  not only through the closing keyword, which depends on the target branch
  and on how the merge was made. A source Issue already closed is left alone.

The source Issue's title and body are never changed.

It refuses, before anything is created, when the source Issue does not
exist, is already closed, is itself a requirement Issue (it carries the
aifactory marker), or the repository platform is `none`.

## Acceptance Criteria

- `requirement new --from-issue <n>` creates the requirement, its Issue and
  Draft PR/MR as `requirement new` does, and records `sourceIssueIid` and
  `sourceIssueUrl` in the requirement's front matter.
- On GitHub the requirement's Issue is a sub-issue of the source Issue; on
  GitLab the two Issues are linked as "relates to".
- The PR/MR description contains a closing reference to the source Issue.
- The source Issue receives one comment naming the requirement and its
  Draft PR/MR; its title and body are unchanged.
- `requirement complete` closes the source Issue after the merge if it is
  still open, and leaves an already-closed one alone.
- `requirement platform-sync` on a requirement with a source restores a
  missing link and closing reference without creating a second one.
- The command refuses, creating nothing, when the source Issue is missing,
  closed, a requirement Issue, or when the platform is `none`.
- `requirement new` without the option behaves exactly as today.
- Both adapters are covered by tests against recorded API shapes.
