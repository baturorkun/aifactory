# Manual Handoff

Run ID: `20260923074159-RQ-0020`

Use this handoff in the manual implementation flow when you want an external implementer to complete the requirement without running the AI Factory agent pipeline.

## Instruction for Implementer

Read the requirement and constraints below, inspect the target project, implement the change directly in the workspace, and run the configured local checks. Do not call the AI Factory LLM pipeline for this task.

## Target Project

- Root: /Users/batur/Documents/Projects/bytecraft/agentic/aifactory
- Profile: (not configured)
- Usual paths: src, app, components, lib, tests (where the requirement work normally belongs; a handoff capture is not restricted to them)
- Build: (not configured)
- Typecheck: pnpm typecheck
- Lint: pnpm lint
- Test: pnpm test
- Command timeout: 120000 ms

## Existing Files

- .cache/fastembed/.locks/models--qdrant--bge-small-en-v1.5-onnx-q/0d7726d0cdccb62ee17c03bd1595cff07199b8f8.lock
- .cache/fastembed/.locks/models--qdrant--bge-small-en-v1.5-onnx-q/51f1bd0addd6e859e42c2c8021a5e5461385bb676a649f4b269aa445449f2431.lock
- .cache/fastembed/.locks/models--qdrant--bge-small-en-v1.5-onnx-q/688882a79f44442ddc1f60d70334a7ff5df0fb47.lock
- .cache/fastembed/.locks/models--qdrant--bge-small-en-v1.5-onnx-q/75305659f7795d4549f0e23688b52fa20a32f925.lock
- .cache/fastembed/.locks/models--qdrant--bge-small-en-v1.5-onnx-q/9bbecc17cabbcbd3112c14d6982b51403b264bfa.lock
- .cache/fastembed/models--qdrant--bge-small-en-v1.5-onnx-q/blobs/0d7726d0cdccb62ee17c03bd1595cff07199b8f8
- .cache/fastembed/models--qdrant--bge-small-en-v1.5-onnx-q/blobs/51f1bd0addd6e859e42c2c8021a5e5461385bb676a649f4b269aa445449f2431
- .cache/fastembed/models--qdrant--bge-small-en-v1.5-onnx-q/blobs/688882a79f44442ddc1f60d70334a7ff5df0fb47
- .cache/fastembed/models--qdrant--bge-small-en-v1.5-onnx-q/blobs/75305659f7795d4549f0e23688b52fa20a32f925
- .cache/fastembed/models--qdrant--bge-small-en-v1.5-onnx-q/blobs/9bbecc17cabbcbd3112c14d6982b51403b264bfa
- .cache/fastembed/models--qdrant--bge-small-en-v1.5-onnx-q/files_metadata.json
- .cache/fastembed/models--qdrant--bge-small-en-v1.5-onnx-q/refs/main
- .dockerignore
- .eslintrc.cjs
- .github/workflows/codex-runner-image.yml
- .gitignore
- .gitlab-ci.yml
- AGENTS.md
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
- packages/agent-factory/src/env-check.test.ts
- packages/agent-factory/src/env-check.ts
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
- packages/agent-factory/src/orchestrator/probe.test.ts
- packages/agent-factory/src/orchestrator/probe.ts
- packages/agent-factory/src/orchestrator/runner.test.ts
- packages/agent-factory/src/orchestrator/runner.ts
- packages/agent-factory/src/project-context.test.ts
- packages/agent-factory/src/project-context.ts
- packages/agent-factory/src/project-guidelines.test.ts
- packages/agent-factory/src/project-guidelines.ts
- packages/agent-factory/src/prompts/builders.test.ts
- packages/agent-factory/src/prompts/builders.ts
- packages/agent-factory/src/prompts/registry.ts
- packages/agent-factory/src/quality-gates-integration.test.ts
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
- packages/agent-factory/src/simics-transport.test.ts
- packages/agent-factory/src/utils/json.test.ts
- packages/agent-factory/src/utils/json.ts
- packages/agent-factory/src/workspace/apply.ts
- packages/agent-factory/templates/renode/peripherals/README.md
- packages/agent-factory/templates/renode/platforms/board.repl
- packages/agent-factory/templates/renode/scripts/board/capture-serial.mjs
- packages/agent-factory/templates/renode/scripts/build-model.mjs
- packages/agent-factory/templates/renode/scripts/build-probe.mjs
- packages/agent-factory/templates/renode/scripts/renode-run.mjs
- packages/agent-factory/templates/renode/scripts/run-probe.resc
- packages/agent-factory/templates/simics/scripts/board/capture-serial.mjs
- packages/agent-factory/templates/simics/scripts/sync-run.mjs
- packages/agent-factory/templates/simics/scripts/windows/Build-Modules.ps1
- packages/agent-factory/templates/simics/scripts/windows/Build-Probe.ps1
- packages/agent-factory/templates/simics/scripts/windows/Run-Probe.ps1
- packages/agent-factory/templates/simics/scripts/windows/SimicsTools.ps1
- packages/agent-factory/templates/simics/targets/probe-run/README.md
- packages/agent-factory/tsconfig.json
- packages/contracts/package.json
- packages/contracts/src/index.ts
- packages/contracts/src/probe-trace.ts
- packages/contracts/tsconfig.json
- packages/quality-gates/package.json
- packages/quality-gates/src/index.ts
- packages/quality-gates/src/probe.ts
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
- requirements/RQ-0014-add-atomic-requirement-completion-and-merge-lifecycle.md
- requirements/RQ-0015-add-hardware-twin-workflow-with-probe-firmware-board-trace-and-parity-gate-for-simics-projects.md
- requirements/RQ-0016-generate-the-hardware-twin-runner-scripts-and-board-verified-model-rules-in-the-simics-scaffold.md
- requirements/RQ-0017-read-the-requirement-kind-and-execution-mode-defaults-from-the-project-config-and-seed-simics-drafts-by-profile.md
- requirements/RQ-0018-extend-the-probe-trace-contract-with-actions-and-observations-so-parity-proves-behaviour-not-only-reset-state.md
- requirements/RQ-0019-neutralize-simulator-parameter-names-and-add-a-renode-simulator-template.md
- requirements/RQ-0020-add-a-factory-env-check-command-that-reports-which-env-values-are-set-or-empty-grouped-by-purpose.md
- rsync.sh
- services/rag-web/Dockerfile
- services/rag-web/nginx.conf
- services/rag-web/public/app.js
- services/rag-web/public/index.html
- services/rag-web/public/styles.css
- services/rag/.pytest_cache/.gitignore
- services/rag/.pytest_cache/CACHEDIR.TAG
- services/rag/.pytest_cache/README.md
- services/rag/.pytest_cache/v/cache/nodeids
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
- services/rag/tests/__pycache__/test_code_ingest.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_code_ingest.cpython-313.pyc
- services/rag/tests/__pycache__/test_config_loading.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_config_loading.cpython-313.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313.pyc
- services/rag/tests/__pycache__/test_source_filter.cpython-313-pytest-9.1.1.pyc
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
id: RQ-0020
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-23T07:35:05.896Z"
branch: "factory/RQ-0020"
createdFromCommit: "29240f1b272ca3f036038484f3c9b7ba8e68d1a4"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/19"
githubPullRequestIid: 19
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/18"
githubIssueIid: 18
repositoryProvider: github
---
# RQ-0020 - a factory env-check command that reports which env values are set, defaulted, or empty

