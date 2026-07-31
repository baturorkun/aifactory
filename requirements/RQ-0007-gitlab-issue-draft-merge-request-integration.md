# RQ-0007 - GitLab Issue and Draft Merge Request Integration

Extend the requirement-branch lifecycle so one `factory requirement new`
operation can reserve the requirement, create its branch, create a linked
GitLab Issue, and open a linked Draft Merge Request. Merge approval and the
actual merge must remain manual.

## Objective

This command, either with explicit selection:

```bash
pnpm factory -- requirement new "Feature title" --mode handoff --platform gitlab
```

or with GitLab as the sole provider having a complete environment-variable
set:

```bash
pnpm factory -- requirement new "Feature title" --mode handoff
```

shall create and link all of the following:

- the next safely reserved `RQ-xxxx` requirement;
- its `factory/RQ-xxxx` branch;
- one GitLab Issue;
- one Draft Merge Request from the requirement branch to the configured base
  branch.

The existing requirement Markdown remains the executable, version-controlled
specification. GitLab Issue and Merge Request records provide planning,
discussion, review, and lifecycle visibility.

## Configuration

Add optional repository-platform adapter configurations. The CLI may select an
adapter explicitly, or AI Factory may detect the single fully configured
provider from its environment.

Example:

```json
{
  "repositoryPlatforms": {
    "gitlab": {
      "baseUrl": "${GITLAB_URL}",
      "projectId": "${GITLAB_PROJECT_ID}",
      "token": "${GITLAB_TOKEN}",
      "targetBranch": "main",
      "removeSourceBranchOnMerge": true,
      "labels": {
        "draft": "factory::draft",
        "ready": "factory::ready",
        "running": "factory::running",
        "needsFix": "factory::needs-fix",
        "passed": "factory::passed"
      }
    }
  }
}
```

- `--platform gitlab` explicitly selects the configured GitLab adapter.
- Without `--platform`, a complete non-empty GitLab variable set
  (`GITLAB_URL`, `GITLAB_PROJECT_ID`, and `GITLAB_TOKEN`) automatically selects
  GitLab.
- Future GitHub detection shall require its complete provider-specific set,
  including `GITHUB_TOKEN` and `GITHUB_REPOSITORY`; an API URL may retain its
  provider default.
- If no complete provider set is available, preserve the current requirement
  reservation and branch-only behavior and create no remote platform object.
- If more than one complete provider set is available, fail before reserving a
  requirement and require `--platform <name>` to resolve the ambiguity.
- A partially configured provider is not available. If any variables for a
  provider are present but its required set is incomplete, report the missing
  variable names without printing values or tokens.
- A detected but unsupported provider, such as GitHub before its adapter is
  installed, must fail with a clear provider-not-installed error rather than
  silently choosing another provider or branch-only mode.
- `targetBranch` defaults to `requirementBranches.baseBranch` when omitted.
- The token must come from environment expansion and must never be written to
  requirements, manifests, logs, handoffs, artifacts, commits, or error
  messages.
- GitLab variables are required only when an operation actually uses enabled
  GitLab integration. Unrelated commands must not fail because GitLab
  credentials are absent.
- Support self-managed GitLab base URLs as well as GitLab.com-compatible API
  paths.

## Provider Architecture

Define a provider-neutral interface for the lifecycle operations used by AI
Factory, including:

- create/find/update work item;
- add an idempotent work-item comment;
- add/remove lifecycle labels without removing unrelated labels;
- create/find/update a draft change request;
- return normalized IDs, URLs, state, source branch, and target branch.

Implement these operations in a GitLab adapter using Issues, Issue Notes, and
Merge Requests. Requirement lifecycle, handoff, and pipeline modules must call
the provider-neutral interface and must not construct GitLab API requests
directly.

Use neutral internal terminology such as `workItem` and `changeRequest` where
the concept applies to both platforms. GitLab-facing output may say `Issue`
and `Merge Request`. A future GitHub adapter must be able to map the same
interface to Issues, comments, and Pull Requests without changing requirement
lifecycle logic or stored generic linkage fields.

The CLI supports explicit selection:

