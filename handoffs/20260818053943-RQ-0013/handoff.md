# Manual Handoff

Run ID: `20260818053943-RQ-0013`

Use this handoff in the manual implementation flow when you want an external implementer to complete the requirement without running the AI Factory agent pipeline.

## Instruction for Implementer

Read the requirement and constraints below, inspect the target project, implement the change directly in the workspace, and run the configured local checks. Do not call the AI Factory LLM pipeline for this task.

## Target Project

- Root: /Users/batur/Documents/Projects/bytecraft/agentic/aifactory
- Allowed paths: src, app, components, lib, tests
- Typecheck: pnpm typecheck
- Lint: pnpm lint
- Test: pnpm test

## Existing Files

- .dockerignore
- .eslintrc.cjs
- .github/workflows/codex-runner-image.yml
- .gitignore
- .gitlab-ci.yml
- README.md
- constraints/RQ-0000-example.json
- docker/codex-runner.Dockerfile
- docs/AI-FACTORY-CLI.md
- factory.config.json
- infra/rag/compose.yaml
- infra/rag/init/001_pgvector.sql
- package.json
- packages/agent-factory/bin/factory.js
- packages/agent-factory/package.json
- packages/agent-factory/prompts/architect.md
- packages/agent-factory/prompts/coder.md
- packages/agent-factory/prompts/domain-guard.md
- packages/agent-factory/prompts/planner.md
- packages/agent-factory/prompts/reviewer.md
- packages/agent-factory/prompts/tester.md
- packages/agent-factory/src/cli.ts
- packages/agent-factory/src/config.ts
- packages/agent-factory/src/model/adapter.ts
- packages/agent-factory/src/model/codex-cli.test.ts
- packages/agent-factory/src/model/codex-cli.ts
- packages/agent-factory/src/model/gemini.test.ts
- packages/agent-factory/src/model/gemini.ts
- packages/agent-factory/src/model/index.test.ts
- packages/agent-factory/src/model/index.ts
- packages/agent-factory/src/model/mock.ts
- packages/agent-factory/src/model/ollama.ts
- packages/agent-factory/src/model/openai-compat.ts
- packages/agent-factory/src/model/response-schemas.test.ts
- packages/agent-factory/src/model/response-schemas.ts
- packages/agent-factory/src/orchestrator/checkpoint.test.ts
- packages/agent-factory/src/orchestrator/checkpoint.ts
- packages/agent-factory/src/orchestrator/direct.ts
- packages/agent-factory/src/orchestrator/failure-summary.test.ts
- packages/agent-factory/src/orchestrator/failure-summary.ts
- packages/agent-factory/src/orchestrator/handoff.test.ts
- packages/agent-factory/src/orchestrator/handoff.ts
- packages/agent-factory/src/orchestrator/manifest.test.ts
- packages/agent-factory/src/orchestrator/manifest.ts
- packages/agent-factory/src/orchestrator/pipeline.test.ts
- packages/agent-factory/src/orchestrator/pipeline.ts
- packages/agent-factory/src/orchestrator/runner.test.ts
- packages/agent-factory/src/orchestrator/runner.ts
- packages/agent-factory/src/project-context.test.ts
- packages/agent-factory/src/project-context.ts
- packages/agent-factory/src/project-guidelines.test.ts
- packages/agent-factory/src/project-guidelines.ts
- packages/agent-factory/src/prompts/builders.test.ts
- packages/agent-factory/src/prompts/builders.ts
- packages/agent-factory/src/prompts/registry.ts
- packages/agent-factory/src/rag/grounding-client.test.ts
- packages/agent-factory/src/rag/grounding-client.ts
- packages/agent-factory/src/rag/python-runner.test.ts
- packages/agent-factory/src/rag/python-runner.ts
- packages/agent-factory/src/rag/systemd.ts
- packages/agent-factory/src/repository-platform/github.test.ts
- packages/agent-factory/src/repository-platform/github.ts
- packages/agent-factory/src/repository-platform/gitlab.test.ts
- packages/agent-factory/src/repository-platform/gitlab.ts
- packages/agent-factory/src/repository-platform/resolve.test.ts
- packages/agent-factory/src/repository-platform/resolve.ts
- packages/agent-factory/src/repository-platform/types.ts
- packages/agent-factory/src/requirement-branches.test.ts
- packages/agent-factory/src/requirement-branches.ts
- packages/agent-factory/src/requirement-lifecycle.test.ts
- packages/agent-factory/src/requirement-lifecycle.ts
- packages/agent-factory/src/requirements/parser.test.ts
- packages/agent-factory/src/requirements/parser.ts
- packages/agent-factory/src/scaffold.test.ts
- packages/agent-factory/src/scaffold.ts
- packages/agent-factory/src/utils/json.test.ts
- packages/agent-factory/src/utils/json.ts
- packages/agent-factory/src/workspace/apply.ts
- packages/agent-factory/tsconfig.json
- packages/contracts/package.json
- packages/contracts/src/index.ts
- packages/contracts/tsconfig.json
- packages/quality-gates/package.json
- packages/quality-gates/src/index.ts
- packages/quality-gates/tsconfig.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- requirements/RQ-0000-example.md
- requirements/RQ-0001-rag-ingest-file-progress.md
- requirements/RQ-0002-rag-ingest-subdirectory.md
- requirements/RQ-0003-resilient-gemini-embedding-ingest.md
- requirements/RQ-0004-project-rag-grounding.md
- requirements/RQ-0005-project-guidelines.md
- requirements/RQ-0006-requirement-branch-automation.md
- requirements/RQ-0007-gitlab-issue-draft-merge-request-integration.md
- requirements/RQ-0008-librechat-rag-web-chat.md
- requirements/RQ-0009-github-issue-pull-request-integration.md
- requirements/RQ-0010-codex-cli-pipeline-model-provider.md
- requirements/RQ-0012-generate-project-root-safe-agent-lifecycle-guidance.md
- requirements/RQ-0013-add-first-class-simics-project-support.md
- rsync.sh
- services/rag-web/Dockerfile
- services/rag-web/nginx.conf
- services/rag-web/public/app.js
- services/rag-web/public/index.html
- services/rag-web/public/styles.css
- services/rag/Dockerfile
- services/rag/README.md
- services/rag/pyproject.toml
- services/rag/src/aifactory_rag/__init__.py
- services/rag/src/aifactory_rag/__main__.py
- services/rag/src/aifactory_rag/__pycache__/__init__.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/api.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/config.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/db.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/embeddings.cpython-313.pyc
- services/rag/src/aifactory_rag/api.py
- services/rag/src/aifactory_rag/auth/__pycache__/entra.cpython-313.pyc
- services/rag/src/aifactory_rag/auth/entra.py
- services/rag/src/aifactory_rag/cli.py
- services/rag/src/aifactory_rag/config.py
- services/rag/src/aifactory_rag/db.py
- services/rag/src/aifactory_rag/embeddings.py
- services/rag/src/aifactory_rag/ingest/__pycache__/chunker.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/parsers.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/pipeline.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/sources.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/chunker.py
- services/rag/src/aifactory_rag/ingest/parsers.py
- services/rag/src/aifactory_rag/ingest/pipeline.py
- services/rag/src/aifactory_rag/ingest/sources.py
- services/rag/src/aifactory_rag/migrations/001_init.sql
- services/rag/src/aifactory_rag/migrations/002_flexible_embedding_vector.sql
- services/rag/src/aifactory_rag/query/__pycache__/responder.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/retriever.cpython-313.pyc
- services/rag/src/aifactory_rag/query/responder.py
- services/rag/src/aifactory_rag/query/retriever.py
- services/rag/tests/__pycache__/test_code_ingest.cpython-313.pyc
- services/rag/tests/__pycache__/test_config_loading.cpython-313.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313.pyc
- services/rag/tests/__pycache__/test_source_filter.cpython-313.pyc
- services/rag/tests/test_code_ingest.py
- services/rag/tests/test_config_loading.py
- services/rag/tests/test_document_download.py
- services/rag/tests/test_page_citations.py
- services/rag/tests/test_resilient_embeddings.py
- services/rag/tests/test_source_filter.py
- templates/feature/component.ts.hbs
- templates/service/service.ts.hbs
- tsconfig.base.json
- tsconfig.json

