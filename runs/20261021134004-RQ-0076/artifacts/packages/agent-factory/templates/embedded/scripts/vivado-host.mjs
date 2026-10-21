import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { botDownload, botJob, botJobWait, botPowershell, botUpload } from './lab-bot.mjs';

// Runs a command against a tool host of the project, wherever it is: the
// Vivado and Vitis host (VIVADO_* settings) or the Docker host that runs the
// hardware twin's image (TWIN_*).
//
//   <PREFIX>_REMOTE_HOST empty  the command runs on this machine, in the project
//   <PREFIX>_REMOTE_HOST set    the project's sources are archived, copied to that
//                               host over SSH, and the command runs in the copy
//   VIVADO_ACCESS=bot           the same copy on the Vivado host, but through the
//                               lab bot's Windows agent there (VIVADO_BOT_AGENT),
//                               with no login and no key: the sources go through
//                               the bot's store, only the files the copy there
//                               lacks (RQ-0062), the command runs in the background
//                               and is followed, the results come back through the
//                               store (RQ-0057)
//
// The copy keeps its out/ between runs, so a stage continues from the one
// before it (a project, a checkpoint, a workspace). What a stage leaves in
// out/<design>/artifacts is brought back, also when the stage failed, so its
// logs and reports can be read here.
//
// Nothing about a machine is written here. Every value comes from the
// environment, which includes the project's .env, and a missing one is an
// error that names it.

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const EXCLUDED_TOP_LEVEL = new Set(['.env', '.git', '.DS_Store', 'node_modules', 'out', 'references', 'runs', 'handoffs']);
// Left out of the sources at any depth, as tar's --exclude does.
// __pycache__: Vitis' Python leaves one beside scripts/vitis_sw.py on the
// builder; it is no source, here or there (RQ-0076).
const EXCLUDED_NAMES = ['.git', '.env', '.DS_Store', '._*', '__MACOSX', 'node_modules', 'out', 'runs', 'handoffs', 'references', '*.log', '__pycache__'];
const excludedName = (name) => EXCLUDED_NAMES.some((pattern) => (pattern.startsWith('*') ? name.endsWith(pattern.slice(1))
  : pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern));

export class CommandError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

// The project's .env configures this machine; an already-exported value wins.
export function loadEnvFile(env = { ...process.env }) {
  const path = resolve(PROJECT_ROOT, '.env');
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (env[key] !== undefined && env[key] !== '') continue;
    env[key] = trimmed.slice(separator + 1).replace(/\s+#.*$/, '').trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const value = (env, name) => (env[name] ?? '').trim();

// The person running the stages, by the name the bot knows them
// (BOT_API_AGENT): the one place a developer's .env names them. Their copy of
// the project on a host is <project>-<name> and their Vivado host account is
// <name> unless .env says otherwise (RQ-0058).
export function personOf(env) {
  return value(env, 'BOT_API_AGENT');
}

export function defaultHostProject(env, projectName = basename(PROJECT_ROOT)) {
  const person = personOf(env);
  return person ? `${projectName}-${person}`.replace(/[^A-Za-z0-9._-]/g, '-') : '';
}

// The host and tool settings of one tool host, checked. A remote host needs a
// user, a base path and a project name; the tool locations are needed
// wherever the tools run. `prefix` is VIVADO (Vivado and Vitis) or TWIN (the twin's Docker).
// VIVADO_ACCESS: ssh (the default) or bot.
export function hostAccess(env, prefix = 'VIVADO') {
  if (prefix !== 'VIVADO') return 'ssh';
  const access = value(env, 'VIVADO_ACCESS').toLowerCase() || 'ssh';
  if (access !== 'ssh' && access !== 'bot') throw new CommandError(`VIVADO_ACCESS must be ssh or bot, not "${access}".`, 2);
  return access;
}

export function hostSettings(env, prefix = 'VIVADO') {
  const name = (suffix) => `${prefix}_${suffix}`;
  const what = { TWIN: "twin's Docker host", BOARD: 'lab host' }[prefix] ?? 'Vivado host';
  const access = hostAccess(env, prefix);
  const host = value(env, name('REMOTE_HOST'));
  const hostType = value(env, name('HOST_TYPE')) || (host || access === 'bot' ? 'linux' : process.platform === 'win32' ? 'windows' : 'linux');
  if (hostType !== 'windows' && hostType !== 'linux') {
    throw new CommandError(`${name('HOST_TYPE')} must be windows or linux, not "${hostType}".`);
  }
  const settings = {
    prefix,
    access,
    remote: host !== '' || access === 'bot',
    hostType,
    host,
    // The Vivado host's account is the person's own; the lab host's is the lab's.
    user: value(env, name('REMOTE_USER')) || (prefix === 'VIVADO' ? personOf(env) : ''),
    port: value(env, name('REMOTE_PORT')) || '22',
    basePath: value(env, name('REMOTE_BASE_PATH')),
    projectName: value(env, name('REMOTE_PROJECT_NAME')) || defaultHostProject(env),
    identityFile: value(env, name('REMOTE_IDENTITY_FILE')),
    knownHosts: value(env, name('REMOTE_KNOWN_HOSTS')),
    vivado: value(env, 'VIVADO_BIN'),
    vitis: value(env, 'VITIS_BIN'),
  };
  if (access === 'bot') {
    // The bot's Windows agent on the Vivado host runs the commands; the
    // project still lives under the base path, under a name of its own.
    settings.botAgent = value(env, 'VIVADO_BOT_AGENT');
    settings.botEnv = env;
    if (!settings.botAgent) throw new CommandError('VIVADO_BOT_AGENT is not set: the bot\'s name for its agent on the Vivado host (builder). Add it to .env.', 2);
    if (!/^[A-Za-z0-9._-]+$/.test(settings.botAgent)) throw new CommandError('VIVADO_BOT_AGENT may contain only letters, digits, dot, underscore and hyphen.', 2);
    if (hostType !== 'windows') throw new CommandError('VIVADO_HOST_TYPE must be windows with VIVADO_ACCESS=bot: the bot\'s agent is a Windows agent.', 2);
    if (!settings.host) settings.host = settings.botAgent;
    for (const [key, setting] of [['basePath', name('REMOTE_BASE_PATH')], ['projectName', name('REMOTE_PROJECT_NAME')]]) {
      if (!settings[key]) throw new CommandError(`${setting} is not set, but VIVADO_ACCESS=bot runs the tools on the Vivado host. Add it to .env${key === 'projectName' ? ' (or BOT_API_AGENT, which names it <project>-<you>)' : ''}.`);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(settings.projectName)) {
      throw new CommandError(`${name('REMOTE_PROJECT_NAME')} may contain only letters, numbers, dot, underscore and hyphen.`);
    }
    if (!/^(?:[A-Za-z]:[\\/]|\\\\)/.test(settings.basePath)) {
      throw new CommandError(`${name('REMOTE_BASE_PATH')} must be an absolute Windows drive or UNC path on a windows host.`);
    }
    return settings;
  }
  if (settings.remote) {
    for (const [key, setting] of [['user', name('REMOTE_USER')], ['basePath', name('REMOTE_BASE_PATH')], ['projectName', name('REMOTE_PROJECT_NAME')]]) {
      if (!settings[key]) {
        const derived = key === 'projectName' || (key === 'user' && prefix === 'VIVADO') ? ' (or BOT_API_AGENT, your name, which it follows from)' : '';
        throw new CommandError(`${setting} is not set, but ${name('REMOTE_HOST')} names a remote ${what}. Add it to .env${derived}.`);
      }
    }
    if (!/^[A-Za-z0-9._:[\]-]+$/.test(settings.host)) throw new CommandError(`${name('REMOTE_HOST')} contains unsupported characters.`);
    if (!/^[A-Za-z0-9._@\\-]+$/.test(settings.user)) throw new CommandError(`${name('REMOTE_USER')} contains unsupported characters.`);
    if (!/^[A-Za-z0-9._-]+$/.test(settings.projectName)) {
      throw new CommandError(`${name('REMOTE_PROJECT_NAME')} may contain only letters, numbers, dot, underscore and hyphen.`);
    }
    if (hostType === 'windows' && !/^(?:[A-Za-z]:[\\/]|\\\\)/.test(settings.basePath)) {
      throw new CommandError(`${name('REMOTE_BASE_PATH')} must be an absolute Windows drive or UNC path on a windows host.`);
    }
    if (hostType === 'linux' && !settings.basePath.startsWith('/')) {
      throw new CommandError(`${name('REMOTE_BASE_PATH')} must be an absolute path on a linux host.`);
    }
    if (!/^\d+$/.test(settings.port) || Number(settings.port) < 1 || Number(settings.port) > 65535) {
      throw new CommandError(`${name('REMOTE_PORT')} must be an integer between 1 and 65535.`);
    }
  }
  return settings;
}

// Where the project lives on the host that runs a command: the copy on a
// remote host, or this checkout.
export function projectPathOnHost(settings) {
  if (!settings.remote) return PROJECT_ROOT;
  const separator = settings.hostType === 'windows' ? '\\' : '/';
  return `${settings.basePath.replace(/[\\/]+$/, '')}${separator}${settings.projectName}`;
}

export function requireTool(settings, key, name) {
  if (!settings[key]) {
    throw new CommandError(`${name} is not set. Add the path of the tool ${settings.remote ? 'on the Vivado host' : 'on this machine'} to .env.`);
  }
  return settings[key];
}

export function buildHost(settings) {
  return settings.remote ? settings.host : hostname();
}

// ------------------------------------------------------------
// The Vivado host through the bot's agent (VIVADO_ACCESS=bot)
// ------------------------------------------------------------

// Each step is one short PowerShell run by the agent (its runs are killed
// after 120 s): the command itself is started in the background and the
// steps that follow only look at it. Every step answers with STATUS= first.
const PS_HEADER = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Decode($Text) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Text)) | ConvertFrom-Json }`;

const base64Text = (text) => Buffer.from(text, 'utf8').toString('base64');

// The script the agent starts in the background: the command in the project
// copy, its output to the job's log, its exit code to exit.txt when it ends.
export function botRunnerScript({ settings, jobDirectory, command }) {
  return `function Decode($Text) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Text)) | ConvertFrom-Json }
