---
id: RQ-0015
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-11T10:25:04.030Z"
branch: "factory/RQ-0015"
createdFromCommit: "d5cc544b09e8e5b17b05c4b3b1d8ec7acd7aab2e"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/9"
githubPullRequestIid: 9
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/8"
githubIssueIid: 8
repositoryProvider: github
---
# RQ-0015 - add hardware-twin workflow with probe firmware, board trace, and parity gate for Simics projects

Add a requirement kind, `hardware-twin`, for Simics projects in which the real
board is the oracle. Today a Simics requirement starts from a firmware image
somebody else built: the model is written to make that image run, and the
image's behaviour on hardware is assumed. The new kind inverts this. The
requirement first produces a small probe firmware that reports what it
observes, the probe is run on the real board and its output is recorded, and
only then is the model written, with the requirement complete when the same
probe produces the same output under Simics.

This is a framework feature, not a project convention. It must be usable by any
project scaffolded with the `simics` profile, with every machine-specific value
read from that project's `.env` and never from code defaults or committed
files.

## Workflow

A `hardware-twin` requirement moves through four phases, recorded in the
requirement's front matter as `twinPhase`:

1. **probe** - the handoff implementation writes `probes/<name>/main.c`,
   `probe.json` and any sources the template does not supply. `factory probe
   build <requirement-id>` compiles it on the licensed host, embeds the SHA-256
   of the committed probe sources into the image, and copies the resulting ELF
   to `probes/<name>/<name>.elf`. The ELF is committed: it is the exact image
   the board will run, and a rebuild may not reproduce it.
2. **board** - `factory probe board-run <requirement-id>` programs the ELF into
   the board, captures the serial output until the trace footer, validates the
   trace against the contract, and writes `probes/<name>/board-trace.txt`. When
   `BOARD_PROGRAM_COMMAND_JSON` or `BOARD_SERIAL_PORT` is empty the command
   runs in manual mode: it prints the ELF path and the expected trace header,
   then waits for the trace file to appear and validates it the same way. The
   trace is committed. Its header must carry the probe name and the source hash
   embedded in the ELF; a mismatch is rejected, not warned about.
3. **model** - the ordinary handoff implementation: DML devices, targets,
   profiles and host tests, exactly as a Simics requirement is implemented
   today.
4. **parity** - `factory probe simics-run <requirement-id>` runs the committed
   ELF on the licensed Simics host through the project's runner and captures
   the same trace; `factory probe compare <requirement-id>` diffs it against
   the board trace. Lines marked `volatile` in the trace are compared for
   presence only. A non-empty diff sets the run to `needs-fix` and the diff is
   the failure summary handed to the next fix iteration; the fix loop is bounded
   by the existing `pipeline.maxFixIterations`. The board trace is never
   regenerated inside the loop. If the probe itself must change, the source
   hash changes, the board trace no longer matches, and phase 2 must be
   repeated deliberately.

`handoff-finish` selects gates by phase: `probeBuild` in phase 1, `boardTrace`
in phase 2, the project's configured gates in phase 3, and `boardParity` in
addition to them in phase 4. `approve` requires phase 4 to have passed.

## Trace Contract

Board and Simics produce the same text, defined as a schema in
`@aifactory/contracts`:

```
PROBE v1 name=<slug> source=<first 16 hex of SHA-256 over probe sources>
<GROUP>.<REGISTER> @0x<8 hex> = 0x<8 hex>[ volatile]
...
PROBE_END lines=<count>
```

`lines` must equal the number of register lines. The comparison is a line diff
after normalising line endings; nothing else is interpreted. Register values
are what the probe reads, not what any document says they should be, so the
probe template must read every register into memory before it initialises the
UART, because initialising the UART changes reset and clock registers that a
probe is likely to be asked about.

## Scaffold and Configuration

- The `simics` profile ships `probes/_template/` with a linker script, a
  vector table and reset handler, a `probe.h` that provides deferred UART
  initialisation and the trace macros, and a `Makefile` that embeds the source
  hash. A new probe is created by copying the template; the LLM writes only the
  register list and any initialisation the target needs.
- `probes` is added to the profile's `targetProject.allowedPaths`.
- `.env.example` documents `SIMICS_REMOTE_HOST`, `SIMICS_REMOTE_USER`,
  `SIMICS_REMOTE_PORT`, `SIMICS_REMOTE_BASE_PATH`,
  `SIMICS_REMOTE_PROJECT_NAME`, `SIMICS_REMOTE_IDENTITY_FILE`,
  `SIMICS_REMOTE_TOOLCHAIN_BIN`, `BOARD_PROGRAM_COMMAND_JSON`,
  `BOARD_RESET_COMMAND_JSON`, `BOARD_SERIAL_PORT`, `BOARD_SERIAL_BAUD` and
  `BOARD_CAPTURE_TIMEOUT_MS`.
- The generated `scripts/sync-run.sh` and any other generated script take
  `SIMICS_REMOTE_*` from the environment and refuse to run with a message
  naming the missing variable. No host name, user, path or port may appear as
  a default in generated code. `BOARD_*` are the only values whose absence is
  not an error, because absence selects manual mode.
- The generated `AGENTS.md` describes the four phases, the manual board mode,
  and the rule that the board trace is authoritative over every document.
- `requirement new --kind hardware-twin` seeds the draft with a section per
  phase so the requirement author lists the registers to probe.

## Acceptance Criteria

- `requirement new --kind hardware-twin` creates a draft whose front matter
  records `kind: hardware-twin` and `twinPhase: probe`, and existing
  requirements without a kind keep today's behaviour unchanged.
- `@aifactory/contracts` exports a trace schema; a trace with a wrong line
  count, a malformed register line, a header whose source hash does not match
  the ELF, or a missing footer is rejected with a message that names the line.
- `factory probe build` compiles the probe on the licensed host, embeds the
  source hash, copies the ELF beside the sources, and the `probeBuild` gate
  fails when the hash embedded in the ELF differs from the hash of the
  committed sources.
- `factory probe board-run` supports automated mode driven by
  `BOARD_PROGRAM_COMMAND_JSON` and `BOARD_SERIAL_PORT`, and manual mode when
  either is empty; both validate the trace identically and record its SHA-256
  in the run manifest.
- `factory probe simics-run` runs the committed ELF through the project's
  Simics runner, and `factory probe compare` produces an empty diff for
  identical traces, a line diff otherwise, honours `volatile`, and sets the run
  to `needs-fix` with the diff as the failure summary.
- `handoff-finish` runs `probeBuild`, `boardTrace` and `boardParity` according
  to `twinPhase`, and `approve` refuses a `hardware-twin` run whose parity gate
  has not passed.
- The `simics` scaffold generates `probes/_template/`, the extended
  `.env.example`, the `AGENTS.md` section, `probes` in `allowedPaths`, and
  `probeBuild`/`probeSimicsRun` commands wired through the generated
  `simics-command.mjs`; the template runtime reads every register before it
  calls the board's UART initialisation and embeds the source marker. The
  probe commands are verified without a compiler or a board: a fixture build
  command that writes the marker, a fixture Simics run that writes a trace,
  and manual board mode fed a fixture trace.
- No generated script or framework source contains a host name, user name,
  remote path, port or serial port as a default; a missing `SIMICS_REMOTE_*`
  variable produces an error naming it.
- Unit tests cover the trace schema, the phase-to-gate selection, manual-mode
  trace acceptance and rejection, the parity diff including `volatile`, and
  the scaffold output; the existing test suite still passes.
