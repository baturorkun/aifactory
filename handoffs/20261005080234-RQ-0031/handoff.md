# Manual Handoff

Run ID: `20261005080234-RQ-0031`

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
- infra/joern/Dockerfile
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
- packages/agent-factory/src/model/claude-cli.test.ts
- packages/agent-factory/src/model/claude-cli.ts
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
- packages/agent-factory/templates/renode/ci/Dockerfile
- packages/agent-factory/templates/renode/ci/build-image.sh
- packages/agent-factory/templates/renode/peripherals/README.md
- packages/agent-factory/templates/renode/platforms/board.repl
- packages/agent-factory/templates/renode/scripts/board/capture-serial.mjs
- packages/agent-factory/templates/renode/scripts/board/lab-agent.mjs
- packages/agent-factory/templates/renode/scripts/build-model.mjs
- packages/agent-factory/templates/renode/scripts/build-probe.mjs
- packages/agent-factory/templates/renode/scripts/renode-run.mjs
- packages/agent-factory/templates/renode/scripts/run-probe.resc
- packages/agent-factory/templates/simics/scripts/board/capture-serial.mjs
- packages/agent-factory/templates/simics/scripts/board/lab-agent.mjs
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
- requirements/RQ-0021-open-a-requirement-from-an-existing-issue-and-link-the-two.md
- requirements/RQ-0022-label-the-source-issue-while-its-requirement-is-in-progress-and-once-it-is-resolved.md
- requirements/RQ-0023-ingest-gitlab-repositories-as-rag-sources-with-function-level-code-chunks.md
- requirements/RQ-0024-build-a-code-symbol-graph-and-answer-callers-callees-and-impact-queries-from-the-rag.md
- requirements/RQ-0025-answer-data-flow-and-coupling-questions-about-c-code-with-joern.md
- requirements/RQ-0026-let-a-repository-ref-follow-the-last-release-or-the-last-version-tag.md
- requirements/RQ-0027-resolve-code-graph-edges-precisely-from-a-scip-index-published-with-the-release.md
- requirements/RQ-0028-keep-a-repository-source-current-with-a-gitlab-push-webhook.md
- requirements/RQ-0029-show-when-each-source-was-last-updated-on-the-rag-web-page.md
- requirements/RQ-0030-chunk-markdown-documents-by-section-and-never-split-a-code-block.md
- requirements/RQ-0031-ready-twin-pipeline-in-the-renode-scaffold-probe-rebuild-twin-run-parity-and-report.md
- rsync.sh
- services/rag-web/Dockerfile
- services/rag-web/nginx.conf
- services/rag-web/public/app.js
- services/rag-web/public/index.html
- services/rag-web/public/styles.css
- services/rag/.pytest_cache/.gitignore
- services/rag/.pytest_cache/CACHEDIR.TAG
- services/rag/.pytest_cache/README.md
- services/rag/.pytest_cache/v/cache/lastfailed
- services/rag/.pytest_cache/v/cache/nodeids
- services/rag/Dockerfile
- services/rag/README.md
- services/rag/pyproject.toml
- services/rag/src/aifactory_rag/__init__.py
- services/rag/src/aifactory_rag/__main__.py
- services/rag/src/aifactory_rag/__pycache__/__init__.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/api.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/build_info.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/cli.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/config.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/dataflow.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/db.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/embeddings.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/status.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/webhook.cpython-313.pyc
- services/rag/src/aifactory_rag/api.py
- services/rag/src/aifactory_rag/auth/__pycache__/entra.cpython-313.pyc
- services/rag/src/aifactory_rag/auth/entra.py
- services/rag/src/aifactory_rag/build_info.py
- services/rag/src/aifactory_rag/cli.py
- services/rag/src/aifactory_rag/config.py
- services/rag/src/aifactory_rag/dataflow.py
- services/rag/src/aifactory_rag/db.py
- services/rag/src/aifactory_rag/embeddings.py
- services/rag/src/aifactory_rag/ingest/__pycache__/chunker.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/code_chunker.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/code_graph.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/git_inputs.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/markdown_chunker.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/parsers.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/pipeline.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/scip_index.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/sources.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/chunker.py
- services/rag/src/aifactory_rag/ingest/code_chunker.py
- services/rag/src/aifactory_rag/ingest/code_graph.py
- services/rag/src/aifactory_rag/ingest/git_inputs.py
- services/rag/src/aifactory_rag/ingest/markdown_chunker.py
- services/rag/src/aifactory_rag/ingest/parsers.py
- services/rag/src/aifactory_rag/ingest/pipeline.py
- services/rag/src/aifactory_rag/ingest/scip_index.py
- services/rag/src/aifactory_rag/ingest/sources.py
- services/rag/src/aifactory_rag/migrations/001_init.sql
- services/rag/src/aifactory_rag/migrations/002_flexible_embedding_vector.sql
- services/rag/src/aifactory_rag/migrations/003_source_inputs.sql
- services/rag/src/aifactory_rag/migrations/004_symbol_graph.sql
- services/rag/src/aifactory_rag/migrations/005_precise_edges.sql
- services/rag/src/aifactory_rag/migrations/006_dataflow_graphs.sql
- services/rag/src/aifactory_rag/migrations/007_input_freshness.sql
- services/rag/src/aifactory_rag/query/__pycache__/graph.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/responder.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/retriever.cpython-313.pyc
- services/rag/src/aifactory_rag/query/graph.py
- services/rag/src/aifactory_rag/query/responder.py
- services/rag/src/aifactory_rag/query/retriever.py
- services/rag/src/aifactory_rag/status.py
- services/rag/src/aifactory_rag/webhook.py
- services/rag/tests/__pycache__/test_build_info.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_claude_cli_responder.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_code_chunker.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_code_graph.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_code_ingest.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_code_ingest.cpython-313.pyc
- services/rag/tests/__pycache__/test_config_loading.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_config_loading.cpython-313.pyc
- services/rag/tests/__pycache__/test_content_type.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_dataflow.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_dataflow_joern.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313.pyc
- services/rag/tests/__pycache__/test_git_inputs.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_git_source_config.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_markdown_chunker.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313.pyc
- services/rag/tests/__pycache__/test_pdf_parse.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_ref_selectors.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313.pyc
- services/rag/tests/__pycache__/test_scip_index.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_source_filter.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_source_filter.cpython-313.pyc
- services/rag/tests/__pycache__/test_source_status.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_vector_index.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_webhook.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_xlsx_parse.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/fixtures/dataflow/coupling/display/display.c
- services/rag/tests/fixtures/dataflow/coupling/radio/radio.c
- services/rag/tests/fixtures/dataflow/shared/timer.c
- services/rag/tests/fixtures/dataflow/unchecked/receive.c
- services/rag/tests/test_build_info.py
- services/rag/tests/test_claude_cli_responder.py
- services/rag/tests/test_code_chunker.py
- services/rag/tests/test_code_graph.py
- services/rag/tests/test_code_ingest.py
- services/rag/tests/test_config_loading.py
- services/rag/tests/test_content_type.py
- services/rag/tests/test_dataflow.py
- services/rag/tests/test_dataflow_joern.py
- services/rag/tests/test_document_download.py
- services/rag/tests/test_git_inputs.py
- services/rag/tests/test_git_source_config.py
- services/rag/tests/test_markdown_chunker.py
- services/rag/tests/test_page_citations.py
- services/rag/tests/test_pdf_parse.py
- services/rag/tests/test_ref_selectors.py
- services/rag/tests/test_resilient_embeddings.py
- services/rag/tests/test_scip_index.py
- services/rag/tests/test_source_filter.py
- services/rag/tests/test_source_status.py
- services/rag/tests/test_vector_index.py
- services/rag/tests/test_webhook.py
- services/rag/tests/test_xlsx_parse.py
- templates/feature/component.ts.hbs
- templates/service/service.ts.hbs
- tsconfig.base.json
- tsconfig.json