$ProjectPath = Decode '${base64Json(projectPathOnHost(settings))}'
$Job = Decode '${base64Json(jobDirectory)}'
$CommandArgs = [string[]](Decode '${base64Json(command)}')
Set-Location -LiteralPath $ProjectPath
& $CommandArgs[0] @($CommandArgs | Select-Object -Skip 1) 2>&1 | Out-File -FilePath (Join-Path $Job 'log') -Encoding utf8 -Append
$Code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
Set-Content -Path (Join-Path $Job 'exit.txt') -Value $Code
`;
}

// The sources' list, as the stage puts it in the store (one line per file:
// sha256, size, path, gzipped), and as the copy records its last sync in
// .aifactory-sync (sha256, size, the file's timestamp there, path).
// The bot serves a .gz file with Content-Encoding: gzip, so Invoke-WebRequest
// may have unpacked it already: the list is read either way, as tar is.
const PS_LISTS = `$Tab = [char]9
function Read-Manifest($Path) {
  $Bytes = [IO.File]::ReadAllBytes($Path)
  if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 31 -and $Bytes[1] -eq 139) {
    $Stream = New-Object IO.MemoryStream(,$Bytes)
    $Gzip = New-Object IO.Compression.GZipStream($Stream, [IO.Compression.CompressionMode]::Decompress)
    $Reader = New-Object IO.StreamReader($Gzip, [Text.Encoding]::UTF8)
    $Text = $Reader.ReadToEnd()
    $Reader.Dispose()
  } else { $Text = [Text.Encoding]::UTF8.GetString($Bytes) }
  $Text.Split([char]10) | Where-Object { $_ }
}
function Read-Recorded($ProjectPath) {
  $Recorded = @{}
  $Path = Join-Path $ProjectPath '.aifactory-sync'
  if (Test-Path -LiteralPath $Path) {
    foreach ($Line in [IO.File]::ReadAllLines($Path)) {
      $Parts = $Line.Split([char[]]@($Tab), 4)
      if ($Parts.Count -eq 4) { $Recorded[$Parts[3]] = $Parts }
    }
  }
  $Recorded
}`;

// diff: which of the listed files the copy lacks or has otherwise. A file
// whose size and timestamp are what the last sync recorded keeps its recorded
// hash; another is hashed, for at most a minute of the step (the agent kills
// a run at 120 s), past that it is sent. The answer is index ranges into the
// list: NEED=0-4,9.
export function botDiffScript({ settings, jobDirectory, manifestUrl }) {
  return `${PS_HEADER}
