# AI Factory — CLI Reference

API-less, requirement-driven, multi-agent code generation.

Run commands from the `aifactory` directory. A bare selector such as
`--project arinc661-studio` targets the sibling directory
`../arinc661-studio`; explicit relative or absolute paths are also supported.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Reserve a draft requirement and switch to its branch
pnpm factory -- --project ../myproject requirement new "My feature" --mode handoff

# 3. Complete the generated requirement, then submit it
pnpm factory -- --project ../myproject requirement submit RQ-0001

# 4. (Optional) Add constraints
# → constraints/RQ-0001.json

# 5. Run the pipeline directly (dry-run uses mock model — no LLM needed)
pnpm factory -- --project ../myproject run RQ-0001 --dry-run

# 6. Check status
pnpm factory -- --project ../myproject status

# 7. See what was produced
pnpm factory -- --project ../myproject artifacts <run-id>

# 8. Approve when satisfied
pnpm factory -- --project ../myproject approve <run-id>
```

---

## Commands

| Command | Description |
|---|---|
| `factory requirement new <title> --mode handoff [--platform github\|gitlab\|none]` | Reserve a `[skip ci]` draft, create its branch, and create linked GitHub or GitLab resources when configured |
| `factory requirement platform-sync <req-id> [--platform github\|gitlab]` | Create or recover the linked Issue and Draft Pull/Merge Request (`gitlab-sync` remains an alias) |
| `factory requirement cancel <req-id> [--reason <text>] [--platform github\|gitlab\|none]` | Mark the base-branch record cancelled, close its Pull/Merge Request, and delete its requirement branch |
| `factory requirement complete <req-id> --run <run-id> [--by <name>] [--platform github\|gitlab]` | Validate an approved run and repository gates, record completion, merge with a SHA guard, then label and close the Issue |
| `factory requirement mode <req-id> <handoff\|pipeline>` | Change execution mode locally |
| `factory requirement submit <req-id>` | Validate and submit through the configured mode |
| `factory requirement decision <req-id>` | Print the CI execution decision |
| `factory run <req-id>` | Start pipeline for a requirement |
| `factory handoff <req-id>` | Create a uniquely versioned handoff package and queued run |
| `factory handoff-begin <run-id>` | Mark handoff implementation as running |
| `factory handoff-finish <run-id>` | Capture changes, run gates, and finalize a handoff run |
| `factory handoff-finish <run-id> --skip-gates` | Finalize a handoff run without executing gates |
| `factory run <req-id> --dry-run` | Run with mock model (no LLM) |
| `factory run <req-id> --skip-gates` | Skip quality gates |
| `factory run <req-id> --tasks task-1,task-2` | Run only specific tasks |
| `factory resume-requirement <req-id> --push` | Resume a needs-fix requirement from its automatic checkpoint branch |
| `factory sync-requirement <req-id> --fresh --push` | Discard a stale checkpoint and restart from Planner while preserving project-level path security |
| `factory model-provider` | Print the configured model provider (used by CI preflight) |
| `factory status` | List recent runs |
| `factory status <run-id>` | Show details of a run |
| `factory artifacts <run-id>` | List generated files |
| `factory logs <run-id>` | Show per-agent logs |
| `factory approve <run-id>` | Approve a passed run |
| `factory init` | Create default `factory.config.json` |

---

## Configuration — `factory.config.json`

```json
{
  "model": {
    "provider": "ollama",        // "ollama" | "openai-compat" | "gemini" | "codex-cli" | "mock"
    "name": "codellama",         // primary model
    "reviewerName": "llama3",    // reviewer model (optional, falls back to name)
    "baseUrl": "http://localhost:11434",
    "timeoutMs": 180000,
    "temperature": 0.2
  },
  "pipeline": {
    "maxRetries": 3,             // retries per agent on transient failure
    "maxFixIterations": 3        // max code/review cycles per task
  },
  "paths": {
    "requirements": "./requirements",
    "constraints": "./constraints",
    "references": "./references",
    "runs": "./runs",
    "prompts": "./packages/agent-factory/prompts"
  },
  "targetProject": {
    "root": "../my-app",         // target repo/app root (optional)
    "applyArtifacts": false,     // true writes generated files into targetProject.root
    "profile": "generic",       // e.g. vanilla-typescript, python, or simics
    "allowedPaths": ["src", "app", "components", "lib", "tests", "tsconfig.json", "tsconfig.build.json", "package.json", "vite.config.ts"],
    "commandTimeoutMs": 120000,
    "commands": {
      "build": "pnpm build",
      "typeCheck": "pnpm typecheck",
      "lint": "pnpm lint",
      "test": "pnpm test"
    }
  },
  "domain": {
    "rules": []                  // custom domain rules for Domain Guard agent
  }
}
```

By default the factory runs in artifact-only mode: generated files are written under
`runs/<run-id>/artifacts`.

To turn it into an agentic coding runner for a real project, set `targetProject.root`
and `targetProject.applyArtifacts: true`. Generated files are still copied into the
run directory for auditability, then written into the target project only if their
paths stay inside `targetProject.allowedPaths`. `--dry-run` never writes to the
target project.

### Switching to Ollama

```bash
ollama pull codellama
ollama pull llama3
ollama serve
```

Then in `factory.config.json`:
```json
{ "model": { "provider": "ollama", "name": "codellama", "reviewerName": "llama3" } }
```

### Switching to OpenAI-compat (LM Studio / vLLM)

```json
{ "model": { "provider": "openai-compat", "name": "your-model", "baseUrl": "http://localhost:8080" } }
```

### Switching to Codex CLI in CI pipelines

```json
{
  "model": {
    "provider": "codex-cli",
    "name": "gpt-5.6-sol",
    "reviewerName": "gpt-5.6-sol",
    "executable": "codex",
    "reasoningEffort": "medium"
  }
}
```

Use a runner image containing Codex CLI. The repository provides
`docker/codex-runner.Dockerfile`, and its `.gitlab-ci.yml` builds and pushes
commit and branch-tagged images on every change. Default-branch builds also
publish `$CI_REGISTRY_IMAGE/codex-runner:latest`.

Generated jobs first look for `CODEX_AUTH_JSON_FILE`, a GitLab CI/CD **File**
variable containing the complete `auth.json`. When present, it is copied with
mode 600 into a job-local `CODEX_HOME`. Otherwise the job uses the runner host
mount at `CODEX_HOME` (default `/home/gitlab-runner/.codex`). The mount can
persist token refreshes; the File variable must be updated when its cached login
becomes invalid. Authentication is validated only for `pipeline` requirements
using the `codex-cli` provider. Handoff mode and API providers keep their
existing behavior. AI Factory, not Codex CLI, owns Issue, branch, Draft PR/MR,
commit, and push operations; merge remains manual.

Generated target projects also include `.github/workflows/ai-factory.yml`.
It runs on `factory/RQ-*` requirement pushes and supports both API-backed model
providers and `codex-cli`. Configure model selection as GitHub Actions repository
variables (`AI_PROVIDER`, `AI_MODEL`, `AI_REVIEWER_MODEL`, and optionally
`AI_BASE_URL`). The job runs in the versioned Codex runner image published to
GHCR by `.github/workflows/codex-runner-image.yml`; override it with the
`AIFACTORY_RUNNER_IMAGE` repository variable when using another registry. The
default GHCR package must be public so GitHub can pull it before starting the
job. Store `AI_API_KEY` as a repository secret for API-backed
providers. For `codex-cli`, store either `CODEX_AUTH_JSON` (the complete Codex
`auth.json`) or `OPENAI_API_KEY` as a repository secret. The workflow uses the
job-scoped `GITHUB_TOKEN` for Issue, Draft Pull Request, checkpoint, commit, and
push operations, and uploads only run diagnostics plus the active requirement.

---

## Requirement Format — `requirements/<id>.md`

```markdown
---
id: RQ-0001
status: draft # draft, ready, completed, or cancelled
executionMode: handoff
pipelineFast: false
createdByName: "Developer"
createdByEmail: "developer@example.com"
createdAt: "2026-07-28T10:00:00.000Z"
branch: "factory/RQ-0001"
createdFromCommit: "abc123"
---
# RQ-0001 - My Feature Title

