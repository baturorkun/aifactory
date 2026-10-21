---
id: RQ-0075
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T13:02:51.781Z"
branch: "factory/RQ-0075"
createdFromCommit: "679528234692b0a6793e26bd0ed6588cc90a9808"
completedRunId: "20261021131059-RQ-0075"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T13:31:50.342Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/129"
githubPullRequestIid: 129
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/128"
githubIssueIid: 128
repositoryProvider: github
---
# RQ-0075 - Template update: line endings compared normalized (Windows CRLF), nothing to commit is current, the Coding Standard section kept

Kaan ran `pnpm factory -- template update` in embedded1 on Windows (21
October 2026). Git there has `core.autocrlf=true`: files are LF in the
repository and the template, CRLF in his checkout. The update compared them
byte for byte, listed three unchanged files as changed, wrote them, and Git,
normalising, found nothing to commit: the command failed. Kaan's agent
proposed a `.gitattributes` in the template. The same day the update, run in
embedded1 after `standard use`, replaced AGENTS.md with the template's and
dropped its Coding Standard section.

## What it does

- Text files are compared with CRLF taken as LF; a file with a NUL byte is
  compared as bytes.
- The embedded template brings `.gitattributes`: `* text=auto eol=lf`, `.bat`
  and `.cmd` CRLF. Every checkout is LF, Windows too; Vivado, Tcl and shell
  scripts want LF. A project takes it with the next update.
- Written and staged, but no change in Git's eyes: the update says the
  project is current, pushes nothing, opens nothing.
- The Coding Standard section of AGENTS.md is always the last one, written by
  one function for `factory new --standard`, `standard use` and the update,
  which keeps a project's section.

## Acceptance Criteria

- A project checked out with CRLF (core.autocrlf true) shows only
  `.gitattributes` as a change, and once it is merged a checkout is LF.
- A project with a standard: the update lists no AGENTS.md change, and after
  writing the section is there.