${PS_LISTS}
# aifactory: diff
$ProjectPath = Decode '${base64Json(projectPathOnHost(settings))}'
$Job = Decode '${base64Json(jobDirectory)}'
$ManifestUrl = Decode '${base64Json(manifestUrl)}'
New-Item -ItemType Directory -Force -Path $ProjectPath, $Job | Out-Null
$ManifestFile = Join-Path $Job 'manifest.gz'
Invoke-WebRequest -UseBasicParsing -Uri $ManifestUrl -OutFile $ManifestFile
$Recorded = Read-Recorded $ProjectPath
$Clock = [Diagnostics.Stopwatch]::StartNew()
$Need = New-Object System.Collections.Generic.List[int]
$Index = 0
foreach ($Line in @(Read-Manifest $ManifestFile)) {
  $Parts = $Line.Split([char[]]@($Tab), 3)
  $Info = [IO.FileInfo]::new([IO.Path]::Combine($ProjectPath, $Parts[2]))
  $Same = $false
  if ($Info.Exists -and $Info.Length -eq [long]$Parts[1]) {
    $Record = $Recorded[$Parts[2]]
    if ($Record -and [long]$Record[1] -eq $Info.Length -and [long]$Record[2] -eq $Info.LastWriteTimeUtc.Ticks) { $Same = $Record[0] -eq $Parts[0] }
    elseif ($Clock.Elapsed.TotalSeconds -lt 60) { $Same = (Get-FileHash -LiteralPath $Info.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Parts[0] }
  }
  if (-not $Same) { $Need.Add($Index) }
  $Index += 1
}
$Ranges = New-Object System.Collections.Generic.List[string]
$At = 0
while ($At -lt $Need.Count) {
  $From = $Need[$At]
  while ($At + 1 -lt $Need.Count -and $Need[$At + 1] -eq $Need[$At] + 1) { $At += 1 }
  if ($Need[$At] -eq $From) { $Ranges.Add([string]$From) } else { $Ranges.Add(('{0}-{1}' -f $From, $Need[$At])) }
  $At += 1
}
Write-Output "STATUS=OK"
Write-Output "FILES=$Index"
Write-Output "NEED=$($Ranges -join ',')"
`;
}

// sync: the copy made the list. What the project no longer has goes (under
// the synced top-level entries, and what the last sync brought); the parts
// of the archive are joined in order and unpacked over the copy; the list is
// recorded. out/ and what is not the project's sources stay.
export function botSyncScript({ settings, jobDirectory, partUrls, entries, directories }) {
  return `${PS_HEADER}
${PS_LISTS}
# aifactory: sync
$ProjectPath = Decode '${base64Json(projectPathOnHost(settings))}'
$Job = Decode '${base64Json(jobDirectory)}'
$PartUrls = [string[]](Decode '${base64Json(partUrls)}')
$Entries = [string[]](Decode '${base64Json(entries)}')
$Directories = [string[]](Decode '${base64Json(directories)}')
$Base = [IO.Path]::GetFullPath($ProjectPath).TrimEnd([char[]]@([char]92, [char]47))
$Lines = @(Read-Manifest (Join-Path $Job 'manifest.gz'))
$Wanted = @{}
foreach ($Line in $Lines) { $Wanted[$Line.Split([char[]]@($Tab), 3)[2]] = $true }
$Stale = [ordered]@{}
foreach ($Entry in $Entries) {
  if ($Entry -in @('.', '..', 'out', '.aifactory-sync') -or $Entry -match '[\\\\/]') { throw "Unsafe entry: $Entry" }
  $Root = [IO.Path]::Combine($Base, $Entry)
  if ([IO.File]::Exists($Root)) { if (-not $Wanted.ContainsKey($Entry)) { $Stale[$Entry] = $true } }
  elseif ([IO.Directory]::Exists($Root)) {
    foreach ($File in [IO.Directory]::GetFiles($Root, '*', [IO.SearchOption]::AllDirectories)) {
      $Relative = $File.Substring($Base.Length + 1).Replace([char]92, [char]47)
      if ($Relative -match '(^|/)__pycache__/') { continue }
      if (-not $Wanted.ContainsKey($Relative)) { $Stale[$Relative] = $true }
    }
  }
}
foreach ($Path in (Read-Recorded $Base).Keys) {
  if ($Path -match '(^|/)[.][.](/|$)') { continue }
  if (-not $Wanted.ContainsKey($Path) -and [IO.File]::Exists([IO.Path]::Combine($Base, $Path))) { $Stale[$Path] = $true }
}
foreach ($Relative in $Stale.Keys) {
  $Target = [IO.Path]::Combine($Base, $Relative)
  Remove-Item -LiteralPath $Target -Force
  $Parent = [IO.Path]::GetDirectoryName($Target)
  while ($Parent.Length -gt $Base.Length -and [IO.Directory]::Exists($Parent) -and @([IO.Directory]::GetFileSystemEntries($Parent)).Count -eq 0) {
    [IO.Directory]::Delete($Parent)
    $Parent = [IO.Path]::GetDirectoryName($Parent)
  }
}
if ($PartUrls.Count -gt 0) {
  $Archive = Join-Path $Job 'src.tar.gz'
  $Part = Join-Path $Job 'part'
  $Out = [IO.File]::Create($Archive)
  try {
    foreach ($Url in $PartUrls) {
      Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Part
      $In = [IO.File]::OpenRead($Part)
      try { $In.CopyTo($Out) } finally { $In.Dispose() }
    }
  } finally { $Out.Dispose() }
  $Tar = if ([IO.Path]::DirectorySeparatorChar -eq [char]92) { 'tar.exe' } else { 'tar' }
  & $Tar -xf $Archive -C $Base
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
  Remove-Item -LiteralPath $Archive, $Part -Force
}
$Record = New-Object System.Collections.Generic.List[string]
foreach ($Line in $Lines) {
  $Parts = $Line.Split([char[]]@($Tab), 3)
  $Info = [IO.FileInfo]::new([IO.Path]::Combine($Base, $Parts[2]))
  if (-not $Info.Exists) { throw "Missing after the sync: $($Parts[2])" }
  $Record.Add($Parts[0] + $Tab + $Info.Length + $Tab + $Info.LastWriteTimeUtc.Ticks + $Tab + $Parts[2])
}
[IO.File]::WriteAllLines((Join-Path $Base '.aifactory-sync'), $Record.ToArray())
foreach ($Directory in $Directories) { New-Item -ItemType Directory -Force -Path (Join-Path $Base $Directory) | Out-Null }
Write-Output "STATUS=SYNCED"
Write-Output "REMOVED=$($Stale.Count)"
`;
}

// start: the command started in the background in the synced copy, its pid
// and log in the job directory.
export function botStartScript({ settings, jobDirectory, command }) {
  return `${PS_HEADER}
# aifactory: start
$ProjectPath = Decode '${base64Json(projectPathOnHost(settings))}'
$Job = Decode '${base64Json(jobDirectory)}'
[IO.File]::WriteAllText((Join-Path $Job 'run.ps1'), [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64Text(botRunnerScript({ settings, jobDirectory, command }))}')))
Set-Content -Path (Join-Path $Job 'log') -Value "Running on $env:COMPUTERNAME in $ProjectPath" -Encoding utf8
$Process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Job 'run.ps1')) -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $Job 'pid.txt') -Value $Process.Id
Write-Output "STATUS=STARTED"
Write-Output "PID=$($Process.Id)"
`;
}

// status: done or still running, and the log past the offset already seen.
export function botStatusScript({ jobDirectory, offset }) {
  return `${PS_HEADER}
