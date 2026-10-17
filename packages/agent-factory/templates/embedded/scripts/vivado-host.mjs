import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs a command against a tool host of the project, wherever it is: the
// Vivado and Vitis host (VIVADO_* settings) or the Docker host that runs the
// hardware twin's image (TWIN_*).
//
//   <PREFIX>_REMOTE_HOST empty  the command runs on this machine, in the project
//   <PREFIX>_REMOTE_HOST set    the project's sources are archived, copied to that
//                               host over SSH, and the command runs in the copy
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
export function hostSettings(env, prefix = 'VIVADO') {
  const name = (suffix) => `${prefix}_${suffix}`;
  const what = prefix === 'TWIN' ? 'Docker host for the twin' : 'Vivado host';
  const host = value(env, name('REMOTE_HOST'));
  const hostType = value(env, name('HOST_TYPE')) || (host ? 'linux' : process.platform === 'win32' ? 'windows' : 'linux');
  if (hostType !== 'windows' && hostType !== 'linux') {
    throw new CommandError(`${name('HOST_TYPE')} must be windows or linux, not "${hostType}".`);
  }
  const settings = {
    prefix,
    remote: host !== '',
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

function run(program, args, description, options = {}) {
  const result = spawnSync(program, args, { stdio: 'inherit', ...options });
  if (result.error) throw new CommandError(`${description} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new CommandError(`${description} failed with exit code ${result.status ?? 'unknown'}.`, result.status ?? 2);
  }
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
export function runOnHost(settings, command, { pulls = [], directories = [], description = 'Vivado command' } = {}) {
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
    run('scp', [...sshOptions(settings, '-P'), join(temporary, archiveName), `${target}:${archiveName}`], 'Source upload');
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
      const result = spawnSync('scp', [...sshOptions(settings, '-P'), '-r', `${target}:${remoteRoot}/${pull}`, local], { stdio: 'pipe' });
      if (result.status === 0) console.log(`Brought back ${pull}`);
      else if (!failure) throw new CommandError(`Could not bring back ${pull}: ${String(result.stderr).trim()}`);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  if (failure) throw failure;
}

