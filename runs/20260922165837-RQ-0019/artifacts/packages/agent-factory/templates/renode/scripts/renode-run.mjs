#!/usr/bin/env node
// Runs the committed probe ELF under Renode and writes its console trace to
// $PROBE_TRACE_OUT, the text the parity gate compares with the board's. Renode
// is local and free, so there is no remote host: SIMULATOR_BIN names the
// renode executable (default `renode`), the platform describes the board, and
// scripts/run-probe.resc loads the ELF and shows the console on a UART that
// this script captures to a file.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const need = (name) => {
  const v = process.env[name];
  if (!v) { console.error(`${name} is not set; it is provided by "factory probe sim-run".`); process.exit(2); }
  return v;
};

const elf = need('PROBE_ELF');
const traceOut = need('PROBE_TRACE_OUT');
const probeName = need('PROBE_NAME');
const renode = process.env.SIMULATOR_BIN || 'renode';
const resc = resolve(PROJECT_ROOT, 'scripts/run-probe.resc');
if (!existsSync(resc)) { console.error(`Missing ${resc}. Write the Renode script that loads the platform and the ELF.`); process.exit(2); }

const buildDir = resolve(PROJECT_ROOT, 'build/probes', probeName);
mkdirSync(buildDir, { recursive: true });
const uartLog = resolve(buildDir, 'renode-uart.log');

// The .resc reads these from the environment; keep the parameter names common
// with the Simics template so a probe does not care which simulator ran it.
const env = { ...process.env, PROBE_ELF: elf, PROBE_UART_LOG: uartLog, PROBE_NAME: probeName };
const result = spawnSync(renode, ['--disable-xwt', '--console', '-e', `include @${resc}`], {
  cwd: PROJECT_ROOT, env, stdio: 'inherit', timeout: Number(process.env.SIMULATOR_TIMEOUT_MS || '240000'),
});
if (result.error) { console.error(result.error.message); process.exit(2); }
if (!existsSync(uartLog)) { console.error(`Renode finished but wrote no UART log at ${uartLog}. Check scripts/run-probe.resc.`); process.exit(1); }
writeFileSync(traceOut, readFileSync(uartLog));
console.log(`Renode trace: ${traceOut}`);
process.exit(result.status ?? 1);
