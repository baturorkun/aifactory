import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { analyzeEnv, checkProjectEnv, formatEnvCheck, parseEnvExample, parseEnvValues } from './env-check';

const EXAMPLE = [
  '# Required model settings. Copy this file to .env and provide real values.',
  'AI_PROVIDER=gemini',
  'AI_API_KEY=replace_me',
  '',
  '# Where the simulator runs. SIMULATOR_REMOTE_* empty runs locally.',
  'SIMULATOR_HOST_TYPE=',
  'SIMULATOR_BIN=',
  'SIMULATOR_REMOTE_PORT=22',
  '# A commented example must not become a variable:',
  '# SIMICS_BUILD_COMMAND_JSON=["/x","arg"]',
  'SIMULATOR_REMOTE_HOST=',
].join('\n');

test('parseEnvValues keeps only non-empty assignments and strips quotes', () => {
  const values = parseEnvValues('A=1\nB=\nC="two"\n# D=3\n  E = 4 \nbad line\n');
  assert.equal(values.get('A'), '1');
  assert.equal(values.has('B'), false, 'empty value is not "set"');
  assert.equal(values.get('C'), 'two');
  assert.equal(values.has('D'), false, 'a comment is not a value');
  assert.equal(values.get('E'), '4');
});

test('parseEnvExample groups on blank lines and ignores commented example lines', () => {
  const sections = parseEnvExample(EXAMPLE);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].vars.map((v) => v.key), ['AI_PROVIDER', 'AI_API_KEY']);
  assert.match(sections[0].description[0], /Required model settings/);
  const sim = sections[1].vars;
  assert.deepEqual(sim.map((v) => v.key), ['SIMULATOR_HOST_TYPE', 'SIMULATOR_BIN', 'SIMULATOR_REMOTE_PORT', 'SIMULATOR_REMOTE_HOST']);
  assert.ok(!sim.some((v) => v.key.includes('SIMICS_BUILD_COMMAND_JSON')), 'a "# FOO=" line is not a variable');
  assert.equal(sim.find((v) => v.key === 'SIMULATOR_REMOTE_PORT')?.defaultValue, '22');
});

test('analyzeEnv classifies each variable as set, default, or empty', () => {
  const report = analyzeEnv(EXAMPLE, 'AI_PROVIDER=openai\nSIMULATOR_BIN=/opt/renode\nAI_API_KEY=\n');
  assert.equal(report.envFileExists, true);
  const status = new Map(report.sections.flatMap((s) => s.vars).map((v) => [v.key, v.status]));
  assert.equal(status.get('AI_PROVIDER'), 'set');
  assert.equal(status.get('SIMULATOR_BIN'), 'set');
  assert.equal(status.get('AI_API_KEY'), 'empty', 'present but empty counts as empty');
  assert.equal(status.get('SIMULATOR_REMOTE_PORT'), 'default');
  assert.equal(status.get('SIMULATOR_HOST_TYPE'), 'empty');
  assert.deepEqual(report.empty.sort(), ['AI_API_KEY', 'SIMULATOR_HOST_TYPE', 'SIMULATOR_REMOTE_HOST'].sort());
  assert.equal(report.counts.set, 2);
  assert.equal(report.counts.default, 1);
  assert.equal(report.counts.empty, 3);
});

test('analyzeEnv reports a missing .env as everything unset', () => {
  const report = analyzeEnv(EXAMPLE, null);
  assert.equal(report.envFileExists, false);
  // AI_PROVIDER has a default in the example, so it is 'default', not 'empty'.
  assert.ok(report.empty.includes('AI_API_KEY'));
  assert.ok(report.empty.includes('SIMULATOR_BIN'));
  assert.ok(!report.empty.includes('AI_PROVIDER'));
  assert.ok(!report.empty.includes('SIMULATOR_REMOTE_PORT'));
});

test('checkProjectEnv reads the project files and formatEnvCheck names the empties', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-envcheck-'));
  try {
    writeFileSync(join(root, '.env.example'), EXAMPLE, 'utf8');
    writeFileSync(join(root, '.env'), 'AI_PROVIDER=gemini\nAI_API_KEY=k\nSIMULATOR_HOST_TYPE=linux\nSIMULATOR_BIN=/opt/renode\nSIMULATOR_REMOTE_HOST=192.168.1.2\n', 'utf8');
    const report = checkProjectEnv(root);
    assert.equal(report.empty.length, 0, 'everything needed is filled or defaulted');
    const text = formatEnvCheck(report, root);
    assert.match(text, /Summary: 5 set, 1 using a default, 0 empty/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkProjectEnv refuses a directory with no .env.example', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-envcheck-none-'));
  try {
    mkdirSync(join(root, 'sub'));
    assert.throws(() => checkProjectEnv(root), /does not look like a factory project/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
