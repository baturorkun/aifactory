# AI Factory

AI Factory is a requirement-driven agentic coding runner.

It is meant to live as a reusable core repository next to the projects it works on. The factory itself is written in TypeScript, but target projects can use any stack: Python, TypeScript, frontend, backend, or an empty project that you define later with requirements.

```text
agentic/
  aifactory/       # core factory repo
  myproject/       # target project generated or maintained by the factory
  another-app/     # another target project
```

## What It Does

AI Factory reads a requirement and optional constraints, then either:

- creates a handoff package for manual or local-assistant implementation without API usage,
- runs a mock pipeline for local flow testing,
- runs a real LLM-backed multi-agent pipeline and applies generated files to the target project.

The target project is controlled by `factory.config.json` in the target repo.

## Example Projects

These public example target projects show AI Factory in real usage:

- Vanilla TypeScript example: https://github.com/baturorkun/aifactory-example-vanilla-ts
- Python HTTP example: https://github.com/baturorkun/aifactory-example-python-http

## Recommended Workflow

The normal order is:

1. Install the core `aifactory` repo.
2. Create a target project with `factory new`.
3. Move into the target project directory.
4. Add requirements and constraints in the target project.
5. Run `handoff`, `run`, `status`, `logs`, and other factory commands from the target project.

```bash
cd agentic/aifactory
pnpm install
pnpm -r run typecheck

# Create a sibling target project.
pnpm factory new myproject --template python

# From this point on, work inside the target project.
cd ../myproject

# Add requirement files under requirements/ and constraints/.
pnpm factory handoff RQ-0001-example
pnpm factory run RQ-0001-example
pnpm factory status
```

Important: `factory new` is normally run from the core repo. Most other commands are normally run from the target project.

## Choose An Execution Mode

After a target project exists and a requirement is written, choose one of these modes from inside the target project:

| Mode | Command | Calls external LLM API? | Writes application code? | Purpose |
|---|---|---:|---:|---|
| Handoff | `pnpm factory handoff <req-id>` | No | No | Package the task for manual/local assistant implementation |
| Mock run | `pnpm factory run <req-id>` with no `.env`, or `--dry-run` | No | Mock artifacts only | Test the factory pipeline/config without API cost |
| API run | `pnpm factory run <req-id>` with `.env` provider settings | Yes | Yes, when the provider returns valid artifacts | Let the LLM-backed agents implement the requirement |
| Fast API run | `pnpm factory run <req-id> --fast` with `.env` provider settings | Yes, fewer calls | Yes | Lower-cost API implementation path |

Handoff is not a pipeline run. It creates `handoffs/<req-id>/handoff.md`, which combines the requirement, constraints, target project root, allowed paths, local check commands, and current file list. Use it when you do not want to spend API calls but still want a complete implementation brief.

If `.env` is missing, `run` falls back to the mock provider. Mock is useful for plumbing tests, but it does not implement the real feature.

## Core Concepts

### Requirement

A requirement is a markdown file:

```text
requirements/RQ-0001-python-http-hello-world.md
```

It describes what should be built.

### Constraints

A constraints file is optional JSON with the same ID:

```text
constraints/RQ-0001-python-http-hello-world.json
```

It describes boundaries such as target files, forbidden frameworks, stack expectations, or domain rules.

### Requirement ID

The requirement ID is the filename without extension:

```text
requirements/RQ-0001-python-http-hello-world.md
constraints/RQ-0001-python-http-hello-world.json
```

Run commands use this ID from inside the target project:

```bash
pnpm factory run RQ-0001-python-http-hello-world
pnpm factory handoff RQ-0001-python-http-hello-world
```

## Install Core Repo

From the `aifactory` repo:

```bash
pnpm install
pnpm -r run typecheck
pnpm factory --help
```

## Create A New Target Project

`--template` is required. AI Factory does not assume the target project language.

```bash
pnpm factory new myproject --template empty
pnpm factory new my-web-app --template vanilla-ts
pnpm factory new my-python-app --template python
```

By default, running this from inside `aifactory/` creates the target project one directory above it:

```text
agentic/
  aifactory/
  myproject/
```

