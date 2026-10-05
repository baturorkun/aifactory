#!/usr/bin/env node
// A fresh board run in CI for every hardware-twin probe in scope
// (scripts/ci/twin-requirements.mjs): on a requirement branch only that
// requirement's probe, elsewhere every probe with a committed trace.
//
//   node scripts/ci/board-check.mjs
//
// Runs each probe through `factory probe board-run`, keeps the fresh trace in
// build/board/<probe>.txt, puts the committed trace back and compares the two
// (spin counts of volatile waits aside). A probe with no committed trace yet
// gets its first one recorded as an artifact, to be committed with its
// requirement. Exits non-zero when the board no longer reports what was
// committed. Everything that names the lab comes from .env (written by
// ci-env.mjs from .env.example and the CI/CD variables): BOARD_POWER_NAME is
// the board's socket in the lab PDU, powered on here when it is off and off
// again after; BOT_API_AGENT is the lab PC whose OpenOCD is restarted before
// the runs, so a session left from before the board's last reset does not
// refuse the load. Both are optional: empty, that step is skipped.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const setting = (name) => (process.env[name] ?? '').trim();
if (setting('BOARD_PROGRAM_COMMAND_JSON') === '' && setting('BOARD_SERIAL_PORT') === '') {
  console.error('BOARD_PROGRAM_COMMAND_JSON and BOARD_SERIAL_PORT are empty: `factory probe board-run` would wait for a trace recorded by hand, which no pipeline can do. Fill the BOARD_* block in .env.example and set BOT_API_TOKEN as a CI/CD variable.');
  process.exit(2);
}
const powerName = setting('BOARD_POWER_NAME');
const agent = setting('BOT_API_AGENT');
const labAvailable = setting('BOT_API_URL') !== '' && setting('BOT_API_TOKEN') !== '';

const run = (argv, options = {}) => {
  const result = spawnSync(argv[0], argv.slice(1), { cwd: ROOT, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit' });
  if (options.capture && result.stdout) process.stdout.write(result.stdout);
  return result;
};
const lab = (path) => (labAvailable ? run(['node', 'scripts/board/lab-agent.mjs', 'cmd', path], { capture: true }).stdout ?? '' : '');
const comparable = (text) => text.replace(/\r/g, '').split('\n').filter((l) => /^(READ|WRITE|WAIT|MEM) /.test(l))
  .map((l) => l.replace(/ spins=\d+ volatile$/, ' volatile')).join('\n');

const probes = spawnSync(process.execPath, ['scripts/ci/twin-requirements.mjs'], { cwd: ROOT, encoding: 'utf8' })
  .stdout.trim().split('\n').filter(Boolean).map((l) => l.split(' '));
if (probes.length === 0) { console.log('No probe is in scope for a board run.'); process.exit(0); }

// The board's socket in the lab PDU, when it has one: powered on here, and
// off again after, so a pipeline leaves the lab as it found it.
let socket;
let poweredHere = false;
if (powerName !== '' && labAvailable) {
  const socketLine = lab('power/status').split('\n').find((l) => l.includes(`(${powerName})`)) ?? '';
  socket = socketLine.trim().match(/^([A-Z])\b/)?.[1];
  if (!socket) { console.error(`No power socket is labelled "${powerName}" in the lab's power status.`); process.exit(1); }
  poweredHere = /→\s*Off/.test(socketLine);
  if (poweredHere) {
    lab(`power/on/${socket}`);
    spawnSync('sleep', ['5']);
  }
}
if (agent !== '' && labAvailable) {
  lab(`ocd/stop/${agent}`);
  lab(`ocd/start/${agent}`);
  spawnSync('sleep', ['3']);
}

mkdirSync(resolve(ROOT, 'build/board'), { recursive: true });
let failed = 0;
try {
  for (const [id, probe] of probes) {
    console.log(`\n== ${id} ${probe} on the board`);
    const committed = resolve(ROOT, 'probes', probe, 'board-trace.txt');
    const before = existsSync(committed) ? readFileSync(committed, 'utf8') : undefined;
    const result = run(['bash', 'scripts/ci/factory.sh', 'probe', 'board-run', id]);
    if (result.status !== 0 || !existsSync(committed)) { console.error(`${id}: board run failed`); failed += 1; continue; }
    const fresh = readFileSync(committed, 'utf8');
    copyFileSync(committed, resolve(ROOT, 'build/board', `${probe}.txt`));
    if (before === undefined) {
      // First time on the board (a requirement branch): nothing to compare
      // with. The trace is the job's artifact, to be committed with the RQ.
      console.log(`${id}: first board trace recorded -> build/board/${probe}.txt; commit it as probes/${probe}/board-trace.txt`);
      continue;
    }
    run(['git', 'checkout', '--', `probes/${probe}/board-trace.txt`]);
    if (comparable(fresh) !== comparable(before)) { console.error(`${id}: the board no longer reports the committed trace`); failed += 1; }
    else console.log(`${id}: the board still reports the committed trace`);
  }
} finally {
  if (agent !== '' && labAvailable) lab(`ocd/stop/${agent}`);
  if (poweredHere) lab(`power/off/${socket}`);
}
process.exit(failed ? 1 : 0);
