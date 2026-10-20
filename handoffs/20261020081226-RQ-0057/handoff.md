# Manual Handoff

Run ID: `20261020081226-RQ-0057`

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
- docs/Embedded-Template-Kullanim-Kilavuzu.html
- docs/Embedded-Template-Kullanim-Kilavuzu.pdf
- factory.config.json
- infra/joern/Dockerfile
- infra/rag/compose.yaml
- infra/rag/init/001_pgvector.sql
- lab/inventory.json
- package.json
- packages/agent-factory/bin/factory.js
- packages/agent-factory/package.json
- packages/agent-factory/prompts/architect.md
- packages/agent-factory/prompts/coder.md
- packages/agent-factory/prompts/domain-guard.md
- packages/agent-factory/prompts/planner.md
- packages/agent-factory/prompts/reviewer.md
- packages/agent-factory/prompts/tester.md
- packages/agent-factory/src/ci-variables.ts
- packages/agent-factory/src/cli.ts
- packages/agent-factory/src/coding-standard-gate.test.ts
- packages/agent-factory/src/coding-standard.ts
- packages/agent-factory/src/config.ts
- packages/agent-factory/src/embedded-setup.test.ts
- packages/agent-factory/src/embedded-template.test.ts
- packages/agent-factory/src/env-check.test.ts
- packages/agent-factory/src/env-check.ts
- packages/agent-factory/src/lab-inventory.ts
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
- packages/agent-factory/src/native-templates.test.ts
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
- packages/agent-factory/src/rag/requirement-comparison.test.ts
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
- packages/agent-factory/src/standards.test.ts
- packages/agent-factory/src/standards/docx.ts
- packages/agent-factory/src/standards/import.ts
- packages/agent-factory/src/template-update.ts
- packages/agent-factory/src/utils/checkbox-prompt.ts
- packages/agent-factory/src/utils/json.test.ts
- packages/agent-factory/src/utils/json.ts
- packages/agent-factory/src/workspace/apply.ts
- packages/agent-factory/templates/embedded/boards/zedboard.yaml
- packages/agent-factory/templates/embedded/common/boards/README.md
- packages/agent-factory/templates/embedded/common/flow_lib.tcl
- packages/agent-factory/templates/embedded/common/gates.tcl
- packages/agent-factory/templates/embedded/common/tool_check.tcl
- packages/agent-factory/templates/embedded/designs/hello_ps/project.tcl
- packages/agent-factory/templates/embedded/designs/hello_ps/sw/create_vitis.py
- packages/agent-factory/templates/embedded/designs/hello_ps/sw/src/main.c
- packages/agent-factory/templates/embedded/designs/hello_ps/tcl/bd.tcl
- packages/agent-factory/templates/embedded/designs/hello_ps/test.yaml
- packages/agent-factory/templates/embedded/designs/led_counter/constraints/zedboard.xdc
- packages/agent-factory/templates/embedded/designs/led_counter/project.tcl
- packages/agent-factory/templates/embedded/designs/led_counter/src/counter.vhd
- packages/agent-factory/templates/embedded/designs/led_counter/src/led_counter_top.vhd
- packages/agent-factory/templates/embedded/designs/led_counter/tb/tb_counter.vhd
- packages/agent-factory/templates/embedded/flow.ps1
- packages/agent-factory/templates/embedded/flow.sh
- packages/agent-factory/templates/embedded/flow.tcl
- packages/agent-factory/templates/embedded/ip/README.md
- packages/agent-factory/templates/embedded/scripts/board.mjs
- packages/agent-factory/templates/embedded/scripts/coding-standard.mjs
- packages/agent-factory/templates/embedded/scripts/flow.mjs
- packages/agent-factory/templates/embedded/scripts/lab-bot.mjs
- packages/agent-factory/templates/embedded/scripts/twin.mjs
- packages/agent-factory/templates/embedded/scripts/vivado-host.mjs
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
- requirements/RQ-0039-a-requirement-is-compared-with-the-project-s-doors-requirements.md
- requirements/RQ-0040-a-running-ingest-shows-what-it-is-doing-and-who-started-it.md
- requirements/RQ-0041-an-answer-on-the-rag-page-can-be-shared-by-its-link.md
- requirements/RQ-0042-a-rag-answer-gets-the-section-and-the-repository-the-question-is-about.md
- requirements/RQ-0043-c-and-c-project-templates.md
- requirements/RQ-0044-embedded-project-template-with-a-vivado-flow.md
- requirements/RQ-0045-embedded-twin-phase-the-ps-on-renode.md
- requirements/RQ-0046-embedded-board-phase-the-real-board-over-jtag.md
- requirements/RQ-0047-embedded-projects-start-configured-lab-inventory-platform-template-update-ci-variables.md
- requirements/RQ-0048-embedded-ci-on-windows-hosts-whole-files-back-short-paths-the-board-job-s-host-project.md
- requirements/RQ-0049-embedded-twin-settings-from-env-as-bfi-sw-twin-gitlab-url-twin-project-twin-registry.md
- requirements/RQ-0050-rag-ingest-empty-files-skipped-json-with-comments-read-as-text-an-ingest-interrupted-by-a-restart-runs-again.md
- requirements/RQ-0051-rag-nightly-ingest-schedule-the-service-ingests-every-active-source-at-a-configured-hour.md
- requirements/RQ-0052-coding-standards-import-a-standard-document-into-rules-and-groups-a-coding-standards-rag-source-and-a-project-s-chosen-groups.md
- requirements/RQ-0053-codingstandard-gate-a-project-s-c-checked-against-its-chosen-rules-with-cppcheck-and-lexical-checks-waivers-and-a-report.md
- requirements/RQ-0054-embedded-env-the-vivado-host-user-is-the-developer-s-own-account-not-the-inventory-s.md
- requirements/RQ-0055-embedded-board-phase-over-the-lab-bot-board-access-bot-no-ssh-to-the-lab-host.md
- requirements/RQ-0056-embedded-twin-phase-over-the-lab-bot-twin-access-bot-runs-the-twin-on-the-lab-host-s-docker-without-ssh.md
- requirements/RQ-0057-embedded-build-stages-over-the-lab-bot-vivado-access-bot-runs-vivado-vitis-and-xsdb-on-the-builder-through-its-bot-agent-no-ssh.md
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
- services/rag/.ruff_cache/0.16.10/10791066096630907280
- services/rag/.ruff_cache/0.16.10/13471866905513533596
- services/rag/.ruff_cache/0.16.10/7136115883481557005
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
- services/rag/src/aifactory_rag/__pycache__/schedule.cpython-313.pyc
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
- services/rag/src/aifactory_rag/ingest/__pycache__/rules_chunker.cpython-313.pyc
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
- services/rag/src/aifactory_rag/ingest/rules_chunker.py
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
- services/rag/src/aifactory_rag/migrations/009_requirement_identifier.sql
- services/rag/src/aifactory_rag/migrations/010_ingest_progress.sql
- services/rag/src/aifactory_rag/migrations/011_shared_answers.sql
- services/rag/src/aifactory_rag/query/__pycache__/graph.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/path_filter.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/responder.cpython-313.pyc
- services/rag/src/aifactory_rag/query/__pycache__/retriever.cpython-313.pyc
- services/rag/src/aifactory_rag/query/graph.py
- services/rag/src/aifactory_rag/query/path_filter.py
- services/rag/src/aifactory_rag/query/responder.py
- services/rag/src/aifactory_rag/query/retriever.py
- services/rag/src/aifactory_rag/schedule.py
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
- services/rag/tests/__pycache__/test_identifier_lookup.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_ingest_progress.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_local_embeddings.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_markdown_chunker.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_migrations.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313.pyc
- services/rag/tests/__pycache__/test_path_filter.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_pdf_parse.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_pdf_pictures.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_pptx_parse.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_ref_selectors.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313.pyc
- services/rag/tests/__pycache__/test_rules_chunker.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_schedule.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_scip_index.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_section_and_repository_focus.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_shared_answers.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_source_filter.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_source_filter.cpython-313.pyc
- services/rag/tests/__pycache__/test_source_status.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_unreadable_files.cpython-313-pytest-9.1.1.pyc
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
- services/rag/tests/test_identifier_lookup.py
- services/rag/tests/test_ingest_progress.py
- services/rag/tests/test_local_embeddings.py
- services/rag/tests/test_markdown_chunker.py
- services/rag/tests/test_migrations.py
- services/rag/tests/test_page_citations.py
- services/rag/tests/test_path_filter.py
- services/rag/tests/test_pdf_parse.py
- services/rag/tests/test_pdf_pictures.py
- services/rag/tests/test_pptx_parse.py
- services/rag/tests/test_ref_selectors.py
- services/rag/tests/test_resilient_embeddings.py
- services/rag/tests/test_rules_chunker.py
- services/rag/tests/test_schedule.py
- services/rag/tests/test_scip_index.py
- services/rag/tests/test_section_and_repository_focus.py
- services/rag/tests/test_shared_answers.py
- services/rag/tests/test_source_filter.py
- services/rag/tests/test_source_status.py
- services/rag/tests/test_unreadable_files.py
- services/rag/tests/test_vector_index.py
- services/rag/tests/test_webhook.py
- services/rag/tests/test_xlsx_parse.py
- standards/cstd/arm-m3.rules.md
- standards/cstd/bytecraft.rules.md
- standards/cstd/checks.json
- standards/cstd/do178c.rules.md
- standards/cstd/index.md
- standards/cstd/misra.rules.md
- standards/cstd/rules.json
- templates/feature/component.ts.hbs
- templates/service/service.ts.hbs
- tsconfig.base.json
- tsconfig.json

