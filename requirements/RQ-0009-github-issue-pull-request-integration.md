---
id: RQ-0009
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur.orkun@brado."
createdAt: "2026-08-05T22:38:30.000Z"
branch: "factory/RQ-0009"
---

# RQ-0009 - GitHub Issue and Draft Pull Request Integration

Extend the repository platform subsystem in AI Factory to support GitHub as a first-class platform adapter (`github`). Creating a requirement via `factory requirement new` shall reserve the requirement, create its branch, open a linked GitHub Issue, and create a linked Draft Pull Request on GitHub.

## Objective

Running the requirement creation command with explicit platform selection:

```bash
pnpm factory -- requirement new "Feature title" --mode handoff --platform github
```

or with GitHub as the sole fully configured repository provider having environment variables set:

```bash
pnpm factory -- requirement new "Feature title" --mode handoff
```

shall perform and link all of the following:

- Reserve the next `RQ-xxxx` requirement identifier;
- Create the git branch `factory/RQ-xxxx` locally and push to remote `origin`;
- Create one GitHub Issue with title, description, and initial lifecycle labels;
- Create one Draft Pull Request from `factory/RQ-xxxx` to the configured base branch (`main`);
- Record the created Issue URL, Pull Request URL, and GitHub metadata in the requirement document frontmatter.

The requirement Markdown file remains the authoritative, version-controlled specification. GitHub Issues and Pull Requests provide lifecycle visibility, code review, and issue tracking.

## Configuration

Extend `factory.config.json` and config schemas to accept `"github"` under `repositoryPlatforms`:

```json
{
  "repositoryPlatforms": {
    "github": {
      "baseUrl": "${GITHUB_API_URL:-https://api.github.com}",
      "repository": "${GITHUB_REPOSITORY}",
      "token": "${GITHUB_TOKEN}",
      "targetBranch": "main",
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

### Configuration Rules:

- `--platform github` explicitly selects the GitHub adapter.
- Without `--platform`, presence of complete non-empty GitHub environment variables (`GITHUB_TOKEN` and `GITHUB_REPOSITORY`) automatically selects GitHub.
- If both GitLab and GitHub configurations are fully complete and `--platform` is omitted, fail before reserving a requirement and demand `--platform <name>` to resolve ambiguity.
- If required GitHub variables (`GITHUB_TOKEN`, `GITHUB_REPOSITORY`) are missing when GitHub is requested, fail with a clear message listing the missing environment variables without exposing sensitive values.
- `baseUrl` defaults to `https://api.github.com` if not specified.
- `targetBranch` defaults to `requirementBranches.baseBranch` (`main`).
- Secret tokens (`GITHUB_TOKEN`) MUST come from environment expansion and MUST NEVER be written to requirement files, manifests, logs, handoff packages, or error outputs.

## Provider Architecture

Implement `GitHubRepositoryPlatform` implementing the unified `RepositoryPlatformAdapter` interface:

1. **`createWorkItem(title, body, labels)`**:
   - Sends REST API call `POST /repos/{owner}/{repo}/issues`.
   - Returns normalized ID, number, URL, state, and labels.
2. **`createDraftChangeRequest(title, body, sourceBranch, targetBranch, issueNumber)`**:
   - Sends REST API call `POST /repos/{owner}/{repo}/pulls` with `"draft": true`.
   - Links the created Issue in the PR body (`Closes #<issueNumber>`).
   - Returns normalized PR ID, number, URL, draft status, source and target branches.
3. **`updateWorkItemLabels(issueNumber, addLabels, removeLabels)`**:
   - Idempotently syncs lifecycle labels (`factory::draft`, `factory::running`, `factory::passed`, `factory::needs-fix`).
4. **`addWorkItemComment(issueNumber, comment)`**:
   - Posts status update comments on the linked GitHub Issue (`POST /repos/{owner}/{repo}/issues/{issue_number}/comments`).

## Acceptance Criteria

- `requirement new --platform github` creates and links one GitHub Issue and one Draft Pull Request, then records their identifiers and URLs in requirement frontmatter.
- Complete GitHub credentials are auto-detected, incomplete credentials fail without exposing token values, and simultaneous complete GitHub and GitLab configurations require explicit platform selection.
- GitHub lifecycle labels and status comments are synchronized idempotently during requirement creation and submission.
- Requirement submission and cancellation synchronize the linked GitHub Pull Request lifecycle just as they do for GitLab Merge Requests.
- New project scaffolds include GitHub repository-platform configuration and environment-variable examples alongside GitLab configuration.
- CLI help, success output, and user documentation describe GitHub and GitLab platform workflows consistently.
- GitHub adapter, platform resolution, lifecycle integration, and scaffold behavior are covered by automated tests and all configured quality gates pass.

## Verification Plan

### Automated Tests
- Unit tests in `packages/agent-factory/src/repository-platform/github.test.ts` covering GitHub REST API calls (Issue creation, Draft PR creation, Label updates, Comments) using nock/msw or mocked fetch.
- Resolution tests in `packages/agent-factory/src/repository-platform/resolve.test.ts` verifying `--platform github` and auto-detection via `GITHUB_TOKEN` and `GITHUB_REPOSITORY`.

### Manual Verification
- Execute `pnpm factory -- requirement new "Test GitHub Integration" --mode handoff --platform github` against a GitHub test repository and verify Issue and Draft PR are created on GitHub.
