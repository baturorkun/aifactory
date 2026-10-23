# Manual Handoff

Run ID: `20261023085714-RQ-0088`

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
id: RQ-0088
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T06:01:43.754Z"
branch: "factory/RQ-0088"
createdFromCommit: "ad121829c48c6e274c5b4e3a15ed69ad7311ba90"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/155"
githubPullRequestIid: 155
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/154"
githubIssueIid: 154
repositoryProvider: github
---
# RQ-0088 - vanilla-ts template: a development deploy outside CI, as a container or a copy into a directory, on this machine or a host over ssh, with the same script CI deploys with

A project made from the `vanilla-ts` template deploys only from GitLab CI:
`deploy_linux` (main) and `deploy_preview_linux` (other branches) start a
container on the runner's own Docker. During development there is no way to
put the working tree somewhere to look at without a commit, a push and a
pipeline, and no way to deploy anywhere but the runner.

`website` built and verified this first, as its RQ-0017: `scripts/deploy.sh`,
`scripts/release.sh` and `tests/deploy.test.sh`, deployed for real into a
subdomain's directory on a cPanel host (GoDaddy, `public_html`). This
requirement brings the same scripts into the template, with the project's
name in place of `website`; what the cPanel run taught is written into it.

## What it does

Four kinds of deploy, one script (`scripts/deploy.sh`) and one set of
`DEPLOY_*` names; what differs is where the settings come from:

| | Kind | Trigger | Settings |
|---|---|---|---|
| 1 | a developer's | `pnpm run deploy:dev` | `.env` (not in the repository) |
| 2 | main | a push to main | `deploy/main.env` |
| 3 | branch | a push to another branch | `deploy/branch.env` |
| 4 | release | a tag | `deploy/release.env` |

The `deploy/*.env` profiles are committed and hold no secrets. The secrets
(the ssh key and known hosts) are the developer's own files, or in CI two
protected GitLab File variables.

### 1. Two choices

- `DEPLOY_TARGET`: `container` (the release built into the project's nginx
  image, `Dockerfile` and `nginx.conf` as today, run as a container, port
  `DEPLOY_PORT` on the host to 8282) or `directory` (the release copied into
  `DEPLOY_PATH` for a web server that is already there).