## Requirement

---
id: RQ-0031
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-05T07:59:46.735Z"
branch: "factory/RQ-0031"
createdFromCommit: "5ef943e869df7a47881b587a06bd15eae7171164"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/41"
githubPullRequestIid: 41
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/40"
githubIssueIid: 40
repositoryProvider: github
---
# RQ-0031 - Ready twin pipeline in the Renode scaffold: probe rebuild, twin run, parity and report

A Renode project made with `factory new --simulator renode` gets a CI image
that holds everything a twin check needs (`ci/Dockerfile`: Renode 1.17.0 and
the Arm GNU toolchain 15.2.Rel1, pinned by SHA-256, `SIMULATOR_*` pointing at
them) and a `.gitlab-ci.yml` that uses none of it: its one job,
`ai_factory_requirement_branch`, asks `requirement decision` and, in handoff
mode, prints that it skips. Every proof the hardware-twin workflow produces
(the probe rebuilds byte for byte, the twin prints the board's trace, the
host tests pass) runs only on a developer's machine, in `handoff-finish`.

bfi-simulator wrote that pipeline by hand on top of the scaffold: stages
`probe_build`, `twin_run`, `parity`, `report` and a manual `board` stage,
driven by four helper scripts under `scripts/ci/`. twin1, the next Renode
project, started on 2026-10-05 with the scaffold's passive CI again and had
nothing to show for its first push but a job waiting for a runner. The
pipeline is the same for every Renode twin, because every job is a `factory
probe` command over the requirements' front matter; it belongs in the
scaffold, so the next project gets it on day one and bfi-simulator can drop
its copy.

## What the scaffold generates

`writeGitlabCi` in `packages/agent-factory/src/scaffold.ts`, for
`simulator === 'renode'`, adds to the generated `.gitlab-ci.yml`, after
`build_ci_image` and before the passive `ai_factory_requirement_branch`:

