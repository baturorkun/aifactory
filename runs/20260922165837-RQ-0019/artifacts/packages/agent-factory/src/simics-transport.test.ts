import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTargetProject } from './scaffold';

// The transport is a generated artifact, so it is exercised the way a project
// gets it: generate one, then run the file the project actually received.

function generatedProject(name: string): { root: string; parent: string } {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-transport-'));
  const { projectRoot } = createTargetProject(name, {
    dir: parent,
    simulator: 'simics',
    codexHome: join(parent, 'codex-home'),
  });
  // An empty host is local mode; the file is read by the transport itself.
  writeFileSync(join(projectRoot, '.env'), 'SIMULATOR_REMOTE_HOST=\n', 'utf8');
  return { root: projectRoot, parent };
}

function transport(root: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, ['scripts/sync-run.mjs', ...args], {
    cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
  return { status: result.status, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

test('local mode runs the command in the project, stages inputs and collects what --pull names', () => {
  const { root, parent } = generatedProject('local-sim');
  try {
    writeFileSync(join(parent, 'given.txt'), 'from the host\n', 'utf8');
    const collected = join(parent, 'collected.txt');
    const result = transport(root, [
      '--push-input', join(parent, 'given.txt'),
      '--pull', `build/made/result.txt=${collected}`,
      '--', 'sh', '-c', 'mkdir -p build/made && cat build/inputs/given.txt > build/made/result.txt',
    ]);
    assert.equal(result.status, 0, result.output);
    assert.equal(readFileSync(collected, 'utf8'), 'from the host\n');
    assert.equal(readFileSync(join(root, 'build/inputs/given.txt'), 'utf8'), 'from the host\n');
    assert.match(result.output, /Running in /);
    assert.doesNotMatch(result.output, /ssh|scp|archive/i, 'local mode contacts nothing');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('local mode propagates the command exit code and refuses a file the command did not produce', () => {
  const { root, parent } = generatedProject('local-fail-sim');
  try {
    assert.equal(transport(root, ['--', 'sh', '-c', 'exit 3']).status, 3);

    const missing = transport(root, ['--pull', `build/absent.txt=${join(parent, 'x.txt')}`, '--', 'sh', '-c', 'true']);
    assert.equal(missing.status, 2);
    assert.match(missing.output, /produced no build\/absent\.txt/);
    assert.equal(existsSync(join(parent, 'x.txt')), false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a leading -- is a separator when it is the only one, and pnpm\'s extra -- is dropped', () => {
  const { root, parent } = generatedProject('separator-sim');
  try {
    const direct = transport(root, ['--', 'sh', '-c', 'exit 0']);
    assert.equal(direct.status, 0, direct.output);

    const viaPnpm = transport(root, ['--', '--pull', `build/a.txt=${join(parent, 'a.txt')}`, '--',
      'sh', '-c', 'mkdir -p build && echo ok > build/a.txt']);
    assert.equal(viaPnpm.status, 0, viaPnpm.output);
    assert.equal(readFileSync(join(parent, 'a.txt'), 'utf8'), 'ok\n');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('remote mode names the missing variable and never invents a default', () => {
  const { root, parent } = generatedProject('remote-sim');
  try {
    const noUser = transport(root, ['--', 'sh', '-c', 'true'], { SIMULATOR_REMOTE_HOST: 'host.example' });
    assert.equal(noUser.status, 2);
    assert.match(noUser.output, /SIMULATOR_REMOTE_USER is not set, but SIMULATOR_REMOTE_HOST names a remote Simics host/);

    const noBase = transport(root, ['--', 'sh', '-c', 'true'],
      { SIMULATOR_REMOTE_HOST: 'host.example', SIMULATOR_REMOTE_USER: 'someone' });
    assert.match(noBase.output, /SIMULATOR_REMOTE_BASE_PATH is not set/);

    const badBase = transport(root, ['--', 'sh', '-c', 'true'], {
      SIMULATOR_REMOTE_HOST: 'host.example', SIMULATOR_REMOTE_USER: 'someone',
      SIMULATOR_REMOTE_BASE_PATH: '/not/windows', SIMULATOR_REMOTE_PROJECT_NAME: 'p',
    });
    assert.match(badBase.output, /SIMULATOR_REMOTE_BASE_PATH must be an absolute Windows/);

    const badPort = transport(root, ['--', 'sh', '-c', 'true'], {
      SIMULATOR_REMOTE_HOST: 'host.example', SIMULATOR_REMOTE_USER: 'someone',
      SIMULATOR_REMOTE_BASE_PATH: 'C:\\w', SIMULATOR_REMOTE_PROJECT_NAME: 'p', SIMULATOR_REMOTE_PORT: '0',
    });
    assert.match(badPort.output, /SIMULATOR_REMOTE_PORT must be an integer/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('--pull cannot reach outside the project in either mode', () => {
  const { root, parent } = generatedProject('escape-sim');
  try {
    for (const bad of ['../secret.txt', '/etc/hosts', 'C:/elsewhere/x']) {
      const result = transport(root, ['--pull', `${bad}=${join(parent, 'out')}`, '--', 'sh', '-c', 'true']);
      assert.equal(result.status, 2, bad);
      assert.match(result.output, /--pull produced path must be relative to the project/, bad);
    }
    const malformed = transport(root, ['--pull', 'no-equals-sign', '--', 'sh', '-c', 'true']);
    assert.match(malformed.output, /--pull must be <project-relative>=<local-path>/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the generated command wrapper expands ${NAME} from the environment and refuses an unset one', () => {
  const { root, parent } = generatedProject('wrapper-sim');
  try {
    const unset = spawnSync(process.execPath, ['scripts/simics-command.mjs', 'probe-build'], {
      cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH },
    });
    assert.equal(unset.status, 2);
    assert.match((unset.stdout ?? '') + (unset.stderr ?? ''), /PROBE_NAME is not set but .*probe\.probe-build\) refers to it/);

    // With the variables set, the recorded command runs and the pull lands.
    const config = JSON.parse(readFileSync(join(root, 'simics.config.json'), 'utf8'));
    config.probe['probe-build'] = ['node', 'scripts/sync-run.mjs',
      '--pull', 'build/probes/${PROBE_NAME}/${PROBE_NAME}.elf=${PROBE_ELF}', '--',
      'sh', '-c', 'mkdir -p "build/probes/$PROBE_NAME" && printf "ELF PROBE_SOURCE=%s" "$PROBE_SOURCE_HASH" > "build/probes/$PROBE_NAME/$PROBE_NAME.elf"'];
    writeFileSync(join(root, 'simics.config.json'), JSON.stringify(config, null, 2), 'utf8');
    mkdirSync(join(root, 'probes/p'), { recursive: true });

    const built = spawnSync(process.execPath, ['scripts/simics-command.mjs', 'probe-build'], {
      cwd: root, encoding: 'utf8',
      env: { PATH: process.env.PATH, PROBE_NAME: 'p', PROBE_ELF: join(root, 'probes/p/p.elf'), PROBE_SOURCE_HASH: 'abcdef0123456789' },
    });
    assert.equal(built.status, 0, (built.stdout ?? '') + (built.stderr ?? ''));
    assert.equal(readFileSync(join(root, 'probes/p/p.elf'), 'utf8'), 'ELF PROBE_SOURCE=abcdef0123456789');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
