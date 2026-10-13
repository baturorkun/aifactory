# Manual Handoff

Run ID: `20261013141900-RQ-0038`

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
- .ruff_cache/.gitignore
- .ruff_cache/0.16.10/12613866657622272541
- .ruff_cache/0.16.10/13549339773376111376
- .ruff_cache/0.16.10/16648158301630994442
- .ruff_cache/0.16.10/17088938272575661312
- .ruff_cache/0.16.10/7026750713621207618
- .ruff_cache/CACHEDIR.TAG
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
- packages/agent-factory/src/renode-ci-scripts.test.ts
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
- packages/agent-factory/templates/probe-cpu/cortex-m3/README.md
- packages/agent-factory/templates/probe-cpu/cortex-m3/cpu.c
- packages/agent-factory/templates/probe-cpu/cortex-m3/linker.ld
- packages/agent-factory/templates/probe-cpu/cortex-m3/toolchain.json
- packages/agent-factory/templates/renode/ci/Dockerfile
- packages/agent-factory/templates/renode/ci/build-image.sh
- packages/agent-factory/templates/renode/peripherals/README.md
- packages/agent-factory/templates/renode/platforms/board.repl
- packages/agent-factory/templates/renode/scripts/board/capture-serial.mjs
- packages/agent-factory/templates/renode/scripts/board/lab-agent.mjs
- packages/agent-factory/templates/renode/scripts/build-model.mjs
- packages/agent-factory/templates/renode/scripts/build-probe.mjs
- packages/agent-factory/templates/renode/scripts/ci/board-check.mjs
- packages/agent-factory/templates/renode/scripts/ci/ci-env.mjs
- packages/agent-factory/templates/renode/scripts/ci/factory.sh
- packages/agent-factory/templates/renode/scripts/ci/twin-report.mjs
- packages/agent-factory/templates/renode/scripts/ci/twin-requirements.mjs
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
- requirements/RQ-0032-data-flow-and-symbol-chunks-for-typescript-javascript-and-c-code.md
- requirements/RQ-0033-local-embeddings-with-qwen3-embedding-on-ollama-and-passive-sources.md
- requirements/RQ-0034-leave-aifactory-s-own-records-out-of-the-rag-grounding-of-a-requirement.md
- requirements/RQ-0035-embeddings-on-several-ollama-hosts.md
- requirements/RQ-0036-a-cpu-agnostic-probe-template-the-core-s-startup-fault-handling-linker-script-and-toolchain-come-from-the-project-not-the-scaffold.md
- requirements/RQ-0037-ibm-doors-modules-as-an-input-of-a-rag-source.md
- requirements/RQ-0038-a-requirement-asked-for-by-its-identifier-is-found.md
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
- services/rag/.ruff_cache/.gitignore
- services/rag/.ruff_cache/0.16.10/10231516393505205728
- services/rag/.ruff_cache/0.16.10/13471866905513533596
- services/rag/.ruff_cache/0.16.10/14836184705873572389
- services/rag/.ruff_cache/0.16.10/7136115883481557005
- services/rag/.ruff_cache/0.16.10/8130025895959391965
- services/rag/.ruff_cache/0.16.10/8726680569800917887
- services/rag/.ruff_cache/0.16.10/9031686090203689123
- services/rag/.ruff_cache/0.16.10/9193138050047695620
- services/rag/.ruff_cache/CACHEDIR.TAG
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
- services/rag/src/aifactory_rag/ingest/__pycache__/doors_chunker.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/doors_inputs.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/git_inputs.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/markdown_chunker.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/parsers.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/pipeline.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/scip_index.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/__pycache__/sources.cpython-313.pyc
- services/rag/src/aifactory_rag/ingest/chunker.py
- services/rag/src/aifactory_rag/ingest/code_chunker.py
- services/rag/src/aifactory_rag/ingest/code_graph.py
- services/rag/src/aifactory_rag/ingest/doors_chunker.py
- services/rag/src/aifactory_rag/ingest/doors_client/export.dxl
- services/rag/src/aifactory_rag/ingest/doors_client/list.dxl
- services/rag/src/aifactory_rag/ingest/doors_client/run.ps1
- services/rag/src/aifactory_rag/ingest/doors_inputs.py
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
- services/rag/src/aifactory_rag/migrations/008_dataflow_families.sql
- services/rag/src/aifactory_rag/query/__pycache__/graph.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/path_filter.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/responder.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/retriever.cpython-313.pyc
- services/rag/src/aifactory_rag/query/graph.py
- services/rag/src/aifactory_rag/query/path_filter.py
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
- services/rag/tests/__pycache__/test_csharp_code.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_dataflow.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_dataflow_joern.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313.pyc
- services/rag/tests/__pycache__/test_doors_chunker.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_doors_inputs.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_embedding_hosts.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_git_inputs.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_git_source_config.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_local_embeddings.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_markdown_chunker.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313.pyc
- services/rag/tests/__pycache__/test_path_filter.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_pdf_parse.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_pptx_parse.cpython-313-pytest-9.1.1.pyc
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
- services/rag/tests/fixtures/dataflow/unchecked-cs/CoreUart.cs
- services/rag/tests/fixtures/dataflow/unchecked-cs/Timer.cs
- services/rag/tests/fixtures/dataflow/unchecked-js/font-parse.ts
- services/rag/tests/fixtures/dataflow/unchecked/receive.c
- services/rag/tests/test_build_info.py
- services/rag/tests/test_claude_cli_responder.py
- services/rag/tests/test_code_chunker.py
- services/rag/tests/test_code_graph.py
- services/rag/tests/test_code_ingest.py
- services/rag/tests/test_config_loading.py
- services/rag/tests/test_content_type.py
- services/rag/tests/test_csharp_code.py
- services/rag/tests/test_dataflow.py
- services/rag/tests/test_dataflow_joern.py
- services/rag/tests/test_document_download.py
- services/rag/tests/test_doors_chunker.py
- services/rag/tests/test_doors_inputs.py
- services/rag/tests/test_embedding_hosts.py
- services/rag/tests/test_git_inputs.py
- services/rag/tests/test_git_source_config.py
- services/rag/tests/test_local_embeddings.py
- services/rag/tests/test_markdown_chunker.py
- services/rag/tests/test_page_citations.py
- services/rag/tests/test_path_filter.py
- services/rag/tests/test_pdf_parse.py
- services/rag/tests/test_pptx_parse.py
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
id: RQ-0038
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-13T14:18:19.555Z"
branch: "factory/RQ-0038"
createdFromCommit: "8b867cd0305376c530f46ba8797b9930d20f6727"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/55"
githubPullRequestIid: 55
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/54"
githubIssueIid: 54
repositoryProvider: github
---
# RQ-0038 - A requirement asked for by its identifier is found

