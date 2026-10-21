---
id: RQ-0083
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T20:05:16.609Z"
branch: "factory/RQ-0083"
createdFromCommit: "154f16c73ee72c77ee7a46529d70fc7f3342abc6"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/145"
githubPullRequestIid: 145
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/144"
githubIssueIid: 144
repositoryProvider: github
---
# RQ-0083 - Builder prune removes IP cache entries unused for 30 days

Since RQ-0080 every copy on the lab builder shares Vivado's out-of-context
IP cache at `C:\ab\.ipc`, and nothing removes from it. On 21 October 2026
it held 20.8 MB after two builds; it grows with every new IP configuration,
in every project that builds there.

The layout, read on the builder: `.ipc\<x>\<y>\<cache-id>\` (a 16-hex
id), with the IP's checkpoint, netlists, stubs and a `stats.txt` that
Vivado rewrites on a hit; last access times are enabled there.

## What it does

- The builder prune (`flow.mjs prune`, on every push to the default branch)
  removes a cache entry whose files were neither written nor read for 30
  days, and the folders that leaves empty. An entry in use stays, whoever's
  project uses it; a removed one is synthesized and cached again the next
  time it is needed.
- Removed entries are listed with the other removals.

## Acceptance Criteria

- Under pwsh, against a stand-in base path: an entry unused for 45 days and
  one for 31 go, with the folders left empty; one written 45 days ago but
  read two days ago stays, as does one used this week; the existing prune
  cases are unchanged.
