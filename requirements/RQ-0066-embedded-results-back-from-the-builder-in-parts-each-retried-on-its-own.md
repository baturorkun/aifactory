---
id: RQ-0066
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T18:56:21.553Z"
branch: "factory/RQ-0066"
createdFromCommit: "582fee9ed96e8eb677ca3585364f3636eceb8bb9"
completedRunId: "20261020190553-RQ-0066"
completedBy: "Batur Orkun"
completedAt: "2026-10-20T19:13:46.337Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/111"
githubPullRequestIid: 111
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/110"
githubIssueIid: 110
repositoryProvider: github
---
# RQ-0066 - Embedded: results back from the builder in parts, each retried on its own

RQ-0062 sends the sources to the builder in parts; the results still came
back as one archive: the collect step packed `out/<design>/artifacts`, the
agent's `upload-file` put it in the bot's store and the developer's machine
downloaded it whole over ZeroTier, a dropped download starting over (three
tries). embedded1's archive is 20 KB; a large FPGA's bitstream alone is tens
of megabytes, with reports and debug probes on top, and on a weak link such a
download may never finish.

## What it does

- The collect step cuts the results archive into parts of `BOT_API_CHUNK_KB`
  (default 8192, the same setting as the sources) on the builder and lists
  them in order; an archive under that size is its own single part, as before.
- Each part goes to the store with its own `upload-file` job
  (`<copy>-<job>-results.tar.gz.partNNN`) and comes back with its own
  download, retried on its own; the parts are joined here and unpacked.
- The stage prints `Results: part n of m` when there is more than one.

## Acceptance Criteria

- Under PowerShell the collect step cuts a 50 KB incompressible archive into
  16 KB parts whose join is the archive and unpacks to the same files; a small
  archive is one part, the archive itself.
- Through a bot answering with three parts the stage uploads, downloads and
  joins all three, in order, and the artifacts arrive.
- On the builder, with `BOT_API_CHUNK_KB=8`, a sim brings its results back in
  two parts and the bitstream is byte for byte the one built.
