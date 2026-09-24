#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Serial capture through the lab agent service: the board's UART is wired
// to a COM port on the board PC, so the reading has to happen there. One
// blocking job per port opens it, reads until the probe footer or the
// timeout, and returns the text; the first port that produced a probe trace
// is printed to stdout, which is what `factory probe board-run` consumes.
//
// Everything that names a machine comes from the environment:
//   BOT_API_URL, BOT_API_TOKEN, BOT_API_AGENT   the agent service
//   BOARD_SERIAL_PORT      one COM port, or a comma list to try several, or
//                          tcp://host:port when the lab's port map (hub4com)
//                          already bridges the console to a TCP port: then the
//                          capture reads that socket directly and the agent is
//                          not involved
//   BOARD_SERIAL_BAUD      default 115200
//   BOARD_CAPTURE_TIMEOUT_MS   how long each listener waits for the end pattern
//   BOARD_CAPTURE_END_PATTERN  regex that ends the capture; default the probe
//                              footer, so a product image can name its own marker

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    console.error(`${name} is not set. It names the lab agent or the board's serial port and belongs in .env.`);
    process.exit(2);
  }
  return value.trim();
}

const portSetting = required('BOARD_SERIAL_PORT');
const timeoutMs = Number(process.env.BOARD_CAPTURE_TIMEOUT_MS || '30000');
const endPatternEarly = process.env.BOARD_CAPTURE_END_PATTERN || 'PROBE_END lines=\\d+';

if (/^tcp:\/\//.test(portSetting)) {
  const { connect } = await import('node:net');
  const [host, port] = portSetting.slice(6).split(':');
  let text = '';
  const sock = connect(Number(port), host);
  const done = () => { sock.destroy(); };
  sock.on('data', (chunk) => { text += chunk.toString('latin1'); if (new RegExp(endPatternEarly).test(text)) done(); });
  sock.on('error', (error) => { console.error(`  ${portSetting}: ${error.message}`); });
  const timer = setTimeout(done, Math.max(1000, timeoutMs - 2000));
  await new Promise((resolveClose) => sock.on('close', resolveClose));
  clearTimeout(timer);
  if (process.env.PROBE_BUILD_DIR) {
    try { mkdirSync(process.env.PROBE_BUILD_DIR, { recursive: true }); writeFileSync(join(process.env.PROBE_BUILD_DIR, 'board-capture.raw.txt'), text); } catch { /* the capture itself is what matters */ }
  }
  const ok = new RegExp(endPatternEarly).test(text);
  console.error(`  ${portSetting}: ${ok ? 'succeeded' : 'no end pattern'}, ${text.length} byte(s)`);
  process.stdout.write(text);
  process.exitCode = ok ? 0 : 1;
} else {

const url = required('BOT_API_URL').replace(/\/+$/, '');
const token = required('BOT_API_TOKEN');
const agent = required('BOT_API_AGENT');
const ports = portSetting.split(',').map((p) => p.trim()).filter(Boolean);
const baud = Number(process.env.BOARD_SERIAL_BAUD || '115200');
// The caller kills this process at BOARD_CAPTURE_TIMEOUT_MS; the listeners
// must have returned before that, or their result is never seen.
const seconds = Math.max(5, Math.ceil(timeoutMs / 1000) - 10);
const endPattern = process.env.BOARD_CAPTURE_END_PATTERN || 'PROBE_END lines=\\d+';
if (endPattern.includes("'")) {
  console.error('BOARD_CAPTURE_END_PATTERN must not contain a single quote; it is embedded in a PowerShell string.');
  process.exit(2);
}

for (const port of ports) {
  if (!/^(COM\d+|CNC[AB]\d+)$/.test(port)) {
    console.error(`BOARD_SERIAL_PORT entry is not a Windows COM port name: ${port}`);
    process.exit(2);
  }
}

// PowerShell listener run by the agent. It stops at the footer so a fast
// probe does not wait out the whole timeout.
function listener(port) {
  return [
    `$p = New-Object System.IO.Ports.SerialPort '${port}',${baud},'None',8,'One'; $p.ReadTimeout = 200; $p.Open();`,
    '$sb = New-Object Text.StringBuilder;',
    `$end = (Get-Date).AddSeconds(${seconds});`,
    'while ((Get-Date) -lt $end) {',
    '  try { $sb.Append($p.ReadExisting()) | Out-Null } catch {}',
    `  if ($sb.ToString() -match '${endPattern}') { break }`,
    '  Start-Sleep -Milliseconds 100',
    '}',
    '$p.Close(); $sb.ToString()',
  ].join(' ');
}

async function runJob(port) {
  // The documented endpoint: the body is the PowerShell script itself, and the
  // call returns when it finishes (wait is capped at 120 s by the service).
  const response = await fetch(`${url}/api/agents/${encodeURIComponent(agent)}/pwsh?wait=${Math.min(120, seconds + 10)}&user=probe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: listener(port),
  });
  if (!response.ok) {
    throw new Error(`agent job on ${port} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  const job = await response.json();
  const detail = [job.stderr, job.error, job.exit_code !== undefined && job.exit_code !== 0 ? `exit ${job.exit_code}` : ''].filter(Boolean).join(' | ');
  return { port, status: job.status, stdout: job.stdout ?? '', stderr: detail };
}

const results = await Promise.all(ports.map((port) => runJob(port).catch((error) => ({ port, status: 'error', stdout: '', stderr: String(error) }))));
const withTrace = results.find((r) => new RegExp(endPattern).test(r.stdout));
const chosen = withTrace ?? results.find((r) => r.stdout.trim()) ?? results[0];

// Whatever came off the port is kept beside the probe's build output, so a
// capture the validator refuses (a board that hung mid-way, a wrong baud) can
// still be read.
if (process.env.PROBE_BUILD_DIR) {
  try {
    mkdirSync(process.env.PROBE_BUILD_DIR, { recursive: true });
    writeFileSync(join(process.env.PROBE_BUILD_DIR, 'board-capture.raw.txt'), chosen.stdout);
  } catch { /* the capture itself is what matters */ }
}

for (const r of results) {
  console.error(`  ${r.port}: ${r.status}, ${r.stdout.length} byte(s)${r.stderr ? `, ${r.stderr.trim().split('\n')[0]}` : ''}`);
}
if (withTrace && ports.length > 1) {
  console.error(`  probe output arrived on ${withTrace.port}; set BOARD_SERIAL_PORT=${withTrace.port}`);
}
// Not process.exit(): on a pipe the write is asynchronous, and exiting at
// once drops whatever has not been flushed yet, which for a long trace is
// its footer. Setting the exit code lets stdout drain first.
process.stdout.write(chosen.stdout);
process.exitCode = withTrace ? 0 : 1;

}
