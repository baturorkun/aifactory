---
id: RQ-0010
status: draft
executionMode: pipeline
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur.orkun@brado."
createdAt: "2026-08-12T13:56:32.121Z"
branch: "factory/RQ-0010"
createdFromCommit: "b5a3ed6fc1350137545a9436c200b06da37aa08e"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/3"
githubPullRequestIid: 3
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/2"
githubIssueIid: 2
repositoryProvider: github
---
# RQ-0010 - Codex CLI pipeline model provider

Add `codex-cli` as a first-class AI Factory model provider. It must behave like
the existing API-backed model adapters from the orchestrator's perspective:
Planner, Architect, Coder, Tester, Reviewer, Domain Guard, retries, structured
output validation, quality gates, requirement branch commits, and automatic
pushes remain owned by AI Factory.

The Codex CLI provider is an execution backend only. It must not create or
modify GitHub/GitLab Issues, requirement metadata, branches, Pull Requests, or
Merge Requests. Those lifecycle operations continue through AI Factory's
repository-platform adapters. Merge remains a manual developer action.

Codex CLI execution applies only to requirements using `executionMode:
pipeline` when `model.provider` resolves to `codex-cli`. Handoff requirements
must retain the existing handoff-package workflow and must not require Codex CLI
installation or authentication.

For GitLab Docker runners, Codex authentication is supplied by the runner mount
at `/home/gitlab-runner/.codex`, which contains `auth.json`. Generated CI must
set `CODEX_HOME` to this path and validate Codex availability/authentication only
immediately before a pipeline-mode Codex execution. API-backed providers must
continue to run without Codex CLI or its auth mount.

## Acceptance Criteria

- `factory.config.json` accepts `model.provider: codex-cli` with model name,
  optional reviewer model, executable, timeout, and optional reasoning effort.
- `CodexCliAdapter` implements the existing `ModelAdapter` contract by invoking
  `codex exec` non-interactively, ephemerally, without approvals, and in a
  read-only sandbox.
- AI Factory passes each agent's system/user prompts through stdin, maps an
  optional response schema to Codex CLI structured output, and returns the last
  model message through the normal `ModelResponse` path.
- Temporary schemas and response files are isolated per call and cleaned after
  success, failure, or timeout; secrets and `auth.json` contents are never
  logged or copied into run artifacts.
- A missing Codex executable, missing/unreadable
  `/home/gitlab-runner/.codex/auth.json`, authentication failure, timeout, or
  invalid/missing output produces a clear error without leaking credentials.
- Generated GitLab CI uses a configurable AI Factory runner image, exports
  `CODEX_HOME=/home/gitlab-runner/.codex`, and runs Codex preflight checks only
  for `pipeline` execution with `AI_PROVIDER=codex-cli`.
- Handoff-mode requirements skip Codex preflight and preserve the existing
  handoff workflow even when the configured provider is `codex-cli`.
- API-backed providers preserve their current behavior and do not require the
  Codex runner image or authentication mount.
- AI Factory still creates/links Issues, creates requirement branches and Draft
  PRs/MRs, commits generated changes, and pushes the requirement branch; no
  automatic merge is introduced.
- Unit tests cover config selection, CLI argument/schema mapping, success,
  timeout/error cleanup, reviewer selection, and conditional GitLab CI output.
- Documentation explains the custom runner image, the auth mount, provider
  selection, pipeline-only behavior, and manual merge boundary.
