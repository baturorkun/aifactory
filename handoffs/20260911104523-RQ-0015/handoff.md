# Manual Handoff

Run ID: `20260911104523-RQ-0015`

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
- requirements/RQ-0014-add-atomic-requirement-completion-and-merge-lifecycle.md
- requirements/RQ-0015-add-hardware-twin-workflow-with-probe-firmware-board-trace-and-parity-gate-for-simics-projects.md
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
id: RQ-0015
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-11T10:25:04.030Z"
branch: "factory/RQ-0015"
createdFromCommit: "d5cc544b09e8e5b17b05c4b3b1d8ec7acd7aab2e"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/9"
githubPullRequestIid: 9
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/8"
githubIssueIid: 8
repositoryProvider: github
---
# RQ-0015 - add hardware-twin workflow with probe firmware, board trace, and parity gate for Simics projects

Add a requirement kind, `hardware-twin`, for Simics projects in which the real
board is the oracle. Today a Simics requirement starts from a firmware image
somebody else built: the model is written to make that image run, and the
image's behaviour on hardware is assumed. The new kind inverts this. The
requirement first produces a small probe firmware that reports what it
observes, the probe is run on the real board and its output is recorded, and
only then is the model written, with the requirement complete when the same
probe produces the same output under Simics.

This is a framework feature, not a project convention. It must be usable by any
project scaffolded with the `simics` profile, with every machine-specific value
read from that project's `.env` and never from code defaults or committed
files.

## Workflow

A `hardware-twin` requirement moves through four phases, recorded in the
requirement's front matter as `twinPhase`:

1. **probe** - the handoff implementation writes `probes/<name>/main.c`,
   `probe.json` and any sources the template does not supply. `factory probe
   build <requirement-id>` compiles it on the licensed host, embeds the SHA-256
   of the committed probe sources into the image, and copies the resulting ELF
   to `probes/<name>/<name>.elf`. The ELF is committed: it is the exact image
   the board will run, and a rebuild may not reproduce it.
2. **board** - `factory probe board-run <requirement-id>` programs the ELF into
   the board, captures the serial output until the trace footer, validates the
   trace against the contract, and writes `probes/<name>/board-trace.txt`. When
   `BOARD_PROGRAM_COMMAND_JSON` or `BOARD_SERIAL_PORT` is empty the command
   runs in manual mode: it prints the ELF path and the expected trace header,
   then waits for the trace file to appear and validates it the same way. The
   trace is committed. Its header must carry the probe name and the source hash
   embedded in the ELF; a mismatch is rejected, not warned about.
3. **model** - the ordinary handoff implementation: DML devices, targets,
   profiles and host tests, exactly as a Simics requirement is implemented
   today.
4. **parity** - `factory probe simics-run <requirement-id>` runs the committed
   ELF on the licensed Simics host through the project's runner and captures
   the same trace; `factory probe compare <requirement-id>` diffs it against
   the board trace. Lines marked `volatile` in the trace are compared for
   presence only. A non-empty diff sets the run to `needs-fix` and the diff is
   the failure summary handed to the next fix iteration; the fix loop is bounded
   by the existing `pipeline.maxFixIterations`. The board trace is never
   regenerated inside the loop. If the probe itself must change, the source
   hash changes, the board trace no longer matches, and phase 2 must be
   repeated deliberately.

`handoff-finish` selects gates by phase: `probeBuild` in phase 1, `boardTrace`
in phase 2, the project's configured gates in phase 3, and `boardParity` in
addition to them in phase 4. `approve` requires phase 4 to have passed.

## Trace Contract

Board and Simics produce the same text, defined as a schema in
`@aifactory/contracts`:

```
PROBE v1 name=<slug> source=<first 16 hex of SHA-256 over probe sources>
<GROUP>.<REGISTER> @0x<8 hex> = 0x<8 hex>[ volatile]
...
PROBE_END lines=<count>
```

