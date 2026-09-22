#!/usr/bin/env node
// Builds one probe locally with the ARM toolchain and embeds the source hash
// AI Factory passes, so the board gate can confirm the committed image came
// from the committed sources. Renode runs locally, so unlike the Simics
// template there is no remote host: SIMULATOR_TOOLCHAIN_BIN optionally points
// at the arm-none-eabi bin directory, otherwise the tools are found on PATH.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const need = (name) => { const v = process.env[name]; if (!v) { console.error(`${name} is not set; it is provided by "factory probe build".`); process.exit(2); } return v; };

const name = need('PROBE_NAME');
const elfOut = need('PROBE_ELF');
const sourceHash = need('PROBE_SOURCE_HASH');
const dir = resolve(PROJECT_ROOT, 'probes', name);
const bin = process.env.SIMULATOR_TOOLCHAIN_BIN ? process.env.SIMULATOR_TOOLCHAIN_BIN + '/' : '';
const gcc = `${bin}arm-none-eabi-gcc`;

const sources = readdirSync(dir).filter((f) => f.endsWith('.c')).map((f) => join(dir, f));
const linker = join(dir, 'linker.ld');
if (sources.length === 0) { console.error(`No .c sources in ${dir}`); process.exit(2); }

// The probe stringifies PROBE_SOURCE_HASH into PROBE_SOURCE=<hash> so the gate
// can find it in the ELF without reproducing the build.
const args = [
  '-mcpu=cortex-m3', '-mthumb', '-nostartfiles', '-ffreestanding', '-Os', '-g',
  `-DPROBE_SOURCE_HASH=${sourceHash}`,
  ...(existsSync(linker) ? ['-T', linker] : []),
  ...sources, '-o', elfOut,
];
const result = spawnSync(gcc, args, { cwd: PROJECT_ROOT, stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exit(2); }
process.exit(result.status ?? 1);