```bash
pnpm factory -- requirement new "Feature title" --mode handoff --platform gitlab
```

An explicit selection takes precedence and validates only that provider. When
the option is omitted, AI Factory resolves the complete provider variable sets
using the deterministic rules above. Print the resolved platform (`gitlab`,
`github`, or `none`) before creating resources, without printing credentials.

## Requirement Creation Sequence

Preserve the existing concurrency-safe ID reservation and branch lifecycle,
then perform the GitLab operations in this order:

1. Verify the clean/current configured base branch.
2. Reserve the next `RQ-xxxx` on the base branch using the existing
   concurrency retry behavior.
3. Push the `[skip ci]` reservation commit.
4. Create and push `factory/RQ-xxxx`, then switch the local worktree to it.
5. Create or recover the linked GitLab Issue.
6. Add Issue metadata to the branch copy of the requirement, commit it with
   `[skip ci]`, and push it. This branch-only commit provides a difference from
   the base branch before Draft Merge Request creation.
7. Create or recover the Draft Merge Request.
8. Add Merge Request metadata to the requirement branch, commit with
   `[skip ci]`, and push it.
9. Add a GitLab Issue note containing the requirement ID, branch, execution
   mode, and Draft Merge Request link.

Neither the base-branch reservation nor the GitLab-link metadata commits may
start the AI implementation pipeline.

## Requirement Metadata

Persist stable, flat lifecycle metadata that the existing frontmatter parser
can validate and update. Store the provider explicitly and retain
provider-specific Issue/MR fields for the first adapter:

```yaml
repositoryProvider: gitlab
gitlabIssueIid: 42
gitlabIssueUrl: "https://gitlab.example/group/project/-/issues/42"
gitlabMergeRequestIid: 15
gitlabMergeRequestUrl: "https://gitlab.example/group/project/-/merge_requests/15"
```

- IIDs must be positive integers.
- `repositoryProvider` must match the configured provider before linked remote
  resources can be read or modified.
- URLs must belong to the configured GitLab base URL and project.
- Existing linked metadata must be preserved by mode, fast-mode, submit, and
  other frontmatter updates.
- A requirement may link to at most one active Issue and one active Merge
  Request in its configured project.

## GitLab Issue

Create an Issue with:

- title `RQ-xxxx - <requirement title>`;
- configured draft label;
- a description containing the requirement ID, branch, execution mode,
  requirement file path, and an AI Factory ownership marker;
- no API tokens, local absolute paths, model configuration, or other secrets.

The ownership marker must allow a retry to find the Issue even if local Issue
metadata was not committed because an earlier operation stopped midway.

## Draft Merge Request

Create a Draft Merge Request with:

- source branch `factory/RQ-xxxx`;
- target branch from GitLab/requirement-branch configuration;
- title `Draft: RQ-xxxx - <requirement title>`;
- description linking the requirement and containing `Closes #<issue-iid>`;
- configured source-branch removal behavior;
- no automatic merge, merge-when-pipeline-succeeds, or equivalent setting.

Creating the Draft Merge Request must not approve or merge it. Removing Draft
status later must not merge it. Merge remains an explicit GitLab user action.

## Idempotency and Recovery

GitLab operations occur after the base reservation and branch push, so remote
API failure must not attempt destructive Git rollback.

- A retry must never create a duplicate Issue or Merge Request.
- Discover an existing Issue by stored IID first, then by the AI Factory
  ownership marker.
- Discover an existing Merge Request by stored IID first, then by the exact
  source project, source branch, target project, and target branch.
- Verify that recovered resources belong to the configured project and match
  the requirement before attaching them.
- Add an idempotent recovery command:

  ```bash
  pnpm factory -- requirement gitlab-sync RQ-xxxx
  ```

- If GitLab synchronization fails, report which local and remote resources
  were successfully created and print the recovery command.
- Re-running synchronization after success must update links/status without
  creating extra notes, Issues, MRs, or Git commits when nothing changed.

## Lifecycle Synchronization

Synchronize GitLab tracking without changing the existing execution semantics:

- Draft creation applies the configured draft label.
- `requirement submit` applies the ready label and adds an idempotent status
  note.
