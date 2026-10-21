---
id: RQ-0073
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T12:45:08.833Z"
branch: "factory/RQ-0073"
createdFromCommit: "6ad48f971fe5a64ea261a42c61bd8650b4e5f51e"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/125"
githubPullRequestIid: 125
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/124"
githubIssueIid: 124
repositoryProvider: github
---
# RQ-0073 - Template update and the factory launcher on Windows: no .cmd spawned without a shell (the check by node, tsx by node)

On Kaan's Windows PC `template update` in embedded1 stopped with "pnpm
check fails with the new template; nothing was pushed" (21 October 2026),
though the project's check passes. The update started the check with
`spawnSync('pnpm', ['-s', 'check'])`: on Windows pnpm is `pnpm.cmd`, which
Node does not start without a shell, so the check never ran and its missing
exit code read as a failure. The launcher `bin/factory.js` (behind the
project's `pnpm factory` script) starts `node_modules/.bin/tsx.cmd` the same
way; Kaan had called tsx by hand instead.

## What it does

- The update's check runs the project's `scripts/flow.mjs check` with this
  Node (what `pnpm check` runs), no pnpm involved. A check that cannot start
  says so; one that fails gives its exit code.
- `bin/factory.js` runs tsx's own script (`node_modules/tsx/dist/cli.mjs`)
  with this Node instead of the `.bin` shim.
- `pnpm install` after aifactory's lockfile moved goes through the shell on
  Windows, and a start failure is named.
- The security gate flags `require('child_process')` in any changed file and
  had no way to accept a launcher that needs it. A file may now say a finding
  is intended: a comment `security-reviewed: <id> — <reason>` (ids `eval`,
  `new-function`, `child-process`, `sql-template`, `env-assignment`). The
  finding then does not fail the gate and stays in its report with the
  reason; a marker without a reason, or for another id, reviews nothing.
  `bin/factory.js` carries one for `child-process`.

## Acceptance Criteria

- The check passes on a template project, fails with its exit code when the
  design check fails, and names a missing `scripts/flow.mjs`.
- `node bin/factory.js --help` works, and the launcher starts no `.cmd` and no
  `.bin` shim.
- A reviewed security finding passes the gate and is listed with its reason;
  an unreviewed one, one without a reason, or one reviewed for another id
  fails.
