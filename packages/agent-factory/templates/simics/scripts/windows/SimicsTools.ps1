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
        -EnvironmentVariable 'SIMICS_EXECUTABLE'
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