## Requirement

---
id: RQ-0057
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T21:37:04.213Z"
branch: "factory/RQ-0057"
createdFromCommit: "b05d98bceefac0e8bf085fc0a159784d4e91b0f0"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/93"
githubPullRequestIid: 93
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/92"
githubIssueIid: 92
repositoryProvider: github
---
# RQ-0057 - Embedded build stages over the lab bot: VIVADO_ACCESS=bot runs Vivado, Vitis and xsdb on the builder through its bot agent, no SSH

The sim, build, xsa and sw stages, and the board phase's xsdb, run on the
Vivado host (the builder, 192.168.1.3) over SSH: the sources go by scp, a
PowerShell script runs the tool, the results come back by scp (RQ-0044).
That needs an account on the builder for every developer and their key in
Windows OpenSSH's `administrators_authorized_keys`, which `ssh-copy-id`
cannot write; the first developer to take the template could not get in.
The lab host no longer needs any of this (RQ-0055, RQ-0056: the bot). The
builder is the last host a developer logs in to.

The lab bot runs its Windows agent on the lab PCs and, now, on the builder
(`builder`): free-form PowerShell for the agents the bot allows it for, a
file store, and jobs that are polled. Its PowerShell runs are killed after
120 seconds, and a Vivado build takes longer than that.

