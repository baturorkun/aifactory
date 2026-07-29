# RQ-0006 - Draft Requirement Branch Lifecycle

Provide a Git-backed lifecycle in which the default branch reserves requirement
IDs while each developer completes and implements exactly one requirement on a
stable `factory/RQ-xxxx` branch.

## Requirements

- Add `factory requirement new <title> --mode <handoff|pipeline>`.
- Require a clean, current configured base branch before creating a requirement.
- Determine the next numeric `RQ-xxxx` ID and safely retry when a concurrent
  default-branch push reserves the same ID.
- Create a draft Markdown requirement on the default branch with status,
  execution mode, creator Git name/email, creation time, branch, and source
  commit metadata.
- Commit and push the draft reservation to the configured default branch.
- Mark the reservation commit with `[skip ci]` so neither its default-branch
  push nor its initial requirement-branch push creates a pipeline.
- Fork and push `factory/RQ-xxxx` from that exact commit, then switch the
  developer worktree to it.
- Add `factory requirement mode <id> <mode>` without automatically committing
  or pushing the mode change.
- Add `factory requirement submit <id>`.
- Reject submit when the requirement lacks a substantive description or at
  least one acceptance criterion.
- Prevent a requirement branch from modifying another requirement document.
- Accept GitLab Runner detached-HEAD checkouts only when `GITLAB_CI`,
  `CI_COMMIT_BRANCH`, and `CI_COMMIT_SHA` identify the expected branch and the
  checked-out `HEAD` exactly matches that CI commit.
- In handoff mode, mark the requirement ready locally and create the existing
  handoff package without committing or pushing.
- In pipeline mode, mark the requirement ready, commit only its requirement
  document, and push the requirement branch.
- Keep `run`, `handoff`, `handoff-begin`, and `handoff-finish` backward
  compatible for legacy requirements without lifecycle metadata.
- Reject direct agent or handoff execution for explicit draft requirements or
  for a lifecycle execution-mode mismatch.
- Have GitLab CI skip draft and handoff branches and run AI Factory only for
  ready pipeline requirements.
- Refresh a reused runner-side AI Factory checkout from `origin/main` and
  detach it at the fetched commit before installing or executing the CLI.
- Store the successful requirement fingerprint in
  `.aifactory/requirements/RQ-xxxx.json` and skip unchanged reruns.
- Keep Merge Request creation and merge manual.

## Acceptance Criteria

- The default branch contains the immutable draft reservation before its
  requirement branch is created.
- The new branch contains the same draft and becomes the active local branch.
- Git creator information is visible in the generated frontmatter.
- Draft pushes never invoke the agent pipeline.
- A pipeline submit pushes and invokes the existing run pipeline in GitLab.
- A handoff submit produces a tracked handoff run and never pushes implicitly.
- Other requirement documents cannot be submitted from the active requirement
  branch.
- Existing metadata-free requirements continue to work.