# aifactory: status
$Job = Decode '${base64Json(jobDirectory)}'
$Offset = ${Number(offset) || 0}
$ExitPath = Join-Path $Job 'exit.txt'
$LogPath = Join-Path $Job 'log'
if (Test-Path -LiteralPath $ExitPath) {
  Write-Output "STATUS=DONE"
  Write-Output "EXIT=$((Get-Content -LiteralPath $ExitPath -Raw).Trim())"
} else {
  $ProcessId = [int](Get-Content -LiteralPath (Join-Path $Job 'pid.txt') -Raw).Trim()
  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) { Write-Output "STATUS=RUNNING" } else { Write-Output "STATUS=DONE"; Write-Output "EXIT=255" }
}
$Length = if (Test-Path -LiteralPath $LogPath) { (Get-Item -LiteralPath $LogPath).Length } else { 0 }
Write-Output "OFFSET=$Length"
Write-Output "LOG:"
if ($Length -gt $Offset) {
  $Stream = [System.IO.File]::Open($LogPath, 'Open', 'Read', 'ReadWrite')
  try {
    $Stream.Seek($Offset, 'Begin') | Out-Null
    $Bytes = New-Object byte[] ($Length - $Offset)
    $Read = $Stream.Read($Bytes, 0, $Bytes.Length)
    $Skip = if ($Offset -eq 0 -and $Read -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) { 3 } else { 0 }
    Write-Output ([Text.Encoding]::UTF8.GetString($Bytes, $Skip, $Read - $Skip))
  } finally { $Stream.Dispose() }
}
`;
}

// collect: what the stage leaves (pulls) into one archive in the job
// directory, cut in parts of chunkBytes (RQ-0066) that go to the store and
// come back one by one, each retried on its own; LOG: lists them in order.
export function botCollectScript({ settings, jobDirectory, pulls, chunkBytes = 8 * 1024 * 1024 }) {
  return `${PS_HEADER}
# aifactory: collect
$ProjectPath = Decode '${base64Json(projectPathOnHost(settings))}'
$Job = Decode '${base64Json(jobDirectory)}'
$Pulls = [string[]](Decode '${base64Json(pulls)}')
$ChunkBytes = [long]${Number(chunkBytes)}
$Present = @($Pulls | Where-Object { Test-Path -LiteralPath (Join-Path $ProjectPath $_) })
$Archive = Join-Path $Job 'results.tar.gz'
$Parts = New-Object System.Collections.Generic.List[string]
if ($Present.Count -gt 0) {
  $Tar = if ([IO.Path]::DirectorySeparatorChar -eq [char]92) { 'tar.exe' } else { 'tar' }
  & $Tar -czf $Archive -C $ProjectPath @($Present | ForEach-Object { $_.Replace([char]92, [char]47) })
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
  $Length = (Get-Item -LiteralPath $Archive).Length
  if ($Length -le $ChunkBytes) { $Parts.Add($Archive) } else {
    $Buffer = New-Object byte[] 1048576
    $In = [IO.File]::OpenRead($Archive)
    try {
      for ($Part = 0; $Part * $ChunkBytes -lt $Length; $Part += 1) {
        $Path = '{0}.part{1:D3}' -f $Archive, $Part
        $Out = [IO.File]::Create($Path)
        try {
          $Left = [math]::Min($ChunkBytes, $Length - $Part * $ChunkBytes)
          while ($Left -gt 0) {
            $Read = $In.Read($Buffer, 0, [int][math]::Min($Buffer.Length, $Left))
            if ($Read -le 0) { throw "short read in $Archive" }
            $Out.Write($Buffer, 0, $Read)
            $Left -= $Read
          }
        } finally { $Out.Dispose() }
        $Parts.Add($Path)
      }
    } finally { $In.Dispose() }
  }
}
Write-Output "STATUS=OK"
Write-Output "PRESENT=$($Present.Count)"
Write-Output "ARCHIVE=$Archive"
Write-Output "PARTS=$($Parts.Count)"
Write-Output "LOG:"
foreach ($Path in $Parts) { Write-Output $Path }
`;
}

// stop (Ctrl-C) and clean: the command's process tree, the job directory.
export function botStopScript({ jobDirectory }) {
  return `${PS_HEADER}
# aifactory: stop
$Job = Decode '${base64Json(jobDirectory)}'
$ProcessId = [int](Get-Content -LiteralPath (Join-Path $Job 'pid.txt') -Raw).Trim()
& taskkill.exe /PID $ProcessId /T /F 2>&1 | Out-Null
Write-Output "STATUS=STOPPED"
`;
}

export function botCleanScript({ jobDirectory }) {
  return `${PS_HEADER}
# aifactory: clean
$Job = Decode '${base64Json(jobDirectory)}'
Remove-Item -LiteralPath $Job -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "STATUS=OK"
`;
}

// prune (RQ-0065): what the project leaves on a Windows Vivado host and no
// longer needs. A CI copy <project>-<tag>-<ref> (s, b, f; the job's full name
// before RQ-0063) whose ref is not among `keep`, the refs that still exist;
// a Vitis workspace in .v whose .owner, the copy it was made for, is gone,
// or one with no .owner a week old; a job or sync directory of this project
// a day old. Nothing touched in the last two hours goes (a job may be in it),
// and a person's copy, <project>-<name>, never does.
export function hostPruneScript({ settings, project, keep }) {
  return `${PS_HEADER}
