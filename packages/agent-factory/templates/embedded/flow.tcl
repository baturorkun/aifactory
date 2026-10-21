# The one entry of the Vivado flow.
#
#   vivado -mode batch -nojournal -notrace -source flow.tcl -tclargs <design> <stage> [options]
#
# <design>  a directory under designs/ that holds a project.tcl
# <stage>   sim | synth | impl | bit | xsa | build | all | clean
#           build = synth, impl, bit (and xsa in project mode); all = sim, then build
# options   --expect-version <v>  the Vivado version the board file names
#           --git-sha <sha>       recorded in summary.json (the copy on a build host has no .git)
#           --jobs <n>            parallel jobs for project-mode runs
#           --threads <n>         threads per run (general.maxThreads)
#           --ip-cache <dir>      the out-of-context IP cache, shared by the copies on a host
#
# The software stage runs in Vitis, not here: designs/<design>/sw/create_vitis.py,
# started by scripts/flow.mjs, flow.ps1 or flow.sh.
#
# Batch Vivado does not always exit non-zero on an error, so every failure is
# caught here and turned into exit 1.

set ROOT [file normalize [file dirname [info script]]]
source [file join $ROOT common flow_lib.tcl]

if {[catch {flow::main $ROOT $argv} message]} {
    puts stderr ""
    puts stderr "FLOW FAILED: $message"
    exit 1
}
exit 0
