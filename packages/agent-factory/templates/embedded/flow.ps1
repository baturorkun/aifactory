# The flow from PowerShell on the Vivado host itself, without Node:
#   .\flow.ps1 <design> <stage>
# Vivado and Vitis come from $env:VIVADO_BIN / $env:VITIS_BIN, or from PATH.
# Elsewhere use `pnpm flow <stage> [design]`, which also reaches a remote host.
param(
    [Parameter(Mandatory = $true)][string]$Design,
    [Parameter(Mandatory = $true)][string]$Stage
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$Vivado = if ($env:VIVADO_BIN) { $env:VIVADO_BIN } else { 'vivado' }
$Vitis = if ($env:VITIS_BIN) { $env:VITIS_BIN } else { 'vitis' }
$UsesVitis = Select-String -Path "designs\$Design\project.tcl" -Pattern '^\s*set\s+VITIS\s+\S' -Quiet

if ($Stage -ne 'sw') {
    New-Item -ItemType Directory -Force -Path "out\$Design" | Out-Null
    & $Vivado -mode batch -nojournal -notrace -log "out\$Design\vivado-$Stage.log" -source flow.tcl -tclargs $Design $Stage
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if ($Stage -eq 'sw' -or ($Stage -eq 'all' -and $UsesVitis)) {
    & $Vitis -s "designs\$Design\sw\create_vitis.py"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
