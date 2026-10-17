---
id: RQ-0047
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-17T21:11:11.890Z"
branch: "factory/RQ-0047"
createdFromCommit: "88e6cf7c2e80942c57ea482b0568be30cbc3d41d"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/73"
githubPullRequestIid: 73
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/72"
githubIssueIid: 72
repositoryProvider: github
---
# RQ-0047 - Embedded projects start configured: lab inventory, platform, template update, CI variables

The first real embedded project, `agentic/embedded1` on gitlab.bc.int, was
made from the template on 17 October and went through spec, sim, build and
board (on the ZedBoard in the lab). Getting it there took work by hand that
every next project would repeat:

- Every machine and lab value was found and typed into its `.env`: the
  Vivado host (192.168.1.3, the Vivado and Vitis paths), the lab host
  (192.168.1.2, xsdb), the ZedBoard's PDU label, JTAG cable serial and console
  device, the hw_server, the bot's URL.
- `requirement new` stopped with "Multiple repository platforms are
  configured" because a `GITHUB_TOKEN` was in the shell, and needed
  `--platform gitlab`; `requirement submit` takes no `--platform` at all.
- The project predated the twin and board phases (RQ-0045, RQ-0046); bringing
  it up to the template meant generating a fresh project and copying the
  template-owned files across by hand.
- The non-secret host settings were written into the project's CI/CD
  variables one by one through the API.

What is parametric belongs in one place in aifactory, and what is logic in
the factory, so that a new project starts configured and an old one can be
brought up to date.

## What it does

**A lab inventory.** `lab/inventory.json` in aifactory describes the lab once:
the Vivado host (address, user, host type, base path, the Vivado and Vitis
paths and version), the lab host the boards hang on (address, user, xsdb, the
hw_server), the Docker host for twins, the bot's URL, and one entry per board
unit: its board file, PDU label, JTAG cable serial, console device and baud.
It holds no token, password or key. The ZedBoard is its first unit; the
Genesys ZU-5EV, Nexys Video and DE10-Nano outlets the bot reports are listed
as known but not yet configured.

**`factory new <name> --template embedded --board <unit>`** writes the
project's `.env` from the inventory: every host and board setting filled, the
host project names per person (`<project>-<git user>`), the tokens
(`TWIN_GITLAB_TOKEN`, `BOT_API_TOKEN`, `GITLAB_TOKEN`) left empty for
`env-check` to name. Without `--board` the board settings stay empty. A unit
whose board file the template does not have is refused with the list of the
ones it has.

**The repository platform from the remote.** When both GitLab and GitHub
settings are complete, `requirement new` and every later command take the one
whose host is the project's `origin` remote instead of stopping; `--platform`
still wins. When the remote matches neither, the message says so.
(`requirement submit` resolves no platform, so it needs no `--platform`.)

**`factory template update`** brings an embedded project's template-owned
files (the scripts, `common/`, the flow wrappers, the CI file, `AGENTS.md`'s
generated sections, `.env.example`, the gates and default phases in
`factory.config.json`, the package scripts, the new files of designs the
template ships such as `test.yaml`) to the template of this aifactory. It
lists what changes, writes only with `--write`, and never touches a design's
sources, a board file the project edited, `.env`, requirements or runs.

**`factory ci-variables`** writes the host and board settings of `.env`
(`VIVADO_*`, `TWIN_*`, `BOARD_*`, `XSDB_BIN`, `BOT_API_URL`) into the
project's GitLab CI/CD variables, creating or updating each; tokens are
written only when `--with-secrets` names them, then masked. It lists what it
would write unless `--write` is given. Enabling a runner for the project
needs a maintainer of the runner's projects, which a project token is not;
the README says to do it in the GitLab UI.

## Not covered

- Board files for units other than the ZedBoard (each its own requirement,
  with its processor's JTAG sequence).
- Rotating or storing tokens; registering runners.
- Updating templates other than `embedded`.

## Acceptance Criteria

- `lab/inventory.json` holds the Vivado host, the lab host, the Docker host,
  the bot URL and the ZedBoard unit with the values found on 17 October, and
  no secret; a test fails if a value looks like a token.
- `factory new x --template embedded --board zedboard` writes a `.env` whose
  host and board settings equal the inventory's, with per-person host project
  names and empty tokens; `env-check` lists the empty tokens; an unknown unit
  is refused with the known ones.
- With complete GitLab and GitHub settings and an `origin` on the GitLab host,
  `requirement new` picks GitLab without `--platform`, and GitHub with an
  `origin` on github.com; a remote on neither host keeps the error.
- `factory template update` on a project made before the twin and board
  phases lists `scripts/twin.mjs`, `scripts/board.mjs`, `test.yaml`, the gates
  and the CI file, writes them with `--write` (after which the project equals
  a fresh one on those files), and leaves design sources, `.env` and
  requirements untouched.
- `factory ci-variables` lists the variables it would write; with `--write` it
  creates or updates them on a GitLab project, and writes a token only with
  `--with-secrets`, masked.
- The README describes the inventory, `--board`, `template update`,
  `ci-variables` and the runner step done by hand.
