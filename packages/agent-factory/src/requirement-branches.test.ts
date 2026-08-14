import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  changedRequirementIds,
  checkpointPushArgs,
  discardCheckpoint,
  pushCheckpoint,
  requirementBranchName,
  restoreCheckpoint,
} from './requirement-branches';
import { FactoryConfigSchema } from './config';

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

test('requirement branch names are stable and reject unsafe IDs', () => {
  assert.equal(requirementBranchName('RQ-0016'), 'factory/RQ-0016');
  assert.equal(requirementBranchName('rq-42', 'requirements/'), 'requirements/RQ-42');
  assert.throws(() => requirementBranchName('../main'), /Invalid requirement ID/);
});

test('checkpoint pushes use ci.skip only for GitLab-compatible remotes', () => {
  assert.deepEqual(
    checkpointPushArgs('origin', 'abc123', 'factory-checkpoint/RQ-1', true),
    ['push', 'origin', 'abc123:refs/heads/factory-checkpoint/RQ-1', '-o', 'ci.skip'],
  );
  assert.deepEqual(
    checkpointPushArgs('origin', 'abc123', 'factory-checkpoint/RQ-1', false),
    ['push', 'origin', 'abc123:refs/heads/factory-checkpoint/RQ-1'],
  );
});

test('changed requirements are detected from added and updated Markdown files', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-requirement-changes-'));
  try {
    git(root, 'init', '-b', 'main');
    git(root, 'config', 'user.name', 'AI Factory Test');
    git(root, 'config', 'user.email', 'test@example.invalid');
    mkdirSync(join(root, 'requirements'));
    writeFileSync(join(root, 'requirements', 'RQ-0001-first.md'), '# First\n');
    writeFileSync(join(root, 'README.md'), '# Project\n');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'initial');
    const base = git(root, 'rev-parse', 'HEAD');

    writeFileSync(join(root, 'requirements', 'RQ-0001-first.md'), '# First updated\n');
    writeFileSync(join(root, 'requirements', 'RQ-0002-second.md'), '# Second\n');
    writeFileSync(join(root, 'README.md'), '# Project updated\n');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'update requirements');
    const head = git(root, 'rev-parse', 'HEAD');

    assert.deepEqual(changedRequirementIds(root, base, head), ['RQ-0001', 'RQ-0002']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkpoint branch preserves artifacts and restores validated task state', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-checkpoint-branch-'));
  const remote = join(root, 'remote.git');
  const project = join(root, 'project');
  try {
    mkdirSync(project);
    git(root, 'init', '--bare', remote);
    git(remote, 'config', 'receive.advertisePushOptions', 'true');
    git(project, 'init', '-b', 'main');
    git(project, 'config', 'user.name', 'AI Factory Test');
    git(project, 'config', 'user.email', 'test@example.invalid');
    mkdirSync(join(project, 'requirements'));
    mkdirSync(join(project, 'src'));
    writeFileSync(join(project, 'requirements', 'RQ-0037-test.md'), '# RQ-0037\n');
    writeFileSync(join(project, 'src', 'main.ts'), 'export const value = 1;\n');
    git(project, 'add', '.');
    git(project, 'commit', '-m', 'initial');
    git(project, 'remote', 'add', 'origin', remote);
    git(project, 'push', '-u', 'origin', 'main');
    const sourceCommit = git(project, 'rev-parse', 'HEAD');
    const config = FactoryConfigSchema.parse({
      model: { provider: 'mock', name: 'mock' },
      paths: {
        requirements: join(project, 'requirements'), constraints: join(project, 'constraints'),
        runs: join(project, 'runs'), handoffs: join(project, 'handoffs'),
        templates: join(project, 'templates'), prompts: join(project, 'prompts'),
      },
      targetProject: { root: project, applyArtifacts: true, allowedPaths: ['src'], commands: {} },
      requirementBranches: { enabled: true, branchPrefix: 'factory/', baseBranch: 'main', remote: 'origin' },
    });
    const prepared = {
      root: project,
      branch: 'factory/RQ-0037',
      sourceCommit,
      requirementFile: 'requirements/RQ-0037-test.md',
      requirementSha256: 'req-hash',
    };
    writeFileSync(join(project, 'src', 'main.ts'), 'export const value = 2;\n');
    pushCheckpoint(prepared, config, {
      version: 1,
      requirementId: 'RQ-0037',
      requirementSha256: 'req-hash',
      sourceCommit,
      fast: false,
      previousRunId: 'run-1',
      stageExecutions: {},
      updatedAt: new Date().toISOString(),
      artifactPaths: ['src/main.ts'],
      tasks: {},
      plan: {
        requirementId: 'RQ-0037', summary: 'Plan', assumptions: [], outOfScope: [],
        tasks: [{ id: 'task-1', title: 'Task', description: 'Do it', dependsOn: [], acceptanceCriteria: ['Works'], targetFiles: ['src/main.ts'] }],
      },
    });
    git(project, 'restore', 'src/main.ts');
    const restored = restoreCheckpoint(prepared, config, 'RQ-0037', false);
    assert.equal(restored?.previousRunId, 'run-1');
    assert.equal(readFileSync(join(project, 'src', 'main.ts'), 'utf8'), 'export const value = 2;\n');
    assert.match(git(remote, 'show-ref', '--heads'), /factory-checkpoint\/RQ-0037/);
    discardCheckpoint(project, config, 'RQ-0037');
    assert.doesNotMatch(git(remote, 'show-ref', '--heads'), /factory-checkpoint\/RQ-0037/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
