---
id: RQ-0045
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-17T19:59:16.598Z"
branch: "factory/RQ-0045"
createdFromCommit: "2482823ccaed6c1bb1f0ae6e6f5e13f8610862e4"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/69"
githubPullRequestIid: 69
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/68"
githubIssueIid: 68
repositoryProvider: github
---
# RQ-0045 - Embedded twin phase: the PS on Renode

An embedded project (RQ-0044) builds a bitstream, an XSA and an ELF, but
nothing runs the ELF: a design passes `build` without anyone having seen its
software start. The team tests mostly on the hardware twin and on the real
board now and then, so the twin is the default test.

The twin is not built inside the embedded project. As with the BFI, it is a
project of its own (`hardware-twin/bfi-sumilator`, Renode with the board's
models) that releases an image, and the firmware project runs its ELF on that
image: bfi-sw's `twin-test` takes the twin's latest release, pulls
`<registry>/<project>:<tag>`, runs `--elf … --seconds … --out …` with the ELF
copied in, and checks what comes out. The embedded template does the same,
for any board whose twin is named.

## What it does

**A `twin` phase.** The phases become `spec → sim → build → twin`, the gate
`twinTest`. A requirement chooses it like the others (`--phases`, the
checkbox list); a new project's default is all four. `handoff-finish`, the
factory job and the merge request pipeline run it after `build`.

**The board file names its twin.** `boards/<board>.yaml` gets a `twin`
section: the twin project's GitLab, path and container registry, and the file
under `--out` that holds the console. The template's ZedBoard has none yet
(no ZedBoard twin exists); it shows the section commented, to fill when the
twin is released. A board with no twin, a design with no software or no
`test.yaml`, has nothing to run on the twin and says so.

**What the design expects, in one file.** `designs/<design>/test.yaml`:
`timeout_s` (the simulated seconds), `expect` and `fail_on` (lines on the
console) and `summary` (fields of the twin's JSON summary within `min` and
`max`, as bfi-sw checks `sysTimeMs`). The board will use the same file.

**`pnpm flow twin [design]`.** It finds the twin's latest release with
`TWIN_GITLAB_TOKEN` (`read_api`, `read_registry`), or the one `TWIN_TAG`
names, runs the image in Docker with the ELF copied in, brings back what it
recorded, judges it, and writes `out/<design>/artifacts/twin/result.json`:
`target: twin`, the twin project, release, image and revision, `status`
(pass, fail, timeout, error), the lines matched and missing, each summary
check with its value, the twin's exit code and summary, the ELF's SHA-256,
the Docker host and the duration. The release is never pinned silently: every
result says which one it ran on. Docker is this machine's, or a Linux host's
over SSH (`TWIN_REMOTE_*`, the transport the Vivado host uses); the token
reaches that host only for a pull, in a file removed at once.

**CI.** An `embedded_twin` job runs after `embedded_build` with its
artifacts, in `docker:27` on the runner's Docker as bfi-sw's `twin-test` does,
on every push, merge request and tag as far as the requirement names the
phase, and keeps `out/*/artifacts/twin/`.

**The agents are told.** `AGENTS.md` says the twin is a project of its own
(a missing model or wrong behaviour is a requirement there, not a change
here), what the twin cannot show (cache maintenance, real timing and CDC,
level shifters, PL reset: the board's job), and how to read `result.json`.

## Not covered

- Building a ZedBoard twin: a hardware twin project of its own.
- The PL on the twin (Verilator co-simulation).
- The real board (`board` phase, the bot, JTAG, parity with the twin).
- Live inputs to the twin (bfi-simulator's `--live`).

## Acceptance Criteria

- The phases are `spec, sim, build, twin`; `--phases` and the checkbox list
  offer `twin`; a new embedded project's default runs all four.
- A board file's `twin` section (gitlab, project, registry, console) is
  checked by `pnpm check`; the template's ZedBoard shows it commented and its
  designs report that no twin is named.
- With a board whose twin is `hardware-twin/bfi-sumilator` and bfi-sw's
  latest release ELF, `pnpm flow twin` on the lab server's Docker runs the
  twin's latest release, passes the checks bfi-sw makes (`sysTimeMs` within
  1900..2000 after 2 s, frames sent) and records the release and revision; a
  summary value out of range gives `fail` and exit 1; `TWIN_TAG` runs the
  release it names.
- No token is left on the Docker host or in the run directory after a run.
- The `twinTest` gate runs `pnpm twin` after `build` and is skipped, with the
  reason, when the requirement does not name the phase or an earlier phase
  failed.
- The generated `.gitlab-ci.yml` has `embedded_twin` after `embedded_build`
  in `docker:27`, honouring the requirement's phases, with the result as an
  artifact.
- The README and `AGENTS.md` of an embedded project describe the twin phase,
  its settings and its limits.