## Requirement

---
id: RQ-0013
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur.orkun@brado."
createdAt: "2026-08-18T05:34:10.592Z"
branch: "factory/RQ-0013"
createdFromCommit: "d5c066df2ff15125c92b4927fc32b649c9d0fd66"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/7"
githubPullRequestIid: 7
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/6"
githubIssueIid: 6
repositoryProvider: github
---
# RQ-0013 - Add first-class Simics project support

Add a focused Simics project profile to AI Factory so a target repository can
develop Wind River/Intel Simics board and device models without inheriting the
current TypeScript and Jest assumptions.

The first version is an enablement MVP rather than a complete board generator.
It must scaffold a Simics-oriented target repository, understand the relevant
source formats, provide stack-aware agent guidance, and delegate authoritative
build and simulator validation to commands configured by the target project.
Simics itself, proprietary packages, firmware images, and license material must
remain external to AI Factory and must not be copied into generated projects or
CI artifacts.

The intended development workflow is hybrid: model sources may be authored on
a workstation without Simics, while configured quality gates execute on a
licensed local or self-hosted CI runner. Interactive GUI debugging remains an
external developer activity. AI Factory must support non-interactive,
exit-code-driven validation without claiming that static generation alone
proves behavioral fidelity of a digital twin.

## Scope

