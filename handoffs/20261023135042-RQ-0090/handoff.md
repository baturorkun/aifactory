# Manual Handoff

Run ID: `20261023135042-RQ-0090`

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
- packages/agent-factory/src/model/provider-env.test.ts
- packages/agent-factory/src/model/provider-env.ts
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
- packages/agent-factory/src/python-service-template.test.ts
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
- packages/agent-factory/src/security-gate.test.ts
- packages/agent-factory/src/simics-transport.test.ts
- packages/agent-factory/src/standards.test.ts
- packages/agent-factory/src/standards/docx.ts
- packages/agent-factory/src/standards/import.ts
- packages/agent-factory/src/template-delivery.test.ts
- packages/agent-factory/src/template-delivery.ts
- packages/agent-factory/src/template-lock.ts
- packages/agent-factory/src/template-override.ts
- packages/agent-factory/src/template-sync.test.ts
- packages/agent-factory/src/template-update.ts
- packages/agent-factory/src/utils/checkbox-prompt.ts
- packages/agent-factory/src/utils/json.test.ts
- packages/agent-factory/src/utils/json.ts
- packages/agent-factory/src/vanilla-ts-deploy.test.ts
- packages/agent-factory/src/vanilla-ts-template-sync.test.ts
- packages/agent-factory/src/workspace/apply.ts
- packages/agent-factory/templates/embedded/.gitattributes
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
- packages/agent-factory/templates/embedded/scripts/build-reuse.mjs
- packages/agent-factory/templates/embedded/scripts/coding-standard.mjs
- packages/agent-factory/templates/embedded/scripts/flow.mjs
- packages/agent-factory/templates/embedded/scripts/lab-bot.mjs
- packages/agent-factory/templates/embedded/scripts/template-check.mjs
- packages/agent-factory/templates/embedded/scripts/twin.mjs
- packages/agent-factory/templates/embedded/scripts/vitis_sw.py
- packages/agent-factory/templates/embedded/scripts/vivado-host.mjs
- packages/agent-factory/templates/probe-cpu/cortex-m3/README.md
- packages/agent-factory/templates/probe-cpu/cortex-m3/cpu.c
- packages/agent-factory/templates/probe-cpu/cortex-m3/linker.ld
- packages/agent-factory/templates/probe-cpu/cortex-m3/toolchain.json
- packages/agent-factory/templates/python-service/.github/workflows/deploy.yml
- packages/agent-factory/templates/python-service/deploy/README.md
- packages/agent-factory/templates/python-service/deploy/branch.env
- packages/agent-factory/templates/python-service/deploy/dev.env.example
- packages/agent-factory/templates/python-service/scripts/deploy.sh
- packages/agent-factory/templates/python-service/scripts/template-check.mjs
- packages/agent-factory/templates/python-service/tests/deploy.test.sh
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
- packages/agent-factory/templates/vanilla-ts/deploy/README.md
- packages/agent-factory/templates/vanilla-ts/deploy/branch.env
- packages/agent-factory/templates/vanilla-ts/scripts/ci-remote-tools.sh
- packages/agent-factory/templates/vanilla-ts/scripts/deploy.sh
- packages/agent-factory/templates/vanilla-ts/scripts/release.sh
- packages/agent-factory/templates/vanilla-ts/scripts/template-check.mjs
- packages/agent-factory/templates/vanilla-ts/tests/deploy.test.sh
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
- requirements/RQ-0058-embedded-env-the-person-s-name-once-bot-api-agent-the-vivado-account-and-the-host-project-copies-follow-from-it.md
- requirements/RQ-0059-rag-index-fpga-sources-constraints-and-tcl-by-default-xdc-sdc-pdc-ucf-qsf-tcl-v-sv-vhd.md
- requirements/RQ-0060-embedded-lab-bot-client-retry-uploads-and-downloads-when-the-connection-drops.md
- requirements/RQ-0061-embedded-the-vivado-parallel-jobs-from-env-vivado-jobs-filled-from-the-lab-inventory.md
- requirements/RQ-0062-embedded-sources-to-the-builder-over-the-bot-only-as-they-change-manifest-diff-chunked-upload.md
- requirements/RQ-0063-embedded-the-vitis-path-estimate-measured-right-cmake-build-directory-deepest-object-and-shorter-ci-project-names-on-the-builder.md
- requirements/RQ-0064-rag-c-tables-chunked-whole-file-scope-initialized-arrays-as-symbols-and-a-split-symbol-s-parts-brought-along.md
- requirements/RQ-0065-embedded-prune-the-builder-ci-copies-of-gone-branches-orphaned-vitis-workspaces-stale-job-directories.md
- requirements/RQ-0066-embedded-results-back-from-the-builder-in-parts-each-retried-on-its-own.md
- requirements/RQ-0067-embedded-the-builder-s-sync-and-collect-steps-in-the-background-followed-so-no-size-meets-the-bot-s-120-s-limit.md
- requirements/RQ-0068-docs-the-embedded-user-guide-brought-to-rq-0067-prune-results-in-parts-background-steps-bot-api-chunk-kb.md
- requirements/RQ-0069-template-update-brings-aifactory-up-to-date-first-and-always-delivers-as-a-merge-request-only-from-a-clean-current-main.md
- requirements/RQ-0070-rag-questions-embedded-on-their-own-ollama-hosts-rag-embedding-query-base-url-first-that-answers-ingest-on-the-others.md
- requirements/RQ-0071-coding-standard-the-project-s-choice-in-factory-config-json-codingstandard-coding-standard-only-the-rules-made-from-it-and-the-waivers.md
- requirements/RQ-0072-rag-source-slots-9-to-12-in-factory-config-json-do-254-as-source-9-do254.md
- requirements/RQ-0073-template-update-and-the-factory-launcher-on-windows-no-cmd-spawned-without-a-shell-the-check-by-node-tsx-by-node.md
- requirements/RQ-0074-coding-standard-report-only-codingstandard-enforce-false-the-gate-and-ci-report-the-violations-without-failing.md
- requirements/RQ-0075-template-update-line-endings-compared-normalized-windows-crlf-nothing-to-commit-is-current-the-coding-standard-section-kept.md
- requirements/RQ-0076-coding-standard-gate-and-ci-job-in-every-c-and-embedded-project-no-standard-nothing-to-check-a-choice-without-rules-stop-and-no-pycache-on-the-builder.md
- requirements/RQ-0077-template-branch-push-pipeline-dropped-a-template-update-runs-one-pipeline-the-merge-request-one.md
- requirements/RQ-0078-embedded-build-reused-when-its-inputs-were-already-built-no-second-vivado-build-on-main-or-the-completion-commit.md
- requirements/RQ-0079-vivado-threads-per-run-vivado-threads-8-by-default-in-synthesis-and-implementation-runs.md
- requirements/RQ-0080-vivado-ip-cache-shared-by-the-builder-s-copies-and-incremental-implementation-a-new-branch-does-not-synthesize-its-ip-again.md
- requirements/RQ-0081-no-skipped-pipeline-records-on-gitlab-requirement-bookkeeping-commits-dropped-by-a-workflow-rule-and-no-skip-ci-quoted-into-a-template-update-commit.md
- requirements/RQ-0082-designs-built-at-once-on-the-build-host-sources-synced-once-each-design-s-vivado-and-vitis-run-in-parallel-vivado-parallel.md
- requirements/RQ-0083-builder-prune-removes-ip-cache-entries-unused-for-30-days.md
- requirements/RQ-0084-ci-factory-job-no-pnpm-lock-yaml-or-pnpm-left-in-the-project-so-the-requirement-decision-does-not-stop-on-files-ci-made.md
- requirements/RQ-0085-coding-standard-report-only-no-cppcheck-on-a-developer-s-machine-is-not-a-failure-ci-s-coding-standard-job-reports.md
- requirements/RQ-0086-build-correctness-no-incremental-synthesis-or-implementation-and-a-project-rebuilt-when-its-block-design-or-ip-inputs-change.md
- requirements/RQ-0087-template-sync-a-project-s-design-ip-in-simulation-and-clean-on-windows-from-embedded1-and-a-project-s-change-to-a-template-owned-file-kept-gated-and-proposed-back-instead-of-overwritten.md
- requirements/RQ-0088-vanilla-ts-template-a-development-deploy-outside-ci-as-a-container-or-a-copy-into-a-directory-on-this-machine-or-a-host-over-ssh-with-the-same-script-ci-deploys-with.md
- requirements/RQ-0089-template-update-for-vanilla-ts-projects-as-for-embedded-lock-three-way-merge-override-and-propose-templatecheck-gate.md
- requirements/RQ-0090-python-service-template-a-python-service-deployed-as-a-compose-stack-with-the-same-deploy-script-profiles-and-template-update-github-actions-deploy-for-netforgesh.md
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
- services/rag/src/aifactory_rag/api.py
- services/rag/src/aifactory_rag/auth/entra.py
- services/rag/src/aifactory_rag/build_info.py
- services/rag/src/aifactory_rag/cli.py
- services/rag/src/aifactory_rag/config.py
- services/rag/src/aifactory_rag/dataflow.py
- services/rag/src/aifactory_rag/db.py
- services/rag/src/aifactory_rag/embeddings.py
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
- services/rag/src/aifactory_rag/query/graph.py
- services/rag/src/aifactory_rag/query/path_filter.py
- services/rag/src/aifactory_rag/query/responder.py
- services/rag/src/aifactory_rag/query/retriever.py
- services/rag/src/aifactory_rag/schedule.py
- services/rag/src/aifactory_rag/status.py
- services/rag/src/aifactory_rag/webhook.py
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
id: RQ-0090
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T13:31:01.803Z"
branch: "factory/RQ-0090"
createdFromCommit: "b73b13ddd44a57bebb5064ac2d09b21885a229c5"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/159"
githubPullRequestIid: 159
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/158"
githubIssueIid: 158
repositoryProvider: github
---
# RQ-0090 - python-service template: a Python service deployed as a compose stack with the same deploy script, profiles and template update, GitHub Actions deploy, for NetForgeSH

