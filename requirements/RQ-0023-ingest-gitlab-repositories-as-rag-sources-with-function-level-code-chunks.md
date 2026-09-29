---
id: RQ-0023
status: draft
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
(`gitlab.bc.int`): C/C++ firmware and drivers, TS/JS services and tools. The
only source type is `filesystem`, so code reaches the corpus only when someone
copies a checkout onto a share, and it is then chunked by size like prose: a
chunk starts in the middle of one function and ends in the next, carries no
symbol name, and a question about a function by name retrieves whatever text
happens to sit near the name.

This is the first of three layers for code (the symbol graph and Joern
data-flow queries follow as their own requirements); it gives the other two
their input: the repositories on the RAG host and one chunk per symbol.

## What it does

**A `git` source type.** One source is one corpus (one `sourceId`) and may
hold several repositories, so a project whose code is split across firmware,
driver and library repositories is queried with a single id, and RQ-0024 can
link a call from one of them into another. A source names either its
repositories, as GitLab project paths (`group/project`), or a GitLab group,
whose projects and subgroups' projects it takes, filtered by optional
project-path globs. It may name a ref; by default each project's default
branch. File include/exclude globs work as for `filesystem` sources.

The RAG host keeps a mirror of each repository under `RAG_GIT_MIRROR_DIR`,
which must lie outside the deployed tree (`rsync.sh` deletes anything under
`/srv/aifactory` that the checkout does not have; the default is
`/srv/rag-sources/git`), and ingests the tree at the fetched commit. A later
ingest fetches, diffs against the commit recorded for the last successful
ingest of that repository, and processes only added, changed and deleted
files; a deleted or renamed file loses its chunks.

**Configuration follows the numbered slots.** The server and the credential are
shared by all git sources; each slot adds its own:

```bash
RAG_GITLAB_URL=http://gitlab.bc.int
RAG_GITLAB_TOKEN=glpat-...
RAG_GIT_MIRROR_DIR=/srv/rag-sources/git

RAG_SOURCE_6_ID=bfi-code
RAG_SOURCE_6_GROUP=aselsan/bfi
RAG_SOURCE_6_PROJECT_EXCLUDE='["**/archive/**"]'
RAG_SOURCE_6_EXCLUDE_ADDITIONS='["**/third_party/**"]'

RAG_SOURCE_7_ID=netforgesh-code
RAG_SOURCE_7_REPOSITORIES=netforge/netforgesh,netforge/agent
RAG_SOURCE_7_REF=main
```

`REPOSITORIES` is comma-separated, like `RAG_SOURCE_IDS`. A slot that needs a
different credential names another variable with `RAG_SOURCE_N_TOKEN_ENV`;
the configuration only ever holds variable names, never token values. The
file types a git slot takes (C, C++, TS, JS and the document types) are fixed
in its `factory.config.json` template; `.env` carries only exceptions.

**Tokens stay out of everything the service writes.** A repository list needs
a token with `read_repository`; a group also needs `read_api`, to list its
projects. `gitlab.bc.int` answers on HTTP only (443 is closed), so the scheme
comes from `RAG_GITLAB_URL`, and switching to HTTPS later is that one line. The
token is passed to git per command, never stored in a mirror's git config or
remote URL, and never written to a log line, chunk, document or error message.

**Function-level chunks for C, C++, TS and JS.** Files in these languages are
parsed with tree-sitter and chunked per function, method, class, struct, enum
and top-level type or macro block, with a file-level chunk for what is left
(includes, imports, globals). A symbol longer than the chunk size is split
inside its body and every part keeps the symbol's signature at its head. Each
chunk's metadata records repository, ref, commit, path, language, symbol name,
symbol kind, signature and start/end line, and `contentType: code`, so the
existing `excludeContentTypes: ["code"]` filter keeps working. A file the
parser cannot handle falls back to the current size-based chunking and is
reported, never dropped.

**Citations point at the code.** A code chunk is cited as
`<repository>@<short commit>:<path>:<start>-<end> (<symbol>)`, and the web UI
links it to the file at that commit on GitLab.

## Acceptance Criteria

- A `git` source with two repositories in `REPOSITORIES` ingests both at
  their fetched commits into one `sourceId`, and a query on that id returns
  chunks from either; a source with a `GROUP` ingests every project of the
  group and its subgroups that the project globs admit.
- `RAG_GITLAB_TOKEN` is used when the slot names no `TOKEN_ENV`, and the
  named variable when it does.
- Mirrors live under `RAG_GIT_MIRROR_DIR` and survive an `rsync.sh` deploy;
  the next ingest fetches instead of cloning again.
- A second ingest after a push processes only the files changed since the
  recorded commit; chunks of deleted files are removed and a renamed file is
  not duplicated.
- The token value appears in no log line, chunk, stored document, error
  message or file under the mirror directory, including each mirror's git
  config; a missing or rejected token fails that source with a message naming
  the variable.
- C, C++, TS and JS files produce one chunk per symbol with the metadata
  listed above; an over-long function is split and each part starts with its
  signature.
- A file tree-sitter cannot parse is ingested with size-based chunks and
  appears in the run's report.
- `excludeContentTypes: ["code"]` removes these chunks from a query and
  leaving it off returns them.
- A query naming a function returns that function's chunk with its
  repository, commit, path and line range in the citation.
- The existing `filesystem` sources ingest and query as before.
