---
id: RQ-0069
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T21:11:04.389Z"
branch: "factory/RQ-0069"
createdFromCommit: "b4bf9607e0abd62e687abf60264aa3446196c055"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/117"
githubPullRequestIid: 117
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/116"
githubIssueIid: 116
repositoryProvider: github
---
# RQ-0069 - Template update brings aifactory up to date first and always delivers as a merge request, only from a clean, current main

On 20 October embedded1 took the template three times (RQ-0005, RQ-0006,
RQ-0007), each by hand: pull aifactory, `template update --write` (files left
in the worktree), a requirement, gates, commit, push, merge request. Three or
four embedded projects are coming. The update must stay the project's to ask
for: aifactory keeps no list of projects (no state), and the project the
command runs in is the one updated.

## What it does

- `factory template update` still lists the changes. `--write` now delivers
  them as a merge request, from the project's directory:
  1. aifactory brings itself up to date: its checkout must be on main and
     clean; it is fast-forwarded to origin/main, and `pnpm install` runs when
     `pnpm-lock.yaml` moved. When anything moved the command runs again in a
     new process, since the code that writes the template is the code pulled.
  2. The project must be on its main (the platform's target branch), clean,
     and not ahead of origin; behind is fast-forwarded. Otherwise nothing is
     touched and the message says what to do.
  3. No change: nothing more ("on the current embedded template"). A branch
     `template/*` on origin (an open template update): stops, naming it.
  4. A branch `template/aifactory-<commit>` gets the changes, `pnpm check`
     runs on it, the commit (`chore(template): …`, with the list) is pushed
     and a merge request opened (ready, not draft) with the list and the
     aifactory commit. A failing check pushes nothing.
  5. The project is left on main, clean; the local branch is removed.
- `--local` writes the changes into the worktree only (the old `--write`).
- README and the user guide (v0.69) describe it.

## Acceptance Criteria

- Against a project with a bare origin and one template file made old, the
  merge request is opened from `template/aifactory-<commit>` with that change,
  the branch on origin has the template's file, origin/main is untouched and
  the project is back on a clean main; a second run while it is open stops.
- Uncommitted changes, another branch or a main ahead of origin stop it with
  their message and no merge request; a main behind origin is fast-forwarded
  and delivered.
- A current project gets no branch; a failing check pushes nothing.
- aifactory is fast-forwarded from a clean main and says so; on another branch
  or with uncommitted changes it stops.
