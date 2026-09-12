---
id: RQ-0016
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-12T13:32:00.000Z"
branch: "factory/RQ-0016"
createdFromCommit: "b32b638"
completedRunId: "20260912170952-RQ-0016"
completedBy: "Batur Orkun"
completedAt: "2026-09-12T17:40:44.676Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/11"
githubPullRequestIid: 11
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/10"
githubIssueIid: 10
repositoryProvider: github
---
# RQ-0016 - generate the hardware-twin runner scripts and board-verified model rules in the simics scaffold

RQ-0015 gave the `hardware-twin` kind its contract: the phases, the trace
format, the gates, the probe template, the environment variables. Running it
for the first time in `aselsan-bfi` (RQ-0009, merged) showed that the contract
is not enough to work with. That project had to hand-write about 770 lines of
transport and runner code before a single probe could reach a board, and had
to invent three modelling rules that nothing records. A second Simics project
would repeat both.

This requirement moves what is generic into the `simics` scaffold, and writes
down what is a rule rather than code. Nothing in `aselsan-bfi` changes; it
keeps the versions it has, which are verified against a real licensed host and
a real board.

## Topology

A Simics installation is either on this machine or on another one reached over
SSH. Both are Windows: Linux hosts are out of scope, and the generated runner
scripts stay PowerShell.

`SIMICS_REMOTE_HOST` decides, and nothing else:

- **empty** - the command runs here. `--pull` copies a file out of the project
  instead of fetching it.
- **set** - today's behaviour: archive the source, copy it over, run the
  command in the synchronised project, fetch what `--pull` names.

The generated `scripts/sync-run.mjs` reads `SIMICS_REMOTE_*` itself, from the
environment and from `.env`. The `scripts/sync-run.sh` wrapper that assembles
those flags today is removed: it adds a Bash dependency a Windows host need
not have, and it exists only to read variables the Node script can read.
Missing values stay an error that names the variable; only
`SIMICS_REMOTE_HOST` may be empty, and emptiness selects local.

## Generated Scripts

The `simics` template gains these, taken from `aselsan-bfi` where they are
already free of any machine name:

- `scripts/sync-run.mjs` - the transport above, with `--push-input` and
  `--pull`, the gzip bootstrap that keeps the remote command under the
  Windows command-line limit, and the exclusions that keep `references/`,
  `build/` and `.env` off the wire.
- `scripts/windows/SimicsTools.ps1` - resolving the project root, the Simics
  launcher and the ARM toolchain from an explicit path, an environment
  variable, `PATH`, or a search root, and a checked command invocation.
- `scripts/windows/Build-Probe.ps1` - compiles `probes/<name>/*.c` with
  `-DPROBE_SOURCE_HASH=<hash>` as a bare token, writes the ELF to the path
  `factory probe build` expects, and fails if the image does not embed the
  marker.
- `scripts/windows/Run-Probe.ps1` - runs the committed probe image under the
  project's firmware runner and writes the captured console text to
  `$PROBE_TRACE_OUT`.
- `scripts/board/capture-serial.mjs` - reads the board's serial port through a
  lab agent service when `BOARD_AGENT_URL` names one, so a board wired to
  another machine can still be captured. It is the documented shape of
  `BOARD_CAPTURE_COMMAND_JSON`, not a requirement: a directly attached port
  needs no such wrapper.

`simics.config.json` is generated with `gates` and `probe` entries that invoke
`scripts/sync-run.mjs` directly, so a generated project runs without editing
them once `.env` is filled in.

## Recorded Rules

The generated `AGENTS.md` gains a section that states, in the Simics part:

- **The board trace is the oracle.** Where it disagrees with a manual, a
  vendor header or a design export, the trace wins, and the disagreement is
  recorded in the profile rather than resolved silently.
- **A board-verified profile is derived, never written.** An
  `extract-<device>-profile.mjs` reads the probe manifest and the board trace,
  refuses them if they disagree about which registers were read in which
  order, and emits the profile with the SHA-256 of the trace and of the image
  that produced it. A host test regenerates the profile from the committed
  inputs and compares it with the committed profile.
- **An earlier boundary is never re-frozen against a new value.** When the
  board contradicts a device modelled before the board was consulted, that
  device exposes its power-on value as an attribute whose default stays the
  value its own frozen gate validates, and the board-verified composition sets
  what the board printed. Both values live in the profile's board
  observations.
- **The parity gate is part of the boundary gate.** A board-verified gate runs
  its model validation twice, checks that the earlier regression firmware still
  reaches its own output through the new composition, and diffs the probe's
  Simics trace against the board trace, honouring `volatile` lines.

The same section records what cost time in RQ-0009 and is not discoverable
from the code: in DML 1.4 a `template` must be declared at file scope, an
attribute's `init()` runs only when the object is declared
`is (uint64_attr, init)` and `param init_val` on an attribute does nothing,
and `%script%` expands in command arguments but not in a bare assignment, so a
path needs `$p = (lookup-file "%script%/…")`. On Windows PowerShell 5.1 there
is no `[Text.Encoding]::Latin1`, an array splat binds positionally where a
hashtable splat binds by name, and a quoted `-DNAME="x"` loses its quotes on
the way to GCC. Simics rejects an empty string for a declared string
parameter, so an unset selection is omitted rather than passed empty.

## Draft Seeding

`requirement new --kind hardware-twin` seeds the acceptance criteria with the
gate shape above, so a requirement author starts from what the gate will
check rather than reconstructing it.

## Acceptance Criteria

- A project generated with `--template simics` contains
  `scripts/sync-run.mjs`, `scripts/windows/SimicsTools.ps1`,
  `scripts/windows/Build-Probe.ps1`, `scripts/windows/Run-Probe.ps1` and
  `scripts/board/capture-serial.mjs`, and no `scripts/sync-run.sh`.
- `scripts/sync-run.mjs` runs the command locally when `SIMICS_REMOTE_HOST` is
  empty and over SSH when it is set; `--pull` produces the named local file in
  both modes; a missing `SIMICS_REMOTE_USER`, `SIMICS_REMOTE_BASE_PATH` or
  `SIMICS_REMOTE_PROJECT_NAME` fails with a message naming it only in the
  remote mode.
- The generated `simics.config.json` `gates` and `probe` entries invoke
  `scripts/sync-run.mjs`, and `node scripts/simics-command.mjs probe-build`
  fails with a message naming the first unset `PROBE_*` variable rather than
  running a command with an empty argument.
- The generated `AGENTS.md` states the four rules and the recorded pitfalls
  above.
- `requirement new --kind hardware-twin` seeds acceptance criteria covering
  the probe build, the board trace, the parity diff and the earlier-boundary
  rule.
- Unit tests cover the local and remote branches of the transport with a
  fixture command, `--pull` in both modes, the refusal messages, and the
  generated file set; the existing suite still passes.
- No generated file contains a host name, user name, remote path, port or
  serial port as a value.
