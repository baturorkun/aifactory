---
id: RQ-0068
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T19:51:47.722Z"
branch: "factory/RQ-0068"
createdFromCommit: "270c29577894410d64541ec4423e90a4d8325270"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/115"
githubPullRequestIid: 115
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/114"
githubIssueIid: 114
repositoryProvider: github
---
# RQ-0068 - Docs: the embedded user guide brought to RQ-0067 (prune, results in parts, background steps, BOT_API_CHUNK_KB)

The embedded user guide (`docs/Embedded-Template-Kullanim-Kilavuzu.html` and
its PDF, also in the agentic `docs/`) stood at v0.63 and left out RQ-0064 to
RQ-0067.

## What it does

- §5 says that through the bot both the sources and the results travel in
  parts of `BOT_API_CHUNK_KB` (8 MB unless set; less on a weak link), a dropped
  part sent again alone, and that every step on the builder runs in the
  background and is followed, so the bot's 120 s per run does not bound a
  project's size.
- §8 lists `embedded_builder_prune` (after every push to main; what it removes
  and what it never touches); §11 `pnpm flow prune`.
- The header and footer say v0.67, RQ-0044…RQ-0067, 20 October 2026; the PDF
  is printed again.

## Acceptance Criteria

- The guide names `BOT_API_CHUNK_KB`, the results in parts, the background
  steps and `embedded_builder_prune`; HTML and PDF agree in both docs folders.