`lines` must equal the number of register lines. The comparison is a line diff
after normalising line endings; nothing else is interpreted. Register values
are what the probe reads, not what any document says they should be, so the
probe template must read every register into memory before it initialises the
UART, because initialising the UART changes reset and clock registers that a
probe is likely to be asked about.

## Scaffold and Configuration

- The `simics` profile ships `probes/_template/` with a linker script, a
  vector table and reset handler, a `probe.h` that provides deferred UART
  initialisation and the trace macros, and a `Makefile` that embeds the source
  hash. A new probe is created by copying the template; the LLM writes only the
  register list and any initialisation the target needs.
- `probes` is added to the profile's `targetProject.allowedPaths`.
- `.env.example` documents `SIMICS_REMOTE_HOST`, `SIMICS_REMOTE_USER`,
  `SIMICS_REMOTE_PORT`, `SIMICS_REMOTE_BASE_PATH`,
  `SIMICS_REMOTE_PROJECT_NAME`, `SIMICS_REMOTE_IDENTITY_FILE`,
  `SIMICS_REMOTE_TOOLCHAIN_BIN`, `BOARD_PROGRAM_COMMAND_JSON`,
  `BOARD_RESET_COMMAND_JSON`, `BOARD_SERIAL_PORT`, `BOARD_SERIAL_BAUD` and
  `BOARD_CAPTURE_TIMEOUT_MS`.
- The generated `scripts/sync-run.sh` and any other generated script take
  `SIMICS_REMOTE_*` from the environment and refuse to run with a message
  naming the missing variable. No host name, user, path or port may appear as
  a default in generated code. `BOARD_*` are the only values whose absence is
  not an error, because absence selects manual mode.
- The generated `AGENTS.md` describes the four phases, the manual board mode,
  and the rule that the board trace is authoritative over every document.
- `requirement new --kind hardware-twin` seeds the draft with a section per
  phase so the requirement author lists the registers to probe.

## Acceptance Criteria

- `requirement new --kind hardware-twin` creates a draft whose front matter
  records `kind: hardware-twin` and `twinPhase: probe`, and existing
  requirements without a kind keep today's behaviour unchanged.
- `@aifactory/contracts` exports a trace schema; a trace with a wrong line
  count, a malformed register line, a header whose source hash does not match
  the ELF, or a missing footer is rejected with a message that names the line.
- `factory probe build` compiles the probe on the licensed host, embeds the
  source hash, copies the ELF beside the sources, and the `probeBuild` gate
  fails when the hash embedded in the ELF differs from the hash of the
  committed sources.
- `factory probe board-run` supports automated mode driven by
  `BOARD_PROGRAM_COMMAND_JSON` and `BOARD_SERIAL_PORT`, and manual mode when
  either is empty; both validate the trace identically and record its SHA-256
  in the run manifest.
- `factory probe simics-run` runs the committed ELF through the project's
  Simics runner, and `factory probe compare` produces an empty diff for
  identical traces, a line diff otherwise, honours `volatile`, and sets the run
  to `needs-fix` with the diff as the failure summary.
- `handoff-finish` runs `probeBuild`, `boardTrace` and `boardParity` according
  to `twinPhase`, and `approve` refuses a `hardware-twin` run whose parity gate
  has not passed.
- The `simics` scaffold generates `probes/_template/`, the extended
  `.env.example`, the `AGENTS.md` section, and `probes` in `allowedPaths`; a
  project generated by the updated scaffold builds and validates the template
  probe under the mock model provider without a board, using manual mode with
  a fixture trace.
- No generated script or framework source contains a host name, user name,
  remote path, port or serial port as a default; a missing `SIMICS_REMOTE_*`
  variable produces an error naming it.
- Unit tests cover the trace schema, the phase-to-gate selection, manual-mode
  trace acceptance and rejection, the parity diff including `volatile`, and
  the scaffold output; the existing test suite still passes.


## Constraints

```json
{}
```
