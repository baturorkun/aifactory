---
id: RQ-0018
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-15T07:34:34.398Z"
branch: "factory/RQ-0018"
createdFromCommit: "3f3eb8f1e0700dc2b7cac0a0adf315eb2c92ef9a"
completedRunId: "20260915074747-RQ-0018"
completedBy: "Batur Orkun"
completedAt: "2026-09-15T08:20:00.065Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/15"
githubPullRequestIid: 15
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/14"
githubIssueIid: 14
repositoryProvider: github
---
# RQ-0018 - extend the probe trace contract with actions and observations so parity proves behaviour, not only reset state

The hardware-twin contract (RQ-0015) lets a probe say one thing: a register
holds a value. Parity therefore proves one thing: the model returns the same
values the board returned at reset. The first board-verified model
(`aselsan-bfi` RQ-0009, the MDDR controller) is exactly that, and a reviewer
read it correctly: nothing shows the controller works. Its `DDRC_SR` is a
constant, writing `DYN_SOFT_RESET_CR` has no effect, DDR memory is not mapped,
and the vendor's own initialisation would spin forever in the model. Parity
did not notice because the probe never asked.

This is a property of the contract, not of that requirement. A probe cannot
express "I did X and then observed Y", so no gate can require it, and every
future module carries the same gap. The contract is extended so that a probe
can act and observe, parity compares what was observed after each action, and
a model can only pass by implementing the behaviour.

## Trace contract, version 2

A register line without a keyword keeps its meaning, so every trace recorded
under version 1 stays valid. Three kinds of line are added:

```
READ  MDDR.DDRC_SR @0x400208e4 = 0x00000000                       (today's line; keyword optional)
WRITE MDDR.DYN_SOFT_RESET_CR @0x40020800 <= 0x00000001
WAIT  MDDR.DDRC_SR @0x400208e4 mask=0x00000001 expect=0x00000001 -> ok spins=1842 volatile
MEM   @0xa0000000 len=0x1000 pattern=a5 -> ok
```

- `WRITE` records an action. It is compared for presence and value, so a
  probe that changes what it writes changes its trace.
- `WAIT` polls a register until `(value & mask) == expect` or a spin limit,
  and reports `ok` or `timeout`. The outcome is compared; `spins=` is compared
  only when the line is not marked `volatile`, and the template marks it
  volatile, because a cycle count is the one thing a simulator is not expected
  to match.
- `MEM` writes a pattern over a range, reads it back, and reports `ok` or
  `mismatch at=<addr> got=<value>`.

The footer's `lines=` counts every line kind. The comparison stays a line
diff in order: an action performed in a different order is a different probe.

## Scope of a probe

`probe.json` gains `scope`: `reset-state` when the probe only reads, `behaviour`
when it writes, waits or tests memory. The extraction script derives it from
the trace and refuses a manifest that claims more than the trace shows. The
profile records it; `factory probe compare` and the `boardParity` gate print
it; and the `hardware-twin` draft seeds a **Behaviour** section asking which
actions the probe performs and which observations follow. A device documented
from a `reset-state` probe is a reset-state model, and the profile says so.

## Template runtime

`probes/_template/probe.h` and `probe.c` gain `probe_write`, `probe_wait`
(with a spin limit) and `probe_memtest`, each printing its line as it goes so a
board that hangs inside a step still leaves the lines before it. The register
list becomes a step list: a `main.c` is a sequence of reads, writes, waits and
memory tests in the order the hardware needs them. Reads still come first for
anything whose reset value matters, because the first write changes it.

## Acceptance Criteria

- `@aifactory/contracts` parses `READ` (with or without the keyword), `WRITE`,
  `WAIT` and `MEM` lines, rejects a malformed one by line number, and counts
  every kind toward `lines=`; every trace committed under version 1 parses
  unchanged.
- `compareProbeTraces` reports a `WAIT` whose outcome differs as a difference,
  ignores `spins=` on a volatile line, and compares `WRITE` and `MEM` lines
  in full.
- `probe.json` `scope` is derived from the trace by the extraction template;
  a manifest that says `behaviour` over a read-only trace is refused, and the
  profile, `probe compare` and the `boardParity` gate report the scope.
- The generated probe runtime provides `probe_write`, `probe_wait` with a spin
  limit and `probe_memtest`, prints each line before the next step runs, and
  the generated `main.c` shows one step of each kind.
- `requirement new --kind hardware-twin` seeds a Behaviour section and an
  acceptance criterion that names the behaviour the probe must exercise.
- Unit tests cover parsing and comparison of every line kind, version-1
  compatibility, scope derivation and refusal, and the generated template;
  the existing suite still passes.
