---
id: RQ-0029
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-02T09:17:11.041Z"
branch: "factory/RQ-0029"
createdFromCommit: "5e2998446e00040670cb23b9dfec89c21b37af7a"
completedRunId: "20261002091747-RQ-0029"
completedBy: "Batur Orkun"
completedAt: "2026-10-02T09:53:35.860Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/37"
githubPullRequestIid: 37
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/36"
githubIssueIid: 36
repositoryProvider: github
---
# RQ-0029 - Show when each source was last updated on the RAG web page

Since RQ-0028 a repository source updates itself on every push and pipeline,
in the background. Nobody can see that it happened: the web page lists the
sources by name only, and the only record is the service log and
`rag_ingest_runs`. Before trusting an answer about code, a reader needs to
know how fresh the corpus is and which commit it holds.

## What it does

**`GET /sources/status`.** For each configured source: its last ingest run
(start, finish, inserted / updated / deleted / skipped counts, file errors),
whether an ingest is running now, each repository input's ref, commit and
time of its last ingest (from `rag_source_inputs`), and the time each
data-flow graph was built (`rag_dataflow_graphs`). A run still marked
`running` after six hours is reported as stale, not running.

**The source list shows it.** Under each source name on the web page, one
line: when it was last updated and, for a source with a repository, the ref
and short commit, linked to the commit on GitLab. A dot gives the state:
updating now, up to date, or finished with file errors (the count, not a
failure: a few unreadable files are not a broken corpus). The full detail -
every input, the counts of the last run, the data-flow graphs - is in the
line's tooltip. The page refreshes the status every minute, so a push shows
up without reloading.

## Acceptance Criteria

- `/sources/status` lists every configured source with its last run, its
  repository inputs (ref, commit, ingested at) and its data-flow graphs.
- A source whose ingest is running shows as updating; a run marked running
  for more than six hours shows as stale.
- The web page shows, under each source, the time of its last update and the
  ref and short commit of its repository, the commit linking to GitLab.
- A run that finished with file errors shows the error count, distinct from
  a source that could not be ingested at all.
- The status refreshes on the page every minute without a reload.
