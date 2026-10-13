# Runs one DOORS batch job for the aifactory RAG (RQ-0037): doors.exe with the
# DXL script of the job's mode (list or export) from this directory. The job
# is one JSON line on stdin, so the password is neither on this script's
# command line nor in a file; doors.exe itself takes it as an argument. The
# answer is one JSON line on stdout: whether the script reached its end, and
# what DOORS wrote to its batch log.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$answer = @{ ok = $false; timedOut = $false; exitCode = $null; log = ''; error = '' }
try {
    $job = [Console]::In.ReadLine() | ConvertFrom-Json
    $exe = $job.executable
    if (-not $exe) {
        $exe = Get-ChildItem -Path "$env:ProgramFiles\IBM\Rational\DOORS\*\bin\doors.exe", "${env:ProgramFiles(x86)}\IBM\Rational\DOORS\*\bin\doors.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $exe -or -not (Test-Path $exe)) { throw 'no DOORS client (doors.exe) on this machine' }
    $log = Join-Path $dir 'batch.log'
    # Windows argument quoting: backslashes before a quote are doubled, the quote escaped.
    $arguments = @('-b', (Join-Path $dir ($job.mode + '.dxl')), '-d', $job.database, '-u', $job.user, '-P', $job.password, '-W', '-l', $log) |
        ForEach-Object { '"' + (($_ -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"' }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $exe
    $start.Arguments = $arguments -join ' '
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.EnvironmentVariables['AIFACTORY_DOORS_DIR'] = $dir
    $process = [Diagnostics.Process]::Start($start)
    if (-not $process.WaitForExit([int]$job.timeoutSeconds * 1000)) {
        $answer.timedOut = $true
        $process.Kill()
        $process.WaitForExit(10000) | Out-Null
    }
    $answer.exitCode = $process.ExitCode
    if (Test-Path $log) { $answer.log = [string](Get-Content $log -Raw) }
    $answer.ok = (-not $answer.timedOut) -and (Test-Path (Join-Path $dir ('out\' + $job.mode + '.ok')))
} catch {
    $answer.error = [string]$_.Exception.Message
}
$answer | ConvertTo-Json -Compress
