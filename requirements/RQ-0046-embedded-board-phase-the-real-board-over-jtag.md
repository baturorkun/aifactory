---
id: RQ-0046
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-17T20:33:24.343Z"
branch: "factory/RQ-0046"
createdFromCommit: "c37ad6adb7691cd6868a5c0af7e453e2f72260ac"
completedRunId: "20261017203406-RQ-0046"
completedBy: "Batur Orkun"
completedAt: "2026-10-17T20:54:57.009Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/71"
githubPullRequestIid: 71
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/70"
githubIssueIid: 70
repositoryProvider: github
---
# RQ-0046 - Embedded board phase: the real board over JTAG

An embedded requirement can be built (RQ-0044) and run on its hardware twin
(RQ-0045), but never on the board itself. The twin cannot show cache
maintenance, real timing and CDC, level shifters or the PL reset; the board
can. The team uses the board now and then rather than on every change: when a
requirement needs it, on demand, and every night.

A trial on 17 October did it by hand: the lab bot switched on the PDU outlet
named "Zedboard - 1"; the board's JTAG cable (Digilent `210248B849E0`,
xc7z020 IDCODE 0x23727093) appeared on the lab host's hw_server and its
USB-UART as `/dev/ttyACM0`; xsdb ran the sequence of the team's
`run_jtag.tcl` (`rst -system`, `fpga`, `ps7_init` from the XSA,
`ps7_post_config`, `dow`, `con`); the console printed
`hello_ps: Hello from the Zynq PS`, the line the twin expects; the outlet was
switched off again.

## What it does

**A `board` phase.** The phases become `spec → sim → build → twin → board`,
the gate `boardTest`. A requirement chooses it like the others; it is not in
a new project's default (the board is used now and then), and the checkbox
list offers it unticked.

**`pnpm flow board [design]`.** For a design with software and a
`test.yaml`, from the bitstream, XSA and ELF the build left in
`out/<design>/artifacts/`:

1. Power: when `BOARD_POWER_NAME` and the bot (`BOT_API_URL`,
   `BOT_API_TOKEN`) are set, the outlet with that name is found in the bot's
   power status and switched on if it is off; the stage switches it off again
   at the end only when it switched it on, so the lab is left as it was.
2. On the lab host (`BOARD_REMOTE_*`, the SSH transport of the other hosts;
   empty runs here) it starts reading the console (`BOARD_SERIAL_PORT`,
   `BOARD_SERIAL_BAUD`), then programs the board with xsdb (`XSDB_BIN`)
   through `BOARD_HW_SERVER`, selecting the targets by the cable's serial
   (`BOARD_JTAG_CABLE`) so another board on the same hw_server is never
   touched: `rst -system`, `fpga` the bitstream, the processor init from the
   XSA (`ps7_init.tcl` for Zynq-7000), its post-config, `dow` the ELF, `con`.
   Only JTAG, which a power cycle clears; flash is never written.
3. It reads the console for `timeout_s`, judges it with the design's
   `test.yaml` (`expect`, `fail_on`; summary checks are the twin's), and
   writes `out/<design>/artifacts/board/result.json` in the twin's schema
   (`target: board`, status, matched and missing lines, the bitstream's and
   ELF's SHA-256, the cable, the host, the duration) with the console log and
   the xsdb log beside it.

A board whose processor type the stage does not know yet stops with a message
naming it, rather than guessing an init sequence.

**When it runs.** In the IDE, when the requirement names the phase or
`handoff-finish --phases board` asks for it. In CI an `embedded_board` job,
one at a time for the lab (`resource_group`): on a requirement branch when
the requirement names the phase; on a schedule (nightly) on the default
branch; and by hand on any merge request or on the default branch.

**The agents are told.** `AGENTS.md` says that naming the `board` phase in a
requirement is the requirement author's consent to power and program the
board over JTAG, that nothing else powers or programs it, that flash is never
written, and that the twin and the board differing on the same ELF points at
a twin limit (cache, timing, PL reset) or a missing twin model, to be raised
with the twin project.

## Not covered

- Writing flash (QSPI, SD, eNVM), and boot from flash.
- Boards other than Zynq-7000 (Zynq UltraScale+ `psu_init`, MicroBlaze,
  Intel, Microchip programmers): each is a requirement of its own.
- Reservation of a board between people beyond the CI resource group, and
  port forwarding of the debug servers to a developer's PC.
- A comparison report of twin and board results beyond their common schema.

## Acceptance Criteria

- The phases are `spec, sim, build, twin, board`; `--phases` and the checkbox
  list offer `board`, unticked by default; a new project's default does not
  include it.
- With the lab settings of `.env` (bot, power name, hw_server, cable, serial
  port, the lab host), `pnpm flow board hello_ps` switches the ZedBoard on,
  programs it over JTAG, sees `hello_ps: Hello from the Zynq PS` on the
  console, writes `result.json` with status `pass`, and switches the board
  off; a board that was already on is left on.
- A line in `expect` that never appears gives `timeout`, a `fail_on` line
  gives `fail`, both exit non-zero and keep the console and xsdb logs; the
  board is switched off in every case it was switched on.
- The xsdb script selects every target by the cable serial, and a wrong or
  missing cable, hw_server or serial port is an error that names the setting.
- The `boardTest` gate runs `pnpm board` after `twin` and is skipped, with the
  reason, when the requirement does not name the phase or an earlier phase
  failed.
- The generated `.gitlab-ci.yml` has `embedded_board` as described, with the
  result as an artifact.
- The README and `AGENTS.md` describe the board phase, its settings and its
  rules.