# aifactory: prune
$Base = [IO.Path]::GetFullPath((Decode '${base64Json(settings.basePath)}')).TrimEnd([char[]]@([char]92, [char]47))
$Project = Decode '${base64Json(project)}'
$Keep = [string[]](Decode '${base64Json(keep)}')
$Now = Get-Date
$Removed = New-Object System.Collections.Generic.List[string]
function Remove-Old($Item, $Hours) {
  if (($Now - $Item.LastWriteTime).TotalHours -lt $Hours) { return }
  Remove-Item -LiteralPath $Item.FullName -Recurse -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path -LiteralPath $Item.FullName)) { $Removed.Add($Item.FullName.Substring($Base.Length + 1)) }
}
$Copy = '^' + [regex]::Escape($Project) + '-(s|b|f|embedded_sim|embedded_build|factory)-(.+)$'
foreach ($Item in @(Get-ChildItem -LiteralPath $Base -Directory -Force -ErrorAction SilentlyContinue)) {
  $Match = [regex]::Match($Item.Name, $Copy)
  if ($Match.Success) { if ($Keep -notcontains $Match.Groups[2].Value) { Remove-Old $Item 2 } }
  elseif ($Item.Name -like ('.' + $Project + '-*-job-*') -or $Item.Name -like ('.' + $Project + '-*-sync-*')) { Remove-Old $Item 24 }
}
$Workspaces = Join-Path $Base '.v'
foreach ($Item in @(Get-ChildItem -LiteralPath $Workspaces -Directory -Force -ErrorAction SilentlyContinue)) {
  $Owner = Join-Path $Item.FullName '.owner'
  if (Test-Path -LiteralPath $Owner) {
    $Root = [IO.Path]::GetFullPath((Get-Content -LiteralPath $Owner -Raw).Trim()).TrimEnd([char[]]@([char]92, [char]47))
    $Mine = [IO.Path]::GetFileName($Root) -like ($Project + '-*')
    if ($Mine -and -not (Test-Path -LiteralPath $Root)) { Remove-Old $Item 2 }
  } else { Remove-Old $Item 168 }
}
Write-Output "STATUS=OK"
Write-Output "REMOVED=$($Removed.Count)"
Write-Output "LOG:"
foreach ($Name in $Removed) { Write-Output $Name }
`;
}

// A PowerShell script on the Windows Vivado host at its base path, over SSH
// or through the bot: its STATUS= answer.
export async function runHostScript(settings, script, description) {
  if (!settings.remote || settings.hostType !== 'windows') {
    throw new CommandError(`${description} works on a Windows Vivado host (VIVADO_REMOTE_HOST, VIVADO_HOST_TYPE=windows).`, 2);
  }
  if (settings.access === 'bot') return botStep(settings, script, description, { wait: 90 });
  const result = spawnSync('ssh', [...sshOptions(settings, '-p'), `${settings.user}@${settings.host}`, ...powershellCommand(script)], { stdio: ['ignore', 'pipe', 'inherit'] });
  if (result.error) throw new CommandError(`${description} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new CommandError(`${description} on ${settings.host} failed with exit code ${result.status ?? 'unknown'}.`, result.status ?? 2);
  const step = parseStep(String(result.stdout));
  if (!step.STATUS) throw new CommandError(`${description} on ${settings.host} gave no STATUS line.`, 2);
  return step;
}

// A step that may outlast the agent's 120 s (RQ-0067): the sync of a large
// project's first copy, the collect of large results. The step's own script
// is started in the background in the job directory, its output going to
// <name>.out and its exit code to <name>.exit; botPollScript looks at it.
export function botBackgroundScript({ jobDirectory, name, script }) {
  return `${PS_HEADER}
# aifactory: ${name}
$Job = Decode '${base64Json(jobDirectory)}'
New-Item -ItemType Directory -Force -Path $Job | Out-Null
$Shell = if ([IO.Path]::DirectorySeparatorChar -eq [char]92) { 'powershell.exe' } else { 'pwsh' }
$Inner = Join-Path $Job '${name}.ps1'
$Runner = Join-Path $Job '${name}-run.ps1'
[IO.File]::WriteAllText($Inner, [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64Text(script)}')))
$Out = Join-Path $Job '${name}.out'
$Exit = Join-Path $Job '${name}.exit'
$Lines = @(
  ('& ' + "'" + $Shell + "'" + ' -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' + "'" + $Inner + "'" + ' 2>&1 | Out-File -FilePath ' + "'" + $Out + "'" + ' -Encoding utf8'),
  ('Set-Content -Path ' + "'" + $Exit + "'" + ' -Value $(if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE })')
)
[IO.File]::WriteAllText($Runner, ($Lines -join [Environment]::NewLine))
$Options = @{ FilePath = $Shell; ArgumentList = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $Runner); PassThru = $true }
if ($Shell -eq 'powershell.exe') { $Options.WindowStyle = 'Hidden' }
$Process = Start-Process @Options
Set-Content -Path (Join-Path $Job '${name}.pid') -Value $Process.Id
Write-Output "STATUS=STARTED"
`;
}

// poll: a background step done or still running; once done, its output.
export function botPollScript({ jobDirectory, name }) {
  return `${PS_HEADER}
# aifactory: poll
# step: ${name}
$Job = Decode '${base64Json(jobDirectory)}'
$Exit = Join-Path $Job '${name}.exit'
$Out = Join-Path $Job '${name}.out'
if (Test-Path -LiteralPath $Exit) {
  Write-Output "STATUS=DONE"
  Write-Output "EXIT=$((Get-Content -LiteralPath $Exit -Raw).Trim())"
} else {
  $ProcessId = [int](Get-Content -LiteralPath (Join-Path $Job '${name}.pid') -Raw).Trim()
  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) { Write-Output "STATUS=RUNNING" } else { Write-Output "STATUS=DONE"; Write-Output "EXIT=255" }
}
Write-Output "LOG:"
if (Test-Path -LiteralPath $Exit) { if (Test-Path -LiteralPath $Out) { Get-Content -LiteralPath $Out -Raw } }
`;
}

// The STATUS= answer of a step: its fields and what follows LOG:.
export function parseStep(text) {
  const [head, ...rest] = (text ?? '').split(/^LOG:\r?\n?/m);
  const fields = {};
  for (const line of head.split(/\r?\n/)) {
    const match = /^([A-Z]+)=(.*)$/.exec(line.trim());
    if (match) fields[match[1]] = match[2].trim();
  }
  return { ...fields, log: rest.join('LOG:\n') };
}

