[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProbeName,
    [string]$Target,
    [string]$LoadAddress = '0x00000000',
    [string]$ProjectRoot,
    [string]$ToolchainBin,
    [string]$SimicsExecutable,
    [long]$SimulatedCycles = 4000000,
    [int]$TimeoutSeconds = 240
)

# Runs the committed probe image under Simics and writes what it printed to
# build\probes\<name>\simics-trace.txt, the text the parity gate compares with
# the board's.
#
# The target is the project's own. It is given two parameters and is
# responsible for everything between them:
#
#   probe_image   raw binary of the probe, to load at $LoadAddress
#   trace_output  file the captured console text must be written to
#
# Pass it with -Target, or record it in simics.config.json as probe.target.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'SimicsTools.ps1')

if ($ProbeName -notmatch '^[a-z0-9][a-z0-9-]*$') { throw "Probe name must be a lowercase slug: $ProbeName" }
$root = Resolve-ProjectRoot $ProjectRoot
$elf = Join-Path $root "probes\$ProbeName\$ProbeName.elf"
if (-not (Test-Path -LiteralPath $elf -PathType Leaf)) { throw "Committed probe image is missing: $elf" }

# A probe that waits for something the model never provides spins to its own
# limit before it prints the footer, and needs a budget the default cannot
# cover. probes\<name>\run.json declares it; the file is outside the source
# hash, so changing the budget does not invalidate the board trace. Explicit
# parameters still win.
$runConfigPath = Join-Path $root "probes\$ProbeName\run.json"
if (Test-Path -LiteralPath $runConfigPath -PathType Leaf) {
    $runConfig = Get-Content -LiteralPath $runConfigPath -Raw | ConvertFrom-Json
    if (-not $PSBoundParameters.ContainsKey('SimulatedCycles') -and $runConfig.simulatedCycles) { $SimulatedCycles = [long]$runConfig.simulatedCycles }
    if (-not $PSBoundParameters.ContainsKey('TimeoutSeconds') -and $runConfig.timeoutSeconds) { $TimeoutSeconds = [int]$runConfig.timeoutSeconds }
}

if ([string]::IsNullOrWhiteSpace($Target)) {
    $configPath = Join-Path $root 'simics.config.json'
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $Target = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).probe.target
    }
}
if ([string]::IsNullOrWhiteSpace($Target)) {
    throw 'No Simics target for the probe. Pass -Target, or set probe.target in simics.config.json.'
}
$targetPath = if ([IO.Path]::IsPathRooted($Target)) { $Target } else { Join-Path $root $Target }
if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) { throw "Probe target does not exist: $targetPath" }

$output = Join-Path $root "build\probes\$ProbeName"
New-Item -ItemType Directory -Force -Path $output | Out-Null
$trace = Join-Path $output 'simics-trace.txt'
$stdoutLog = Join-Path $output 'simics.stdout.log'
$stderrLog = Join-Path $output 'simics.stderr.log'
Remove-Item -LiteralPath $trace, $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

$simics = & (Join-Path $PSScriptRoot 'Build-Modules.ps1') -ProjectRoot $root -SimicsExecutable $SimicsExecutable

# Simics loads a raw image, not an ELF: the ELF carries load addresses the
# target would have to interpret, and the board ran these exact bytes.
$objcopy = Resolve-ArmTool -Name 'arm-none-eabi-objcopy.exe' -ToolchainBin $ToolchainBin
$binary = Join-Path $output "$ProbeName.bin"
Invoke-CheckedCommand -Executable $objcopy -Arguments @('-O', 'binary', $elf, $binary) `
    -Description 'Creating ignored physical-load probe image'

$quote = {
    param([string]$Value)
    if ($Value.Contains('"')) { throw "Unsupported quote character: $Value" }
    return '"' + $Value.Replace('%', '%%') + '"'
}
$tokens = @('call', (& $quote $simics), (& $quote '-batch-mode'), (& $quote $targetPath))
$tokens += @(
    "probe_image=$($binary.Replace('\', '/'))",
    "trace_output=$($trace.Replace('\', '/'))",
    "load_address=$LoadAddress",
    "simulated_cycles=$SimulatedCycles"
) | ForEach-Object { & $quote $_ }
$tokens += '1>' + (& $quote $stdoutLog)
$tokens += '2>' + (& $quote $stderrLog)

$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = if ([string]::IsNullOrWhiteSpace($env:ComSpec)) { 'cmd.exe' } else { $env:ComSpec }
$info.Arguments = '/d /s /c ' + ($tokens -join ' ')
$info.WorkingDirectory = $root
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$process = [System.Diagnostics.Process]::Start($info)
if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    throw "Simics exceeded the $TimeoutSeconds second timeout."
}
$stdout = if (Test-Path -LiteralPath $stdoutLog) { Get-Content -LiteralPath $stdoutLog -Raw } else { '' }
$stderr = if (Test-Path -LiteralPath $stderrLog) { Get-Content -LiteralPath $stderrLog -Raw } else { '' }
if ($process.ExitCode -ne 0) {
    Write-Host ($stdout + "`n" + $stderr)
    throw "Simics exited with code $($process.ExitCode)."
}
if (-not (Test-Path -LiteralPath $trace -PathType Leaf)) {
    Write-Host ($stdout + "`n" + $stderr)
    throw "The target finished but wrote no trace to $trace. It must write the captured console text to its trace_output parameter."
}

Write-Host "PROBE=$ProbeName"
Write-Host "TARGET=$targetPath"
Write-Host "Trace: $trace"