Use `--dir` to choose another parent directory:

```bash
pnpm factory new myproject --template python --dir ../examples
```

If `--template` is missing, the command fails and lists valid choices.

```bash
pnpm factory new myproject
```

```text
Error: Missing --template. Choose one: empty, vanilla-ts, python
```

### Templates

#### `empty`

Creates only an AI Factory-ready target workspace:

```text
requirements/
constraints/
references/
handoffs/
runs/
templates/
.gitlab-ci.yml
factory.config.json
.env.example
.gitignore
package.json
```

Use this when the actual project stack will be created later by a requirement.

Every generated target project also includes a manual GitLab CI job in `.gitlab-ci.yml`. The job clones AI Factory from `https://github.com/baturorkun/aifactory.git`, then runs `pnpm factory run "$REQUIREMENT_ID"` when manually started on `master` or `main`.

Set `REQUIREMENT_ID` when starting the manual GitLab job, for example:

```text
RQ-0001-job-form
```

#### `vanilla-ts`

Creates an empty browser TypeScript project:

```text
public/index.html
src/main.ts
src/styles.css
tsconfig.json
tsconfig.build.json
```

Generated scripts include:

```bash
pnpm typecheck
pnpm build
```

#### `python`

Creates a minimal Python target project:

```text
pyproject.toml
src/main.py
src/__init__.py
tests/test_main.py
```

Generated scripts include:

```bash
pnpm typecheck
pnpm test
```

The Python template uses Python standard library commands by default.

## Target Project Config

Each target project has a `factory.config.json`.

New projects are generated with model settings that read from `.env` if it exists, and fall back to mock if it does not:

```json
{
  "model": {
    "provider": "${AI_PROVIDER:-mock}",
    "name": "${AI_MODEL:-mock}",
    "reviewerName": "${AI_REVIEWER_MODEL:-mock}",
    "baseUrl": "${AI_BASE_URL:-}",
    "apiKey": "${AI_API_KEY:-}"
  }
}
```

This means:

- no `.env`: runs use the mock provider,
- `.env` with Gemini/xAI/Ollama-compatible settings: runs use the configured provider.

Generated projects also define standard workspace paths:

```json
{
  "paths": {
    "requirements": "./requirements",
    "constraints": "./constraints",
    "references": "./references",
    "runs": "./runs",
    "handoffs": "./handoffs",
    "templates": "./templates"
  }
}
```

The same config also controls where files can be written:

```json
{
  "targetProject": {
    "root": ".",
    "applyArtifacts": true,
    "allowedPaths": ["src", "tests"],
    "commands": {
      "typeCheck": "pnpm typecheck",
      "test": "pnpm test"
    }
  }
}
```

`allowedPaths` is important. The factory will only apply generated artifacts inside those paths.

## Provider Setup

### Default: Mock

If `.env` does not exist, generated projects use mock automatically.

Mock is useful for checking that the pipeline and config work, but it does not produce real application code.

```bash
pnpm factory run RQ-0001-example
```

With no `.env`, this runs against mock.

### Gemini Example

Create `.env` in the target project:

```bash
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
AI_REVIEWER_MODEL=gemini-2.5-flash
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
AI_API_KEY=replace_me
```

Then run:

```bash
pnpm factory run RQ-0001-example
```

### xAI / Grok Example

Use the OpenAI-compatible provider:

```bash
AI_PROVIDER=openai-compat
AI_MODEL=grok-4-fast-reasoning
AI_REVIEWER_MODEL=grok-4-fast-reasoning
AI_BASE_URL=https://api.x.ai/v1
AI_API_KEY=replace_me
```

Model names depend on the provider account and current API availability.

### Ollama / Local OpenAI-Compatible Endpoint

For an OpenAI-compatible local endpoint:

```bash
AI_PROVIDER=openai-compat
AI_MODEL=your-local-model
AI_REVIEWER_MODEL=your-local-model
AI_BASE_URL=http://localhost:8080
AI_API_KEY=local
```

For native Ollama provider config, use `provider: ollama` in `factory.config.json`.

## Main Commands

Run these from the target project directory.

### Create a handoff package

