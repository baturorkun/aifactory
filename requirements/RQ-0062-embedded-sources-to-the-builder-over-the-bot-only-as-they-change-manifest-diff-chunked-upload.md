---
id: RQ-0062
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T15:59:39.450Z"
branch: "factory/RQ-0062"
createdFromCommit: "8ed198c8a6781230f1b2e362867b3b11f0ff44d1"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/103"
githubPullRequestIid: 103
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/102"
githubIssueIid: 102
repositoryProvider: github
---
# RQ-0062 - Embedded: sources to the builder over the bot only as they change (manifest diff, chunked upload)

With `VIVADO_ACCESS=bot` every `sim`, `build` and `sw` packed the whole
project into one archive and sent it to the bot's store in a single upload,
over the developer's ZeroTier link. embedded1 is small; a real FPGA project
(IP sources, constraint sets, vendor libraries, test vectors) sends hundreds
of megabytes for a one-line change, and one dropped connection on that single
upload loses all of it.

## What it does

- The stage lists the project's sources with their size and SHA-256 (the
  files the archive took before: the same exclusions) and puts the list in
  the bot's store.
- A `diff` step on the builder compares the list with the project copy there:
  a file whose size and timestamp match what the last sync recorded keeps its
  recorded hash, others are hashed again (for at most a minute; past that
  they are sent). It answers with the files to send.
- Only those files go into the archive. An archive over 8 MB goes in parts
  (`BOT_API_CHUNK_KB`, default 8192), each part uploaded and retried on its
  own. Nothing changed: nothing is uploaded.
- A `sync` step joins the parts, removes from the copy what the project no
  longer has (under the synced top-level entries, and what the last sync
  brought), unpacks the archive and records the new list in
  `.aifactory-sync` in the copy. `out/` is kept, as before.
- The stage prints how much it sent: `Sources: 2 of 140 files changed
  (14 KB) sent` or `Sources: up to date on builder`.
- The ssh mode (CI, on the LAN) keeps sending the whole archive.
- The lab inventory, the `.env.example` text and a test comment still
  described `C:\ab` as a junction to `C:\Users\Batur\aifactory-builds`;
  it is a real directory now (a junction let Vivado's paths grow past 260
  characters again), and the example base path is `C:\ab`.

## Acceptance Criteria

- A second run with no change uploads no source archive; a change to one
  file sends only that file; a file deleted here is deleted on the builder;
  a file changed on the builder is sent again.
- An archive larger than `BOT_API_CHUNK_KB` arrives in parts and the builder
  joins them in order.
- The diff and sync steps run under real PowerShell against a project copy
  in a test (when `pwsh` is installed).
- No text describes `C:\ab` as a junction.