## What it does

**`VIVADO_ACCESS=ssh|bot`.** `ssh` is the stages as they are, and the
default when the setting is empty, so existing projects and CI change
nothing. `bot` runs the same command, in the same project copy under
`VIVADO_REMOTE_BASE_PATH`/`VIVADO_REMOTE_PROJECT_NAME`, through the bot's
agent `VIVADO_BOT_AGENT` on the builder, with no login and no key:

1. The sources are archived as before and put into the bot's store.
2. A first short PowerShell step on the agent fetches the archive from the
   store, replaces the project copy's entries (never `out/`), makes the
   directories the stage asked for, and starts the command in the
   background in a job directory of its own (`.<project>-job-<id>` beside
   the project copy): its pid, its log, its exit code when it ends.
3. The stage follows it with short status steps every ten seconds, printing
   the log as it grows, until the command ends.
4. A collect step archives what the stage leaves (`pulls`) in the project
   copy; the agent's `upload-file` command puts the archive into the store;
   the stage downloads it and unpacks it into the project, as scp brought it
   back before. The job directory is removed; the command's exit code is the
   stage's, as before.

Ctrl-C and a CI cancel stop the command's process tree on the builder and
remove the job directory. The bot being out of reach for a while (a network
hiccup, a restart) is not the command's failure: the stage asks again for up
to three minutes, and a command it still loses sight of is left running
with its job directory, named in the message. The command runs as the agent
does (SYSTEM), in the project copy named for the developer, so two
developers never share one.

`VIVADO_REMOTE_USER`, `_PORT`, `_IDENTITY_FILE` and `_KNOWN_HOSTS` are
ignored in `bot` mode; `VIVADO_HOST_TYPE` must be `windows` (the agent is
one). The board phase's xsdb goes the same way, since it runs on the Vivado
host (RQ-0055).

**The agent's side.** The bot's Windows agent gets a built-in `upload-file
<path> <name>` command (the agent's own token, like its OpenOCD log upload)
and the builder is listed in `ApiFreeCommandAgents`; both are the bot's
(teams-chatbot), not this repository's.

**New projects.** The lab inventory names the bot's agent on the Vivado host
(`vivado.botAgent`); a project made from it gets `VIVADO_ACCESS=bot` and
`VIVADO_BOT_AGENT`, and `VIVADO_REMOTE_USER` stays for `ssh`. The
`.env.example`, README, the user guide and `AGENTS.md` describe the switch.
CI keeps `ssh` (the instance-level `VIVADO_*` variables).

## Not covered

- Removing the source and result archives from the bot's store after a run
  (the bot has no delete; the names are unique per run).
- A Linux Vivado host through the bot: the bot's agent is a Windows agent.
- Several commands of one stage in one job: each `runOnHost` is one job, as
  each was one SSH session.

## Acceptance Criteria

- `VIVADO_ACCESS` empty or `ssh` runs the stages exactly as before; any other
  value than `ssh` or `bot` is an error naming the setting; `bot` without
  `VIVADO_BOT_AGENT`, `VIVADO_REMOTE_BASE_PATH` or `VIVADO_REMOTE_PROJECT_NAME`,
  or with `VIVADO_HOST_TYPE=linux`, is an error naming the setting.
- With `VIVADO_ACCESS=bot` and `VIVADO_BOT_AGENT=builder`, from a machine
  with no account on the builder, `pnpm flow sim led_counter`, `pnpm flow
  build hello_ps`, `pnpm flow sw hello_ps` and `pnpm board hello_ps` run on
  the builder through the bot, print the tool's log as it grows, bring back
  `out/<design>/artifacts` (bitstream, XSA, ELF, reports) and the board's
  `board-run`, and leave no job directory on the builder.
- A command that fails on the builder fails the stage with its exit code and
  its log, as over SSH; Ctrl-C stops the command's process tree on the
  builder.
- No key, password or token of the developer is sent to the builder; the bot
  sees only its own token.
- A project made with `--board zedboard` gets `VIVADO_ACCESS=bot` and
  `VIVADO_BOT_AGENT=builder` from the inventory; the `.env.example`, README,
  the user guide and `AGENTS.md` describe both modes.


## Constraints

```json
{}
```