```bash
pnpm factory handoff RQ-0001-example
```

This does not call an LLM and does not write application code. It creates:

```text
handoffs/RQ-0001-example/handoff.md
```

The handoff file is an implementation brief. It includes:

- the requirement markdown,
- matching constraints JSON,
- target project root,
- allowed paths,
- configured local check commands,
- current target file list.

Use this when API cost matters or when you want a human/local assistant to implement the requirement. Handoff does not modify `src/`, `tests/`, or other application files by itself.

### Run full pipeline

```bash
pnpm factory run RQ-0001-example
```

Uses the configured provider.

- If `.env` is missing, provider falls back to mock.
- If `.env` configures Gemini/xAI/etc., it calls that API.

### Run cost-controlled mode

```bash
pnpm factory run RQ-0001-example --fast
```

Fast mode skips some review agents and uses fewer LLM calls.

### Force mock mode

```bash
pnpm factory run RQ-0001-example --dry-run
```

`--dry-run` forces mock even if `.env` is configured.

### Run subset of tasks

```bash
pnpm factory run RQ-0001-example --tasks task-1,task-3
```

### Check status

```bash
pnpm factory status
pnpm factory status <run-id>
```

### View logs

```bash
pnpm factory logs <run-id>
```

### List artifacts

```bash
pnpm factory artifacts <run-id>
```

### Approve a passed run

```bash
pnpm factory approve <run-id>
```

## Pipeline Flow

Normal mode:

```text
Requirement
  -> Planner
  -> Architect
  -> Coder
  -> Tester
  -> Reviewer
  -> Domain Guard
  -> Quality Gates
```

Fast mode:

```text
Requirement
  -> Planner
  -> Architect
  -> Coder
  -> Quality Gates
```

Quality gates are local checks such as schema validation, typecheck, lint, tests, and security checks when configured.

## Directory Roles

In a target project:

```text
requirements/   # permanent product/task descriptions
constraints/    # permanent technical/domain boundaries
references/     # source material such as PDFs, standards, screenshots, and notes
handoffs/       # manual implementation packages, no API usage
runs/           # pipeline execution history and audit output
templates/      # optional target-local templates
src/            # target app source, depending on template
tests/          # target app tests, depending on template
```

`references/` is for source material that supports requirements. Put large inputs such as PDFs under a topic folder, then create concise markdown notes that requirements can cite.

`runs/` is for executed pipeline runs.

`handoffs/` is for prepared manual implementation packages.

## Example: Python HTTP Hello World

Create a Python project:

```bash
cd aifactory
pnpm factory new myproject --template python
cd ../myproject
```

Create requirement:

```text
requirements/RQ-0001-python-http-hello-world.md
```

Example requirement:

```markdown
# Python HTTP Hello World Server

Build a minimal Python HTTP server. When the server is started and a browser opens `/`, the page must display Hello World.

## Acceptance Criteria

- Use Python standard library only.
- Implement the server in src/main.py.
- Listen on localhost:8000 by default.
- GET / returns HTTP 200.
- Response body is exactly Hello World.
- Tests pass with the configured test command.
```

Create handoff without API:

```bash
pnpm factory handoff RQ-0001-python-http-hello-world
```

Run with API or mock fallback:

```bash
pnpm factory run RQ-0001-python-http-hello-world
```

## Development Commands For AI Factory

Run from the core repo:

```bash
pnpm install
pnpm -r run typecheck
pnpm factory --help
```

Create smoke projects:

```bash
pnpm factory new smoke-empty --template empty --dir /tmp --force
pnpm factory new smoke-web --template vanilla-ts --dir /tmp --force
pnpm factory new smoke-python --template python --dir /tmp --force
```

## Notes For Public Repos

Do not commit real `.env` files or API keys.

Commit `.env.example` only.

Generated `runs/` can become noisy and may contain model output. Keep it ignored unless you intentionally want to publish run artifacts.

## Current Package Names

Internal workspace packages use the `@aifactory/*` scope:

```text
@aifactory/contracts
@aifactory/quality-gates
@aifactory/agent-factory
```

The CLI command exposed by the target project is:

```bash
pnpm factory ...
```
