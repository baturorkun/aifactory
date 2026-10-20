---
id: RQ-0057
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T21:37:04.213Z"
branch: "factory/RQ-0057"
createdFromCommit: "b05d98bceefac0e8bf085fc0a159784d4e91b0f0"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/93"
githubPullRequestIid: 93
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/92"
githubIssueIid: 92
repositoryProvider: github
---
# RQ-0057 - Embedded build stages over the lab bot: VIVADO_ACCESS=bot runs Vivado, Vitis and xsdb on the builder through its bot agent, no SSH

The sim, build, xsa and sw stages, and the board phase's xsdb, run on the
Vivado host (the builder, 192.168.1.3) over SSH: the sources go by scp, a
PowerShell script runs the tool, the results come back by scp (RQ-0044).
That needs an account on the builder for every developer and their key in
Windows OpenSSH's `administrators_authorized_keys`, which `ssh-copy-id`
cannot write; the first developer to take the template could not get in.
The lab host no longer needs any of this (RQ-0055, RQ-0056: the bot). The
builder is the last host a developer logs in to.

The lab bot runs its Windows agent on the lab PCs and, now, on the builder
(`builder`): free-form PowerShell for the agents the bot allows it for, a
file store, and jobs that are polled. Its PowerShell runs are killed after
120 seconds, and a Vivado build takes longer than that.

## What it does

**`VIVADO_ACCESS=ssh|bot`.** `ssh` is the stages as they are, and the
default when the setting is empty, so existing projects and CI change
nothing. `bot` runs the same command, in the same project copy under
`VIVADO_REMOTE_BASE_PATH`/`VIVADO_REMOTE_PROJECT_NAME`, through the bot's
agent `VIVADO_BOT_AGENT` on the builder, with no login and no key:

1. The sources are archived as before and put into the bot's store.
2. A first short PowerShell step on the agent fetches the archive from the
   store, replaces the project copy's entries (never `out/`), makes the
   directories the stage asked for, and starts the command in the
   background in a job directory of its own (`.<project>-job-<id>` beside
   the project copy): its pid, its log, its exit code when it ends.
3. The stage follows it with short status steps every ten seconds, printing
   the log as it grows, until the command ends.
4. A collect step archives what the stage leaves (`pulls`) in the project
   copy; the agent's `upload-file` command puts the archive into the store;
   the stage downloads it and unpacks it into the project, as scp brought it
   back before. The job directory is removed; the command's exit code is the
   stage's, as before.

Ctrl-C and a CI cancel stop the command's process tree on the builder and
remove the job directory. The bot being out of reach for a while (a network
hiccup, a restart) is not the command's failure: the stage asks again for up
to three minutes, and a command it still loses sight of is left running
with its job directory, named in the message. The command runs as the agent
does (SYSTEM), in the project copy named for the developer, so two
developers never share one.

`VIVADO_REMOTE_USER`, `_PORT`, `_IDENTITY_FILE` and `_KNOWN_HOSTS` are
ignored in `bot` mode; `VIVADO_HOST_TYPE` must be `windows` (the agent is
one). The board phase's xsdb goes the same way, since it runs on the Vivado
host (RQ-0055).

**The agent's side.** The bot's Windows agent gets a built-in `upload-file
<path> <name>` command (the agent's own token, like its OpenOCD log upload)
and the builder is listed in `ApiFreeCommandAgents`; both are the bot's
(teams-chatbot), not this repository's.

**New projects.** The lab inventory names the bot's agent on the Vivado host
(`vivado.botAgent`); a project made from it gets `VIVADO_ACCESS=bot` and
`VIVADO_BOT_AGENT`, and `VIVADO_REMOTE_USER` stays for `ssh`. The
`.env.example`, README, the user guide and `AGENTS.md` describe the switch.
CI keeps `ssh` (the instance-level `VIVADO_*` variables).

## Not covered

- Removing the source and result archives from the bot's store after a run
  (the bot has no delete; the names are unique per run).
- A Linux Vivado host through the bot: the bot's agent is a Windows agent.
- Several commands of one stage in one job: each `runOnHost` is one job, as
  each was one SSH session.

## Acceptance Criteria

- `VIVADO_ACCESS` empty or `ssh` runs the stages exactly as before; any other
  value than `ssh` or `bot` is an error naming the setting; `bot` without
  `VIVADO_BOT_AGENT`, `VIVADO_REMOTE_BASE_PATH` or `VIVADO_REMOTE_PROJECT_NAME`,
  or with `VIVADO_HOST_TYPE=linux`, is an error naming the setting.
- With `VIVADO_ACCESS=bot` and `VIVADO_BOT_AGENT=builder`, from a machine
  with no account on the builder, `pnpm flow sim led_counter`, `pnpm flow
  build hello_ps`, `pnpm flow sw hello_ps` and `pnpm board hello_ps` run on
  the builder through the bot, print the tool's log as it grows, bring back
  `out/<design>/artifacts` (bitstream, XSA, ELF, reports) and the board's
  `board-run`, and leave no job directory on the builder.
- A command that fails on the builder fails the stage with its exit code and
  its log, as over SSH; Ctrl-C stops the command's process tree on the
  builder.
- No key, password or token of the developer is sent to the builder; the bot
  sees only its own token.
- A project made with `--board zedboard` gets `VIVADO_ACCESS=bot` and
  `VIVADO_BOT_AGENT=builder` from the inventory; the `.env.example`, README,
  the user guide and `AGENTS.md` describe both modes.