- Handoff/pipeline start applies the running label.
- A failed or needs-fix result applies the needs-fix label and records the Run
  ID plus quality-gate summary.
- A passed result applies the passed label and records the Run ID plus
  quality-gate summary.
- Status transitions remove superseded AI Factory lifecycle labels without
  removing unrelated user labels.
- Handoff submit still does not commit or push application work.
- Pipeline submit retains its existing requirement commit/push behavior.
- GitLab synchronization must not silently pull Issue edits into requirement
  Markdown or overwrite branch changes.

## CLI Output

Successful creation shall print at least:

```text
Requirement : RQ-xxxx
Branch      : factory/RQ-xxxx
Issue       : #42 <url>
Draft MR    : !15 <url>
Mode        : handoff
```

When GitLab integration is disabled, retain the current output and behavior.

## Implementation Boundaries

- Add a typed GitLab REST client rather than shelling out to `curl` or relying
  on a globally installed `glab` command.
- Keep the GitLab REST client behind the provider-neutral repository-platform
  interface so GitHub support does not require changes to requirement
  lifecycle orchestration.
- Centralize authentication, URL construction, response validation, timeouts,
  and safe API error handling.
- Encode project paths correctly when a path is used instead of a numeric
  project ID.
- Use the GitLab Issues, Issue Notes, and Merge Requests REST endpoints.
- Do not implement webhook ingestion, automatic Issue-to-requirement content
  replacement, automatic approval, or automatic merge in this requirement.
- Do not require GitLab integration for legacy projects or metadata-free
  requirements.

## Tests

Use mocked HTTP responses; automated tests must never create real GitLab
Issues, branches, Merge Requests, notes, or labels.

Cover at least:

- successful Issue and Draft Merge Request creation;
- branch-only metadata commits carrying `[skip ci]`;
- correct source and target branch selection;
- Issue/MR metadata parsing and preservation;
- omitted `--platform` automatically selecting the only complete provider;
- no complete provider preserving branch-only legacy behavior;
- multiple complete providers requiring an explicit selection;
- partial provider variables producing a safe missing-variable error;
- explicit `--platform gitlab` overriding auto-detection;
- rejection of missing, mismatched, or unsupported providers;
- lazy credential validation;
- self-managed GitLab base URL handling;
- duplicate-safe retry after Issue creation but before metadata commit;
- duplicate-safe retry after MR creation but before metadata commit;
- recovery from stored IIDs and ownership markers;
- rejection of a mismatched recovered Issue or MR;
- label transitions without removing unrelated labels;
- idempotent notes and no-op synchronization;
- redaction of tokens and authorization headers from errors/logs;
- confirmation that no merge API is invoked.

## Acceptance Criteria

- One `requirement new ... --platform gitlab` command creates the requirement
  reservation, requirement branch, linked GitLab Issue, and linked Draft Merge
  Request.
- A command without `--platform` automatically selects GitLab when and only
  when its complete required variable set is non-empty and it is the sole
  available provider.
- A command without any complete provider creates only the requirement
  reservation and branch and calls no platform API.
- Ambiguous or partial provider configuration fails safely before requirement
  reservation and identifies variable names without exposing their values.
- Requirement lifecycle code depends on a provider-neutral interface, with
  GitLab implemented as the first adapter.
- The requirement branch follows the existing `factory/RQ-xxxx` convention.
- The base branch continues to provide concurrency-safe RQ ID reservation.
- Issue and Merge Request IIDs/URLs are persisted on the requirement branch.
- The Draft Merge Request targets the configured base branch and links its
  Issue with a closing reference.
- Draft setup commits and pushes do not run the AI implementation pipeline.
- Partial failures are recoverable without deleting valid Git resources.
- Retrying creation or synchronization never duplicates GitLab resources.
- Submit and run state changes are visible on the linked Issue.
- Handoff and pipeline execution behavior remains backward compatible.
- AI Factory never approves or merges the Merge Request automatically.
- GitLab credentials and authorization data never appear in persisted output.
- Unit/integration tests use mocked GitLab HTTP interactions and all configured
  quality gates pass.
