#!/usr/bin/env bash
# The flow from bash on the Vivado host itself, without Node:
#   ./flow.sh <design> <stage>
# Vivado and Vitis come from $VIVADO_BIN / $VITIS_BIN, or from PATH.
# Elsewhere use `pnpm flow <stage> [design]`, which also reaches a remote host.
set -euo pipefail
cd "$(dirname "$0")"
design="${1:?usage: ./flow.sh <design> <stage>}"
stage="${2:?usage: ./flow.sh <design> <stage>}"
vivado="${VIVADO_BIN:-vivado}"
vitis="${VITIS_BIN:-vitis}"

if [ "$stage" != sw ]; then
    mkdir -p "out/$design"
    "$vivado" -mode batch -nojournal -notrace -log "out/$design/vivado-$stage.log" -source flow.tcl -tclargs "$design" "$stage"
fi
if [ "$stage" = sw ] || { [ "$stage" = all ] && grep -Eq '^\s*set\s+VITIS\s+\S' "designs/$design/project.tcl"; }; then
    "$vitis" -s "designs/$design/sw/create_vitis.py"
fi
