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
| `factory requirement new <title> --mode handoff [--platform gitlab]` | Reserve a `[skip ci]` draft, create its branch, and create linked GitLab resources when configured |
| `factory requirement gitlab-sync <req-id>` | Create or recover the linked GitLab Issue and Draft Merge Request |
| `factory requirement cancel <req-id> [--reason <text>]` | Mark the base-branch record cancelled, close its GitLab MR, and delete its requirement branch |
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
    "provider": "ollama",        // "ollama" | "openai-compat" | "mock"
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
    "allowedPaths": ["src", "app", "components", "lib", "tests", "tsconfig.json", "tsconfig.build.json", "package.json", "vite.config.ts"],
    "commands": {
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
```

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
