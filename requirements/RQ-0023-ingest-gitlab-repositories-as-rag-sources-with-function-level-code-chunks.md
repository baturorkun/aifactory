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
and optional GitLab repositories, named either as a list of project paths
(`group/project`) or as a GitLab group whose projects and subgroups' projects
it takes, filtered by optional project-path globs. So a project's documents
and its code, split across firmware, driver and library repositories, can be
one id, and RQ-0024 can link a call from one repository into another; a
corpus shared by several projects, such as `do178c`, stays a source of its
own. There is no source type: what a slot holds is what is set on it.

```bash
RAG_GITLAB_URL=http://gitlab.bc.int
RAG_GITLAB_TOKEN=glpat-...
RAG_GIT_MIRROR_DIR=/srv/rag-sources/git

# documents and code in one corpus
RAG_SOURCE_3_ID=aselsan-bfi
RAG_SOURCE_3_PATH="/mnt/fs2/5000-K EMNİYET KRİTİK PROJELER/5001-K ASELSAN BFI-SW"
RAG_SOURCE_3_REPOSITORIES=aselsan/bfi-sw,aselsan/bfi-drivers
RAG_SOURCE_3_REF=main

# a whole group, code only
RAG_SOURCE_6_ID=netforge-code
RAG_SOURCE_6_GROUP=netforge
RAG_SOURCE_6_PROJECT_EXCLUDE='["**/archive/**"]'
RAG_SOURCE_6_EXCLUDE_ADDITIONS='["**/third_party/**"]'
```

`REPOSITORIES` is comma-separated, like `RAG_SOURCE_IDS`. `REF` applies to
the slot's repositories; unset, each project's default branch.
`EXCLUDE_ADDITIONS` applies to every input of the slot. The GitLab server and
token are shared by all slots; a slot that needs a different credential names
another variable with `RAG_SOURCE_N_TOKEN_ENV`, and the configuration only
ever holds variable names, never token values. `PATH` has no default any
more, so a slot that names only repositories takes no folder. Loading the
configuration fails, naming the slot and the variables, when a slot sets both
`REPOSITORIES` and `GROUP`; a slot with no input at all is not a source.

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

**Tokens stay out of everything the service writes.** A repository list needs
a token with `read_repository`; a group also needs `read_api`, to list its
projects. `gitlab.bc.int` answers on HTTP only (443 is closed), so the scheme
comes from `RAG_GITLAB_URL`, and switching to HTTPS later is that one line. The
token is passed to git per command, never stored in a mirror's git config or
remote URL, and never written to a log line, chunk, document or error message.

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

- A slot with `PATH` and two repositories in `REPOSITORIES` ingests the
  folder and both repositories into one `sourceId`, and a query on that id
  returns chunks from all three.
- A slot with `GROUP` ingests every project of the group and its subgroups
  that the project globs admit; a slot with both `REPOSITORIES` and `GROUP`
  fails configuration loading with the slot number and both variable names.
- The five existing slots, which set only `PATH`, load, ingest and query as
  before, with their documents' relative paths unchanged.
- The same relative path in the folder and in a repository is stored as two
  documents.
- `RAG_GITLAB_TOKEN` is used when the slot names no `TOKEN_ENV`, and the
  named variable when it does.
- Mirrors live under `RAG_GIT_MIRROR_DIR` and survive an `rsync.sh` deploy;
  the next ingest fetches instead of cloning again.
- A second ingest after a push processes only the files changed since the
  recorded commit; chunks of deleted files are removed and a renamed file is
  not duplicated. The run report shows counts per input.
- The token value appears in no log line, chunk, stored document, error
  message or file under the mirror directory, including each mirror's git
  config; a missing or rejected token fails that source with a message naming
  the variable.
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