// A step's answer from the agent, or why it did not run.
async function botStep(settings, script, description, { wait = 60 } = {}) {
  let job = await botPowershell(settings.botEnv, settings.botAgent, script, { wait, stage: 'BUILD' });
  job = await botJobWait(settings.botEnv, job, { deadlineMs: Date.now() + 180_000, pause: 2000, stage: 'BUILD' });
  if (job.status !== 'succeeded') {
    throw new CommandError(`${description} on ${settings.host} through the bot failed: ${job.error || job.stderr || job.stdout || `agent job ${job.status}`}`.trim(), 2);
  }
  const step = parseStep(job.stdout);
  if (!step.STATUS) throw new CommandError(`${description} on ${settings.host} through the bot gave no STATUS line: ${job.stdout.slice(0, 400)}`, 2);
  return step;
}

// Runs a step in the background and asks after it until it ends, so its
// length meets no limit of the agent's (RQ-0067); the bot out of reach for a
// while is asked again, as for the command. Its own STATUS= answer.
async function backgroundStep(settings, jobDirectory, name, script, description, { pause = 3000 } = {}) {
  const started = await botStep(settings, botBackgroundScript({ jobDirectory, name, script }), `${description} start`);
  if (started.STATUS !== 'STARTED') throw new CommandError(`${description} on ${settings.host} did not start: ${started.log || started.STATUS}`, 2);
  let misses = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pause));
    let polled;
    try {
      polled = await botStep(settings, botPollScript({ jobDirectory, name }), description, { wait: 30 });
      misses = 0;
    } catch (error) {
      if (!/cannot reach the lab bot|answered 5\d\d/.test(String(error.message)) || ++misses > 12) throw error;
      console.error(`${description}: ${error.message}; asking again in 15 s (${misses}/12)`);
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      continue;
    }
    if (polled.STATUS !== 'DONE') continue;
    const output = polled.log.replace(/^\uFEFF/, '');
    if (Number(polled.EXIT) !== 0) throw new CommandError(`${description} on ${settings.host} failed (exit ${polled.EXIT}): ${output.trim().slice(-1500)}`, 2);
    const step = parseStep(output);
    if (!step.STATUS) throw new CommandError(`${description} on ${settings.host} gave no STATUS line: ${output.slice(0, 400)}`, 2);
    return step;
  }
}