A Python project (NetForgeSH: FastAPI with a React frontend, run as a compose
stack with its own Postgres, on GitHub) has no aifactory template: it was made
before templates and deploys with three hand-written scripts and a CI job, each
with its own hosts, ports, paths and names written into it. `template update`
refuses it ("applies to a project of profile embedded or vanilla-typescript"),
and the deploy mechanism of RQ-0088 (one `scripts/deploy.sh`, four kinds of
deploy from `.env` and `deploy/<profile>.env`) knows only one nginx container
or a directory copy, only on GitLab CI.

This adds a `python-service` template, made like `vanilla-ts`: the same lock,
three-way merge, override and propose, and `templateCheck` gate (RQ-0087,
RQ-0089), the same `scripts/deploy.sh` with a third target, `compose`, and a
GitHub Actions deploy workflow. A project of profile `python-service` takes the
template with `factory template update`, delivered as a pull request on GitHub
as a merge request on GitLab.

Deploy settings are parameters and never reach the project's AI provider
session: they live in `deploy/<profile>.env` (committed, no secrets, as in
`website`), in the developer's `.env`, and in CI secrets, and the provider's
process is started without any `DEPLOY_*` variable.

## What the template owns and what the project owns

- Template-owned (locked, replaced or merged by `template update`):
  `scripts/deploy.sh`, `scripts/template-check.mjs`, `tests/deploy.test.sh`,
  `deploy/README.md`, `deploy/dev.env.example` (the `DEPLOY_*` lines a
  developer copies into `.env`), `.github/workflows/deploy.yml` on GitHub.