Since RQ-0037 a source holds the requirements of its DOORS modules, one chunk
each, labelled with the requirement's identifier (`BFI-SRS-1296`). Asked by
what it says, a requirement is found: on the lab database, 150 requirements
asked for by their own sentence were all in the top 12. Asked by its
identifier, it is not: "BFI-SRS-1296 ne diyor?" brought the requirement into
the top 12 for 3 of the 150. The search is by meaning, and a number means
nothing to an embedding model; the nearest chunks of an identifier are other
chunks that carry identifiers.

People do ask that way, and so will the factory: a requirement that says
"implements BFI-SRS-1296" has to be grounded on that requirement, not on
twelve others.

## What it does

**An identifier in the question is looked up, not searched for.** Before the
vector search, the question is read for tokens that can be identifiers: a
word with a letter and a digit in it, with `-`, `_` or `.` between its parts
(`BFI-SRS-1296`, `BFI_HLR_235`, `REQ12`). Each is looked up, whatever its
letter case, among the requirement labels of the chunks the question may
search: the same sources, content types and paths as the vector search, active
chunks of the current embedding width only. A token that is no requirement's
identifier (`DO-178C`, `LS1043A`) matches nothing and costs one indexed
lookup.

**What is found comes first.** The chunks found by identifier head the
result, in the order the identifiers appear in the question; a requirement
split into parts comes with all its parts, a requirement that two modules
both hold comes from both. The vector search fills the rest up to
`rag.retrieval.topK`, without repeating a chunk. With more identifiers than
`topK` the first `topK` chunks are returned. A chunk found by identifier is
not subject to `rag.retrieval.minScore`, and the answer's source list marks it
as found by identifier.

**A question without an identifier is answered as before**, with the same
statements and the same result.

## Not covered

- Identifiers with a space in them.
- Identifiers that only occur in a document's text (a PDF that mentions
  `BFI-SRS-1296`): only the label of a requirement chunk is looked up.
- Keyword search in general; this is the lookup of one label.

## Acceptance Criteria

- "BFI-SRS-1296 ne diyor?" returns the chunk labelled `BFI-SRS-1296` first,
  followed by vector results, `topK` chunks in all and none of them twice.
- `bfi-srs-1296` in the question finds the chunk labelled `BFI-SRS-1296`.
- A question naming two identifiers returns their chunks in the order of the
  question, before any other chunk; one of the two that does not exist does
  not change that.
- A requirement of three parts is returned with its three parts, in order.
- With `sourceIds` set, an identifier that exists only in another source is
  not returned; with `excludeContentTypes: ["requirements"]` no chunk is
  returned by identifier.
- With `minScore` set above every vector score, the chunk found by identifier
  is still returned.
- A question with no such token runs the statements it ran before and no
  other.
- `DO-178C`, `LS1043A`, `v2.3` and `3.5.1` in a question are harmless: the
  first two are looked up and match nothing, the last two are not looked up.
- The lookup uses an index on the requirement label; the migration that adds
  it can be run twice.
- On the lab server, of 150 requirements drawn at random and asked for by
  identifier alone, at least 148 come back first.


## Constraints

```json
{}
```
