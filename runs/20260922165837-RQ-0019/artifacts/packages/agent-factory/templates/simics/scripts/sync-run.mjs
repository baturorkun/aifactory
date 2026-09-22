import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXCLUDED_TOP_LEVEL = new Set([
  '.env',
  '.git',
  '.DS_Store',
  'build',
  'checkpoints',
  'dist',
  'firmware',
  'node_modules',
  'references',
  'runs',
]);

// Runs one command against the project's Simics installation, wherever it is.
//
//   SIMULATOR_REMOTE_HOST empty  the command runs on this machine, in the project
//   SIMULATOR_REMOTE_HOST set    the project is archived, copied to that host over
//                             SSH, and the command runs in the copy
//
// Nothing about a machine is written here. Every value is read from the
// environment, which includes the project's .env, and a missing one is an
// error naming it rather than a default that works on one desk.

const REMOTE_VARIABLES = {
  host: 'SIMULATOR_REMOTE_HOST',
  user: 'SIMULATOR_REMOTE_USER',
  basePath: 'SIMULATOR_REMOTE_BASE_PATH',
  projectName: 'SIMULATOR_REMOTE_PROJECT_NAME',
  port: 'SIMULATOR_REMOTE_PORT',
  identityFile: 'SIMULATOR_REMOTE_IDENTITY_FILE',
};

const HELP = `Usage:
  node scripts/sync-run.mjs [--push-input <file>]... [--pull <project-relative>=<local>]... -- <command> [arguments...]

Where the command runs is decided by ${REMOTE_VARIABLES.host}:
  empty   here, in this project
  set     on that host, in a synchronised copy of this project

Remote mode also requires ${REMOTE_VARIABLES.user}, ${REMOTE_VARIABLES.basePath}
and ${REMOTE_VARIABLES.projectName}; ${REMOTE_VARIABLES.port} defaults to 22 and
${REMOTE_VARIABLES.identityFile} is optional.

Each --push-input file is placed in build/inputs/<file-name> before the command
runs. Each --pull names a file the command produces, relative to the project,
and where to put it on this machine.

Example:
  node scripts/sync-run.mjs --pull build/probes/x/x.elf=probes/x/x.elf -- \\
    powershell.exe -NoLogo -NoProfile -NonInteractive -File scripts\\windows\\Build-Probe.ps1 -ProbeName x
`;

