---
id: RQ-0056
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T21:03:42.684Z"
branch: "factory/RQ-0056"
createdFromCommit: "32edc52d6a6ab77966c1030492215ae2cb5d4eba"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/91"
githubPullRequestIid: 91
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/90"
githubIssueIid: 90
repositoryProvider: github
---
---
# RQ-0056 - Embedded twin phase over the lab bot: TWIN_ACCESS=bot runs the twin on the lab host's Docker without SSH

The twin phase (RQ-0045) runs the twin image on this machine's Docker or, with
`TWIN_REMOTE_HOST`, on a Linux host's Docker over SSH, copying the ELF in and
the results out with `docker cp`. A developer without Docker on their PC has
the lab host (192.168.1.2) for that, and reaching it over SSH means a root
key: the key nobody but the lab admin and CI holds (RQ-0055 removed it from
the board phase). The lab bot now runs Docker and Renode jobs on the lab host
for whoever holds its token, each job owned by name and leaving its results
in the bot's store; the twin phase can go through that.

## What it does

**`TWIN_ACCESS=ssh|bot`.** `ssh` is the phase as it is (this machine's
Docker, or a host's over SSH) and the default when the setting is empty, so
existing projects and CI change nothing. `bot` runs the twin on the Linux
host the bot calls `TWIN_BOT_AGENT` (`lab`), with no login and no key:

1. The twin's release and image are found as before (the twin's GitLab API,
   `TWIN_GITLAB_TOKEN`); that token never leaves this machine.
2. The ELF is put into the bot's store under a name of its own
   (`PUT /api/agents/<agent>/files/<name>`).
3. A `docker-run` job owned as `<project>/<BOT_API_AGENT>` runs the twin
   image with its own contract, the ELF from `/in` and the results under
   `/out/run`, for `timeout_s` seconds (the job's own limit a minute past
   that, for the pull and the boot).
4. The stage asks the bot for the job until it ends, downloads the output
   archive (`out/run`, the job's `log`), and judges it as before: the twin's
   exit code is the job's, the summary is the last JSON line of the log, the
   console is `TWIN_CONSOLE` under `out/run`.

`result.json` is the same with `access`, `job` and `owner` added; the
image's version and revision labels are not read in `bot` mode (no `docker
inspect` through the bot). The job's log is kept as `job.log` beside it.

**The lab bot's API in one place.** `scripts/lab-bot.mjs` holds what the
board (RQ-0055) and twin phases share: the settings (`BOT_API_URL`,
`BOT_API_TOKEN`, `BOT_API_AGENT`), the owner `<project>/<BOT_API_AGENT>`,
commands, file upload, jobs and their output. The board phase uses it.

**New projects.** The lab inventory names the bot's id for the lab host
(`lab.botAgent`); a project made from it gets `TWIN_ACCESS=bot` and
`TWIN_BOT_AGENT`. The `.env.example`, README, the user guide and `AGENTS.md`
describe the switch. The CI twin job keeps the runner's own Docker.

## Not covered

- Registry login on the lab host: `docker-run` pulls with the host's own
  credentials, so a twin release the lab host has not pulled yet needs the
  lab admin to log the host in to the registry (a deploy token). In `ssh`
  mode the stage still logs in with `TWIN_GITLAB_TOKEN` per run.
- Removing the ELF from the bot's store after the run (the bot has no delete).
- `VIVADO_ACCESS=bot`, the build stages and xsdb through the bot's agent on
  the Vivado host: RQ-0057.
- Live inputs to the twin.

## Acceptance Criteria

- `TWIN_ACCESS` empty or `ssh` runs the twin phase exactly as RQ-0045 left
  it; any other value than `ssh` or `bot` is an error naming the setting.
- With `TWIN_ACCESS=bot`, `TWIN_BOT_AGENT=lab` and bfi-sw's release ELF,
  `pnpm flow twin` from a machine with no key to the lab host and no Docker
  of its own runs `hardware-twin/bfi-sumilator`'s latest release on the lab
  host through the bot, passes bfi-sw's check (`sysTimeMs` within
  1900..2000 after 2 s), writes `result.json` with status `pass`,
  `access: bot` and the job id, and the lab host is left with no container
  of the job.
- A summary value out of range gives `fail`; a job the bot ends with a
  non-zero exit code gives `error` with its reason; a missing
  `TWIN_BOT_AGENT`, `BOT_API_AGENT` or `BOT_API_TOKEN` is an error naming the
  setting.
- No token reaches the lab host or the bot in `bot` mode.
- A project made with `--board zedboard` gets `TWIN_ACCESS=bot` and
  `TWIN_BOT_AGENT=lab` from the inventory; the `.env.example`, README, the
  user guide and `AGENTS.md` describe both modes.