- Project-owned (added only when missing): `deploy/branch.env`. The project's
  `AGENTS.md`, `.env.example`, `pyproject.toml`, compose files, `Dockerfile`,
  sources, tests and its own CI workflow (tests) are never the template's.
- `scripts/deploy.sh` and `scripts/template-check.mjs` are byte-identical in
  `vanilla-ts` and `python-service`; `vanilla-ts` projects get the compose
  target through their next `template update`, nothing in their deploys
  changes. Each template keeps its own `tests/deploy.test.sh`: the
  `python-service` one tests the compose target.
- The project's name is read from `package.json` `name`, else from
  `pyproject.toml` `[project] name`.

## The compose target

`DEPLOY_TARGET=compose`, local or remote as before (ssh with
`DEPLOY_REMOTE_IDENTITY_FILE` and `DEPLOY_REMOTE_KNOWN_HOSTS`, no trust on
first use). New settings, all `DEPLOY_*`:

- `DEPLOY_DIR`: the stack's directory on the target (`~` allowed). It holds
  `src/` (replaced on each deploy), `runtime.env` (kept, mode 600) and data
  directories.
- `DEPLOY_COMPOSE_PROJECT`: the compose project name (its volumes keep the
  data across deploys).
- `DEPLOY_COMPOSE_FILES`: the compose files, in order (default `compose.yml`).
- `DEPLOY_COMPOSE_OVERLAYS`: `network:file` pairs. The file is added only when
  the network exists on the target (a log stack that may not be there).
- `DEPLOY_COMPOSE_PORT_VAR`, `DEPLOY_COMPOSE_IMAGE_VAR`: the `runtime.env`
  names that receive the resolved port and the image.
- `DEPLOY_ENV_SET_<NAME>=value`: written into `runtime.env` as `NAME=value`
  on every deploy (settings, build arguments such as a CLI version).
- `DEPLOY_ENV_SECRETS`: `NAME=kind` pairs (`hex<N>`, `base64url<N>`), each
  generated once on the target when `runtime.env` lacks it, never printed and
  never leaving the target.