Short description of what needs to be built.

## Acceptance Criteria

- Criterion one (testable, specific)
- Criterion two

## Non-Functional Requirements

- Performance: response < 100ms
- Language: TypeScript strict mode
```

Metadata-free legacy requirements remain supported. Explicit lifecycle
requirements must be `ready`; `run` accepts pipeline mode and `handoff` accepts
handoff mode.

An approved implementation is finalized with `requirement complete`. The run
manifest must be committed on the requirement branch and have `status:
approved`. Required CI and approvals must pass. If the completion metadata
commit starts a new CI run, the command reports the pending state and can be
rerun unchanged; comments, labels, closure, and an already completed merge are
reconciled idempotently.

---

## Constraints Format — `constraints/<id>.json`

Optional. Passed to every agent as additional context.

```json
{
  "targetPackage": "src/widgets",
  "language": "typescript",
  "forbidden": ["lodash", "moment"]
}
```

---

## Pipeline Flow

```
requirement.md
    │
    ▼
┌─────────┐     ┌───────────┐
│ Planner │────▶│ Task list │
└─────────┘     └─────┬─────┘
                      │  (per task)
              ┌───────▼────────┐
              │   Architect    │
              └───────┬────────┘
                      │
              ┌───────▼────────┐     ┌──────────┐
              │     Coder      │◀────│ Fix loop │
              └───────┬────────┘     │  (max 3) │
                      │              └──────────┘
              ┌───────▼────────┐           ▲
              │    Tester      │           │ needs-fix
              └───────┬────────┘           │
                      │                    │
              ┌───────▼────────┐           │
              │   Reviewer     │───────────┘
              └───────┬────────┘
                      │ approved
              ┌───────▼────────┐
              │  Domain Guard  │
              └───────┬────────┘
                      │ passed
              ┌───────▼────────┐
              │ Quality Gates  │
              │ schema/type/   │
              │ lint/test/sec  │
              └───────┬────────┘
                      │
                   passed ──▶ pnpm factory -- approve <run-id>
                                      │ approved
                                      ▼
                         pnpm factory -- requirement complete
                                      │ completed + merged
                                      ▼
                            Issue passed + closed
