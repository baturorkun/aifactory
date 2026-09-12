[CmdletBinding()]
param(
    [string]$ProjectRoot,
    [string]$SimicsExecutable
)

# Prepares the Simics project and builds every DML module under dml\.
#
# The module list is the directory listing, not a literal: a gate script that
# names its modules has to be edited whenever a requirement adds one, and the
# one that is forgotten silently validates against a stale .dll.
#
# Returns the path of the project's own Simics launcher.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'SimicsTools.ps1')

$root = Resolve-ProjectRoot $ProjectRoot
$simics = Resolve-SimicsExecutable $SimicsExecutable
$projectSetup = Join-Path (Split-Path $simics -Parent) 'project-setup.bat'
if (-not (Test-Path -LiteralPath $projectSetup -PathType Leaf)) {
    throw "project-setup.bat not found beside Simics: $projectSetup"
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'GNUmakefile') -PathType Leaf)) {
    Invoke-CheckedCommand -Executable $projectSetup -Arguments @('--ignore-existing-files', $root) `
        -Description 'Creating ignored Simics project files'
}
$projectSimics = Join-Path $root 'simics.bat'
if (-not (Test-Path -LiteralPath $projectSimics -PathType Leaf)) {
    throw "Project Simics launcher was not created: $projectSimics"
}

# A host whose C compiler is not the one Simics expects names it in the
# environment. No path is assumed here: a compiler that exists on one desk and
# nowhere else is exactly what a generated script must not decide for itself.
$hostCc = $env:SIMICS_HOST_CC
if (-not [string]::IsNullOrWhiteSpace($hostCc)) {
    if (-not (Test-Path -LiteralPath $hostCc -PathType Leaf)) {
        throw "SIMICS_HOST_CC is set to '$hostCc', but that file does not exist."
    }
    $hostCxx = if ([string]::IsNullOrWhiteSpace($env:SIMICS_HOST_CXX)) {
        [IO.Path]::Combine((Split-Path $hostCc -Parent), 'g++.exe')
    } else { $env:SIMICS_HOST_CXX }
    @('# -*- makefile -*-', 'ifeq (default,$(origin CC))', "    CC=$hostCc", "    CXX=$hostCxx", 'endif') |
        Set-Content -LiteralPath (Join-Path $root 'compiler.mk') -Encoding ASCII
}

$source = Join-Path $root 'dml'
if (Test-Path -LiteralPath $source -PathType Container) {
    foreach ($module in Get-ChildItem -LiteralPath $source -Directory) {
        $destination = Join-Path $root "modules\$($module.Name)"
        Remove-Item -LiteralPath $destination -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath $module.FullName -Destination $destination -Recurse
    }
}

$make = (Get-Command 'make.exe' -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
Push-Location $root
try { Invoke-CheckedCommand -Executable $make -Arguments @('-j1') -Description 'Building DML modules' }
finally { Pop-Location }

return $projectSimics
