---
id: RQ-0054
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T14:09:57.716Z"
branch: "factory/RQ-0054"
createdFromCommit: "7ffa044bfae8537732152944031b4a0c59d3201b"
completedRunId: "20261019161456-RQ-0054"
completedBy: "Batur Orkun"
completedAt: "2026-10-19T16:16:16.609Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/87"
githubPullRequestIid: 87
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/86"
githubIssueIid: 86
repositoryProvider: github
---
# RQ-0054 - Embedded .env: the Vivado host user is the developer's own account, not the inventory's

The first developer given the embedded template (19 October) could not reach
either host. `factory new --board` fills `.env` from the lab inventory, and
the inventory's Vivado host user is `batur`: the developer's project tried
to log in to the build host as someone else. The lab host's user, `root`, is
the lab's policy and stays; but nothing told the developer where a key has
to go on each host (the Windows build host reads an administrator's keys
from `C:\ProgramData\ssh\administrators_authorized_keys`, not from
`~/.ssh/authorized_keys`, and `ssh-copy-id` cannot write there).

## What it does

- `.env` of a new embedded project takes `VIVADO_REMOTE_USER` from the
  developer's own login name on this machine, not from the inventory, with a
  comment to change it when the account on the host differs. The
  inventory's `vivado.user` is the CI account and stays the instance-level
  `VIVADO_REMOTE_USER` (`labWideCiValues`), so CI is unchanged.
- `.env.example`, the README and the embedded guide say where a developer's
  key goes: on the Windows build host into
  `administrators_authorized_keys` (an administrator) or the account's
  `.ssh/authorized_keys` (not one), added by hand or with one PowerShell
  line over a password login, since `ssh-copy-id` cannot; on the lab host
  into `root`'s `authorized_keys`, by the lab admin.
- `factory env-check` ends with the two logins to try
  (`ssh <user>@<vivado host>`, `ssh <user>@<lab host>`) when the hosts are
  set, so the first failure is explained before the first build.

## Acceptance Criteria

- A project made with `--board zedboard` by a user logged in as `kavci` has
  `VIVADO_REMOTE_USER=kavci`; the instance-level value from the inventory
  is still `batur`.
- `.env.example` and the README carry the key placement for both hosts.
- `factory env-check` in such a project prints the two host logins to try.
