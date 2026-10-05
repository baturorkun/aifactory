#!/usr/bin/env node
// CI has no .env, but the aifactory CLI and the board scripts read one, and
// aifactory lets .env override the environment. So a job writes its .env from
// .env.example (every shared, non-secret value) with three changes:
//   - the secrets (*_TOKEN) come from GitLab CI/CD variables, when set;
//   - SIMULATOR_REMOTE_HOST is emptied and SIMULATOR_BIN/_TOOLCHAIN_BIN taken
//     from the image, so the twin (Renode) and gcc run inside the job, not over SSH;
//   - nothing else changes, so CI talks to the same boards as a developer.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const local = { SIMULATOR_REMOTE_HOST: '', SIMULATOR_BIN: process.env.SIMULATOR_BIN ?? '', SIMULATOR_TOOLCHAIN_BIN: process.env.SIMULATOR_TOOLCHAIN_BIN ?? '' };
const filled = [];
const out = readFileSync(resolve(ROOT, '.env.example'), 'utf8').split('\n').map((line) => {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) return line;
  const [, key] = m;
  if (key in local) return `${key}=${local[key]}`;
  if (key.endsWith('_TOKEN') && process.env[key]) { filled.push(key); return `${key}=${process.env[key]}`; }
  return line;
});
writeFileSync(resolve(ROOT, '.env'), out.join('\n'));
console.log(`.env from .env.example; secrets from CI variables: ${filled.join(', ') || 'none'}; the twin and gcc run inside the job`);
