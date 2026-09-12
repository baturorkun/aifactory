# Manual Handoff

Run ID: `20260912170952-RQ-0016`

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
- packages/agent-factory/src/utils/json.test.ts
- packages/agent-factory/src/utils/json.ts
- packages/agent-factory/src/workspace/apply.ts
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
id: RQ-0016
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-12T13:32:00.000Z"
branch: "factory/RQ-0016"
createdFromCommit: "b32b638"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/11"
githubPullRequestIid: 11
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/10"
githubIssueIid: 10
repositoryProvider: github
---
# RQ-0016 - generate the hardware-twin runner scripts and board-verified model rules in the simics scaffold

RQ-0015 gave the `hardware-twin` kind its contract: the phases, the trace
format, the gates, the probe template, the environment variables. Running it
for the first time in `aselsan-bfi` (RQ-0009, merged) showed that the contract
is not enough to work with. That project had to hand-write about 770 lines of
transport and runner code before a single probe could reach a board, and had
to invent three modelling rules that nothing records. A second Simics project
would repeat both.

This requirement moves what is generic into the `simics` scaffold, and writes
down what is a rule rather than code. Nothing in `aselsan-bfi` changes; it
keeps the versions it has, which are verified against a real licensed host and
a real board.

## Topology

A Simics installation is either on this machine or on another one reached over
SSH. Both are Windows: Linux hosts are out of scope, and the generated runner
scripts stay PowerShell.

`SIMICS_REMOTE_HOST` decides, and nothing else:

- **empty** - the command runs here. `--pull` copies a file out of the project
  instead of fetching it.
- **set** - today's behaviour: archive the source, copy it over, run the
  command in the synchronised project, fetch what `--pull` names.

The generated `scripts/sync-run.mjs` reads `SIMICS_REMOTE_*` itself, from the
environment and from `.env`. The `scripts/sync-run.sh` wrapper that assembles
those flags today is removed: it adds a Bash dependency a Windows host need
not have, and it exists only to read variables the Node script can read.
Missing values stay an error that names the variable; only
`SIMICS_REMOTE_HOST` may be empty, and emptiness selects local.

## Generated Scripts

The `simics` template gains these, taken from `aselsan-bfi` where they are
already free of any machine name:

- `scripts/sync-run.mjs` - the transport above, with `--push-input` and
  `--pull`, the gzip bootstrap that keeps the remote command under the
  Windows command-line limit, and the exclusions that keep `references/`,
  `build/` and `.env` off the wire.
- `scripts/windows/SimicsTools.ps1` - resolving the project root, the Simics
  launcher and the ARM toolchain from an explicit path, an environment
  variable, `PATH`, or a search root, and a checked command invocation.
- `scripts/windows/Build-Probe.ps1` - compiles `probes/<name>/*.c` with
  `-DPROBE_SOURCE_HASH=<hash>` as a bare token, writes the ELF to the path
  `factory probe build` expects, and fails if the image does not embed the
  marker.
- `scripts/windows/Run-Probe.ps1` - runs the committed probe image under the
  project's firmware runner and writes the captured console text to
  `$PROBE_TRACE_OUT`.
- `scripts/board/capture-serial.mjs` - reads the board's serial port through a
  lab agent service when `BOARD_AGENT_URL` names one, so a board wired to
  another machine can still be captured. It is the documented shape of
  `BOARD_CAPTURE_COMMAND_JSON`, not a requirement: a directly attached port
  needs no such wrapper.

`simics.config.json` is generated with `gates` and `probe` entries that invoke
`scripts/sync-run.mjs` directly, so a generated project runs without editing
them once `.env` is filled in.

## Recorded Rules

The generated `AGENTS.md` gains a section that states, in the Simics part:

- **The board trace is the oracle.** Where it disagrees with a manual, a
  vendor header or a design export, the trace wins, and the disagreement is
  recorded in the profile rather than resolved silently.
- **A board-verified profile is derived, never written.** An
  `extract-<device>-profile.mjs` reads the probe manifest and the board trace,
  refuses them if they disagree about which registers were read in which
  order, and emits the profile with the SHA-256 of the trace and of the image
  that produced it. A host test regenerates the profile from the committed
  inputs and compares it with the committed profile.
- **An earlier boundary is never re-frozen against a new value.** When the
  board contradicts a device modelled before the board was consulted, that
  device exposes its power-on value as an attribute whose default stays the
  value its own frozen gate validates, and the board-verified composition sets
  what the board printed. Both values live in the profile's board
  observations.
- **The parity gate is part of the boundary gate.** A board-verified gate runs
  its model validation twice, checks that the earlier regression firmware still
  reaches its own output through the new composition, and diffs the probe's
  Simics trace against the board trace, honouring `volatile` lines.

The same section records what cost time in RQ-0009 and is not discoverable
from the code: in DML 1.4 a `template` must be declared at file scope, an
attribute's `init()` runs only when the object is declared
`is (uint64_attr, init)` and `param init_val` on an attribute does nothing,
and `%script%` expands in command arguments but not in a bare assignment, so a
path needs `$p = (lookup-file "%script%/…")`. On Windows PowerShell 5.1 there
is no `[Text.Encoding]::Latin1`, an array splat binds positionally where a
hashtable splat binds by name, and a quoted `-DNAME="x"` loses its quotes on
the way to GCC. Simics rejects an empty string for a declared string
parameter, so an unset selection is omitted rather than passed empty.

## Draft Seeding

`requirement new --kind hardware-twin` seeds the acceptance criteria with the
gate shape above, so a requirement author starts from what the gate will
check rather than reconstructing it.

## Acceptance Criteria

- A project generated with `--template simics` contains
  `scripts/sync-run.mjs`, `scripts/windows/SimicsTools.ps1`,
  `scripts/windows/Build-Probe.ps1`, `scripts/windows/Run-Probe.ps1` and
  `scripts/board/capture-serial.mjs`, and no `scripts/sync-run.sh`.
- `scripts/sync-run.mjs` runs the command locally when `SIMICS_REMOTE_HOST` is
  empty and over SSH when it is set; `--pull` produces the named local file in
  both modes; a missing `SIMICS_REMOTE_USER`, `SIMICS_REMOTE_BASE_PATH` or
  `SIMICS_REMOTE_PROJECT_NAME` fails with a message naming it only in the
  remote mode.
- The generated `simics.config.json` `gates` and `probe` entries invoke
  `scripts/sync-run.mjs`, and `node scripts/simics-command.mjs probe-build`
  fails with a message naming the first unset `PROBE_*` variable rather than
  running a command with an empty argument.
- The generated `AGENTS.md` states the four rules and the recorded pitfalls
  above.
- `requirement new --kind hardware-twin` seeds acceptance criteria covering
  the probe build, the board trace, the parity diff and the earlier-boundary
  rule.
- Unit tests cover the local and remote branches of the transport with a
  fixture command, `--pull` in both modes, the refusal messages, and the
  generated file set; the existing suite still passes.
- No generated file contains a host name, user name, remote path, port or
  serial port as a value.


## Constraints

```json
{}
```
