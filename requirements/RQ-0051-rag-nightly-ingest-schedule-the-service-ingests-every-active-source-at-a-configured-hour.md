---
id: RQ-0051
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T09:20:32.612Z"
branch: "factory/RQ-0051"
createdFromCommit: "ade92f9b4adfc8f03d7749eb4175ab412bccb671"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/81"
githubPullRequestIid: 81
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/80"
githubIssueIid: 80
repositoryProvider: github
---
# RQ-0051 - RAG nightly ingest schedule: the service ingests every active source at a configured hour

Repository sources stay current through GitLab webhooks (RQ-0028), but a
folder source on the file server (simics, renode, do178c, ecu-csw, the
aselsan-bfi folder) is read only when someone runs `factory rag ingest` by
hand: the last sweep was 16 October, and a document put on the file server
since then is not in RAG. Batur asked (19 October) for a nightly ingest, as
code in the service rather than a cron job on the host, so it travels with a
deploy and is visible in the runs.

## What it does

- `rag.ingest.schedule` ("HH:MM", from `RAG_INGEST_SCHEDULE`) names the hour
  of a daily ingest of every active source; `rag.ingest.scheduleTimezone`
  (an IANA name such as `Europe/Istanbul`, from
  `RAG_INGEST_SCHEDULE_TIMEZONE`) says whose clock, the host's local time
  when empty. Empty `schedule` (the default) keeps today's behaviour.
- The RAG API service (`aifactory-rag.service`) runs it: a thread started
  with the service sleeps until the next occurrence and then triggers every
  enabled source through the webhook ingest queue, one after another in the
  configured order, so a source already being ingested folds into one more
  run. Passive sources are left alone. The runs record
  `started_by = "schedule HH:MM <zone>"`.
- `/runtime-info` reports the schedule and the next run, so the status page
  and an operator can see it.
- `.env.example` and the README describe the two settings.

## Acceptance Criteria

- `next_run` gives the next occurrence of the hour in the given zone: later
  today when the hour is ahead, tomorrow when it has passed, across a DST
  change without drifting.
- With a schedule, the service starts the thread and, when the hour comes,
  every enabled source is triggered once with `schedule` as who started it;
  a passive source is not.
- Without a schedule nothing is started and `/runtime-info` says so.
- RAG tests pass; deployed with `RAG_INGEST_SCHEDULE=02:00` and
  `RAG_INGEST_SCHEDULE_TIMEZONE=Europe/Istanbul`, `/runtime-info` names the
  next run.
