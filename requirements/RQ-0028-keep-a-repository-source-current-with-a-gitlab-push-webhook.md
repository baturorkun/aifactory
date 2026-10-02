---
id: RQ-0028
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-02T07:42:22.706Z"
branch: "factory/RQ-0028"
createdFromCommit: "0bf9c044f5848f9d84e424b8ea99db9e4a3faca8"
completedRunId: "20261002074301-RQ-0028"
completedBy: "Batur Orkun"
completedAt: "2026-10-02T09:11:47.856Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/35"
githubPullRequestIid: 35
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/34"
githubIssueIid: 34
repositoryProvider: github
---
# RQ-0028 - Keep a repository source current with a GitLab push webhook

The RAG is the first thing aifactory's agents consult while they implement a
requirement, so a repository source has to show the code they build on, not
the last release. `aselsan-bfi` now follows `aselsan/bfi-sw`'s integration
branch (`RAG_SOURCE_3_REPO_1_REF=project-initialization`), but an ingest only
runs when someone starts it, so the corpus falls behind every push.

## What it does

**A GitLab push webhook starts the ingest.** `POST /webhooks/gitlab` accepts
GitLab's push and tag-push events. It finds the repository entries whose URL
names the event's project, and starts an ingest of their sources when the
push is to the ref the entry follows: its branch, or the default branch when
no `REF` is set; a tag push for an entry on `@last-release` or `@last-tag`. A
push to any other branch is acknowledged and ignored.

**Each entry has its own secret.** GitLab sends the webhook's secret token in
`X-Gitlab-Token`; it is compared, in constant time, with the entry's
`RAG_SOURCE_N_REPO_K_WEBHOOK_SECRET`. No secret configured, or a different
one, is refused with 401 and starts nothing. The API answers on the whole
network (`RAG_API_BIND=0.0.0.0`) without authentication today, which is why
the secret is checked here and never optional.

**The webhook returns at once and ingests in the background.** GitLab waits a
few seconds for a webhook, an ingest takes longer, so the endpoint queues the
source and answers 202. One ingest per source runs at a time; pushes that
arrive while it runs are folded into a single follow-up run, so a burst of
pushes costs at most two ingests. Each run is the ordinary incremental
ingest: changed files only, the commit's SCIP index from its pipeline when it
has one, and a new Joern graph for a data-flow source.

**A successful pipeline starts one more ingest.** The push's ingest runs
before the commit's pipeline has produced its SCIP index (RQ-0027), or for a
tag before the release package is uploaded. A pipeline event with status
`success` on the followed branch (or a tag pipeline, for a release selector)
queues another ingest of the source; its files are unchanged by then and
skipped, and it applies the index.

**Setting it up.** In the GitLab project: Settings > Webhooks, URL
`http://<rag-host>:8765/webhooks/gitlab`, the secret token, push events (and
tag push events for a release selector). GitLab refuses webhooks to private
addresses unless its administrator allows requests to the local network.

## Acceptance Criteria

- A push event with the right secret, to the branch an entry follows, starts
  one ingest of that entry's source and answers 202.
- A push to another branch, or for a project no entry names, answers 200 and
  starts nothing.
- A missing or wrong `X-Gitlab-Token`, or an entry without a secret, answers
  401 and starts nothing; the secret never appears in a response or log.
- Several pushes while an ingest runs lead to one follow-up ingest, not one
  per push; two sources ingest independently.
- A tag push starts the ingest of an entry on `@last-release`/`@last-tag` and
  is ignored by an entry that follows a branch.
- A successful pipeline on the followed branch starts an ingest that applies
  the commit's SCIP index; a failed or running pipeline, or one on another
  branch, starts nothing.
- The run is recorded like any ingest (`rag_ingest_runs`), and its outcome is
  visible through `GET /ingest-runs/{id}` or the service log.
