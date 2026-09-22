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
//   BOARD_AGENT_URL, BOARD_AGENT_TOKEN, BOARD_AGENT_NAME   the agent service
//   BOARD_SERIAL_PORT      one COM port, or a comma list to try several
//   BOARD_SERIAL_BAUD      default 115200
//   BOARD_CAPTURE_TIMEOUT_MS   how long each listener waits for PROBE_END

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    console.error(`${name} is not set. It names the lab agent or the board's serial port and belongs in .env.`);
    process.exit(2);
  }
  return value.trim();
}

const url = required('BOARD_AGENT_URL').replace(/\/+$/, '');
const token = required('BOARD_AGENT_TOKEN');
const agent = required('BOARD_AGENT_NAME');
const ports = required('BOARD_SERIAL_PORT').split(',').map((p) => p.trim()).filter(Boolean);
const baud = Number(process.env.BOARD_SERIAL_BAUD || '115200');
const timeoutMs = Number(process.env.BOARD_CAPTURE_TIMEOUT_MS || '30000');
// The caller kills this process at BOARD_CAPTURE_TIMEOUT_MS; the listeners
// must have returned before that, or their result is never seen.
const seconds = Math.max(5, Math.ceil(timeoutMs / 1000) - 10);

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
    "  if ($sb.ToString() -match 'PROBE_END lines=\\d+') { break }",
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
const withTrace = results.find((r) => /PROBE v\d+ name=/.test(r.stdout));
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
