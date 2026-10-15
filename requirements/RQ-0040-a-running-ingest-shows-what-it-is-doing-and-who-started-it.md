---
id: RQ-0040
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-15T09:19:00.922Z"
branch: "factory/RQ-0040"
createdFromCommit: "c9544d77d8cf23883863e52801ae02552d52ffb1"
completedRunId: "20261015091945-RQ-0040"
completedBy: "Batur Orkun"
completedAt: "2026-10-15T09:25:19.293Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/59"
githubPullRequestIid: 59
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/58"
githubIssueIid: 58
repositoryProvider: github
---
# RQ-0040 - A running ingest shows what it is doing and who started it

The source card of the RAG page says "Updating now" while an ingest runs, and
under "Running ingest" it shows 0 new, 0 changed, 0 removed, 0 unchanged and
0 errors until the run ends: the counts are written once, when it finishes. A
first ingest of 2d-ge-ipc ran for over an hour like that. Nothing said which
input it was in (the folder, which repository, the DOORS export), how far it
had got, which file it was on, or whether a push or a person had started it.

## What it does

**A run records who started it.** `rag_ingest_runs.started_by` holds, for a
GitLab push, `GitLab push by <user name> to <project>`, and for a tag push
`GitLab tag push by ...`; for the command line, `command line (<user>)`, the
user being the one behind sudo when there is one; for the API's ingest
endpoint, `API`. Pushes folded into one queued run name the last of them.

**A run records where it is while it runs.** `rag_ingest_runs.progress` holds
the input being worked on (its kind, folder, git or doors, and its label), and
either the file (its path, its number and the number of files of the input)
or the step that is not a file: fetching a repository, exporting from DOORS,
building data-flow graphs. It is written when a file or a step begins, and
cleared when the run ends.

**The counts are written as the run goes.** Scanned, new, changed, unchanged,
removed and errors are written with each file, so a running ingest shows them
as they grow.

**The page shows it.** The card's running ingest says who started it and what
it is doing now, for example `git teydeb-2d-ge-ipc · 193 of 207 ·
00_Documents/.../VHDL_FPGA_Training_Day1.pdf` or `fetching
gitlab.bc.int/2d-ge-ipc/teydeb-2d-ge-ipc`; the last finished ingest says who
started it.

## Not covered

- A time left estimate.
- Stopping a running ingest from the page.

## Acceptance Criteria

- An ingest from the command line records `command line (<user>)`, with the
  sudo user when there is one; one from a GitLab push records the pusher's
  name and the project; one from the API records `API`.
- While a folder input runs, `progress` names the folder input, the file, its
  number and the number of files; while a repository is fetched it names the
  repository and the step; while DOORS is exported it names the server and the
  step; when the run ends it is empty.
- The counts of a running ingest grow with each file and equal the final
  counts when it ends.
- `/sources/status` gives a running ingest's `startedBy` and `progress`, and the
  last finished one's `startedBy`; runs recorded before this change have
  neither and are shown as before.
- The migration that adds the two columns can be run twice.
- The card shows who started a run and, while it runs, what it is doing now.
