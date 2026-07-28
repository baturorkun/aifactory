import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { FactoryConfigSchema, type FactoryConfig } from './config';
import {
  createDraftRequirement,
  requirementExecutionDecision,
  setRequirementMode,
  submitRequirement,
} from './requirement-lifecycle';

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function makeRepository(): {
  root: string;
  remote: string;
  config: FactoryConfig;
  cleanup: () => void;
} {
  const temp = mkdtempSync(join(tmpdir(), 'aifactory-lifecycle-'));
  const remote = join(temp, 'remote.git');
  const root = join(temp, 'project');
  mkdirSync(root);
  git(temp, 'init', '--bare', remote);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Developer Name');
  git(root, 'config', 'user.email', 'developer@example.com');
  mkdirSync(join(root, 'requirements'));
  mkdirSync(join(root, 'constraints'));
  mkdirSync(join(root, 'runs'));
  mkdirSync(join(root, 'handoffs'));
  mkdirSync(join(root, 'prompts'));
  writeFileSync(
    join(root, 'requirements', 'RQ-0001-existing.md'),
    '# RQ-0001 - Existing\n\nExisting requirement.\n\n## Acceptance Criteria\n\n- Existing.\n',
  );
  writeFileSync(join(root, 'README.md'), '# Test project\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'initial');
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '--set-upstream', 'origin', 'main');

  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    paths: {
      requirements: join(root, 'requirements'),
      constraints: join(root, 'constraints'),
      runs: join(root, 'runs'),
      handoffs: join(root, 'handoffs'),
      templates: join(root, 'templates'),
      prompts: join(root, 'prompts'),
    },
    targetProject: {
      root,
      applyArtifacts: false,
      allowedPaths: ['src', 'tests'],
      commands: {},
    },
    requirementBranches: {
      enabled: true,
      branchPrefix: 'factory/',
      baseBranch: 'main',
      remote: 'origin',
    },
  });
  return {
    root,
    remote,
    config,
    cleanup: () => rmSync(temp, { recursive: true, force: true }),
  };
}

function completeDraft(path: string): void {
  const markdown = readFileSync(path, 'utf8')
    .replace('<!-- Describe the requirement here. -->', 'Implement the requested behavior.')
    .replace(
      '<!-- Add one acceptance criterion per bullet. -->',
      '- The requested behavior is implemented.',
    );
  writeFileSync(path, markdown);
}

test('new requirement reserves a draft on main and switches to its branch', () => {
  const repo = makeRepository();
  try {
    const result = createDraftRequirement(
      'Yeni özellik',
      'handoff',
      repo.config,
    );
    assert.equal(result.requirementId, 'RQ-0002');
    assert.equal(result.branch, 'factory/RQ-0002');
    assert.equal(git(repo.root, 'branch', '--show-current'), result.branch);

    const mainCopy = git(
      repo.root,
      `--git-dir=${repo.remote}`,
      'show',
      `main:${result.requirementFile}`,
    );
    assert.match(mainCopy, /status: draft/);
    assert.match(mainCopy, /createdByName: "Developer Name"/);
    assert.match(mainCopy, /createdByEmail: "developer@example.com"/);
    assert.match(
      git(repo.root, `--git-dir=${repo.remote}`, 'show-ref', result.branch),
      /refs\/heads\/factory\/RQ-0002/,
    );
  } finally {
    repo.cleanup();
  }
});

test('pipeline submit marks ready, commits only the requirement, and pushes the branch', async () => {
  const repo = makeRepository();
  try {
    const created = createDraftRequirement('Pipeline feature', 'handoff', repo.config);
    const requirementPath = join(repo.root, created.requirementFile);
    completeDraft(requirementPath);
    const updated = setRequirementMode(created.requirementId, 'pipeline', repo.config);
    assert.equal(updated.lifecycle?.executionMode, 'pipeline');

    const submitted = await submitRequirement(created.requirementId, repo.config, {
      createHandoff: async () => {
        throw new Error('handoff should not be called');
      },
    });
    assert.equal(submitted.pushed, true);
    assert.equal(requirementExecutionDecision(created.requirementId, repo.config), 'run');
    const remoteCopy = git(
      repo.root,
      `--git-dir=${repo.remote}`,
      'show',
      `${created.branch}:${created.requirementFile}`,
    );
    assert.match(remoteCopy, /status: ready/);
    assert.match(remoteCopy, /executionMode: pipeline/);
    assert.equal(git(repo.root, 'status', '--porcelain'), '');
  } finally {
    repo.cleanup();
  }
});

test('handoff submit stays local and returns the handoff run ID', async () => {
  const repo = makeRepository();
  try {
    const created = createDraftRequirement('Handoff feature', 'handoff', repo.config);
    completeDraft(join(repo.root, created.requirementFile));
    const submitted = await submitRequirement(created.requirementId, repo.config, {
      createHandoff: async () => '20260728123000-RQ-0002',
    });
    assert.equal(submitted.pushed, false);
    assert.equal(submitted.runId, '20260728123000-RQ-0002');
    assert.equal(requirementExecutionDecision(created.requirementId, repo.config), 'handoff');
    const remoteCopy = git(
      repo.root,
      `--git-dir=${repo.remote}`,
      'show',
      `${created.branch}:${created.requirementFile}`,
    );
    assert.match(remoteCopy, /status: draft/);
    assert.match(readFileSync(join(repo.root, created.requirementFile), 'utf8'), /status: ready/);
  } finally {
    repo.cleanup();
  }
});

test('submit rejects changes to another requirement', async () => {
  const repo = makeRepository();
  try {
    const created = createDraftRequirement('Isolated feature', 'pipeline', repo.config);
    completeDraft(join(repo.root, created.requirementFile));
    writeFileSync(
      join(repo.root, 'requirements', 'RQ-0001-existing.md'),
      '# RQ-0001 - Modified incorrectly\n',
    );
    await assert.rejects(
      submitRequirement(created.requirementId, repo.config, {
        createHandoff: async () => 'unused',
      }),
      /Only .* may have uncommitted changes/,
    );
  } finally {
    repo.cleanup();
  }
});