A freshly scaffolded project carries a `.env.example` listing every variable it
understands, but nothing tells the operator which of those are still empty until
a command fails halfway on a missing one. `factory env-check` closes that gap: it
reads the project's `.env.example` (the committed source of truth for the
variable list and its grouping) and its `.env`, and reports each variable as
**set**, **default** (empty in `.env` but the example gives a usable default), or
**empty**, grouped the way `.env.example` groups them.

The command is deliberately descriptive, not prescriptive. Whether an empty
variable actually needs a value depends on the operation and the mode
(`SIMULATOR_REMOTE_*` empty means local, `BOARD_*` empty means the manual board
flow, an optional SSH key means the default key), which a static reader cannot
decide. So it prints each section's guidance comment and lists the empties
without calling them errors; the judgement of what to fill is left to the reader.
A placeholder default such as `replace_me` is reported empty, not defaulted,
because it exists precisely to demand a real value.

## Acceptance Criteria

- `factory env-check` reads `<project>/.env.example` and `<project>/.env` and
  prints, grouped by the example's sections, every variable as set, default, or
  empty, followed by a summary and the list of empties.
- A variable present in `.env` with a non-empty value is `set`; one absent or
  empty in `.env` whose `.env.example` gives a non-empty, non-placeholder default
  is `default`; anything else is `empty`. A placeholder default (`replace_me` and
  similar) is treated as empty.
- Commented example lines in `.env.example` (`# FOO=...`) are never mistaken for
  variables; blank lines separate the groups; a group's leading `#` lines are its
  description.
- The command exits non-zero only when the project has no `.env` at all, not
  merely because some values are empty (many are legitimately optional).
- It errors clearly when run somewhere with no `.env.example`.
- Host tests cover the parsing, the classification (including placeholders and a
  missing `.env`), and the end-to-end read of a project directory.

## Out of scope

- Deciding or enforcing which variables are required for a given operation, and
  prompting for or writing values. That judgement stays with the operator (and
  with the assistant, which fills what it knows and asks for the rest).


## Constraints

```json
{}
```