// The project's .env is configuration for this machine, not a secret store the
// transport interprets: only the variables above are read from it, and an
// already-exported value wins.
function loadEnvFile(env = process.env) {
  const path = resolve(PROJECT_ROOT, '.env');
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (env[key] !== undefined) continue;
    env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function fail(message) {
  console.error(message);
  console.error(`\n${HELP}`);
  process.exit(2);
}

class CommandError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function parseArguments(argv, env = loadEnvFile()) {
  // `pnpm run x -- a b` hands this script a leading `--`. Dropping it blindly
  // would eat the separator of a direct `node sync-run.mjs -- cmd` call, so it
  // is dropped only when another separator follows.
  const normalizedArgs = argv[0] === '--' && argv.slice(1).includes('--') ? argv.slice(1) : argv;

  if (normalizedArgs.includes('--help') || normalizedArgs.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  const separator = normalizedArgs.indexOf('--');
  if (separator === -1) fail('Missing "--" before the command.');

  const optionArgs = normalizedArgs.slice(0, separator);
  const command = normalizedArgs.slice(separator + 1);
  if (command.length === 0) fail('A command is required.');

  // The environment is the source; a flag is an override, which keeps the
  // transport testable without exporting anything.
  const options = {
    host: env[REMOTE_VARIABLES.host],
    user: env[REMOTE_VARIABLES.user],
    'base-path': env[REMOTE_VARIABLES.basePath],
    'project-name': env[REMOTE_VARIABLES.projectName],
    port: env[REMOTE_VARIABLES.port],
    'identity-file': env[REMOTE_VARIABLES.identityFile],
  };
  for (const key of Object.keys(options)) {
    if (options[key] !== undefined && options[key].trim() === '') delete options[key];
  }
  const supported = new Set([
    '--host',
    '--user',
    '--base-path',
    '--project-name',
    '--port',
    '--identity-file',
    '--push-input',
    '--pull',
  ]);

  const pushInputs = [];
  const pulls = [];
  for (let index = 0; index < optionArgs.length; index += 2) {
    const name = optionArgs[index];
    const value = optionArgs[index + 1];
    if (!supported.has(name)) fail(`Unknown option: ${name ?? '<empty>'}`);
    if (!value || value.startsWith('--')) fail(`Missing value for ${name}.`);
    if (name === '--push-input') pushInputs.push(value);
    else if (name === '--pull') pulls.push(value);
    else options[name.slice(2)] = value;
  }

  // An empty host is not a missing value: it says the Simics installation is
  // on this machine, and then none of the connection details apply.
  const remote = options.host !== undefined;
  let port = '22';
  if (remote) {
    for (const [key, variable] of [['user', REMOTE_VARIABLES.user], ['base-path', REMOTE_VARIABLES.basePath], ['project-name', REMOTE_VARIABLES.projectName]]) {
      if (!options[key]) fail(`${variable} is not set, but ${REMOTE_VARIABLES.host} names a remote Simics host. Add it to .env.`);
    }
    if (!/^[A-Za-z0-9._:[\]-]+$/.test(options.host)) fail(`${REMOTE_VARIABLES.host} contains unsupported characters.`);
    if (!/^[A-Za-z0-9._@\\-]+$/.test(options.user)) fail(`${REMOTE_VARIABLES.user} contains unsupported characters.`);
    if (!/^[A-Za-z0-9._-]+$/.test(options['project-name'])) {
      fail(`${REMOTE_VARIABLES.projectName} may contain only letters, numbers, dot, underscore, and hyphen.`);
    }
    if (!/^(?:[A-Za-z]:[\\/]|\\\\)/.test(options['base-path'])) {
      fail(`${REMOTE_VARIABLES.basePath} must be an absolute Windows drive or UNC path.`);
    }
    port = options.port ?? '22';
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      fail(`${REMOTE_VARIABLES.port} must be an integer between 1 and 65535.`);
    }
  }

  const resolvedInputs = pushInputs.map((value) => {
    const source = resolve(value);
    if (!existsSync(source) || !statSync(source).isFile()) {
      fail(`--push-input must name an existing file: ${value}`);
    }
    const name = basename(source);
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      fail(`--push-input file name may contain only letters, numbers, dot, underscore, and hyphen: ${name}`);
    }
    return { source, name };
  });
  const names = new Set();
  for (const input of resolvedInputs) {
    if (names.has(input.name)) fail(`Duplicate --push-input file name: ${input.name}`);
    names.add(input.name);
  }

  // --pull <project-relative>=<local>: a file the command produces, collected
  // after it succeeds. The produced side is relative to the project, so
  // nothing outside it can be fetched, remotely or locally.
  const resolvedPulls = pulls.map((value) => {
    const separator = value.indexOf('=');
    if (separator <= 0 || separator === value.length - 1) fail(`--pull must be <project-relative>=<local-path>: ${value}`);
    const produced = value.slice(0, separator).replace(/\\/g, '/');
    if (produced.startsWith('/') || /^[A-Za-z]:/.test(produced) || produced.split('/').includes('..')) {
      fail(`--pull produced path must be relative to the project and may not contain "..": ${produced}`);
    }
    return { produced, local: resolve(value.slice(separator + 1)) };
  });

  return {
    remote,
    pulls: resolvedPulls,
    host: options.host,
    user: options.user,
    basePath: options['base-path'],
    projectName: options['project-name'],
    port,
    identityFile: options['identity-file'],
    pushInputs: resolvedInputs,
    command,
  };
}

