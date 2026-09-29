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

**A `git` source type.** A source names either a list of repository URLs or a
GitLab group (with its subgroups), plus a ref (default: the project's default
branch) and optional include/exclude globs for project paths. The RAG host
keeps a mirror of each repository under a configured directory and ingests the
checked-out tree at the fetched commit. A later ingest fetches, diffs against
the commit recorded for the last successful ingest, and processes only added,
changed and deleted files; a deleted or renamed file loses its chunks.

**Access is one token per source, read from the environment.** The source
names the variable (`tokenEnv`), never the value. For a repository list a
project deploy token with `read_repository` is enough; for a group, a group
access token with `read_repository` and `read_api`, the latter to list the
group's projects. `gitlab.bc.int` answers on HTTP only (443 is closed), so the
URL scheme is taken from the configuration and the token is never written to a
log, a chunk, the mirror's git config or an error message.

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

- A `git` source with a repository URL list and a `tokenEnv` ingests each
  repository at the fetched commit; a source with a GitLab group ingests every
  project of the group and its subgroups that the path globs admit.
- A second ingest after a push processes only the files changed since the
  recorded commit; chunks of deleted files are removed and a renamed file is
  not duplicated.
- The token value appears in no log line, chunk, stored document, error
  message or file under the mirror directory; a missing or rejected token
  fails that source with a message naming the variable.
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
