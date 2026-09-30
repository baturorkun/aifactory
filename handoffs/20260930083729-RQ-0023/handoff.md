# Manual Handoff

Run ID: `20260930083729-RQ-0023`

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
- services/rag/src/aifactory_rag/__pycache__/config.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/db.cpython-313.pyc
- services/rag/src/aifactory_rag/__pycache__/embeddings.cpython-313.pyc
- services/rag/src/aifactory_rag/api.py
- services/rag/src/aifactory_rag/auth/__pycache__/entra.cpython-313.pyc
- services/rag/src/aifactory_rag/auth/entra.py
- services/rag/src/aifactory_rag/build_info.py
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
- services/rag/tests/__pycache__/test_build_info.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_claude_cli_responder.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_code_ingest.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_code_ingest.cpython-313.pyc
- services/rag/tests/__pycache__/test_config_loading.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_config_loading.cpython-313.pyc
- services/rag/tests/__pycache__/test_content_type.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_document_download.cpython-313.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_page_citations.cpython-313.pyc
- services/rag/tests/__pycache__/test_pdf_parse.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_resilient_embeddings.cpython-313.pyc
- services/rag/tests/__pycache__/test_source_filter.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_source_filter.cpython-313.pyc
- services/rag/tests/__pycache__/test_vector_index.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/__pycache__/test_xlsx_parse.cpython-313-pytest-9.1.1.pyc
- services/rag/tests/test_build_info.py
- services/rag/tests/test_claude_cli_responder.py
- services/rag/tests/test_code_ingest.py
- services/rag/tests/test_config_loading.py
- services/rag/tests/test_content_type.py
- services/rag/tests/test_document_download.py
- services/rag/tests/test_page_citations.py
- services/rag/tests/test_resilient_embeddings.py
- services/rag/tests/test_source_filter.py
- services/rag/tests/test_vector_index.py
- services/rag/tests/test_xlsx_parse.py
- templates/feature/component.ts.hbs
- templates/service/service.ts.hbs
- tsconfig.base.json
- tsconfig.json

## Requirement

---
id: RQ-0023
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-29T15:30:49.166Z"
branch: "factory/RQ-0023"
createdFromCommit: "8af96d5d9f2a7059a5b492ba1a89eba31f709705"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/25"
githubPullRequestIid: 25
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/24"
githubIssueIid: 24
repositoryProvider: github
---
# RQ-0023 - Ingest GitLab repositories as RAG sources with function-level code chunks

The RAG answers from documents on the file shares, but most of what the
projects need to know about their own software is in code on GitLab
(`gitlab.bc.int`): C/C++ firmware and drivers, TS/JS services and tools. A
source can only name a folder, so code reaches the corpus only when someone
copies a checkout onto a share, and every file, code included, is chunked by
size like prose: a chunk starts in the middle of one function and ends in the
next, carries no symbol name, and a question about a function by name
retrieves whatever text happens to sit near the name.

This is the first of three layers for code (the symbol graph, RQ-0024, and
Joern data-flow queries, RQ-0025, follow). It gives the other two their
input: repositories on the RAG host, and one chunk per symbol for code from
any origin.

## What it does

**A source can hold a folder, repositories, or both.** A source stays one
corpus, one `sourceId`. Its inputs are an optional folder (`PATH`, as today)
and any number of GitLab repositories and groups, each numbered under the
slot. So a project's documents and its code, split across firmware, driver
and library repositories, can be one id, and RQ-0024 can link a call from one
repository into another; a corpus shared by several projects, such as
`do178c`, stays a source of its own. There is no source type: what a slot
holds is what is set on it.

```bash
RAG_GIT_MIRROR_DIR=/srv/rag-sources/git

RAG_SOURCE_3_ID=aselsan-bfi
RAG_SOURCE_3_PATH="/mnt/fs2/5000-K EMNİYET KRİTİK PROJELER/5001-K ASELSAN BFI-SW"

RAG_SOURCE_3_REPO_1_URL=http://gitlab.bc.int/aselsan/bfi-sw
RAG_SOURCE_3_REPO_1_TOKEN=glpat-...
RAG_SOURCE_3_REPO_1_REF=main

RAG_SOURCE_3_REPO_2_URL=http://gitlab.bcintr.int/simics/aselsan-bfi
RAG_SOURCE_3_REPO_2_TOKEN=glpat-...

RAG_SOURCE_6_ID=netforge-code
RAG_SOURCE_6_GROUP_1_URL=http://gitlab.bc.int/netforge
RAG_SOURCE_6_GROUP_1_TOKEN=glpat-...
RAG_SOURCE_6_GROUP_1_PROJECT_EXCLUDE='["**/archive/**"]'
RAG_SOURCE_6_EXCLUDE_ADDITIONS='["**/third_party/**"]'
```

**Every repository and group carries its own URL and its own token.** There is
no shared GitLab URL or token: a token belongs to the project (or group) it was
made for and is never used for another, and the full URL names the server, so
one source may take repositories from `gitlab.bc.int` and `gitlab.bcintr.int`
alike. `REPO_K_TOKEN` is typically a project access token with
`read_repository`; `GROUP_K_TOKEN` is a group access token that also needs
`read_api`, to list the group's projects and subgroups' projects, filtered by
the optional `GROUP_K_PROJECT_EXCLUDE` globs. `REF` is optional; unset, the
repository's default branch, found with `git ls-remote`, so a repository
entry needs no API scope. `EXCLUDE_ADDITIONS` applies to every input of the
slot. A project reached both as a `REPO` and through a `GROUP` is ingested
once.

