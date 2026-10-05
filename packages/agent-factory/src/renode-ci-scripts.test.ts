// The CI helper scripts the Renode template ships (templates/renode/scripts/ci):
// which requirements a pipeline checks, and the .env a job writes for itself.
// They run as the scaffold copies them, from scripts/ci/ of a project tree.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const TEMPLATE_CI = resolve(__dirname, '../templates/renode/scripts/ci');

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-renode-ci-'));
  mkdirSync(join(root, 'scripts/ci'), { recursive: true });
  for (const file of ['twin-requirements.mjs', 'ci-env.mjs']) copyFileSync(join(TEMPLATE_CI, file), join(root, 'scripts/ci', file));
  return root;
}

function requirement(root: string, id: string, kind: string, probe?: string): void {
  mkdirSync(join(root, 'requirements'), { recursive: true });
  const front = [`id: ${id}`, 'status: draft', `kind: ${kind}`, ...(probe ? [`probe: ${probe}`] : [])].join('\n');
  writeFileSync(join(root, 'requirements', `${id}-x.md`), `---\n${front}\n---\n# ${id}\n`);
}

function probeFiles(root: string, probe: string, files: string[]): void {
  mkdirSync(join(root, 'probes', probe), { recursive: true });
  for (const file of files) writeFileSync(join(root, 'probes', probe, file), 'x');
}

function scope(root: string, env: Record<string, string>): { picked: string[]; note: string } {
  const result = spawnSync(process.execPath, ['scripts/ci/twin-requirements.mjs'], {
    cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return { picked: result.stdout.trim().split('\n').filter(Boolean), note: result.stderr.trim() };
}

test('twin-requirements: a requirement branch checks its own probe as soon as it has an ELF', () => {
  const root = project();
  try {
    requirement(root, 'RQ-0001', 'hardware-twin', 'boot-console');
    requirement(root, 'RQ-0002', 'hardware-twin', 'timer');
    requirement(root, 'RQ-0003', 'standard');
    probeFiles(root, 'boot-console', ['boot-console.elf', 'board-trace.txt']);
    probeFiles(root, 'timer', ['timer.elf']);

    // The branch's probe, with or without a board trace.
    assert.deepEqual(scope(root, { CI_COMMIT_BRANCH: 'factory/RQ-0002' }).picked, ['RQ-0002 timer']);
    // The merge request from that branch too.
    assert.deepEqual(scope(root, { CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'factory/RQ-0002', CI_COMMIT_BRANCH: '' }).picked, ['RQ-0002 timer']);
    // Without an ELF the branch has nothing to check yet, and says so.
    rmSync(join(root, 'probes/timer/timer.elf'));
    const empty = scope(root, { CI_COMMIT_BRANCH: 'factory/RQ-0002' });
    assert.deepEqual(empty.picked, []);
    assert.match(empty.note, /RQ-0002 only .*no ELF yet/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('twin-requirements: elsewhere every hardware-twin requirement with a committed board trace', () => {
  const root = project();
  try {
    requirement(root, 'RQ-0001', 'hardware-twin', 'boot-console');
    requirement(root, 'RQ-0002', 'hardware-twin', 'timer');
    requirement(root, 'RQ-0003', 'standard');
    probeFiles(root, 'boot-console', ['boot-console.elf', 'board-trace.txt']);
    probeFiles(root, 'timer', ['timer.elf']);

    assert.deepEqual(scope(root, { CI_COMMIT_BRANCH: 'main' }).picked, ['RQ-0001 boot-console']);
    // A standard requirement's branch may still change the model: it checks every probe, as main.
    const standard = scope(root, { CI_COMMIT_BRANCH: 'factory/RQ-0003' });
    assert.deepEqual(standard.picked, ['RQ-0001 boot-console']);
    assert.match(standard.note, /RQ-0003 has no probe of its own/);
    probeFiles(root, 'timer', ['board-trace.txt']);
    assert.deepEqual(scope(root, { CI_COMMIT_BRANCH: 'main' }).picked, ['RQ-0001 boot-console', 'RQ-0002 timer']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ci-env: the job .env is .env.example with secrets from CI variables and the simulator inside the image', () => {
  const root = project();
  try {
    writeFileSync(join(root, '.env.example'), [
      '# a comment stays',
      'AI_PROVIDER=codex-cli',
      'SIMULATOR_HOST_TYPE=linux',
      'SIMULATOR_BIN=/opt/renode/renode_1.17.0-portable/renode',
      'SIMULATOR_REMOTE_HOST=lab.example',
      'SIMULATOR_REMOTE_USER=root',
      'SIMULATOR_TOOLCHAIN_BIN=/opt/toolchain/bin',
      'BOT_API_URL=http://lab-bot.example',
      'BOT_API_TOKEN=',
      'GITLAB_TOKEN=',
      '',
    ].join('\n'));
    const result = spawnSync(process.execPath, ['scripts/ci/ci-env.mjs'], {
      cwd: root, encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        SIMULATOR_BIN: '/opt/renode/current/renode',
        SIMULATOR_TOOLCHAIN_BIN: '/opt/arm-gnu-toolchain/current/bin',
        BOT_API_TOKEN: 'lab-secret',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /secrets from CI variables: BOT_API_TOKEN;/);
    const env = readFileSync(join(root, '.env'), 'utf8').split('\n');
    assert.ok(env.includes('# a comment stays'));
    assert.ok(env.includes('AI_PROVIDER=codex-cli'), 'a shared value is unchanged');
    assert.ok(env.includes('SIMULATOR_REMOTE_USER=root'), 'a remote setting other than the host is unchanged');
    assert.ok(env.includes('SIMULATOR_REMOTE_HOST='), 'the simulator runs inside the job');
    assert.ok(env.includes('SIMULATOR_BIN=/opt/renode/current/renode'), 'the image\'s Renode');
    assert.ok(env.includes('SIMULATOR_TOOLCHAIN_BIN=/opt/arm-gnu-toolchain/current/bin'), 'the image\'s toolchain');
    assert.ok(env.includes('BOT_API_TOKEN=lab-secret'), 'a secret set as a CI variable is filled');
    assert.ok(env.includes('GITLAB_TOKEN='), 'a secret not set stays empty');
    assert.ok(!env.some((line) => line.includes('lab-secret') && !line.startsWith('BOT_API_TOKEN=')), 'the secret goes nowhere else');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