function run(program, args, description, spawnOptions = {}) {
  const result = spawnSync(program, args, {
    stdio: 'inherit',
    shell: false,
    ...spawnOptions,
  });
  if (result.error) {
    throw new CommandError(`${description} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new CommandError(
      `${description} failed with exit code ${result.status ?? 'unknown'}.`,
      result.status ?? 2,
    );
  }
}

function toPowerShellEncodedCommand(source) {
  return Buffer.from(source, 'utf16le').toString('base64');
}

// Windows OpenSSH hands the requested command to cmd.exe, which truncates at
// 8191 characters. UTF-16 base64 costs about 2.7 characters per script
// character, so the script is compressed and expanded by a fixed-size
// bootstrap instead of being encoded directly.
export function toCompressedBootstrap(script) {
  const payload = gzipSync(Buffer.from(script, 'utf8'), { level: 9 }).toString('base64');
  return [
    // Set before the first cmdlet so module autoloading cannot emit a progress
    // record, which would reach the client as CLIXML on stderr.
    "$ProgressPreference = 'SilentlyContinue'",
    `$Compressed = [Convert]::FromBase64String('${payload}')`,
    '$Stream = New-Object System.IO.MemoryStream(,$Compressed)',
    '$Gzip = New-Object System.IO.Compression.GzipStream($Stream, [System.IO.Compression.CompressionMode]::Decompress)',
    '$Reader = New-Object System.IO.StreamReader($Gzip, [System.Text.Encoding]::UTF8)',
    '$Script = $Reader.ReadToEnd()',
    '$Reader.Dispose()',
    'Invoke-Expression $Script',
  ].join('\n');
}

function toBase64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function includedTopLevelEntries() {
  return readdirSync(PROJECT_ROOT, { withFileTypes: true })
    .map((entry) => entry.name)
    .filter((name) => !EXCLUDED_TOP_LEVEL.has(name) && !name.endsWith('.ckpt') && !name.endsWith('.log'))
    .sort();
}

function createArchive(archivePath) {
  const exclusions = [
    '.git',
    '.env',
    '.DS_Store',
    '._*',
    '__MACOSX',
    'node_modules',
    'dist',
    'build',
    'checkpoints',
    'references',
    'runs',
    '*.ckpt',
    '*.log',
  ];
  const args = [
    '-czf',
    archivePath,
    ...exclusions.flatMap((item) => [`--exclude=${item}`]),
    ...includedTopLevelEntries(),
  ];
  run('tar', args, 'Local source archive creation', {
    env: {
      ...process.env,
      // Prevent macOS tar from adding AppleDouble entries such as `._.`.
      COPYFILE_DISABLE: '1',
    },
  });
}

function sshArguments(options) {
  const args = ['-o', 'BatchMode=yes', '-p', options.port];
  if (options.identityFile) args.push('-i', options.identityFile);
  return args;
}

function scpArguments(options) {
  const args = ['-o', 'BatchMode=yes', '-P', options.port];
  if (options.identityFile) args.push('-i', options.identityFile);
  return args;
}

function remoteScript(options, remoteArchiveName, managedEntries, stagedInputs) {
  const basePath = toBase64Json(options.basePath);
  const projectName = toBase64Json(options.projectName);
  const archiveName = toBase64Json(remoteArchiveName);
  const entries = toBase64Json(managedEntries);
  const inputs = toBase64Json(stagedInputs);
  const command = toBase64Json(options.command);

  return `$ErrorActionPreference = 'Stop'
# Progress records reach the client as CLIXML noise on stderr.
$ProgressPreference = 'SilentlyContinue'
$BasePath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${basePath}')) | ConvertFrom-Json
$ProjectName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${projectName}')) | ConvertFrom-Json
$ArchiveName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${archiveName}')) | ConvertFrom-Json
$ManagedEntries = [string[]]([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${entries}')) | ConvertFrom-Json)
# ConvertFrom-Json hands an empty array to the pipeline as one unexpanded
# object, so it must be assigned before @() can flatten it to zero elements.
$ParsedInputs = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${inputs}')) | ConvertFrom-Json
$StagedInputs = @($ParsedInputs)
$CommandArgs = [string[]]([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${command}')) | ConvertFrom-Json)
$ArchivePath = Join-Path $HOME $ArchiveName
$ProjectPath = Join-Path $BasePath $ProjectName
$StagePath = Join-Path $BasePath ".$ProjectName-sync-$PID-$([DateTime]::UtcNow.Ticks)"

try {
  New-Item -ItemType Directory -Force -Path $BasePath | Out-Null
  New-Item -ItemType Directory -Force -Path $ProjectPath | Out-Null
  New-Item -ItemType Directory -Force -Path $StagePath | Out-Null

  & tar.exe -xzf $ArchivePath -C $StagePath
  if ($LASTEXITCODE -ne 0) { throw "tar.exe failed with exit code $LASTEXITCODE" }

  foreach ($Entry in $ManagedEntries) {
    if ($Entry -in @('.', '..') -or $Entry -match '[\\\\/]') {
      throw "Unsafe managed entry: $Entry"
    }
    $Target = Join-Path $ProjectPath $Entry
    if (Test-Path -LiteralPath $Target) {
      Remove-Item -LiteralPath $Target -Recurse -Force
    }
    $StagedEntry = Join-Path $StagePath $Entry
    if (-not (Test-Path -LiteralPath $StagedEntry)) {
      throw "Archive is missing managed entry: $Entry"
    }
    Move-Item -LiteralPath $StagedEntry -Destination $Target
  }

  if ($StagedInputs.Count -gt 0) {
    $InputPath = Join-Path $ProjectPath 'build\\inputs'
    New-Item -ItemType Directory -Force -Path $InputPath | Out-Null
    foreach ($InputFile in $StagedInputs) {
      $Name = [string]$InputFile.name
      if ($Name -match '[\\\\/]' -or $Name -in @('.', '..')) { throw "Unsafe input file name: $Name" }
      $Staged = Join-Path $HOME ([string]$InputFile.staged)
      if (-not (Test-Path -LiteralPath $Staged -PathType Leaf)) { throw "Uploaded input is missing: $Name" }
      Move-Item -LiteralPath $Staged -Destination (Join-Path $InputPath $Name) -Force
      Write-Output "Input: build\\inputs\\$Name"
    }
  }

  Set-Location -LiteralPath $ProjectPath
  $Executable = [string]$CommandArgs[0]
  $Arguments = @($CommandArgs | Select-Object -Skip 1)
  Write-Output "Running in $ProjectPath"
  Write-Output "Executable: $Executable"
  & $Executable @Arguments
  $RemoteExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  exit $RemoteExitCode
}
finally {
  foreach ($InputFile in $StagedInputs) {
    Remove-Item -LiteralPath (Join-Path $HOME ([string]$InputFile.staged)) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $StagePath -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $StagePath) {
    Write-Warning "Could not remove remote staging directory: $StagePath"
  }
}`;
}

function collectPull(pull, sourcePath, description) {
  if (!existsSync(sourcePath)) {
    throw new CommandError(`${description}: the command produced no ${pull.produced}.`);
  }
  mkdirSync(dirname(pull.local), { recursive: true });
  copyFileSync(sourcePath, pull.local);
}

// Local mode. The project is already where the command expects it, so the
// only work is staging inputs the same way the remote side does and
// collecting what --pull names.
function runLocally(options) {
  if (options.pushInputs.length > 0) {
    const inputDirectory = join(PROJECT_ROOT, 'build', 'inputs');
    mkdirSync(inputDirectory, { recursive: true });
    for (const input of options.pushInputs) {
      copyFileSync(input.source, join(inputDirectory, input.name));
      console.log(`Input: build/inputs/${input.name}`);
    }
  }

  console.log(`Running in ${PROJECT_ROOT}`);
  console.log(`Executable: ${options.command[0]}`);
  run(options.command[0], options.command.slice(1), 'Local Simics command', { cwd: PROJECT_ROOT });

  for (const pull of options.pulls) {
    const source = join(PROJECT_ROOT, pull.produced);
    if (resolve(source) === resolve(pull.local)) continue;
    console.log(`Collecting ${pull.produced}`);
    collectPull(pull, source, 'Local output collection');
  }
}

function runRemotely(options) {
  const remoteTarget = `${options.user}@${options.host}`;
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'simics-sync-'));
  const remoteArchiveName = `.simics-sync-${process.pid}-${Date.now()}.tar.gz`;
  const localArchivePath = join(temporaryDirectory, remoteArchiveName);

  try {
    console.log(`Creating source archive from ${PROJECT_ROOT}`);
    createArchive(localArchivePath);

    console.log(`Uploading source archive to ${remoteTarget}`);
    run(
      'scp',
      [...scpArguments(options), localArchivePath, `${remoteTarget}:${remoteArchiveName}`],
      'SSH source upload',
    );

    const stagedInputs = options.pushInputs.map((input, index) => ({
      name: input.name,
      staged: `.simics-input-${process.pid}-${index}-${input.name}`,
    }));
    for (const [index, input] of options.pushInputs.entries()) {
      console.log(`Uploading input ${input.name} to ${remoteTarget}`);
      run(
        'scp',
        [...scpArguments(options), input.source, `${remoteTarget}:${stagedInputs[index].staged}`],
        `SSH input upload (${input.name})`,
      );
    }

    console.log(`Synchronizing to ${options.basePath}\\${options.projectName} and running remote command`);
    const script = remoteScript(options, remoteArchiveName, includedTopLevelEntries(), stagedInputs);
    run(
      'ssh',
      [
        ...sshArguments(options),
        remoteTarget,
        'powershell.exe',
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-OutputFormat',
        'Text',
        '-EncodedCommand',
        toPowerShellEncodedCommand(toCompressedBootstrap(script)),
      ],
      'Remote Simics command',
    );

    for (const pull of options.pulls) {
      const remotePath = `${options.basePath.replace(/\\/g, '/')}/${options.projectName}/${pull.produced}`;
      console.log(`Downloading ${pull.produced} from ${remoteTarget}`);
      mkdirSync(dirname(pull.local), { recursive: true });
      run(
        'scp',
        [...scpArguments(options), `${remoteTarget}:${remotePath}`, pull.local],
        `SSH output download (${pull.produced})`,
      );
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function main(argv = process.argv.slice(2), env = loadEnvFile()) {
  const options = parseArguments(argv, env);
  if (options.remote) runRemotely(options);
  else runLocally(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof CommandError ? error.exitCode : 2;
  }
}