- `DEPLOY_ENV_COPY`: `path:NAME,NAME` copies those names from another env
  file on the target when `runtime.env` lacks them (a branch preview that uses
  main's database password).
- `DEPLOY_DATA_DIRS`: `NAME=dir:uid` creates `DEPLOY_DIR/dir`, owned by that
  uid (`podman unshare chown` under rootless podman), and writes its absolute
  path as `NAME`.
- `DEPLOY_HEALTH_PATH`: the path checked on `127.0.0.1:<port>` from the target
  (default `/healthz`).
- `GIT_COMMIT_SHA` and `GIT_COMMIT_TIME` are written into `runtime.env` on
  every deploy.

A build deploy sends the working tree, meaning the files Git tracks or would
track (`git ls-files -co --exclude-standard`; `.gitignore` decides what stays
behind), as a tar stream, and runs `compose up -d --build --remove-orphans`
on the target. `--image <ref>` runs a registry image with `--no-build` after
pulling it. Dangling images are pruned after a deploy. `--stop` is
`compose down` and keeps the volumes. `DEPLOY_DOCKER=podman` runs
`podman compose`. The engine is the one named, with no fallback.

The branch, default branch and run id come from `DEPLOY_BRANCH`,
`DEPLOY_DEFAULT_BRANCH` and `DEPLOY_RUN_ID` when set (GitHub Actions sets
them), else from GitLab's `CI_*`, else from Git. The port rule is unchanged.

## GitHub Actions deploy

`.github/workflows/deploy.yml` (template-owned) runs on the runner named by the
repository variable `DEPLOY_RUNS_ON` (a JSON list of labels, default
`["self-hosted"]`):

- **Push to the default branch:** `--profile main` when `deploy/main.env`
  exists.
- **Manual run (`workflow_dispatch`, profile `branch` or `release`, deploy or
  stop):** branch previews on demand, and a release of a tag with the image
  `DEPLOY_IMAGE:<tag>`. The release job uses the GitHub environment `release`,
  whose protection rules hold it for approval.
- **Branch deleted:** stops that branch's preview.

The ssh key and known hosts come from the secrets `DEPLOY_REMOTE_IDENTITY` and
`DEPLOY_REMOTE_KNOWN_HOSTS`, written to files under `RUNNER_TEMP` and removed
afterwards. No `apk`, nothing GitLab-specific.

## Never in the AI provider session

- The `claude-cli`, `codex-cli` and direct providers start their process with
  an environment without any `DEPLOY_*` variable. Nothing else in it changes.
- The template puts nothing of `deploy/` into guidelines, prompts or handoff
  packages. Its `deploy/README.md` and the generated guidance say that deploy
  settings are the operator's and are not to be read or written by an agent.

## Acceptance Criteria

- `factory new <name> --template python-service` makes a Python project with
  `targetProject.profile: "python-service"`, the template-owned files above, a
  lock, a minimal service with `/healthz`, `compose.yml` and `Dockerfile`, and
  the `templateCheck` gate; `deploy/` is not among its `allowedPaths`. It gets
  `.github/workflows/deploy.yml`.
- `template update` runs on a `python-service` project with or without a
  `package.json`, owns only the files listed above, never `AGENTS.md` or
  `.env.example`, adds only the `templateCheck` gate, keeps a differing file
  that has no known base (a project older than the template has none: its
  first commit is not taken as the template's), and checks
  the result with `tests/deploy.test.sh` before pushing. It is delivered as a
  pull request on GitHub.
- `scripts/deploy.sh` is byte-identical in both templates, reads the project
  name from `package.json` or `pyproject.toml`, and its container and
  directory targets behave as before (the existing vanilla-ts tests pass
  unchanged).
- The compose target behaves as described above, for local and remote, build
  and `--image`, deploy and `--stop`, and `--dry-run`. `tests/deploy.test.sh`
  shows it with fake `docker`/`podman`, `ssh` and `git`, including:
  - secrets generated once and never printed;
  - the overlay added only when its network exists;
  - data directories chowned under podman;
  - the health check;
  - a missing setting named in the error.
- The GitHub deploy workflow is generated as described and is valid YAML; a
  test checks its jobs, triggers, environment and secret handling.
- Providers start without `DEPLOY_*` in their environment: a test spawns each
  provider path with `DEPLOY_*` set in `process.env` and asserts the child
  environment has none of them.
- README documents the `python-service` template and the compose target.

## Out of scope

- NetForgeSH's own move (its profiles, removing its old scripts, its CI deploy
  job, its AGENTS.md) is NetForgeSH's requirement after this one.
- Registry login on the target, TLS and reverse proxies.
- GitLab CI deploy jobs for `python-service` (the script already reads
  GitLab's variables).


## Constraints

```json
{}
```