async function runThroughBot(settings, command, { pulls, directories, description }) {
  const temporary = mkdtempSync(join(tmpdir(), 'vivado-sync-'));
  const jobId = `${process.pid}-${Date.now()}`;
  const jobDirectory = `${settings.basePath.replace(/[\\/]+$/, '')}\\.${settings.projectName}-job-${jobId}`;
  const archiveName = `${settings.projectName}-${jobId}-src.tar.gz`;
  let created = false;
  let started = false;
  let ended = false;
  let stopping = false;
  const stop = async () => {
    if (!started || stopping) return;
    stopping = true;
    await botStep(settings, botStopScript({ jobDirectory }), `Stopping ${description}`).catch(() => {});
  };
  // Ctrl-C: the command's process tree is stopped and the job directory
  // removed before this process ends.
  const onSignal = (signal) => {
    stop()
      .then(() => (created ? botStep(settings, botCleanScript({ jobDirectory }), `${description} cleanup`).catch(() => {}) : undefined))
      .finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  let failure;
  try {
    // The sources: their list to the builder, back the files its copy lacks,
    // only those through the store, in parts (RQ-0062).
    const files = sourceManifest();
    const manifestName = `${settings.projectName}-${jobId}-manifest.gz`;
    const manifest = gzipSync(Buffer.from(files.map((file) => `${file.hash}\t${file.size}\t${file.path}\n`).join(''), 'utf8'));
    const manifestUrl = await botUpload(settings.botEnv, settings.botAgent, manifestName, manifest, 'BUILD');
    created = true;
    const diff = await botStep(settings, botDiffScript({ settings, jobDirectory, manifestUrl }), `${description} sources`, { wait: 90 });
    if (Number(diff.FILES) !== files.length || diff.NEED === undefined) {
      throw new CommandError(`${description} sources on ${settings.host}: the builder read ${diff.FILES ?? 'no'} files of ${files.length} in the list.`, 2);
    }
    const needed = parseRanges(diff.NEED).map((index) => files[index]);
    const partUrls = [];
    if (needed.length > 0) {
      createArchive(join(temporary, archiveName), needed.map((file) => file.path));
      const data = readFileSync(join(temporary, archiveName));
      const chunk = chunkBytes(settings.botEnv);
      const count = Math.ceil(data.length / chunk);
      for (let part = 0; part < count; part += 1) {
        if (count > 1) console.log(`Sources: part ${part + 1} of ${count}`);
        const name = count > 1 ? `${archiveName}.part${String(part).padStart(3, '0')}` : archiveName;
        partUrls.push(await botUpload(settings.botEnv, settings.botAgent, name, data.subarray(part * chunk, (part + 1) * chunk), 'BUILD'));
      }
      console.log(`Sources: ${needed.length} of ${files.length} files changed (${formatBytes(data.length)}) sent to ${settings.host}`);
    } else {
      console.log(`Sources: up to date on ${settings.host} (${files.length} files)`);
    }
    const entries = includedTopLevelEntries();
    const synced = await backgroundStep(settings, jobDirectory, 'sync', botSyncScript({ settings, jobDirectory, partUrls, entries, directories }), `${description} sources`);
    if (Number(synced.REMOVED) > 0) console.log(`Sources: ${synced.REMOVED} ${Number(synced.REMOVED) === 1 ? 'file' : 'files'} no longer here removed on ${settings.host}`);
    await botStep(settings, botStartScript({ settings, jobDirectory, command }), `${description} start`);
    started = true;

    // Follow the log until the command ends; the agent's own runs stay short.
    // The bot being out of reach for a while (a network hiccup, a restart) is
    // not the command's failure: the command runs on, so the stage asks again.
    let offset = 0;
    let step;
    let misses = 0;
    for (;;) {
      try {
        step = await botStep(settings, botStatusScript({ jobDirectory, offset }), `${description} status`, { wait: 30 });
        misses = 0;
      } catch (error) {
        if (!/cannot reach the lab bot|answered 5\d\d/.test(String(error.message)) || ++misses > 12) throw error;
        console.error(`${description}: ${error.message}; asking again in 15 s (${misses}/12)`);
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        continue;
      }
      // The bot trims the step's stdout, so the chunk's last line break is put back.
      if (step.log) process.stdout.write(step.log.endsWith('\n') ? step.log : `${step.log}\n`);
      offset = Number(step.OFFSET) || offset;
      if (step.STATUS === 'DONE') break;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
    ended = true;
    const exitCode = Number(step.EXIT);
    if (exitCode !== 0) failure = new CommandError(`${description} failed with exit code ${Number.isFinite(exitCode) ? exitCode : 'unknown'}.`, Number.isFinite(exitCode) && exitCode > 0 ? exitCode : 2);

    // What the stage left comes back through the bot's store.
    const collected = await backgroundStep(settings, jobDirectory, 'collect', botCollectScript({ settings, jobDirectory, pulls, chunkBytes: chunkBytes(settings.botEnv) }), `${description} results`);
    if (Number(collected.PRESENT) > 0) {
      const resultsName = `${settings.projectName}-${jobId}-results.tar.gz`;
      // The archive in parts (RQ-0066): each to the store and back on its own,
      // a dropped download tried again for that part alone, joined here.
      const parts = collected.log.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (parts.length === 0) parts.push(collected.ARCHIVE);
      const joined = join(temporary, 'results.tar.gz');
      writeFileSync(joined, '');
      for (const [index, path] of parts.entries()) {
        if (parts.length > 1) console.log(`Results: part ${index + 1} of ${parts.length}`);
        const name = parts.length > 1 ? `${resultsName}.part${String(index).padStart(3, '0')}` : resultsName;
        let upload = await botJob(settings.botEnv, settings.botAgent, 'upload-file', [path, name], { wait: 60, stage: 'BUILD' });
        upload = await botJobWait(settings.botEnv, upload, { deadlineMs: Date.now() + 300_000, pause: 2000, stage: 'BUILD' });
        const url = /uploaded_url=(\S+)/.exec(upload.stdout ?? '')?.[1];
        if (upload.status !== 'succeeded' || !url) throw new CommandError(`Could not bring back the results of ${description}: ${upload.error || upload.stderr || upload.stdout}`.trim(), 2);
        await botDownload(url, join(temporary, 'part'), 'BUILD');
        appendFileSync(joined, readFileSync(join(temporary, 'part')));
      }
      for (const pull of pulls) {
        const local = resolve(PROJECT_ROOT, pull);
        mkdirSync(dirname(local), { recursive: true });
        rmSync(local, { recursive: true, force: true });
      }
      // No -z: the archive may come unpacked (Content-Encoding: gzip), and tar
      // tells a compressed one from the file itself; GNU tar's -z would refuse it.
      const extracted = spawnSync('tar', ['-xf', join(temporary, 'results.tar.gz'), '-C', PROJECT_ROOT], { stdio: 'pipe' });
      if (extracted.status !== 0) throw new CommandError(`Could not unpack the results of ${description}: ${String(extracted.stderr).trim()}`, 2);
      for (const pull of pulls) if (existsSync(resolve(PROJECT_ROOT, pull))) console.log(`Brought back ${pull}`);
    } else if (!failure && pulls.length > 0) {
      throw new CommandError(`Could not bring back ${pulls.join(', ')}: nothing of it on ${settings.host}.`, 2);
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    // The job directory goes once the command has ended (or was stopped);
    // a command the stage lost sight of keeps running, and its directory says so.
    if (created && (!started || ended || stopping)) await botStep(settings, botCleanScript({ jobDirectory }), `${description} cleanup`).catch(() => {});
    else if (started) console.error(`${description} may still be running on ${settings.host}; its job directory ${jobDirectory} is left there.`);
    rmSync(temporary, { recursive: true, force: true });
  }
  if (failure) throw failure;
}

function run(program, args, description, options = {}) {
  const result = spawnSync(program, args, { stdio: 'inherit', ...options });
  if (result.error) throw new CommandError(`${description} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new CommandError(`${description} failed with exit code ${result.status ?? 'unknown'}.`, result.status ?? 2);
  }
}

// scp's options. To a Windows host the SCP protocol (-O): with SFTP, the
// default since OpenSSH 9, a Debian 12 client (the CI image) got every file
// over 200 KiB back from Windows OpenSSH cut at exactly 204 800 bytes.
export function scpOptions(settings) {
  return [...(settings.hostType === 'windows' ? ['-O'] : []), ...sshOptions(settings, '-P')];
}

function sshOptions(settings, portFlag) {
  const args = ['-o', 'BatchMode=yes', portFlag, settings.port];
  if (settings.identityFile) args.push('-i', settings.identityFile);
  if (settings.knownHosts) args.push('-o', `UserKnownHostsFile=${settings.knownHosts}`);
  return args;
}

function includedTopLevelEntries(root = PROJECT_ROOT) {
  return readdirSync(root)
    .filter((name) => !EXCLUDED_TOP_LEVEL.has(name) && !name.endsWith('.log'))
    .sort();
}

// The project's sources, or only `files` (project-relative, / separated).
function createArchive(archivePath, files) {
  // macOS tar would add extended attributes that GNU tar on a Linux host
  // reports, one warning per file.
  const quiet = process.platform === 'darwin' ? ['--no-mac-metadata', '--no-xattrs'] : [];
  let what = [...EXCLUDED_NAMES.map((item) => `--exclude=${item}`), ...includedTopLevelEntries()];
  if (files) {
    const list = `${archivePath}.files`;
    writeFileSync(list, files.map((file) => `${file}\n`).join(''));
    what = ['-T', list];
  }
  run('tar', ['-czf', archivePath, ...quiet, ...what],
    'Source archive', { cwd: PROJECT_ROOT, env: { ...process.env, COPYFILE_DISABLE: '1' } });
}

// The files createArchive would take, each with its size and SHA-256, in a
// fixed order: what the builder's copy is compared with (RQ-0062).
export function sourceManifest(root = PROJECT_ROOT) {
  const files = [];
  const walk = (relative, names) => {
    for (const name of names) {
      const path = relative ? `${relative}/${name}` : name;
      const stats = statSync(join(root, path));
      if (stats.isDirectory()) walk(path, readdirSync(join(root, path)).filter((child) => !excludedName(child)).sort());
      else if (stats.isFile()) files.push({ path, size: stats.size, hash: createHash('sha256').update(readFileSync(join(root, path))).digest('hex') });
    }
  };
  walk('', includedTopLevelEntries(root).filter((name) => !excludedName(name)));
  return files;
}

// NEED=0-4,9 from the diff step: the indexes it names.
export function parseRanges(text) {
  const indexes = [];
  for (const range of String(text ?? '').split(',').filter(Boolean)) {
    const [from, to = from] = range.split('-').map(Number);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) throw new CommandError(`Not an index range: ${range}`, 2);
    for (let index = from; index <= to; index += 1) indexes.push(index);
  }
  return indexes;
}

// An archive larger than this goes to the store in parts, each uploaded and
// retried on its own (BOT_API_CHUNK_KB, default 8 MB).
export function chunkBytes(env) {
  const kilobytes = Number((env.BOT_API_CHUNK_KB ?? '').trim() || 8192);
  if (!Number.isInteger(kilobytes) || kilobytes <= 0) throw new CommandError('BOT_API_CHUNK_KB must be a positive whole number of kilobytes.', 2);
  return kilobytes * 1024;
}

const formatBytes = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const base64Json = (data) => Buffer.from(JSON.stringify(data), 'utf8').toString('base64');

// Windows OpenSSH hands the command to cmd.exe, which cuts it at 8191
// characters: the script travels compressed and a small bootstrap expands it.
export function powershellCommand(script) {
  const payload = gzipSync(Buffer.from(script, 'utf8'), { level: 9 }).toString('base64');
  const bootstrap = [
    "$ProgressPreference = 'SilentlyContinue'",
    `$Compressed = [Convert]::FromBase64String('${payload}')`,
    '$Stream = New-Object System.IO.MemoryStream(,$Compressed)',
    '$Gzip = New-Object System.IO.Compression.GzipStream($Stream, [System.IO.Compression.CompressionMode]::Decompress)',
    '$Reader = New-Object System.IO.StreamReader($Gzip, [System.Text.Encoding]::UTF8)',
    '$Script = $Reader.ReadToEnd()',
    '$Reader.Dispose()',
    'Invoke-Expression $Script',
  ].join('\n');
  return ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-OutputFormat', 'Text',
    '-EncodedCommand', Buffer.from(bootstrap, 'utf16le').toString('base64')];
}

function windowsScript(settings, archiveName, entries, command, directories) {
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Decode($Text) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Text)) | ConvertFrom-Json }
$BasePath = Decode '${base64Json(settings.basePath)}'
$ProjectName = Decode '${base64Json(settings.projectName)}'
$Entries = [string[]](Decode '${base64Json(entries)}')
$CommandArgs = [string[]](Decode '${base64Json(command)}')
$Directories = [string[]](Decode '${base64Json(directories)}')
$ArchivePath = Join-Path $HOME '${archiveName}'
$ProjectPath = Join-Path $BasePath $ProjectName
$StagePath = Join-Path $BasePath ".$ProjectName-sync-$PID"
try {
  New-Item -ItemType Directory -Force -Path $ProjectPath, $StagePath | Out-Null
  & tar.exe -xzf $ArchivePath -C $StagePath
  if ($LASTEXITCODE -ne 0) { throw "tar.exe failed with exit code $LASTEXITCODE" }
  foreach ($Entry in $Entries) {
    if ($Entry -in @('.', '..', 'out') -or $Entry -match '[\\\\/]') { throw "Unsafe entry: $Entry" }
    $Target = Join-Path $ProjectPath $Entry
    if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $StagePath $Entry) -Destination $Target
  }
  foreach ($Directory in $Directories) { New-Item -ItemType Directory -Force -Path (Join-Path $ProjectPath $Directory) | Out-Null }
  Set-Location -LiteralPath $ProjectPath
  Write-Output "Running on $env:COMPUTERNAME in $ProjectPath"
  & $CommandArgs[0] @($CommandArgs | Select-Object -Skip 1)
  exit $(if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE })
}
finally {
  Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $StagePath -Recurse -Force -ErrorAction SilentlyContinue
}`;
}

const shellQuote = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

function linuxScript(settings, archiveName, entries, command, directories) {
  const project = `${settings.basePath}/${settings.projectName}`;
  const stage = `${settings.basePath}/.${settings.projectName}-sync-$$`;
  return [
    'set -e',
    `project=${shellQuote(project)}`,
    `stage="${stage}"`,
    'trap \'rm -rf "$stage" "$HOME/' + archiveName + '"\' EXIT',
    'mkdir -p "$project" "$stage"',
    `tar -xzf "$HOME/${archiveName}" -C "$stage"`,
    ...entries.map((entry) => `rm -rf "$project"/${shellQuote(entry)} && mv "$stage"/${shellQuote(entry)} "$project"/`),
    ...directories.map((directory) => `mkdir -p "$project"/${shellQuote(directory)}`),
    'cd "$project"',
    'echo "Running on $(hostname) in $project"',
    command.map(shellQuote).join(' '),
  ].join('\n');
}

// Runs `command` (program and arguments, relative to the project root) here
// or on the Vivado host, then brings each of `pulls` (project-relative files
// or directories) back into the local project. `directories` are made before
// the command runs.
export async function runOnHost(settings, command, { pulls = [], directories = [], description = 'Vivado command' } = {}) {
  if (settings.access === 'bot') {
    await runThroughBot(settings, command, { pulls, directories, description });
    return;
  }
  if (!settings.remote) {
    for (const directory of directories) mkdirSync(resolve(PROJECT_ROOT, directory), { recursive: true });
    // A .bat or .cmd on Windows only starts through the shell.
    const shell = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command[0]);
    run(command[0], command.slice(1), description, { cwd: PROJECT_ROOT, shell });
    return;
  }

  const target = `${settings.user}@${settings.host}`;
  const temporary = mkdtempSync(join(tmpdir(), 'vivado-sync-'));
  const archiveName = `.vivado-sync-${process.pid}-${Date.now()}.tar.gz`;
  let failure;
  try {
    createArchive(join(temporary, archiveName));
    run('scp', [...scpOptions(settings), join(temporary, archiveName), `${target}:${archiveName}`], 'Source upload');
    const entries = includedTopLevelEntries();
    const remoteCommand = settings.hostType === 'windows'
      ? powershellCommand(windowsScript(settings, archiveName, entries, command, directories))
      : ['bash', '-c', shellQuote(linuxScript(settings, archiveName, entries, command, directories))];
    try {
      run('ssh', [...sshOptions(settings, '-p'), target, ...remoteCommand], `${description} on ${settings.host}`);
    } catch (error) {
      failure = error;
    }
    const remoteRoot = `${settings.basePath.replace(/\\/g, '/')}/${settings.projectName}`;
    for (const pull of pulls) {
      const local = resolve(PROJECT_ROOT, pull);
      mkdirSync(dirname(local), { recursive: true });
      rmSync(local, { recursive: true, force: true });
      const result = spawnSync('scp', [...scpOptions(settings), '-r', `${target}:${remoteRoot}/${pull}`, local], { stdio: 'pipe' });
      if (result.status === 0) console.log(`Brought back ${pull}`);
      else if (!failure) throw new CommandError(`Could not bring back ${pull}: ${String(result.stderr).trim()}`);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  if (failure) throw failure;
}

