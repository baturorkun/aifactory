import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
//                               with no login and no key: the archive goes through
//                               the bot's store, the command runs in the background
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
    user: value(env, name('REMOTE_USER')),
    port: value(env, name('REMOTE_PORT')) || '22',
    basePath: value(env, name('REMOTE_BASE_PATH')),
    projectName: value(env, name('REMOTE_PROJECT_NAME')),
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
      if (!settings[key]) throw new CommandError(`${setting} is not set, but VIVADO_ACCESS=bot runs the tools on the Vivado host. Add it to .env.`);
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
      if (!settings[key]) throw new CommandError(`${setting} is not set, but ${name('REMOTE_HOST')} names a remote ${what}. Add it to .env.`);
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

// prepare: the sources from the bot's store into the project copy, the
// command started in the background, its pid and log in the job directory.
export function botPrepareScript({ settings, jobDirectory, archiveUrl, entries, command, directories }) {
  return `${PS_HEADER}
# aifactory: prepare
$ProjectPath = Decode '${base64Json(projectPathOnHost(settings))}'
$Job = Decode '${base64Json(jobDirectory)}'
$ArchiveUrl = Decode '${base64Json(archiveUrl)}'
$Entries = [string[]](Decode '${base64Json(entries)}')
$CommandArgs = [string[]](Decode '${base64Json(command)}')
$Directories = [string[]](Decode '${base64Json(directories)}')
$StagePath = Join-Path $Job 'stage'
New-Item -ItemType Directory -Force -Path $ProjectPath, $Job, $StagePath | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri $ArchiveUrl -OutFile (Join-Path $Job 'src.tar.gz')
& tar.exe -xzf (Join-Path $Job 'src.tar.gz') -C $StagePath
if ($LASTEXITCODE -ne 0) { throw "tar.exe failed with exit code $LASTEXITCODE" }
foreach ($Entry in $Entries) {
  if ($Entry -in @('.', '..', 'out') -or $Entry -match '[\\/]') { throw "Unsafe entry: $Entry" }
  $Target = Join-Path $ProjectPath $Entry
  if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
  Move-Item -LiteralPath (Join-Path $StagePath $Entry) -Destination $Target
}
foreach ($Directory in $Directories) { New-Item -ItemType Directory -Force -Path (Join-Path $ProjectPath $Directory) | Out-Null }
Remove-Item -LiteralPath $StagePath, (Join-Path $Job 'src.tar.gz') -Recurse -Force -ErrorAction SilentlyContinue
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

// collect: what the stage leaves (pulls) into one archive in the job directory.
export function botCollectScript({ settings, jobDirectory, pulls }) {
  return `${PS_HEADER}
# aifactory: collect
$ProjectPath = Decode '${base64Json(projectPathOnHost(settings))}'
$Job = Decode '${base64Json(jobDirectory)}'
$Pulls = [string[]](Decode '${base64Json(pulls)}')
$Present = @($Pulls | Where-Object { Test-Path -LiteralPath (Join-Path $ProjectPath $_) })
$Archive = Join-Path $Job 'results.tar.gz'
if ($Present.Count -gt 0) {
  & tar.exe -czf $Archive -C $ProjectPath @($Present | ForEach-Object { $_.Replace('\\', '/') })
  if ($LASTEXITCODE -ne 0) { throw "tar.exe failed with exit code $LASTEXITCODE" }
}
Write-Output "STATUS=OK"
Write-Output "PRESENT=$($Present.Count)"
Write-Output "ARCHIVE=$Archive"
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

async function runThroughBot(settings, command, { pulls, directories, description }) {
  const temporary = mkdtempSync(join(tmpdir(), 'vivado-sync-'));
  const jobId = `${process.pid}-${Date.now()}`;
  const jobDirectory = `${settings.basePath.replace(/[\\/]+$/, '')}\\.${settings.projectName}-job-${jobId}`;
  const archiveName = `${settings.projectName}-${jobId}-src.tar.gz`;
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
      .then(() => (started ? botStep(settings, botCleanScript({ jobDirectory }), `${description} cleanup`).catch(() => {}) : undefined))
      .finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  let failure;
  try {
    createArchive(join(temporary, archiveName));
    const archiveUrl = await botUpload(settings.botEnv, settings.botAgent, archiveName, readFileSync(join(temporary, archiveName)), 'BUILD');
    const entries = includedTopLevelEntries();
    await botStep(settings, botPrepareScript({ settings, jobDirectory, archiveUrl, entries, command, directories }), `${description} start`);
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
    const collected = await botStep(settings, botCollectScript({ settings, jobDirectory, pulls }), `${description} results`);
    if (Number(collected.PRESENT) > 0) {
      const resultsName = `${settings.projectName}-${jobId}-results.tar.gz`;
      let upload = await botJob(settings.botEnv, settings.botAgent, 'upload-file', [collected.ARCHIVE, resultsName], { wait: 60, stage: 'BUILD' });
      upload = await botJobWait(settings.botEnv, upload, { deadlineMs: Date.now() + 300_000, pause: 2000, stage: 'BUILD' });
      const url = /uploaded_url=(\S+)/.exec(upload.stdout ?? '')?.[1];
      if (upload.status !== 'succeeded' || !url) throw new CommandError(`Could not bring back the results of ${description}: ${upload.error || upload.stderr || upload.stdout}`.trim(), 2);
      await botDownload(url, join(temporary, 'results.tar.gz'), 'BUILD');
      for (const pull of pulls) {
        const local = resolve(PROJECT_ROOT, pull);
        mkdirSync(dirname(local), { recursive: true });
        rmSync(local, { recursive: true, force: true });
      }
      const extracted = spawnSync('tar', ['-xzf', join(temporary, 'results.tar.gz'), '-C', PROJECT_ROOT], { stdio: 'pipe' });
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
    if (started && (ended || stopping)) await botStep(settings, botCleanScript({ jobDirectory }), `${description} cleanup`).catch(() => {});
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

function includedTopLevelEntries() {
  return readdirSync(PROJECT_ROOT)
    .filter((name) => !EXCLUDED_TOP_LEVEL.has(name) && !name.endsWith('.log'))
    .sort();
}

function createArchive(archivePath) {
  const exclusions = ['.git', '.env', '.DS_Store', '._*', '__MACOSX', 'node_modules', 'out', 'runs', 'handoffs', 'references', '*.log'];
  // macOS tar would add extended attributes that GNU tar on a Linux host
  // reports, one warning per file.
  const quiet = process.platform === 'darwin' ? ['--no-mac-metadata', '--no-xattrs'] : [];
  run('tar', ['-czf', archivePath, ...quiet, ...exclusions.map((item) => `--exclude=${item}`), ...includedTopLevelEntries()],
    'Source archive', { cwd: PROJECT_ROOT, env: { ...process.env, COPYFILE_DISABLE: '1' } });
}

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

