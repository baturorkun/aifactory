# AI Factory — CLI Reference

API-less, requirement-driven, multi-agent code generation.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Write a requirement
# → requirements/RQ-0001.md

# 3. (Optional) Add constraints
# → constraints/RQ-0001.json

# 4. Run the pipeline (dry-run uses mock model — no LLM needed)
pnpm factory -- run RQ-0001 --dry-run

# 5. Check status
pnpm factory -- status

# 6. See what was produced
pnpm factory -- artifacts <run-id>

# 7. Approve when satisfied
pnpm factory -- approve <run-id>
```

---

## Commands

| Command | Description |
|---|---|
| `factory run <req-id>` | Start pipeline for a requirement |
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
    "allowedPaths": ["src", "app", "components", "lib", "tests"],
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
# My Feature Title

Short description of what needs to be built.

## Acceptance Criteria

- Criterion one (testable, specific)
- Criterion two

## Non-Functional Requirements

- Performance: response < 100ms
- Language: TypeScript strict mode
```

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