```

Requirement-branch synchronization checkpoints every reviewed task iteration and
failed quality-gate repair state to the custom Git ref
`refs/aifactory/checkpoints/<RQ-ID>`. Because it is neither a branch nor a tag,
checkpoint updates do not create GitHub Actions runs or GitLab pipelines. A retry of `sync-requirement` automatically restores
that checkpoint, reuses the saved plan and architecture, skips passed tasks, and
continues with the last reviewer/domain-guard findings. Use
`resume-requirement <RQ-ID> --push` to require a checkpoint explicitly. A changed
requirement hash, source commit, or fast/full mode invalidates the checkpoint.
Use `sync-requirement <RQ-ID> --fresh --push` when an invalidated checkpoint must
be discarded intentionally. Generated CI jobs accept `AIFACTORY_FRESH=true` and
forward the same option for a one-time clean retry.

Legacy `factory-checkpoint/*` branches remain readable during migration. Generated
GitLab pipelines also reject those legacy branches at the workflow level as defense
in depth.

Planner task target files are advisory scope hints. Coder and Tester may use a
different path when the real project structure requires it, but every artifact
must still pass the hard `targetProject.allowedPaths` boundary. Planner and
Architect prompts include a bounded index of real files under that boundary so
they can prefer existing modules instead of inventing paths.

When a run ends in `needs-fix`, the CLI prints the structured findings in the job
log and writes `failure-summary.json` under the run directory. The requirement MR
branch remains clean until all tasks and quality gates pass; the checkpoint branch
is deleted after the successful synchronized commit.

---

## Run Directory Structure

```
runs/
  <run-id>/
    manifest.json       ← full run record (status, steps, artifacts, gates)
    requirement.md      ← copy of input
    constraints.json    ← copy of constraints (if any)
    steps/              ← per-agent output JSON files
    artifacts/          ← generated source + test files, also used as audit copy
    gates/
      report.json       ← gate results
      security-report.json
```

---

## Domain Rules

Add custom rules to `factory.config.json` to enforce domain-specific constraints:

```json
{
  "domain": {
    "rules": [
      {
        "id": "no-direct-db-in-feature",
        "description": "Feature modules must not import database adapters directly",
        "forbidden": ["pg", "mysql2", "mongodb"]
      }
    ]
  }
}
```

---

## Adding a New Agent

1. Add the role to `AgentRoleSchema` in `packages/contracts/src/index.ts`
2. Add output schema in the same file
3. Create `packages/agent-factory/prompts/<role>.md`
4. Add a prompt builder in `packages/agent-factory/src/prompts/builders.ts`
5. Call it in `packages/agent-factory/src/orchestrator/pipeline.ts`