- Add a `simics` option to `factory new` alongside the existing templates.
- Generate a minimal, documented directory layout for DML models, Simics
  scripts/targets, Python helpers, tests, references, and project-owned wrapper
  scripts.
- Make pipeline prompts language- and stack-aware so a Simics target can use
  DML, `.simics`, Python, C/C++, and extensionless build files without being
  instructed to use TypeScript, npm, or Jest.
- Include Simics source and configuration formats in project indexing and
  review context collection.
- Allow target-owned commands to perform model build, static checks, and
  batch-mode simulator tests on a licensed runner, with a configurable timeout.
- Provide Simics-specific generated guidance covering authoritative
  documentation, deterministic tests, secrets/licenses, generated build
  outputs, and platform/version compatibility.
- Cover the new template and generalized behavior with tests that do not
  require a Simics installation or license in the AI Factory development
  environment.

## Out of Scope

- Installing, downloading, redistributing, or licensing Simics.
- Bundling proprietary Simics packages, documentation, board support packages,
  firmware, checkpoints, or license credentials.
- Implementing a particular board, processor, or peripheral model.
- Requiring Simics for AI Factory's own unit-test suite.
- Automating interactive Simics GUI or remote-desktop workflows.

## Acceptance Criteria

- `factory new <name> --template simics` creates an AI Factory-ready target
  project and reports `simics` in template discovery, validation errors, help,
  documentation, and scaffold tests.
- The generated project has a minimal documented structure for DML/device
  models, target or platform scripts, Python helpers, automated tests,
  references, and project-owned build/test wrappers; placeholder content does
  not depend on proprietary APIs or files.
- The generated `factory.config.json` restricts artifact writes to explicit
  Simics project paths and configures target-owned validation commands without
  embedding workstation-specific Simics installation paths.
- Planner, architect, coder, tester, reviewer, and domain-guard instructions
  receive the target stack/profile and do not impose TypeScript, npm, Jest, or
  web-application conventions on Simics work.
- Existing `empty`, `python`, and `vanilla-ts` projects retain their current
  behavior, and any prompt generalization remains backward compatible.
- Project indexing and supporting review context recognize at least `.dml`,
  `.simics`, `.py`, `.c`, `.cc`, `.cpp`, `.h`, `.hpp`, `.json`, `.yaml`,
  `.yml`, and explicitly allowed extensionless files such as `Makefile`.
- DML and Simics files can be created and updated through the structured
  pipeline without being rejected, omitted from relevant context, or relabeled
  as TypeScript test artifacts.
- Target validation commands can represent model build/static validation and
  non-interactive simulator tests, and their timeout is configurable for jobs
  that legitimately take longer than the current fixed 120 seconds.
- A configured simulator test is judged by its process exit code and captured
  diagnostics; when no Simics executable or licensed runner is configured, the
  generated project documents the limitation and does not report simulated
  behavior as verified.
- Generated guidance states that Simics installation paths, license values,
  proprietary documents, firmware, packages, build outputs, and checkpoints
  must not be hardcoded or unintentionally committed or uploaded as run/CI
  artifacts.
- RAG guidance documents how to index authorized Simics documentation and
  example sources using the already supported `.dml` and `.simics` formats,
  while keeping RAG optional for project creation and local unit tests.
- Automated tests cover template creation, allowed paths, file discovery,
  prompt selection, validation command execution, timeout handling, and absence
  of any dependency on an installed Simics product.
- AI Factory's configured typecheck, lint, and test suites pass.


## Constraints

```json
{}
```
