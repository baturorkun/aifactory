Set-StrictMode -Version Latest

function Resolve-ProjectRoot {
    param([string]$ProjectRoot)

    if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
        return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    }

    return (Resolve-Path -LiteralPath $ProjectRoot).Path
}

function Resolve-Executable {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$ExplicitPath,
        [string]$EnvironmentVariable,
        [string[]]$SearchRoots = @()
    )

    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        $candidates += $ExplicitPath
    }
    if (-not [string]::IsNullOrWhiteSpace($EnvironmentVariable)) {
        $environmentValue = [Environment]::GetEnvironmentVariable($EnvironmentVariable)
        if (-not [string]::IsNullOrWhiteSpace($environmentValue)) {
            $candidates += $environmentValue
        }
    }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
        throw "$Name was configured as '$candidate', but that file does not exist."
    }

    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $command) {
        return $command.Source
    }

    foreach ($root in $SearchRoots) {
        if ([string]::IsNullOrWhiteSpace($root) -or -not (Test-Path -LiteralPath $root -PathType Container)) {
            continue
        }
        $match = Get-ChildItem -LiteralPath $root -Filter $Name -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($null -ne $match) {
            return $match.FullName
        }
    }

    throw "$Name was not found. Configure $EnvironmentVariable or pass its explicit script parameter."
}

# The core and its compiler are the project's choice, recorded in
# probes\toolchain.json ("prefix": arm-none-eabi-, aarch64-none-elf-, ...;
# "cflags": the core flags; "ldflags": passed to the link as given). A
# scaffolded project has them empty: refuse before any compiler runs.
function Read-ProbeToolchain {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)

    $path = Join-Path $ProjectRoot 'probes\toolchain.json'
    $hint = 'The core, its compiler prefix and its flags are this project''s choice: fill "prefix" and "cflags" there, with probes\_template\cpu.c and linker.ld for the same core. probes\README.md names the verified examples.'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "probes\toolchain.json: missing. $hint" }
    try { $parsed = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
    catch { throw "probes\toolchain.json: not valid JSON ($($_.Exception.Message)). $hint" }
    $prefix = if ($null -eq $parsed.prefix) { '' } else { ([string]$parsed.prefix).Trim() }
    if ([string]::IsNullOrWhiteSpace($prefix)) { throw "probes\toolchain.json: ""prefix"" is empty; the project has not chosen its core and toolchain yet. $hint" }
    $cflags = @(); if ($null -ne $parsed.cflags) { $cflags = @($parsed.cflags | ForEach-Object { [string]$_ }) }
    $ldflags = @(); if ($null -ne $parsed.ldflags) { $ldflags = @($parsed.ldflags | ForEach-Object { [string]$_ }) }
    return [pscustomobject]@{ Prefix = $prefix; CFlags = $cflags; LdFlags = $ldflags }
}

function Resolve-ArmTool {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$ToolchainBin
    )

    $configuredBin = $ToolchainBin
    if ([string]::IsNullOrWhiteSpace($configuredBin)) {
        $configuredBin = [Environment]::GetEnvironmentVariable('ARM_GNU_TOOLCHAIN_BIN')
    }
    $explicitPath = if ([string]::IsNullOrWhiteSpace($configuredBin)) {
        $null
    } else {
        Join-Path $configuredBin $Name
    }

    $searchRoots = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Arm'),
        (Join-Path $env:ProgramFiles 'Arm')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    return Resolve-Executable -Name $Name -ExplicitPath $explicitPath -SearchRoots $searchRoots
}

function Resolve-SimicsExecutable {
    param([string]$SimicsExecutable)

    return Resolve-Executable -Name 'simics.bat' -ExplicitPath $SimicsExecutable `
        -EnvironmentVariable 'SIMULATOR_BIN'
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )

    Write-Host "$Description"
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}
