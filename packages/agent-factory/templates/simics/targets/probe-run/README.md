# Probe run target

`scripts/windows/Run-Probe.ps1` runs a probe image under Simics by launching
one target of this project and giving it four parameters. Write that target
here as `run.simics`, and name it in `simics.config.json` as `probe.target`.

The target receives:

| Parameter | Meaning |
|---|---|
| `probe_image` | raw binary of the committed probe, to load at `load_address` |
| `load_address` | where the probe was linked, from `Run-Probe.ps1 -LoadAddress` |
| `trace_output` | file the captured console text must be written to |
| `simulated_cycles` | how long to run before giving up |

Everything between those is the target's own business: which devices the
machine is composed of, where the image is loaded, which console object the
probe prints on, and how the capture is stopped. The runner only checks that
`trace_output` exists when the target exits.

A target of this shape composes the project's platform, loads the image,
starts the capture, runs, stops the capture, and copies what was captured to
`trace_output`:

```
decl {
    param probe_image : string
    param trace_output : string
    param load_address : int = 0x00000000
    param simulated_cycles : int = 4000000
}

run-command-file "%script%/../<the platform this probe exercises>/platform.include"

board.phys_mem.load-file $probe_image $load_address
run-python-file "%script%/run.py"
quit 0
```

The probe prints and then spins, so the run is bounded by
`simulated_cycles` rather than by the firmware stopping. Capture the console
to `trace_output` directly, or capture to a build file and copy it; what the
parity gate compares is the text in `trace_output`, with anything before the
`PROBE v1` header and after the `PROBE_END` footer ignored.
