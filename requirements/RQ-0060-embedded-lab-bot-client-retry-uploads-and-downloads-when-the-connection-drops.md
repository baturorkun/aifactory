---
id: RQ-0060
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T09:57:17.459Z"
branch: "factory/RQ-0060"
createdFromCommit: "afdc44f1e55cd6544517b884189a12bf03b2bd53"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/99"
githubPullRequestIid: 99
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/98"
githubIssueIid: 98
repositoryProvider: github
---
# RQ-0060 - Embedded lab bot client: retry uploads and downloads when the connection drops

A developer on ZeroTier got `cannot reach the lab bot for the upload of
...-src.tar.gz: ECONNRESET` on every build: the upload of the 64 KB source
archive was cut on the way, while the small requests went through. The lab's
ZeroTier gateway lacked MSS clamping (fixed on the gateway the same day), but
a link like that drops now and then anyway, and one drop ended the stage.

## What it does

`scripts/lab-bot.mjs` sends a request again, up to three more times five
seconds apart (`BOT_API_RETRY_MS`), when the connection drops before an
answer, for the requests that may be sent again unchanged:

- uploading a file to the bot's store (the same name, the same bytes);
- downloading a job's output (the body read inside the retry, so a drop
  halfway through counts);
- asking the bot for a job's state.

A request that starts something (a job, a PowerShell step, a bot command) is
never sent twice: a drop there is an error, as before, so no build or board
run starts twice. Each retry says what dropped and why; the last error names
the cause and the number of tries. The upload's message carries the
archive's size.

## Acceptance Criteria

- An upload or download whose connection drops twice succeeds on the third
  try and delivers the whole file.
- A job start whose connection drops is not sent again.
- A link that stays down ends after four tries with the cause in the message.
