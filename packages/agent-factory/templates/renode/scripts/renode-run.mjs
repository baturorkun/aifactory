#!/usr/bin/env node
// Runs the committed probe ELF under Renode and writes its console trace to
// $PROBE_TRACE_OUT, the text the parity gate compares with the board's.
//
// Renode may run on this machine or on a host reached over SSH, the common
// SIMULATOR_REMOTE_* axis: with SIMULATOR_REMOTE_HOST empty this runs
// `$SIMULATOR_BIN` (default `renode`) locally; set, it rsyncs the model and the
// probe ELF to that host, runs Renode there and pulls the UART log back.
// Nothing here names a host: every machine value comes from .env.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const need = (name) => {
  const v = process.env[name];
  if (!v) { console.error(`${name} is not set; it is provided by "factory probe sim-run".`); process.exit(2); }
  return v;
};
const opt = (name) => (process.env[name] && process.env[name].trim() !== '' ? process.env[name].trim() : undefined);

const elf = need('PROBE_ELF');
const traceOut = need('PROBE_TRACE_OUT');
const probeName = need('PROBE_NAME');
const resc = resolve(PROJECT_ROOT, 'scripts/run-probe.resc');
if (!existsSync(resc)) { console.error(`Missing ${resc}.`); process.exit(2); }

// Simulated seconds bound the probe's final spin. A probe may set its own in
// probes/<name>/probe.json ("renodeSeconds"); otherwise 8 s.
let runSeconds = opt('PROBE_RUN_SECONDS') ?? '8';
const manifestPath = resolve(PROJECT_ROOT, 'probes', probeName, 'probe.json');
if (existsSync(manifestPath)) {
  try {
    const seconds = JSON.parse(readFileSync(manifestPath, 'utf8')).renodeSeconds;
    if (seconds !== undefined) runSeconds = String(seconds);
  } catch { /* a malformed manifest falls back to the default */ }
}

const buildDir = resolve(PROJECT_ROOT, 'build/probes', probeName);
mkdirSync(buildDir, { recursive: true });
const uartLog = resolve(buildDir, 'renode-uart.log');

// Renode's Monitor does not import OS environment variables, so the ELF, the
// UART log path and the run length are handed to run-probe.resc as Monitor
// variables set with `-e` before the script is included ("@" marks a path).
const renodeArgs = (elfPath, uartPath, rescArg) => [
  '--disable-xwt', '--console',
  '-e', `$PROBE_ELF=@${elfPath}`,
  '-e', `$PROBE_UART_LOG=@${uartPath}`,
  '-e', `$PROBE_RUN_SECONDS="${runSeconds}"`,
  '-e', `include @${rescArg}`,
];
const timeoutMs = Number(process.env.SIMULATOR_TIMEOUT_MS || '240000');

function runLocally() {
  const renode = opt('SIMULATOR_BIN') || 'renode';
  const result = spawnSync(renode, renodeArgs(elf, uartLog, 'scripts/run-probe.resc'),
    { cwd: PROJECT_ROOT, env: process.env, stdio: 'inherit', timeout: timeoutMs });
  if (result.error) { console.error(result.error.message); process.exit(2); }
  return result.status ?? 1;
}

function ssh(args, options = {}) {
  const port = opt('SIMULATOR_REMOTE_PORT');
  const identity = opt('SIMULATOR_REMOTE_IDENTITY_FILE');
  const base = ['-o', 'BatchMode=yes', ...(port ? ['-p', port] : []), ...(identity ? ['-i', identity] : [])];
  return spawnSync('ssh', [...base, `${remoteUser}@${remoteHost}`, ...args], { stdio: 'inherit', encoding: 'utf8', ...options });
}

let remoteHost; let remoteUser;
function runRemotely() {
  remoteHost = need('SIMULATOR_REMOTE_HOST');
  remoteUser = opt('SIMULATOR_REMOTE_USER') || 'root';
  const basePath = need('SIMULATOR_REMOTE_BASE_PATH');
  const projectName = opt('SIMULATOR_REMOTE_PROJECT_NAME') || basename(PROJECT_ROOT);
  const renode = need('SIMULATOR_BIN'); // the renode executable path on the host
  const port = opt('SIMULATOR_REMOTE_PORT');
  const identity = opt('SIMULATOR_REMOTE_IDENTITY_FILE');
  const remoteRoot = `${basePath.replace(/\/+$/, '')}/${projectName}`;
  const target = `${remoteUser}@${remoteHost}`;
  const sshOpts = ['-o', 'BatchMode=yes', ...(port ? ['-p', port] : []), ...(identity ? ['-i', identity] : [])];
  const rshArg = ['-e', `ssh ${sshOpts.join(' ')}`];

  // Only the model and the one probe's ELF need to travel; traces stay local.
  mkdirSync(resolve(PROJECT_ROOT, 'build'), { recursive: true });
  const mkdir = ssh([`mkdir -p ${remoteRoot}/probes/${probeName} ${remoteRoot}/build`]);
  if (mkdir.status !== 0) { console.error('Could not create the remote project directory.'); process.exit(2); }

  const push = spawnSync('rsync', ['-a', ...rshArg,
    'platforms', 'peripherals', 'scripts',
    `${target}:${remoteRoot}/`], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (push.status !== 0) { console.error('rsync of the model failed.'); process.exit(2); }
  const relElf = relative(PROJECT_ROOT, elf);
  const pushElf = spawnSync('rsync', ['-a', ...rshArg, relElf, `${target}:${remoteRoot}/probes/${probeName}/`],
    { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (pushElf.status !== 0) { console.error('rsync of the probe ELF failed.'); process.exit(2); }

  const remoteElf = `${remoteRoot}/probes/${probeName}/${relElf.split('/').pop()}`;
  const remoteUart = `${remoteRoot}/build/${probeName}-uart.log`;
  // Each argument is single-quoted for the remote shell; the '$' in the Monitor
  // variable names must reach Renode literally, which single quotes preserve.
  const remoteCmd = `cd '${remoteRoot}' && '${renode}' ` +
    renodeArgs(remoteElf, remoteUart, 'scripts/run-probe.resc').map((a) => `'${a}'`).join(' ');
  const run = ssh([remoteCmd], { timeout: timeoutMs });
  if (run.error) { console.error(run.error.message); process.exit(2); }

  const pull = spawnSync('rsync', ['-a', ...rshArg, `${target}:${remoteUart}`, uartLog], { stdio: 'inherit' });
  if (pull.status !== 0) { console.error('Could not pull the UART log back from the host.'); process.exit(2); }
  return run.status ?? 1;
}

const status = opt('SIMULATOR_REMOTE_HOST') ? runRemotely() : runLocally();
if (!existsSync(uartLog)) {
  console.error(`Renode finished but no UART log at ${uartLog}. Check scripts/run-probe.resc.`);
  process.exit(1);
}
writeFileSync(traceOut, readFileSync(uartLog));
console.log(`Renode trace: ${traceOut}`);
process.exit(status);
