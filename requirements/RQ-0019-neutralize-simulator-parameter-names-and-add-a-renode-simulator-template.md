---
id: RQ-0019
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-22T16:43:43.481Z"
branch: "factory/RQ-0019"
createdFromCommit: "0d876030e279c0e267cd881d560f4c7c4005def5"
completedRunId: "20260922165837-RQ-0019"
completedBy: "human"
completedAt: "2026-09-22T17:33:30.269Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/17"
githubPullRequestIid: 17
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/16"
githubIssueIid: 16
repositoryProvider: github
---
# RQ-0019 - Neutralize simulator parameter names and add a Renode simulator template

The hardware-twin kind is already simulator-agnostic in mechanism: parity runs
a configured command that writes a probe trace, and compares it with the board
trace. But every name says "Simics" — the config key `probeSimicsRun`, the env
`SIMICS_*`, the file `simics-trace.txt`, the function `runProbeOnSimics`, the
CLI `probe simics-run`, and the only twin scaffold is `templates/simics`. A
project that models with Renode cannot be scaffolded, and its config would read
as if it used Simics. This requirement makes the twin plumbing name-neutral,
records which simulator a project uses, and adds a Renode scaffold.

## Design

Three orthogonal axes describe a hardware-twin project; none of them is the
requirement kind (kind stays `hardware-twin`, per-requirement):

1. **simulator** — which tool models the device: `simics` or `renode`. Stored
   in `factory.config.json` as `simulator`, chosen at `factory new` time.
2. **host** — the OS the simulator and the probe build run on: `windows` or
   `linux`, in `SIMULATOR_HOST_TYPE`. Decides PowerShell vs bash in the run
   scripts. Independent of the simulator (Simics on Windows today, Renode on
   Linux, but any pairing is allowed).
3. **location** — where that host is: the `SIMULATOR_REMOTE_*` block. Empty
   means local; set means reach it over SSH. Independent of both above.

### `factory new`: two families

`factory new` scaffolds either a standard (application) project or a
hardware-twin project, and the flag says which:

- `--template <empty|vanilla-ts|python>` scaffolds a standard project (the
  language/skeleton axis). `simics` is removed from this list.
- `--simulator <simics|renode>` scaffolds a hardware-twin project: it lays down
  that simulator's tree, sets `requirementDefaults.kind = hardware-twin` and
  `simulator: <name>` in the config, and seeds the shared board half.

`--template` and `--simulator` are mutually exclusive. Passing neither keeps the
current default (`empty`).

### One common env and config, both simulators

Every parameter that is not literally Simics-specific gets a neutral name, so a
Simics project and a Renode project use the same keys and only the values
differ. Backward compatibility: the core reads the new name first and falls
back to the old `SIMICS_*` name, so an unmigrated project keeps working.

| Old (Simics-only) | New (common) |
|---|---|
| config `commands.probeSimicsRun` | `commands.probeSimulatorRun` |
| env `SIMICS_PROBE_SIMICS_RUN_COMMAND_JSON` | `SIMULATOR_PROBE_RUN_COMMAND_JSON` |
| env `SIMICS_PROBE_BUILD_COMMAND_JSON` | `SIMULATOR_PROBE_BUILD_COMMAND_JSON` |
| env `SIMICS_REMOTE_HOST` (and `_USER`, `_PORT`, `_BASE_PATH`, `_PROJECT_NAME`, `_IDENTITY_FILE`) | `SIMULATOR_REMOTE_HOST` (and the same suffixes) |
| env `SIMICS_REMOTE_TOOLCHAIN_BIN` | `SIMULATOR_TOOLCHAIN_BIN` |
| (new) | `SIMULATOR_BIN` — the simulator executable |
| (new) | `SIMULATOR_HOST_TYPE` — `windows` or `linux` |
| file `simics-trace.txt` | `simulator-trace.txt` |
| code `runProbeOnSimics`, `probe.simicsTracePath`, `SIMICS_TRACE_FILE` | `runProbeOnSimulator`, `probe.simulatorTracePath`, `SIMULATOR_TRACE_FILE` |
| CLI `factory probe simics-run` | `factory probe sim-run` (with `simics-run` kept as a hidden alias) |

The `BOARD_*` block (program, capture, serial, agent) is already neutral and
unchanged; it is the board half, shared by both simulators.

### The Renode template

`templates/renode/` shares the board half with `templates/simics` (the probe
runtime, `scripts/board/*`, `firmware-input.mjs`, the trace contract, the
`BOARD_*` and neutral `SIMULATOR_*` env) and differs in the model half:

- models live under `platforms/` (`.repl`) and, where a device needs behaviour,
  `peripherals/` (`.cs`), instead of `dml/`;
- the run is a Renode script (`scripts/*.resc`) that loads the probe binary,
  wires the console UART to a file, runs a bounded number of instructions and
  writes the trace to `$PROBE_TRACE_OUT`;
- there is no remote-sync layer and no PowerShell: Renode is local and free, so
  `SIMULATOR_REMOTE_*` is empty and `SIMULATOR_HOST_TYPE` is `linux` by default;
- `AGENTS.md` carries the Renode modelling notes in place of the DML ones.

The shared board half is factored so it is not duplicated between the two
templates (a common tree both include, or one generated from the other).

## Acceptance Criteria

- `factory new --simulator renode <name>` scaffolds a hardware-twin project
  that builds a probe, runs it under Renode locally, and reports parity, with
  `simulator: renode` and `SIMULATOR_HOST_TYPE: linux` in its config; a host
  test exercises the scaffold.
- `factory new --simulator simics <name>` scaffolds the Simics project as
  before, now with `simulator: simics`, `SIMULATOR_HOST_TYPE: windows`, and the
  neutral parameter names.
- `simics` is no longer a `--template` value; `--template` and `--simulator`
  are mutually exclusive and documented in the command help.
- The core uses the neutral names throughout (`probeSimulatorRun`,
  `SIMULATOR_*`, `simulator-trace.txt`, `runProbeOnSimulator`, `probe sim-run`)
  and still accepts the old `SIMICS_*` env and `simics-run` command as
  fallbacks, so an unmigrated project keeps working; a test covers the
  fallback.
- `factory.config.json` gains a `simulator` field validated by the schema, and
  a run/profile records which simulator produced the parity (provenance).
- The three axes are independent: a project can set `SIMULATOR_HOST_TYPE`
  regardless of `simulator`, and leave `SIMULATOR_REMOTE_*` empty to run
  locally or set it to run over SSH.
- `AGENTS.md` and the scaffold READMEs explain the three axes and the common
  env, and the existing 126 tests plus the new ones pass.

## Out of scope

Migrating the aselsan-bfi project to the neutral names is a separate change on
that repository, done under its own approval; the fallback above keeps it
working until then.
