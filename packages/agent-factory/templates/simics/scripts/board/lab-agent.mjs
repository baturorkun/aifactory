#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// .env is read here so the script works outside the aifactory CLI too; values
// already in the environment win.
function loadEnvFile(projectRoot, env) {
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (env[key] === undefined) env[key] = trimmed.slice(separator + 1).trim();
  }
  return env;
}

// One client for the lab agent service, so every board-side step (serial
// capture, programming, OpenOCD, power, a tool run on a lab PC) goes through
// the same code and the same .env. Nothing here names a machine: the service
// URL, its token and the agent come from BOT_API_URL, BOT_API_TOKEN
// and BOT_API_AGENT.
//
//   node scripts/board/lab-agent.mjs cmd <path>                       e.g. ocd/status/labdev1, power/on/B, pm/devices/labdev2
//   node scripts/board/lab-agent.mjs pwsh [agent] --file <ps1> | --script "<code>" [--wait <s>]
//   node scripts/board/lab-agent.mjs push [agent] <local-file> <remote-path>   upload a file (base64, 5 KB per call: the agent limit is about 8 K characters)
//   node scripts/board/lab-agent.mjs pull [agent] <remote-path> <local-file>   download a file
//
// The agent runs one PowerShell job at a time, a job may wait at most 120 s,
// and the script travels on the PowerShell command line, so it must stay under
// the 32 K character limit; anything longer is started detached and polled
// with another pwsh call, and a file goes up in small pieces.

const env = loadEnvFile(PROJECT_ROOT, process.env);

function required(name) {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    console.error(`${name} is not set; it belongs in .env.`);
    process.exit(2);
  }
  return value.trim();
}

const url = required('BOT_API_URL').replace(/\/+$/, '');
const token = required('BOT_API_TOKEN');
const headers = { Authorization: `Bearer ${token}` };

async function command(path) {
  const response = await fetch(`${url}/api/commands/${path}`, { method: 'POST', headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text);
  for (const line of body.messages ?? []) console.log(line);
  return body;
}

async function pwsh(agent, script, waitSeconds) {
  const response = await fetch(`${url}/api/agents/${encodeURIComponent(agent)}/pwsh?wait=${waitSeconds}&user=factory`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: script,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  const job = JSON.parse(text);
  return { status: job.status, stdout: job.stdout ?? '', stderr: [job.stderr, job.error].filter(Boolean).join('\n'), exitCode: job.exit_code };
}

function report(job) {
  if (job.stdout) process.stdout.write(job.stdout.endsWith('\n') ? job.stdout : `${job.stdout}\n`);
  if (job.stderr) process.stderr.write(`${job.stderr}\n`);
  if (job.status !== 'succeeded' && job.status !== 'completed' && job.exitCode !== 0 && job.exitCode !== undefined) {
    process.exitCode = 1;
  }
}

// PowerShell single-quoted strings: double any quote inside.
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
const CHUNK = 5_000;

async function push(agent, localFile, remotePath) {
  const bytes = readFileSync(localFile);
  const parts = Math.ceil(bytes.length / CHUNK) || 1;
  const stem = remotePath.replace(/\\/g, '/').split('/').pop();
  const tmp = `$env:TEMP\\lab-agent-${stem}.part`;
  for (let index = 0; index < parts; index += 1) {
    const slice = bytes.subarray(index * CHUNK, (index + 1) * CHUNK).toString('base64');
    const script = [
      index === 0 ? `Remove-Item ${psq(tmp).replace(/^'/, '"').replace(/'$/, '"')} -Force -ErrorAction SilentlyContinue` : '',
      `$bytes = [Convert]::FromBase64String(@'\n${slice}\n'@)`,
      `$stream = [IO.File]::Open("${tmp}", 'Append'); $stream.Write($bytes, 0, $bytes.Length); $stream.Close()`,
      index === parts - 1
        ? `New-Item -ItemType Directory -Force -Path (Split-Path ${psq(remotePath)}) | Out-Null; Move-Item "${tmp}" ${psq(remotePath)} -Force; (Get-FileHash ${psq(remotePath)} -Algorithm SHA256).Hash.ToLowerInvariant()`
        : `"part ${index + 1}/${parts}"`,
    ].join('\n');
    const job = await pwsh(agent, script, 100);
    if (job.stderr) throw new Error(`push part ${index + 1}/${parts} failed: ${job.stderr}`);
    process.stdout.write(job.stdout.trim() + '\n');
  }
  const { createHash } = await import('node:crypto');
  console.log(`local  ${createHash('sha256').update(bytes).digest('hex')}  ${basename(localFile)}`);
}

// Downloads go the other way in larger pieces: the limit is on what the
// script says, not on what it prints.
const PULL_CHUNK = 400_000;

async function pull(agent, remotePath, localFile) {
  const sizeJob = await pwsh(agent, `(Get-Item ${psq(remotePath)}).Length`, 60);
  if (sizeJob.stderr) throw new Error(sizeJob.stderr);
  const size = Number(sizeJob.stdout.trim());
  const parts = [];
  for (let offset = 0; offset < size; offset += PULL_CHUNK) {
    const length = Math.min(PULL_CHUNK, size - offset);
    const script = `$s = [IO.File]::OpenRead(${psq(remotePath)}); $s.Position = ${offset}; $b = New-Object byte[] ${length}; $n = $s.Read($b, 0, ${length}); $s.Close(); [Convert]::ToBase64String($b, 0, $n)`;
    const job = await pwsh(agent, script, 100);
    if (job.stderr) throw new Error(`pull at ${offset} failed: ${job.stderr}`);
    parts.push(Buffer.from(job.stdout.trim(), 'base64'));
  }
  const bytes = Buffer.concat(parts);
  if (bytes.length !== size) throw new Error(`pulled ${bytes.length} byte(s) of ${size}`);
  writeFileSync(localFile, bytes);
  const { createHash } = await import('node:crypto');
  console.log(`${localFile}: ${bytes.length} byte(s)  sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
}

async function main(argv) {
  const [mode, ...rest] = argv;
  const agentFrom = (args) => (args[0] && !args[0].startsWith('--') && /^[a-z0-9-]+$/.test(args[0]) && !args[0].includes('/') && !args[0].includes('.') ? [args[0], args.slice(1)] : [required('BOT_API_AGENT'), args]);
  if (mode === 'cmd' && rest[0]) return command(rest[0]);
  if (mode === 'pwsh') {
    const [agent, args] = agentFrom(rest);
    let script; let wait = 100;
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] === '--file') script = readFileSync(resolve(args[i + 1]), 'utf8');
      else if (args[i] === '--script') script = args[i + 1];
      else if (args[i] === '--wait') wait = Number(args[i + 1]);
      else throw new Error(`unknown option ${args[i]}`);
    }
    if (!script) throw new Error('pwsh needs --file <ps1> or --script "<code>"');
    return report(await pwsh(agent, script, Math.min(115, wait)));
  }
  if (mode === 'push') { const [agent, [local, remote]] = agentFrom(rest); if (!local || !remote) throw new Error('push [agent] <local-file> <remote-path>'); return push(agent, resolve(local), remote); }
  if (mode === 'pull') { const [agent, [remote, local]] = agentFrom(rest); if (!remote || !local) throw new Error('pull [agent] <remote-path> <local-file>'); return pull(agent, remote, resolve(local)); }
  throw new Error('Usage: lab-agent.mjs cmd <path> | pwsh [agent] --file <ps1>|--script "<code>" [--wait s] | push [agent] <local> <remote> | pull [agent] <remote> <local>');
}

main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
