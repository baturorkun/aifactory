---
id: RQ-0026
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-30T20:26:26.750Z"
branch: "factory/RQ-0026"
createdFromCommit: "82e392062131ab0d40568d60b0dddb3a76884c0d"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/31"
githubPullRequestIid: 31
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/30"
githubIssueIid: 30
repositoryProvider: github
---
# RQ-0026 - Let a repository REF follow the last release or the last version tag

RQ-0023 lets a repository entry name the ref it is ingested at
(`RAG_SOURCE_N_REPO_K_REF`), but only by a fixed branch or tag name. A fixed
name goes stale: `aselsan/bfi-sw` keeps `main` as a one-file initial commit,
does its work on branches and publishes GitLab Releases (1.0.0, 1.0.1, 1.1.0),
so the corpus should follow the newest release, and a fixed `1.1.0` would have
to be edited in `.env` at every release.

## What it does

**Two selectors for `REF`, resolved at every ingest.**

* `@last-release` — the tag of the repository's newest GitLab Release by
  release date, upcoming (future-dated) releases ignored. It reads the
  Releases API, so the entry's token needs `read_api` as well as
  `read_repository`.
* `@last-tag` — the tag with the highest version number (`1.10.0` above
  `1.9.2`, a leading `v` ignored, tags that are not version numbers skipped),
  read from git alone, for repositories that tag releases without creating
  GitLab Releases.

Any other value is a branch or tag name as today, and an empty `REF` is still
the default branch. The `@` prefix is used because `.env` is sourced by a
shell on the RAG host: `<...>` would be read as a redirection and leave the
value silently empty.

**The resolved name is what is recorded and cited.** The ingest report shows
the selector and what it resolved to (`@last-release -> 1.1.0 (d5dc028)`), and
the chunk metadata, the stored input state and citations carry the real tag,
never the selector. When a newer release appears the next ingest moves to it
and, as for any new commit, processes only the files whose content changed and
retires the files the release no longer has.

**Nothing falls back silently.** An unknown selector (`@latest`) fails
configuration loading, naming the variable and the accepted selectors. A
repository with no release (or no version tag) fails that entry with a message
naming the `REF` variable, and does not stop the other inputs; it does not
fall back to the default branch.

## Acceptance Criteria

- `REF=@last-release` ingests the tag of the newest non-upcoming GitLab
  Release; the report shows the selector, the tag and the commit.
- `REF=@last-tag` ingests the highest version tag, comparing versions
  numerically and ignoring tags that are not versions.
- Chunk metadata, the recorded input state and citations name the tag, not
  the selector.
- After a newer release is published, the next ingest moves to it and
  processes only changed files; files removed in the release are retired.
- An unknown `@` selector fails configuration loading with the variable name
  and the accepted selectors.
- A repository without a release, or without a version tag, fails its entry
  with the `REF` variable named and the other inputs still ingest.
- A token without `read_api` fails `@last-release` with a message saying the
  scope is needed.
- Branch names, tag names and an empty `REF` behave as before.