- A hidden `.twin` base: the CI image with `pull_policy: if-not-present`, the
  `linux` tag, rules for merge requests, the default branch, tags and
  pipelines started by hand, `cache: []`, and a `before_script` that writes
  `.env` from `.env.example` (`scripts/ci/ci-env.mjs`: secrets named `*_TOKEN`
  from CI/CD variables, `SIMULATOR_REMOTE_HOST` emptied and the simulator and
  toolchain paths taken from the image, so Renode and gcc run inside the job).
- `probe_build`: `factory probe build` for every requirement in scope, then
  `git diff --stat --exit-code -- probes/`: the committed ELFs rebuild byte for
  byte with the pinned toolchain. The ELFs are its artifact.
- `twin_run`: `factory probe sim-run` for every requirement in scope, then
  `node --test tests/` with a JUnit report. Artifacts: the simulator traces,
  `build/junit.xml` as a JUnit report.
- `parity`: `factory probe compare` for every requirement in scope, as the
  `boardParity` gate; a probe without a committed board trace is reported as
  such and passes, since the branch has not been on the board yet.
- `report`: one page from the traces and parity results
  (`scripts/ci/twin-report.mjs`), exposed on the merge request, produced also
  when parity failed.
- `board`: `factory probe board-run` for the requirement in scope, manual on
  every pipeline kind, `allow_failure: true`, `resource_group` from the
  project name so two pipelines never hold the board at once. It needs the
  `BOT_API_TOKEN` CI/CD variable; without it the job says so and stops. It
  commits nothing: it records what the board printed as an artifact for the
  developer to commit, as the workflow requires.

The scope of every job comes from `scripts/ci/twin-requirements.mjs`, read
from `requirements/*.md` front matter (`kind: hardware-twin`, `probe`): on a
requirement branch, or a merge request from one, that requirement only, as
soon as its probe has an ELF; anywhere else, every hardware-twin requirement
whose probe has a committed board trace. `scripts/ci/factory.sh` runs the
aifactory CLI in CI from `AIFACTORY_REPO_URL` / `AIFACTORY_REF`, the same
commands a developer runs.

The four scripts live in `templates/renode/scripts/ci/` and are copied by
the scaffold like the rest of `templates/renode/scripts/`. They are the
generic parts of bfi-simulator's `scripts/ci/`: `factory.sh`, `ci-env.mjs`
and `twin-requirements.mjs` as they are, `twin-report.mjs` with its BFI
firmware and live-mode sections removed. Nothing in the generated files
names a lab host, a board or a project other than through `.env.example` and
`$CI_PROJECT_NAME`.

The `ai_factory_requirement_branch` job keeps its rule as today; the twin
jobs run beside it, not instead of it. The generated README's CI section
names the stages and what each proves, and says that the `board` job is
started by hand.

## Out of scope

- The Simics scaffold. The jobs are simulator-independent (every one is a
  `factory probe` command), but the Simics image and host type (Windows,
  PowerShell) are a different CI, so the Simics template gets the same stages
  in a requirement of its own once its runner image exists.
- Packaging and release jobs (bfi-simulator's `twin_image`, `release`,
  `twin_live`): they depend on a product firmware and a twin container that a
  scaffold does not have.
- Registering runners or building the CI image: the scaffold documents both
  as today.

## Acceptance Criteria

- `factory new <name> --simulator renode` writes a `.gitlab-ci.yml` with the
  jobs `probe_build`, `twin_run`, `parity`, `report` and `board` in the stages
  of that order after `ci_image` and before `ai_factory`, and the files
  `scripts/ci/factory.sh`, `scripts/ci/ci-env.mjs`,
  `scripts/ci/twin-requirements.mjs` and `scripts/ci/twin-report.mjs`.
- `scaffold.test.ts` covers the generated `.gitlab-ci.yml` for the Renode
  case: the five jobs exist, `board` is manual with `allow_failure`, the
  twin jobs use `$AIFACTORY_RUNNER_IMAGE`, and a non-Renode project gets none
  of them.
- `node --test` on the generated `scripts/ci/twin-requirements.mjs` (a test
  in the aifactory repository over a fixture `requirements/` directory)
  proves the three scopes: requirement branch with an ELF, requirement
  branch without an ELF, and the default branch with and without board
  traces.
- `scripts/ci/ci-env.mjs` writes a `.env` in which every `*_TOKEN` present as
  an environment variable is filled, `SIMULATOR_REMOTE_HOST` is empty, and
  no other value differs from `.env.example`; covered by a test.
- The generated pipeline, applied to a checkout of twin1 (RQ-0001: one probe
  with a committed ELF and board trace), passes `probe_build`, `twin_run`
  and `parity` in the CI image run locally with Docker, as the validation of
  this requirement records in its handoff.
- No generated file contains a host name, IP address, board name or lab PC
  name; `.env.example` is the only place they are expected.
- The generated README documents the twin stages, the CI/CD variables they
  read (`BOT_API_TOKEN`, `AIFACTORY_REPO_URL`, `AIFACTORY_REF`) and that the
  `board` job is manual.
- Existing scaffold tests for the empty, vanilla-ts, python and Simics cases
  still pass unchanged.


## Constraints

```json
{}
```
