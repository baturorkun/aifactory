---
id: RQ-0058
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T09:25:54.911Z"
branch: "factory/RQ-0058"
createdFromCommit: "5d47a219deb306daa7f0485b54b49d00501cce01"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/95"
githubPullRequestIid: 95
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/94"
githubIssueIid: 94
repositoryProvider: github
---
# RQ-0058 - Embedded .env: the person's name once, BOT_API_AGENT; the Vivado account and the host project copies follow from it

A developer's `.env` named them four times: `BOT_API_AGENT` (the bot), and
`VIVADO_REMOTE_USER`, `VIVADO_REMOTE_PROJECT_NAME`, `BOARD_REMOTE_PROJECT_NAME`
and `TWIN_REMOTE_PROJECT_NAME` (`<project>-<name>`), the last four filled
from the creator's git name and login when the project was made. Handing the
file to the next developer meant finding and changing all of them; the first
one to take embedded1 changed some and not others.

## What it does

**One line names the person: `BOT_API_AGENT`.** It is set by hand, like the
bot's own agent installer asks, and the scripts take the rest from it:

- `VIVADO_REMOTE_USER` empty → `BOT_API_AGENT` (the Vivado host's account is
  the person's own; the lab host's stays the lab's, `root`).
- `VIVADO_REMOTE_PROJECT_NAME`, `BOARD_REMOTE_PROJECT_NAME`,
  `TWIN_REMOTE_PROJECT_NAME` empty → `<project>-<BOT_API_AGENT>`, the project
  being the project directory's name.
- A line that is set still wins, and CI sets its own project names and
  account as before.

A missing account or project name in `ssh` mode names `BOT_API_AGENT` as the
line to set.

**New projects.** `factory new --board` no longer writes the creator's name
anywhere: those lines stay empty. The `.env.example` puts the lab bot and
`BOT_API_AGENT` first, as the one line that names you, and says for each
derived line what an empty value means. `factory env-check` shows the
Vivado login with `BOT_API_AGENT` when the account line is empty.

## Not covered

- Renaming copies a host already keeps under another name: an existing
  `.env` that sets the lines keeps using them.

## Acceptance Criteria

- With only `BOT_API_AGENT=kaan` set, the Vivado host's account is `kaan` and
  the host copies are `<project>-kaan`; the lab host's account stays as set.
- A set `VIVADO_REMOTE_USER` or `*_REMOTE_PROJECT_NAME` wins over the derived
  value.
- A project made with `--board zedboard` has no person's name in `.env`;
  `BOT_API_AGENT` comes before the host sections in `.env.example`.
- `ssh` mode without the account and `BOT_API_AGENT` fails naming both.
