---
id: RQ-0050
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T08:55:28.058Z"
branch: "factory/RQ-0050"
createdFromCommit: "256d282cd42d4893312cf6fd9a81dbc286bf88f1"
completedRunId: "20261019091410-RQ-0050"
completedBy: "Batur Orkun"
completedAt: "2026-10-19T09:17:30.502Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/79"
githubPullRequestIid: 79
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/78"
githubIssueIid: 78
repositoryProvider: github
---
# RQ-0050 - RAG ingest: empty files skipped, JSON with comments read as text, an ingest interrupted by a restart runs again

On 19 October the RAG status page showed `aselsan-bfi` as failed and
`2d-ge-ipc` with file errors. Neither was a broken corpus:

- `aselsan-bfi`'s last run (362, 16 October) was a webhook ingest that the
  RQ-0042 deploy's service restart cut short. On start the service closes such
  runs as `failed` ("interrupted …") and nothing starts them again, so the
  source stayed red for three days although a run four minutes earlier had
  passed. Only a hand-started ingest cleared it.
- `2d-ge-ipc` errors on two files every run: a 0-byte `.docx` on the file
  server (`BGGS-SSDD-001 copy.docx`, empty since May) and a
  `devcontainer.json` with comment lines, which `json.loads` refuses.

## What it does

- A file of 0 bytes is skipped, not an error: there is nothing to read.
- A `.json` file that is not JSON (comments, as in a `devcontainer.json` or
  `tsconfig.json`; a trailing comma) is read as text, so it is still
  searchable and no longer an error.
- When the service starts and closes an interrupted run, it starts a new
  ingest of that source at once (through the webhook queue, one per source),
  recorded as started by the service restart naming the interrupted run.
  Passive sources are closed but not started.

## Acceptance Criteria

- `parse_file` on a `.json` with comment lines returns its text (the comment
  included); valid JSON is still pretty-printed.
- `_ingest_file` on a 0-byte file returns `skipped` without opening it.
- `close_interrupted_runs` returns each closed run with its source;
  `resume_interrupted` queues one ingest per enabled source and none for a
  passive one, naming the interrupted run as who started it.
- RAG tests pass; the service deployed with this shows `aselsan-bfi` and
  `2d-ge-ipc` current after their next ingest.