The numbered entries are read from the environment by both configuration
loaders (TS and Python); `factory.config.json` does not list them one by one.
Numbers need not be contiguous. A `REPO_K` or `GROUP_K` with a URL and no
token, or a token and no URL, fails configuration loading with the slot, the
entry and the missing variable. `PATH` has no default any more, so a slot that
names only repositories takes no folder; a slot with no input at all is not a
source.

**Which files an input takes depends on the input.** A folder takes today's
default list, or the slot's own list as the Renode slot has; a repository
takes the code types (C, C++, TS, JS and the other code extensions already
known) and the document types.

**A file is identified by its input and path.** The same path in the folder
and in a repository, or in two repositories, is two documents. Files from the
folder keep the relative paths they have today, so the existing corpora are
not re-keyed.

**Repositories are mirrored on the RAG host and ingested by commit.** Each
repository is kept under `RAG_GIT_MIRROR_DIR`, which lies outside the deployed
tree because `rsync.sh` deletes anything under `/srv/aifactory` that the
checkout does not have; the default is `/srv/rag-sources/git`. The ingest
takes the tree at the fetched commit. A later ingest fetches, diffs against
the commit recorded for that repository's last successful ingest, and
processes only added, changed and deleted files; a deleted or renamed file
loses its chunks. The folder input keeps today's change detection. The run
report gives each input's counts separately.

**Tokens stay out of everything the service writes.** `gitlab.bc.int` answers on
HTTP only (443 is closed), so the scheme is the one in each URL. A token is read
from its variable when git or the API needs it: it is passed to git per
command, never stored in a mirror's git config or remote URL, never copied into
the loaded configuration that the service prints or serves, and never written
to a log line, chunk, document or error message.

**Function-level chunks for C, C++, TS and JS, from every input.** Chunking
depends on the file's language, not its origin: a `.c` file in a folder is
chunked the same way as one in a repository. Files in these languages are
parsed with tree-sitter and chunked per function, method, class, struct, enum
and top-level type or macro block, with a file-level chunk for what is left
(includes, imports, globals). A symbol longer than the chunk size is split
inside its body and every part keeps the symbol's signature at its head. A
file the parser cannot handle falls back to size-based chunking and is
reported, never dropped. Other code types (DML, Python, ...) keep size-based
chunking.

**Metadata.** Every chunk keeps what it has today, including `contentType`
(`documentation` or `code`, from the extension), so
`excludeContentTypes: ["code"]` and `["documentation"]` separate documents
from code inside one source. Every chunk also records its input: the folder,
or the repository with ref and commit. A symbol chunk adds language, symbol
name, symbol kind, signature and start/end line.

**Existing corpora are re-chunked once.** An unchanged file is skipped today
when chunk size, overlap and embedding settings match; the chunker's version
joins that comparison, so after this change the code files already in
`renode`, `simics` and `aselsan-bfi` are chunked again, and document chunks
ingested before `contentType` existed gain it.

**Citations point at the code.** A chunk from a repository is cited as
`<repository>@<short commit>:<path>:<start>-<end> (<symbol>)` and the web UI
links it to the file at that commit on GitLab; a symbol chunk from a folder is
cited as `<path>:<start>-<end> (<symbol>)`.

## Acceptance Criteria

- A slot with `PATH`, `REPO_1` and `REPO_2` ingests the folder and both
  repositories into one `sourceId`, and a query on that id returns chunks
  from all three; the two repositories may be on different GitLab servers.
- Each repository is fetched with its own `REPO_K_TOKEN` only; a token that
  cannot read its repository fails that entry, naming the variable, and does
  not stop the other inputs.
- A slot with `GROUP_1` ingests every project of the group and its subgroups
  that the project globs admit; a project also listed as a `REPO` is
  ingested once.
- An entry with a URL and no token, or a token and no URL, fails configuration
  loading with the slot, the entry and the missing variable; entry numbers
  with gaps load.
- The five existing slots, which set only `PATH`, load, ingest and query as
  before, with their documents' relative paths unchanged.
- The same relative path in the folder and in a repository is stored as two
  documents.
- Mirrors live under `RAG_GIT_MIRROR_DIR` and survive an `rsync.sh` deploy;
  the next ingest fetches instead of cloning again.
- A second ingest after a push processes only the files changed since the
  recorded commit; chunks of deleted files are removed and a renamed file is
  not duplicated. The run report shows counts per input.
- No token value appears in a log line, chunk, stored document, error
  message, the served configuration or a file under the mirror directory,
  including each mirror's git config.
- C, C++, TS and JS files produce one chunk per symbol with the metadata
  listed above, whether they come from a folder or a repository; an
  over-long function is split and each part starts with its signature.
- A file tree-sitter cannot parse is ingested with size-based chunks and
  appears in the run's report.
- In a source holding documents and code, `excludeContentTypes: ["code"]`
  returns only documents and `["documentation"]` only code.
- Re-ingesting an existing corpus after the change re-chunks its unchanged
  C/C++/TS/JS files by symbol, without `--force`.
- A query naming a function returns that function's chunk, cited with its
  repository, commit, path and line range, or path and line range for a
  folder.


## Constraints

```json
{}
```
