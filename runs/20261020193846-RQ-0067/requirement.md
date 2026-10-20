---
id: RQ-0067
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T19:34:07.598Z"
branch: "factory/RQ-0067"
createdFromCommit: "a4535e4ce039e716755e737cf04142c132bfc72c"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/113"
githubPullRequestIid: 113
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/112"
githubIssueIid: 112
repositoryProvider: github
---
# RQ-0067 - Embedded: the builder's sync and collect steps in the background, followed, so no size meets the bot's 120 s limit

The bot's Windows agent kills a PowerShell run after 120 s. The command a
stage runs on the builder (Vivado, Vitis) was started in the background from
the start (RQ-0057) and followed in short steps, but two steps did their work
inside the run: `sync`, which fetches the source parts from the store, joins
them, unpacks them over the copy and records the list (RQ-0062), and
`collect`, which packs the results and cuts them in parts (RQ-0066). For a
project's first copy of several gigabytes and tens of thousands of files, or
for very large results, Windows' tar alone can take longer than that, and the
agent would kill the step halfway.

## What it does

- `sync` and `collect` are started in the background in the job directory
  (their script, its output to `<step>.out`, its exit code to `<step>.exit`)
  and a `poll` step asks after them every few seconds, as the command's
  `status` step does; the bot out of reach for a while is asked again.
- A step that ends non-zero fails the stage with the end of its output; its
  own `STATUS=` answer is read from its output once it is done.
- The scripts of the steps themselves do not change.

## Acceptance Criteria

- Under PowerShell a background step that sleeps 2 s is reported running,
  then done with its own answer; one that throws ends non-zero with its error
  in the output.
- Through the fake bot the steps run `diff, sync, poll, start, status...,
  collect, poll, clean` and the sources and results travel as before.
- On the builder a fresh copy's first sync and a sim pass with the steps in
  the background.
