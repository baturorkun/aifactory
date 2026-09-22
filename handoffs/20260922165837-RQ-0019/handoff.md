# Manual Handoff

Run ID: `20260922165837-RQ-0019`

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
id: RQ-0019
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-22T16:43:43.481Z"
branch: "factory/RQ-0019"
createdFromCommit: "0d876030e279c0e267cd881d560f4c7c4005def5"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/17"
githubPullRequestIid: 17
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/16"
githubIssueIid: 16
repositoryProvider: github
---
# RQ-0019 - Neutralize simulator parameter names and add a Renode simulator template

The hardware-twin kind is already simulator-agnostic in mechanism: parity runs
a configured command that writes a probe trace, and compares it with the board
trace. But every name says "Simics" — the config key `probeSimicsRun`, the env
`SIMICS_*`, the file `simics-trace.txt`, the function `runProbeOnSimics`, the
CLI `probe simics-run`, and the only twin scaffold is `templates/simics`. A
project that models with Renode cannot be scaffolded, and its config would read
as if it used Simics. This requirement makes the twin plumbing name-neutral,
records which simulator a project uses, and adds a Renode scaffold.

## Design

Three orthogonal axes describe a hardware-twin project; none of them is the
requirement kind (kind stays `hardware-twin`, per-requirement):

1. **simulator** — which tool models the device: `simics` or `renode`. Stored
   in `factory.config.json` as `simulator`, chosen at `factory new` time.
2. **host** — the OS the simulator and the probe build run on: `windows` or
   `linux`, in `SIMULATOR_HOST_TYPE`. Decides PowerShell vs bash in the run
   scripts. Independent of the simulator (Simics on Windows today, Renode on
   Linux, but any pairing is allowed).
3. **location** — where that host is: the `SIMULATOR_REMOTE_*` block. Empty
   means local; set means reach it over SSH. Independent of both above.

### `factory new`: two families

`factory new` scaffolds either a standard (application) project or a
hardware-twin project, and the flag says which:

- `--template <empty|vanilla-ts|python>` scaffolds a standard project (the
  language/skeleton axis). `simics` is removed from this list.
- `--simulator <simics|renode>` scaffolds a hardware-twin project: it lays down
  that simulator's tree, sets `requirementDefaults.kind = hardware-twin` and
  `simulator: <name>` in the config, and seeds the shared board half.

`--template` and `--simulator` are mutually exclusive. Passing neither keeps the
current default (`empty`).

### One common env and config, both simulators

Every parameter that is not literally Simics-specific gets a neutral name, so a
Simics project and a Renode project use the same keys and only the values
differ. Backward compatibility: the core reads the new name first and falls
back to the old `SIMICS_*` name, so an unmigrated project keeps working.

| Old (Simics-only) | New (common) |
|---|---|
| config `commands.probeSimicsRun` | `commands.probeSimulatorRun` |
| env `SIMICS_PROBE_SIMICS_RUN_COMMAND_JSON` | `SIMULATOR_PROBE_RUN_COMMAND_JSON` |
| env `SIMICS_PROBE_BUILD_COMMAND_JSON` | `SIMULATOR_PROBE_BUILD_COMMAND_JSON` |
| env `SIMICS_REMOTE_HOST` (and `_USER`, `_PORT`, `_BASE_PATH`, `_PROJECT_NAME`, `_IDENTITY_FILE`) | `SIMULATOR_REMOTE_HOST` (and the same suffixes) |
| env `SIMICS_REMOTE_TOOLCHAIN_BIN` | `SIMULATOR_TOOLCHAIN_BIN` |
| (new) | `SIMULATOR_BIN` — the simulator executable |
| (new) | `SIMULATOR_HOST_TYPE` — `windows` or `linux` |
| file `simics-trace.txt` | `simulator-trace.txt` |
| code `runProbeOnSimics`, `probe.simicsTracePath`, `SIMICS_TRACE_FILE` | `runProbeOnSimulator`, `probe.simulatorTracePath`, `SIMULATOR_TRACE_FILE` |
| CLI `factory probe simics-run` | `factory probe sim-run` (with `simics-run` kept as a hidden alias) |

The `BOARD_*` block (program, capture, serial, agent) is already neutral and
unchanged; it is the board half, shared by both simulators.

### The Renode template

`templates/renode/` shares the board half with `templates/simics` (the probe
runtime, `scripts/board/*`, `firmware-input.mjs`, the trace contract, the
`BOARD_*` and neutral `SIMULATOR_*` env) and differs in the model half:

- models live under `platforms/` (`.repl`) and, where a device needs behaviour,
  `peripherals/` (`.cs`), instead of `dml/`;
- the run is a Renode script (`scripts/*.resc`) that loads the probe binary,
  wires the console UART to a file, runs a bounded number of instructions and
  writes the trace to `$PROBE_TRACE_OUT`;
- there is no remote-sync layer and no PowerShell: Renode is local and free, so
  `SIMULATOR_REMOTE_*` is empty and `SIMULATOR_HOST_TYPE` is `linux` by default;
- `AGENTS.md` carries the Renode modelling notes in place of the DML ones.

The shared board half is factored so it is not duplicated between the two
templates (a common tree both include, or one generated from the other).

## Acceptance Criteria

- `factory new --simulator renode <name>` scaffolds a hardware-twin project
  that builds a probe, runs it under Renode locally, and reports parity, with
  `simulator: renode` and `SIMULATOR_HOST_TYPE: linux` in its config; a host
  test exercises the scaffold.
- `factory new --simulator simics <name>` scaffolds the Simics project as
  before, now with `simulator: simics`, `SIMULATOR_HOST_TYPE: windows`, and the
  neutral parameter names.
- `simics` is no longer a `--template` value; `--template` and `--simulator`
  are mutually exclusive and documented in the command help.
- The core uses the neutral names throughout (`probeSimulatorRun`,
  `SIMULATOR_*`, `simulator-trace.txt`, `runProbeOnSimulator`, `probe sim-run`)
  and still accepts the old `SIMICS_*` env and `simics-run` command as
  fallbacks, so an unmigrated project keeps working; a test covers the
  fallback.
- `factory.config.json` gains a `simulator` field validated by the schema, and
  a run/profile records which simulator produced the parity (provenance).
- The three axes are independent: a project can set `SIMULATOR_HOST_TYPE`
  regardless of `simulator`, and leave `SIMULATOR_REMOTE_*` empty to run
  locally or set it to run over SSH.
- `AGENTS.md` and the scaffold READMEs explain the three axes and the common
  env, and the existing 126 tests plus the new ones pass.

## Out of scope

Migrating the aselsan-bfi project to the neutral names is a separate change on
that repository, done under its own approval; the fallback above keeps it
working until then.


## Constraints

```json
{}
```