- `DEPLOY_ACCESS`: `local` (this machine) or `remote` (another host over
  ssh: `DEPLOY_REMOTE_HOST`, `DEPLOY_REMOTE_USER`, `DEPLOY_REMOTE_PORT` (22),
  `DEPLOY_REMOTE_IDENTITY_FILE` and `DEPLOY_REMOTE_KNOWN_HOSTS` as a file,
  the way the embedded template's `*_REMOTE_*` settings are used).

Empty or unknown values stop with a message naming the variable; settings
another choice does not use are ignored.

`remote` names both keys, in every kind of deploy: `DEPLOY_REMOTE_IDENTITY_FILE`
and `DEPLOY_REMOTE_KNOWN_HOSTS` empty, or naming no readable file, stop the
deploy at once, naming the variable; nothing falls back to what ssh would
pick. Before any build the script logs in once (`ssh … true`); a refused key
or an unknown host key stops it there, said in one line.

### 2. One script, run by a developer and by CI

`scripts/deploy.sh`, POSIX sh: macOS, Linux, `dash`, and BusyBox in the
`docker:27-cli` image CI uses. Windows is out of scope.

- `pnpm run deploy:dev` builds (`pnpm build`, then `scripts/release.sh`) and
  deploys. Not `deploy`: `pnpm deploy` is a pnpm command.
- `-- --stop` removes this deploy's container (`directory`: nothing to stop);
  `-- --dry-run` prints what would be built, sent, run or copied and where,
  and calls neither `docker` nor `ssh`; `-- --no-build` uses the existing
  `dist/`.
- `--image <tag>` runs an image already built (no build), `--prebuilt`
  ships `release/<project>/` as it is (no build, no `release.sh`) and
  `--label k=v` (repeatable) adds labels: what CI uses.
- Settings come from the environment, else from the `DEPLOY_*` lines of
  `.env` (only those lines are read); the environment wins.
- `scripts/release.sh` lays out `release/<project>/` as `build_static` does
  today and adds a top-level `index.html` that sends the browser to
  `public/index.html` (titled with the project's name), so a `directory`
  deploy opens at `/` on any static server. `build_static` calls it.
- CI deploys from committed profiles, not GitLab environment scopes:
  `deploy/main.env` says where main goes, `deploy/release.env` where a tag
  goes, `deploy/branch.env` how a branch preview runs (`--profile main|release|branch`, also `DEPLOY_PROFILE`). They hold no
  secrets and are reviewed like code; the two may name different servers.
  Settings are taken from the environment first, then the profile, then
  `.env`; an empty value in a profile stays empty (`release.env` ships with
  an empty `DEPLOY_PATH`, so a tag deploys nowhere until the live site's
  directory is written there).
- The secrets are two GitLab protected File variables, scope `*`:
  `DEPLOY_REMOTE_IDENTITY_FILE` (the deploy key, authorised on every server a
  profile names) and `DEPLOY_REMOTE_KNOWN_HOSTS` (every such server's host
  key). `deploy.sh` stops a remote deploy without them (in every kind of
  deploy); `scripts/ci-remote-tools.sh` installs the ssh client when the job
  image lacks it and sets the key to mode 600. Tags are protected so they
  see them.
- `deploy_linux` (main) with `deploy/main.env` ships `build_static`'s
  release as it is (`--prebuilt`); without it, it runs the image
  `docker_image` built on the runner's Docker as today (`--image`, container
  ``<project>`` on `DEPLOY_PORT` else ``APP_PORT``, refusal when another container
  holds the port, health check). GitLab environment `main`.
- `deploy_release` (new, on a tag) needs `deploy/release.env` and deploys
  it with `--prebuilt`. GitLab environment `release`.
- `deploy_preview_linux` (a branch) reads `deploy/branch.env`: it must say
  `container` + `local` (the job stops otherwise: a branch preview runs on
  the runner's Docker, never sees the deploy key, and cannot write the
  runner's disk); what it sets is the port base and the CLI. Without the
  file the same defaults apply. Container `<project>-preview-<branch>`, port
  `DEPLOY_BRANCH_PORT_BASE + N`.

### 3. Container

- `DEPLOY_DOCKER` names the CLI on the target, `docker` by default; `podman`
  works with the same commands. The port's holder is found from
  `ps --format '{{.Names}} {{.Ports}}'`, since Podman has no `publish`
  filter.
- The name is `DEPLOY_CONTAINER_NAME`, else `<project>-dev-<user>`
  (`DEPLOY_USER`, else the login name, lower-cased): two developers on one
  host do not replace each other's container, nor CI's.
- Labels `com.aifactory.project`, `com.aifactory.owner` and
  `com.aifactory.deploy=dev` unless the caller gives its own
  `com.aifactory.deploy`.
- Only its own container is replaced; a port held by another container stops
  the deploy before anything is removed, naming that container.
- `remote`: the build context (`Dockerfile`, `nginx.conf`,
  `release/<project>/`) goes over ssh as a tar stream into a temporary
  directory and the image is built on the host, so an arm64 Mac deploys to an
  amd64 host without a cross build.
- `--restart unless-stopped`; `/healthz` polled for 15 s; on failure the log
  is printed and the exit code is not 0. The URL is printed at the end.

### 3b. The container's port follows the branch

`scripts/deploy.sh` picks the host port, for a developer and for CI alike
(the rule moves out of `deploy_preview_linux`):

- `--port <n>` wins (CI passes `APP_PREVIEW_PORT` this way when set).
- On the default branch (`CI_DEFAULT_BRANCH`, else `main`): `DEPLOY_PORT`
  (CI: `DEPLOY_PORT`, else `APP_PORT`, 8282).
- On `factory/RQ-N` (or `rq-N…`): `DEPLOY_BRANCH_PORT_BASE + N`, the base
  8300 when empty, so RQ-17 is 8317 as before and RQ-5 is 8305 (it was
  20005). Over 65535 or a non-numeric base stops the deploy.
- On another branch: `20000 + CI_PIPELINE_ID % 40000` in CI, as before;
  `DEPLOY_PORT` on a developer's machine.
- The branch is `CI_COMMIT_BRANCH`, else the checkout's. The script prints
  the port and the rule that chose it.

### 4. Directory: in place, never touching what is not the site's

A document root on a hosting account already holds the host's files
(`.htaccess`, `.well-known` for certificate renewal, `cgi-bin`) and has
permissions the web server depends on (cPanel: `750`, group `nobody`).
Replacing the directory loses both, so the deploy writes into it:

- `DEPLOY_PATH` must be absolute; `/`, the home directory, fewer than two
  components and `//`, `.` or `..` are refused. A missing directory is
  created when its parent exists.
- The directory and its permissions are not changed. Each file is written
  beside itself and renamed over the old one.
- The marker `.aifactory-deploy` holds `project=<project>`, the time and one
  `file=` line per file the last deploy wrote; no user name, since a web
  server serves it. Only those files are replaced or, when they left the
  release, removed (with directories they leave empty). Every other file is
  kept.
- A release file that would overwrite a file not in the marker stops the
  deploy before anything is written, naming the files; another project's
  marker is refused.
- The marker is written with the old and new lists before the copy, so an
  interrupted deploy is still the project's next time.
- `remote`: the release goes over ssh as a tar stream to the same install
  step; the host needs `sh`, `tar`, `find`, `grep` and `mktemp`.

### 5. What never leaves the machine

Only `release/<project>/` (and for `container`, `Dockerfile` and
`nginx.conf`) is sent; the send list is built from those, not by excluding.
`.env`, `.git`, `runs/`, `handoffs/` and `node_modules` never go. On macOS
the tar stream carries no `._` files or extended attributes.

### 6. Template files

- New: `scripts/deploy.sh`, `scripts/release.sh`,
  `scripts/ci-remote-tools.sh`, `tests/deploy.test.sh`, kept as files under
  the template (not strings in `scaffold.ts`) and written byte for byte into
  every project: they read the project's name from `package.json` (`name`),
  so no copy carries a project name and a later template update compares
  equal files. `website` takes them unchanged with its own requirement.
- `deploy/branch.env` (container + local, base 8300), as in `website`. No
  `deploy/main.env` or `deploy/release.env`: a new project deploys main on
  the runner until it adds `deploy/main.env`, and a tag stops with "no
  `deploy/release.env`"; `deploy/README.md` lists the four kinds, with an
  example `main.env` for a container on a host and one for a directory.
- `package.json`: `deploy:dev` (`sh scripts/deploy.sh`) and `test`
  (`sh tests/deploy.test.sh`).
- `factory.config.json`: `allowedPaths` adds `scripts`, `deploy`, `package.json`,
  `.gitignore` and `.env.example`; `commands.test` runs `pnpm test`.
- `.gitignore`: `release/`.
- `.env.example`: a `Deploy` section with every `DEPLOY_*` variable, empty
  (`DEPLOY_REMOTE_PORT=22`), each with a one-line comment.
- `factory env-check` lists the `DEPLOY_*` variables as a deploy group,
  needed only for `deploy:dev`.
- The generated project guidelines describe `deploy:dev`, the two choices,
  and that CI runs the same scripts.

### 7. Handoff capture follows `.gitignore`

`handoff-finish` lists changed files with a fixed skip list (`node_modules`,
`runs`, `handoffs`, `dist`, `.git`, `.env`, `.env.*`) and does not read
`.gitignore`, so `release/` (ignored, laid out by `release.sh`) lands in
the run as 50-odd changed artifacts. The capture also skips what the
project's `.gitignore` ignores (through `git ls-files --others --ignored
--exclude-standard` or `git check-ignore`, when the project is a git
repository); the fixed list stays for a project that is not.

### Out of scope

- `template update` for `vanilla-ts` projects: it handles embedded projects
  only (RQ-0069, RQ-0087); extending it is a later requirement. `website`
  already has the scripts from its RQ-0017.
- A bot mode, Windows as the developer's machine, TLS, a domain name or a
  reverse proxy, cache headers on a host's web server.

## Acceptance Criteria

- A new `vanilla-ts` project has the files and settings of 6; its four
  script and test files are byte-identical to the template's, and behave as
  `website`'s (RQ-0017) with the project's own name in container names,
  labels, the marker and messages.
- In the generated `.gitlab-ci.yml`, `build_static` calls `release.sh`, and
  `deploy_linux` and `deploy_preview_linux` call `deploy.sh` with
  `--image`; a scaffold test checks their container names, ports and labels.
- An aifactory test scaffolds a `vanilla-ts` project into a temp directory
  and runs its `pnpm test`, under `sh` and `dash`, and under the C locale.
  It covers, with fake `docker` and `ssh` on `PATH` (the fake `ssh` runs the
  remote command locally):
  - empty or unknown `DEPLOY_TARGET` / `DEPLOY_ACCESS` named; `.env` read,
    the environment wins;
  - `container` + `local`: built, own container replaced, labels, a port
    held by another container refused and named with nothing removed, a
    failed health check prints the log and fails, `--stop`, two users two
    names, `--image` with a caller's `com.aifactory.deploy` and no `dev`;
  - the port rule of 3b, each case;
  - the build context holds only `Dockerfile`, `nginx.conf` and
    `release/<project>/` (no `.env`, no `runs/`);
  - `container` + `remote`: ssh port, identity file and known hosts
    applied, the image built on the host, the URL printed;
  - `directory` + `local` into a cPanel-like root (`.htaccess`,
    `.well-known`, `cgi-bin`, mode `750`): copied in place with its file
    list, the host's files and the mode kept; a redeploy replaces changed
    files and removes its own that left the release; a file not ours in the
    way stops it, named, nothing written; another project's marker, `/`,
    `$HOME`, relative, one component and `..` refused; a missing directory
    created;
  - `directory` + `remote` through the same install step and rules;
  - `--prebuilt` ships the release as it is and stops without it;
  - `remote` without either key or with a missing file stops naming it
    before ssh; a refused login stops before the build;
  - profiles: read, precedence environment > profile > `.env`, an empty
    value stays empty, missing or odd names refused;
  - `--dry-run` calls neither `docker` nor `ssh` and changes no file.
- `deploy_linux` and `deploy_release`, run with fake `docker` and `ssh`:
  no `deploy/main.env` → the image on the runner; a profile without the File
  variables → stops naming them; with them → the release over ssh.
- No real deploy here: aifactory has no deploy host or `DEPLOY_*` values. The
  real `directory` + `remote` run is `website` RQ-0017's (cPanel host, 23
  October 2026); a project's own CI preview deploy runs `container` +
  `local` for real.
- A handoff test: a file under a directory the project's `.gitignore`
  ignores (`release/`) changed between begin and finish is not an
  artifact; a tracked file beside it is.
- The aifactory test suite and typecheck pass.


## Constraints

```json
{}
```
