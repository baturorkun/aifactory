# Probe CPU files: Cortex-M3

The core-specific part of a probe for an Arm Cortex-M3, verified on the
Microchip SmartFusion2 M2S090 ("BFI Eval 1", aselsan-bfi RQ-0009..RQ-0012,
bfi-simulator RQ-0001..RQ-0003): a 16-entry vector table at the start of the
image, `reset_handler` as the entry, HardFault/BusFault routed to the runtime
through `probe_fault_in_mem_step` / `probe_fault_stop` (CFSR and BFAR read,
Thumb-2 instruction skipped when a MEM step took the fault), `wfi` to idle
and `dsb` as the barrier.

Copy into a project whose board has this core:

```text
cpu.c           -> probes/_template/cpu.c      (and every probe copied from it)
linker.ld       -> probes/_template/linker.ld  (adjust ORIGIN/LENGTH to the board)
toolchain.json  -> probes/toolchain.json
```

A probe loaded into RAM over a debugger sets probe.json `vectorTable` to the
table's address; one that boots through the code window leaves it at 0.

A core with no directory here is the first requirement's job: write its
`cpu.c` from the core's reference manual against the interface in `probe.h`
(entry and C runtime set-up, vectors reaching the two fault calls,
`probe_cpu_idle`, `probe_cpu_barrier`), its `linker.ld`, and the prefix,
flags and CI target in `toolchain.json`; then add the verified result here
with the board it was verified on.
