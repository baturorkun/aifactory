---
id: RQ-0065
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T18:45:04.570Z"
branch: "factory/RQ-0065"
createdFromCommit: "7de43ec1187d6e2bb0dc604199c47336ce563898"
completedRunId: "20261020184807-RQ-0065"
completedBy: "Batur Orkun"
completedAt: "2026-10-20T18:53:35.688Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/109"
githubPullRequestIid: 109
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/108"
githubIssueIid: 108
repositoryProvider: github
---
# RQ-0065 - Embedded: prune the builder (CI copies of gone branches, orphaned Vitis workspaces, stale job directories)

On 20 October `C:\ab` on the builder held 21 directories for embedded1
alone: a copy per CI job and branch (`embedded1-embedded_sim-factory-rq-0001`
through `embedded1-b-main`), kept after their branches were merged and gone,
and three Vitis workspaces in `.v` (RQ-0063) that no name ties to a copy.
Nothing removed them; 13 were removed by hand that day.

## What it does

- `node scripts/flow.mjs prune` runs one PowerShell script on the Windows
  Vivado host, over SSH or through the bot as `VIVADO_ACCESS` says. It
  removes, under `VIVADO_REMOTE_BASE_PATH`:
  - a CI copy of this project, `<project>-<s|b|f>-<ref>` (or the job's full
    name before RQ-0063), whose ref is not a branch origin still has
    (`git ls-remote --heads origin`, as GitLab's `CI_COMMIT_REF_SLUG`);
  - a Vitis workspace in `.v` whose `.owner` names a copy of this project
    that is gone, or one with no `.owner` a week old;
  - a bot job or SSH sync directory of this project a day old.
  Nothing touched in the last two hours goes (a job may be in it), a
  person's copy `<project>-<name>` never does, another project's entries
  are not touched, and an origin that lists no branch removes nothing.
- `scripts/vitis_sw.py` writes `.owner` (the copy's path) into the workspace
  it makes.
- The CI has `embedded_builder_prune` after every push to the default branch
  (when a merge has removed a branch), allowed to fail.

## Acceptance Criteria

- Against a base directory with every kind of entry, the script under
  PowerShell removes exactly the copies of gone branches (old and new names),
  the orphaned and week-old ownerless workspaces and the day-old job and sync
  directories; a live branch's copy, a fresh one, a person's copy and another
  project's entries stay.
- `liveRefSlugs` gives origin's branches as slugs and refuses an empty answer.
- The generated CI has the prune job on the default branch.
