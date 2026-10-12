[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProbeName,
    [Parameter(Mandatory = $true)][string]$SourceHash,
    [string]$ProjectRoot,
    [string]$ToolchainBin
)

# Builds one hardware-twin probe from probes\<name>\*.c with the source hash
# AI Factory computed over the committed sources compiled in, so the image
# itself says which sources it came from. Output: build\probes\<name>\<name>.elf

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'SimicsTools.ps1')

if ($ProbeName -notmatch '^[a-z0-9][a-z0-9-]*$') { throw "Probe name must be a lowercase slug: $ProbeName" }
if ($SourceHash -notmatch '^[0-9a-f]{16,64}$') { throw "Source hash must be hex: $SourceHash" }

$root = Resolve-ProjectRoot $ProjectRoot
$probe = Join-Path $root "probes\$ProbeName"
if (-not (Test-Path -LiteralPath $probe -PathType Container)) { throw "Probe directory does not exist: $probe" }
$linker = Join-Path $probe 'linker.ld'
if (-not (Test-Path -LiteralPath $linker -PathType Leaf)) { throw "Probe has no linker.ld: $probe" }
$sources = @(Get-ChildItem -LiteralPath $probe -Filter '*.c' | Sort-Object Name | ForEach-Object { $_.FullName })
if ($sources.Count -eq 0) { throw "Probe has no C sources: $probe" }

$output = Join-Path $root "build\probes\$ProbeName"
New-Item -ItemType Directory -Force -Path $output | Out-Null
$elf = Join-Path $output "$ProbeName.elf"
$binary = Join-Path $output "$ProbeName.bin"
$map = Join-Path $output "$ProbeName.map"

# Which compiler and which core: probes\toolchain.json, part of the probe
# source hash. The flags after the core flags are the probe contract's.
$toolchain = Read-ProbeToolchain -ProjectRoot $root
$gcc = Resolve-ArmTool -Name "$($toolchain.Prefix)gcc.exe" -ToolchainBin $ToolchainBin
$objcopy = Resolve-ArmTool -Name "$($toolchain.Prefix)objcopy.exe" -ToolchainBin $ToolchainBin
$size = Resolve-ArmTool -Name "$($toolchain.Prefix)size.exe" -ToolchainBin $ToolchainBin

$gccArguments = @($toolchain.CFlags) + @(
    '-Os',
    '-ffreestanding',
    '-fno-builtin',
    '-fdata-sections',
    '-ffunction-sections',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-nostdlib',
    "-I$probe",
    "-DPROBE_SOURCE_HASH=$SourceHash",
    "-Wl,-T,$linker",
    "-Wl,-Map,$map",
    '-Wl,--gc-sections',
    '-Wl,--build-id=none'
) + @($toolchain.LdFlags) + @('-o', $elf) + $sources

Invoke-CheckedCommand -Executable $gcc -Arguments $gccArguments -Description "Building probe $ProbeName"
Invoke-CheckedCommand -Executable $objcopy -Arguments @('-O', 'binary', $elf, $binary) -Description 'Creating raw probe image'
& $size $elf

# The marker AI Factory's build gate looks for must be in the image bytes.
$bytes = [IO.File]::ReadAllBytes($elf)
# Windows PowerShell 5.1 has no [Text.Encoding]::Latin1; 28591 is ISO-8859-1.
$text = [Text.Encoding]::GetEncoding(28591).GetString($bytes)
if ($text -notmatch "PROBE_SOURCE=$SourceHash") { throw "The ELF does not embed PROBE_SOURCE=$SourceHash." }

Write-Host "Probe image: $elf"
Write-Host "PROBE_SOURCE=$SourceHash"
