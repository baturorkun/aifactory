---
id: RQ-0055
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T16:21:13.188Z"
branch: "factory/RQ-0055"
createdFromCommit: "489b987868fa949aa15af7cf3ecb3eec19279a99"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/89"
githubPullRequestIid: 89
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/88"
githubIssueIid: 88
repositoryProvider: github
---
# RQ-0055 - Embedded board phase over the lab bot: BOARD_ACCESS=bot, no SSH to the lab host

The board phase (RQ-0046) logs in to the lab host (192.168.1.2) as `root`:
it copies the bitstream and ELF there, runs xsdb there against the host's
hw_server, and reads the board's console from the serial device there. That
works for the lab admin and for CI, which hold root's key. It does not work
for a developer: nobody else gets a root key to the lab host, so a developer
cannot run `pnpm board` from their own machine at all. The renode and simics
templates never had this problem: their board stage goes through the lab
bot. The embedded template reused the SSH transport of the build stages
instead.

The SSH path also has a blind spot. The lab bot's portmap serves the same
console to people (`pm start lab com21`), and the stage opened the serial
device underneath it without knowing: a shared console, or a port that is
busy for a reason nobody is told.

RQ-0054 documented the switch; this requirement implements its board half.

## What it does

**`BOARD_ACCESS=ssh|bot`.** `ssh` is the stage as it is (RQ-0046), and the
default when the setting is empty, so existing projects and CI change
nothing. `bot` reaches the lab without logging in to the lab host:

1. **The console through the bot.** `BOARD_CONSOLE` names the console as the
   bot's `pm status` lists the board: device agent and COM port
   (`lab/COM21`). The stage asks the bot for the bridge,
   `pm start <agent> <COMx> owner=<project>/<user>` (the user is
   `BOARD_OWNER`, or the login name), and reads the console from the
   `BRIDGE host=<ip> port=<tcp>` the bot answers with, over plain TCP, from
   the machine the stage runs on. A console another owner holds, or one a
   person has open through portmap, stops the stage with the bot's answer
   naming them. The bridge is asked for before the board is powered; a
   board whose USB-UART is powered by the board itself (the ZedBoard's) has
   no serial device while it is off, so when the bot says so the board is
   powered first and the bridge asked for again (the `rst -system` xsdb
   begins with makes anything printed before it irrelevant). The bridge is
   closed again (`pm stop ... owner=`) when the stage ends, however it ends;
   Ctrl-C and a CI cancel (SIGINT, SIGTERM) close it too.
2. **JTAG from the Vivado host.** xsdb runs on the Vivado host (`XSDB_BIN`
   there, `C:\Xilinx\...\xsdb.bat` on the builder) and connects to
   `BOARD_HW_SERVER` over TCP; the hw_server is a network service, as
   verified from the builder on 19 October. The Vivado host is reached the way
   the build stages reach it (`VIVADO_ACCESS`; today ssh with the developer's
   own account, the bot's agent once that lands), so the board stage adds no
   login of its own. The same `load.tcl` as before, every target selected by
   the cable serial; its output is kept as `xsdb.log` by the script itself.
3. **Power through the bot,** as before: on when it is off, off again at the
   end only then.

The verdict, `result.json` (with `access`, `console` and `bridge` added),
`console.log` and `xsdb.log` are the same as in `ssh` mode; the console is
read for `timeout_s` after xsdb, or until every expected line has been seen
or a `fail_on` line appears.

**New projects.** A lab unit in `lab/inventory.json` names its console
(`console: lab/COM21`); a project made with `--board` gets
`BOARD_ACCESS=bot` and `BOARD_CONSOLE` from it, and the `.env.example`
describes both modes without the "arrives with RQ-0055" note. The CI jobs
keep their SSH settings (the instance-level `BOARD_REMOTE_*` variables) and
so keep running in `ssh` mode; a project that wants CI on the bot sets
`BOARD_ACCESS: bot` in its `.gitlab-ci.yml` variables.

**The agents are told.** `AGENTS.md` names the two modes and that a
developer runs the board through the bot, never with a key to the lab host.

## Not covered

- `VIVADO_ACCESS=bot`, the build stages and xsdb through the bot's agent on
  the Vivado host: RQ-0056, once that agent is installed.
- A reservation of the board as a whole (JTAG as well as the console): the
  bot's portmap knows the console's owner only.
- Closing a bridge left behind by a killed process from CI (`after_script`);
  the next run of the same owner takes it over, the bot's `pm status` shows
  it, and the lab admin can close it.

## Acceptance Criteria

- `BOARD_ACCESS` empty or `ssh` runs the board stage exactly as RQ-0046
  left it; any other value than `ssh` or `bot` is an error naming the
  setting.
- With `BOARD_ACCESS=bot`, `pnpm board hello_ps` from a machine with no key
  to the lab host opens the console bridge for `<project>/<user>`, powers the
  ZedBoard, programs it with xsdb on the Vivado host through the hw_server,
  sees `hello_ps: Hello from the Zynq PS` on the console, writes
  `result.json` with status `pass` and `access: bot`, closes the bridge and
  powers the board off; the bot's `pm status` shows no owner afterwards.
- A console another owner holds stops the stage with the bot's message,
  before the board is powered when its serial device is there; a missing
  `BOARD_CONSOLE`, `BOT_API_TOKEN` or `XSDB_BIN` is an error naming the
  setting.
- xsdb failing (no target on the cable, a load error) gives status `error`
  with the reason from `xsdb.log`; a missing expected line gives `timeout`,
  a `fail_on` line gives `fail`; in every case the bridge is closed and the
  board is switched off when the stage switched it on.
- A unit with `console` in the inventory gives a new `--board` project
  `BOARD_ACCESS=bot` and `BOARD_CONSOLE`; the `.env.example`, README, the
  user guide and `AGENTS.md` describe both modes.
