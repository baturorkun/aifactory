# Manual Handoff

Run ID: `20261023094654-RQ-0089`

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
id: RQ-0089
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T09:45:29.122Z"
branch: "factory/RQ-0089"
createdFromCommit: "bd7efed1c8aabee36548793bb4e37bb853751308"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/157"
githubPullRequestIid: 157
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/156"
githubIssueIid: 156
repositoryProvider: github
---
# RQ-0089 - template update for vanilla-ts projects, as for embedded: lock, three-way merge, override and propose, templateCheck gate

An embedded project takes aifactory's template changes with
`pnpm factory -- template update` (RQ-0069): a merge request, a lock of what
the template delivered, a three-way merge that never overwrites a project's
change silently, `template override` / `propose` for a change kept on
purpose, and a `templateCheck` gate (RQ-0087). A `vanilla-ts` project has
none of it: `template update` refuses any profile but `embedded`, so the
deploy scripts RQ-0088 put in the template reach `website`, `sitescribe` and
`t-pro` only by hand. This makes `vanilla-ts` work the same way.

## What it does

### 1. A template kind per profile

`template-lock.ts` describes each template that can be updated, by the
`targetProject.profile` of `factory.config.json`:

| | `embedded` | `vanilla-typescript` |
|---|---|---|
| template directory | `templates/embedded` | `templates/vanilla-ts` |
| scaffold template | `embedded` | `vanilla-ts` |
| written by the scaffold | `.gitlab-ci.yml`, `.env.example`, `AGENTS.md` | the same, and `Dockerfile`, `nginx.conf`, `.dockerignore` |
| project-owned (only added when missing) | `designs/`, `boards/` | `deploy/branch.env` (its port base is the project's) |
| merged commands | the embedded gates | `typeCheck`, `test`, `templateCheck` |

The project owns everything else it has: `src/`, `public/`, `tsconfig*`,
`PROJECT_GUIDELINES.md`, `deploy/main.env`, `deploy/release.env`.
`factory.config.json`, `package.json` and `.gitignore` are merged as for
embedded. Lock, base copies, the three-way merge, `kept` / `merged` /
`conflict`, overrides and `propose` are the same code for both kinds;
nothing embedded does changes.

### 2. A project without a profile

A `vanilla-ts` project made before profiles (`website`) has no
`targetProject.profile`. `template update` takes a project with
`public/index.html`, `tsconfig.build.json` and `Dockerfile` and no profile as
`vanilla-typescript`, says so, and writes the profile in its
`factory.config.json` merge. Any other project without a profile is refused
with a message naming the profiles.

### 3. Delivery

`template update` (merge request), `--dry-run`, `--local`, `template status`,
`override`, `propose` work for both kinds. The commit and merge request name
the template: `chore(template): the aifactory vanilla-ts template at <commit>`
(embedded keeps its words); the base of a project without a lock is its last
such commit, of either kind, else its first commit. The check run before the
push is the kind's: `scripts/flow.mjs check` for embedded, `pnpm test`
(`tests/deploy.test.sh`) for `vanilla-ts`, run with the same Node / shell
rules (a check that cannot start says so). Messages and the CLI description
say "template", not "embedded template", where they apply to both.

### 4. templateCheck in vanilla-ts

The `vanilla-ts` template gets `scripts/template-check.mjs` (the embedded
one's behaviour, its help naming no embedded paths), `template:check` in
`package.json`, `commands.templateCheck: "pnpm template:check"`, and a
`template_check` CI job on merge request pipelines (`--strict`, node image).
The quality gates run `templateCheck` for a non-embedded project that names
the command, after the tests; it reports, as for embedded, and the CI job is
what fails. A new `vanilla-ts` project gets its lock at scaffold time, as an
embedded one does. AGENTS.md's Deploy section says which files the template
owns and how to keep a change (`template override`).

### Out of scope

- `python`, `c`, `empty` templates.
- Running the first update on `website` and the other projects: each takes
  it with `template update` after this is merged (its merge request may
  conflict in `.gitlab-ci.yml`, `nginx.conf` and `AGENTS.md`, resolved once).

## Acceptance Criteria

- Every existing embedded template test passes unchanged.
- A scaffolded `vanilla-ts` project has `.factory/template.lock.json` with
  the template's files (scripts, test, `deploy/README.md`, `Dockerfile`,
  `nginx.conf`, `.dockerignore`, `.gitlab-ci.yml`, `.env.example`,
  `AGENTS.md`) and not `deploy/branch.env`; `pnpm template:check` reports it
  in sync; `template_check` is in its CI.
- `template update` on a `vanilla-ts` project, one test each: a template
  file changed only in the template is replaced; changed only in the project
  is kept; changed in both merges or conflicts (markers, draft merge request);
  `deploy/branch.env` with another base is kept; `deploy/main.env` is never
  touched; `package.json` scripts and `factory.config.json` commands merge;
  an override stays and is listed by `template status`.
- A project without a profile laid out like `website` is taken as
  `vanilla-typescript` and gets the profile; one that is not is refused.
- Delivery opens a merge request named for the `vanilla-ts` template, with
  `pnpm test` as its check; a failing test pushes nothing.
- `template update --dry-run` in `website` lists its changes and writes
  nothing (run by hand, reported in the handoff).
- The aifactory test suite and typecheck pass.


## Constraints

```json
{}
```
