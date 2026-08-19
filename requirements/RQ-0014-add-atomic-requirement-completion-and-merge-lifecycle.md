---
id: RQ-0014
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur.orkun@brado."
createdAt: "2026-08-19T14:26:18.895Z"
branch: "factory/RQ-0014"
createdFromCommit: "a928db08d7b9259c312e980e6f108b6d2d403e4b"
---
# RQ-0014 - Add atomic requirement completion and merge lifecycle

Add an explicit lifecycle command that completes an approved requirement and
converges its Git, run-history, change-request, and work-item state. Today an
approved run can coexist indefinitely with a `ready` requirement, a Draft
Pull/Merge Request, and an open Issue carrying `factory::ready`. Operators must
manually merge and repair each state independently, and the CLI exposes no
supported transition to the already-valid `completed` requirement status.

The primary interface shall be:

```bash
factory requirement complete <requirement-id> --run <run-id> [--by <name>] [--platform <provider>]
```

Completion is a cross-system workflow rather than a truly atomic database
transaction. Implement it as an idempotent, resumable convergence operation:
every successfully completed step must be safe to observe and retry, while a
partial failure must never falsely report the requirement as completed on the
base branch or close its work item before the change is merged.

## Required Behavior

- Resolve the configured requirement branch, base branch, repository provider,
  linked work item, and linked Draft Pull/Merge Request through the existing
  lifecycle metadata and repository-platform abstraction.
- Require a clean target repository and an approved run whose
  `requirementId` matches the requested requirement. Reject missing, failed,
  `needs-fix`, merely `passed`, or unrelated runs.
- Verify that the change request points from the configured requirement branch
  to the configured base branch and that its head contains the approved run and
  implementation commits.
- Refuse to merge when the change request is conflicted, required approval is
  missing, or the latest required CI status is not successful. A pending CI
  state may either be waited for within a documented bound or returned as a
  clear resumable result; it must not be treated as success.
- Record completion metadata in the requirement Markdown, including at least
  `status: completed`, `completedAt`, `completedBy`, and the approved run ID.
  Arrange the metadata update and provider merge so protected base branches are
  respected and the merged base branch contains the completed state.
- Remove Draft status and merge through the provider API using a head-SHA guard
  so a newly pushed commit cannot be merged without validation. Honor the
  configured target branch and `removeSourceBranchOnMerge` setting.
- After the merge is confirmed, set the work-item lifecycle label to
  `factory::passed`, add an idempotently marked completion comment containing
  the run and change-request references, and close the work item.
- Re-running the same command after any partial or full completion must
  reconcile missing safe steps without duplicating comments, creating another
  change request, producing conflicting completion commits, or failing merely
  because the change request is already merged or the work item is already
  closed.
- Return non-zero with an actionable explanation when completion cannot safely
  proceed. Do not print platform tokens, credentials, or sensitive API response
  bodies.

Support both existing GitLab and GitHub repository-platform adapters. Provider
`none` must fail clearly because it cannot verify or perform a merge. Keep
`factory approve <run-id>` scoped to run approval; completion is a distinct
requirement lifecycle transition.

## Out of Scope

- Automatically approving a run that is only `passed`.
- Bypassing branch protection, required reviews, required CI, merge conflicts,
  or provider authorization.
- Squashing, rebasing, or force-pushing unrelated user commits.
- Reopening cancelled requirements or completing a run associated with a
  different requirement.
- Implementing webhook infrastructure or a persistent workflow engine solely
  for this command.

## Acceptance Criteria

- `factory requirement complete --help` documents the requirement ID, required
  run ID, approver, provider override, safety checks, and resumable behavior.
- A ready requirement with a matching approved run, successful required CI,
  and a mergeable Draft change request is made ready, merged into the configured
  base branch, and present there with `status: completed` plus completion
  metadata.
- The linked Issue/work item receives only the configured
  `factory::passed` lifecycle label, one marked completion comment, and is
  closed only after the provider confirms the merge.
- GitLab and GitHub implementations use provider APIs and a verified head SHA;
  they honor the configured target branch and source-branch removal policy.
- A run in any state other than `approved`, a run belonging to another
  requirement, a dirty repository, a mismatched source/target branch, failed or
  pending required CI, missing approval, or a merge conflict prevents merge and
  returns a non-zero result with a specific reason.
- A failure after an intermediate external operation leaves a recoverable
  state. Re-running the command converges to the same final result without
  duplicate commits, comments, labels, merges, or branch creation.
- Re-running the command after full completion succeeds as an idempotent no-op
  and reports the already-completed requirement, merged change request, closed
  work item, and approved run.
- Unit tests cover successful GitLab and GitHub flows, every precondition,
  head-SHA races, branch-protection/CI failures, failures between external
  steps, and retries from each partial state using mocked adapters without
  contacting real services.
- Existing `requirement new`, `submit`, `platform-sync`, `cancel`, execution
  modes, handoff finalization, and standalone run approval retain their current
  behavior and test coverage.
- CLI and lifecycle documentation clearly distinguish `passed`, `approved`,
  and `completed`, and show the supported end-to-end sequence from requirement
  creation through merge and work-item closure.
