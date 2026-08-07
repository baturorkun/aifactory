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
  cancelRequirement,
  createDraftRequirement,
  requirementExecutionDecision,
  setRequirementFast,
  setRequirementMode,
  submitRequirement,
  syncRequirementPlatform,
} from './requirement-lifecycle';
import { resolveRequirementFast } from './requirement-branches';
import type {
  ChangeRequest,
  RepositoryPlatformAdapter,
  WorkItem,
} from './repository-platform/types';

class FakeRepositoryPlatform implements RepositoryPlatformAdapter {
  readonly targetBranch = 'main';
  readonly lifecycleLabels = [
    'factory::draft',
    'factory::ready',
    'factory::running',
    'factory::needs-fix',
    'factory::passed',
  ];
  workItem?: WorkItem;
  changeRequest?: ChangeRequest;
  comments: string[] = [];
  closedChangeRequests = 0;

  constructor(readonly provider: 'gitlab' | 'github' = 'gitlab') {}

  async getWorkItem(iid: number): Promise<WorkItem | undefined> {
    return this.workItem?.iid === iid ? this.workItem : undefined;
  }
  async findWorkItem(marker: string): Promise<WorkItem | undefined> {
    return this.workItem?.description.includes(marker) ? this.workItem : undefined;
  }
  async createWorkItem(input: { title: string; description: string; labels: string[] }): Promise<WorkItem> {
    this.workItem = {
      iid: 12,
      title: input.title,
      description: input.description,
      url: this.provider === 'github'
        ? 'https://github.example.test/group/project/issues/12'
        : 'https://gitlab.example.test/group/project/-/issues/12',
      state: 'opened',
      labels: input.labels,
    };
    return this.workItem;
  }
  async setWorkItemLifecycleLabel(workItem: WorkItem, label: string): Promise<WorkItem> {
    workItem.labels = [label];
    return workItem;
  }
  async addWorkItemComment(_workItem: WorkItem, body: string, marker: string): Promise<void> {
    if (!this.comments.some((comment) => comment.includes(marker))) {
      this.comments.push(`${body}\n${marker}`);
    }
  }
  async getChangeRequest(iid: number): Promise<ChangeRequest | undefined> {
    return this.changeRequest?.iid === iid ? this.changeRequest : undefined;
  }
  async findChangeRequest(sourceBranch: string, targetBranch: string): Promise<ChangeRequest | undefined> {
    return this.changeRequest?.sourceBranch === sourceBranch &&
      this.changeRequest.targetBranch === targetBranch
      ? this.changeRequest
      : undefined;
  }
  async createDraftChangeRequest(input: {
    title: string;
    description: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ChangeRequest> {
    this.changeRequest = {
      iid: 21,
      title: this.provider === 'github' ? input.title : `Draft: ${input.title}`,
      url: this.provider === 'github'
        ? 'https://github.example.test/group/project/pull/21'
        : 'https://gitlab.example.test/group/project/-/merge_requests/21',
      state: 'opened',
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
    };
    return this.changeRequest;
  }
  async closeChangeRequest(changeRequest: ChangeRequest): Promise<ChangeRequest> {
    if (changeRequest.state === 'opened') {
      changeRequest.state = 'closed';
      this.closedChangeRequests += 1;
    }
    return changeRequest;
  }
}

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

test('new requirement reserves a draft on main and switches to its branch', async () => {
  const repo = makeRepository();
  try {
    const result = await createDraftRequirement(
      'Yeni özellik',
      'handoff',
      repo.config,
      { environment: {} },
    );
    assert.equal(result.requirementId, 'RQ-0002');
    assert.equal(result.branch, 'factory/RQ-0002');
    assert.equal(git(repo.root, 'branch', '--show-current'), result.branch);
    assert.match(git(repo.root, 'log', '-1', '--format=%s'), /\[skip ci\]$/);

    const mainCopy = git(
      repo.root,
      `--git-dir=${repo.remote}`,
      'show',
      `main:${result.requirementFile}`,
    );
    assert.match(mainCopy, /status: draft/);
    assert.match(mainCopy, /pipelineFast: false/);
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

test('cancel marks main, deletes requirement branches, and is idempotent', async () => {
  const repo = makeRepository();
  try {
    const created = await createDraftRequirement(
      'Cancelled feature',
      'handoff',
      repo.config,
      { environment: {} },
    );
    const cancelled = await cancelRequirement(created.requirementId, repo.config, {
      reason: 'No longer needed',
      environment: {},
    });

    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.pushed, true);
    assert.equal(cancelled.localBranchDeleted, true);
    assert.equal(cancelled.remoteBranchDeleted, true);
    assert.equal(git(repo.root, 'branch', '--show-current'), 'main');
    const mainCopy = git(
      repo.root,
      `--git-dir=${repo.remote}`,
      'show',
      `main:${created.requirementFile}`,
    );
    assert.match(mainCopy, /status: cancelled/);
    assert.match(mainCopy, /cancelledAt: "/);
    assert.match(mainCopy, /cancellationReason: "No longer needed"/);
    assert.notEqual(
      spawnSync('git', ['show-ref', '--verify', `refs/heads/${created.branch}`], { cwd: repo.root }).status,
      0,
    );
    assert.notEqual(
      spawnSync('git', [`--git-dir=${repo.remote}`, 'show-ref', '--verify', `refs/heads/${created.branch}`]).status,
      0,
    );

    const repeated = await cancelRequirement(created.requirementId, repo.config, {
      environment: {},
    });
    assert.equal(repeated.pushed, false);
    assert.equal(repeated.localBranchDeleted, false);
    assert.equal(repeated.remoteBranchDeleted, false);
  } finally {
    repo.cleanup();
  }
});

test('pipeline submit marks ready, commits only the requirement, and pushes the branch', async () => {
  const repo = makeRepository();
  try {
    const created = await createDraftRequirement(
      'Pipeline feature',
      'handoff',
      repo.config,
      { environment: {} },
    );
    const requirementPath = join(repo.root, created.requirementFile);
    completeDraft(requirementPath);
    const updated = setRequirementMode(created.requirementId, 'pipeline', repo.config);
    assert.equal(updated.lifecycle?.executionMode, 'pipeline');
    const fast = setRequirementFast(created.requirementId, true, repo.config);
    assert.equal(fast.lifecycle?.pipelineFast, true);
    assert.equal(resolveRequirementFast(created.requirementId, repo.config), true);
    assert.equal(resolveRequirementFast(created.requirementId, repo.config, false), false);

    const submitted = await submitRequirement(created.requirementId, repo.config, {
      createHandoff: async () => {
        throw new Error('handoff should not be called');
      },
    });
    assert.equal(submitted.pushed, true);
    assert.equal(submitted.pipelineFast, true);
    assert.equal(requirementExecutionDecision(created.requirementId, repo.config), 'run');
    const remoteCopy = git(
      repo.root,
      `--git-dir=${repo.remote}`,
      'show',
      `${created.branch}:${created.requirementFile}`,
    );
    assert.match(remoteCopy, /status: ready/);
    assert.match(remoteCopy, /executionMode: pipeline/);
    assert.match(remoteCopy, /pipelineFast: true/);
    assert.equal(git(repo.root, 'status', '--porcelain'), '');

    const commit = git(repo.root, 'rev-parse', 'HEAD');
    git(repo.root, 'switch', '--detach', commit);
    const previousGitlabCi = process.env.GITLAB_CI;
    const previousCiBranch = process.env.CI_COMMIT_BRANCH;
    const previousCiCommit = process.env.CI_COMMIT_SHA;
    process.env.GITLAB_CI = 'true';
    process.env.CI_COMMIT_BRANCH = created.branch;
    process.env.CI_COMMIT_SHA = commit;
    try {
      assert.equal(
        requirementExecutionDecision(created.requirementId, repo.config),
        'run',
      );
    } finally {
      if (previousGitlabCi === undefined) delete process.env.GITLAB_CI;
      else process.env.GITLAB_CI = previousGitlabCi;
      if (previousCiBranch === undefined) delete process.env.CI_COMMIT_BRANCH;
      else process.env.CI_COMMIT_BRANCH = previousCiBranch;
      if (previousCiCommit === undefined) delete process.env.CI_COMMIT_SHA;
      else process.env.CI_COMMIT_SHA = previousCiCommit;
    }
  } finally {
    repo.cleanup();
  }
});

test('handoff submit stays local and returns the handoff run ID', async () => {
  const repo = makeRepository();
  try {
    const created = await createDraftRequirement(
      'Handoff feature',
      'handoff',
      repo.config,
      { environment: {} },
    );
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
    const created = await createDraftRequirement(
      'Isolated feature',
      'pipeline',
      repo.config,
      { environment: {} },
    );
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

test('new requirement links a GitLab Issue and Draft MR through the platform adapter', async () => {
  const repo = makeRepository();
  const adapter = new FakeRepositoryPlatform();
  try {
    const created = await createDraftRequirement('GitLab feature', 'handoff', repo.config, {
      environment: {
        GITLAB_URL: 'https://gitlab.example.test',
        GITLAB_PROJECT_ID: 'group/project',
        GITLAB_TOKEN: 'secret',
      },
      platformAdapter: adapter,
    });
    assert.equal(created.repositoryProvider, 'gitlab');
    assert.equal(created.workItem?.iid, 12);
    assert.equal(created.changeRequest?.iid, 21);
    const markdown = readFileSync(join(repo.root, created.requirementFile), 'utf8');
    assert.match(markdown, /repositoryProvider: gitlab/);
    assert.match(markdown, /gitlabIssueIid: 12/);
    assert.match(markdown, /gitlabMergeRequestIid: 21/);
    assert.equal(adapter.comments.length, 2);
    assert.match(git(repo.root, 'log', '-2', '--format=%s'), /\[skip ci\]/);
    assert.equal(git(repo.root, 'status', '--porcelain'), '');
    const headBeforeRetry = git(repo.root, 'rev-parse', 'HEAD');
    const recovered = await syncRequirementPlatform(created.requirementId, repo.config, {
      environment: {
        GITLAB_URL: 'https://gitlab.example.test',
        GITLAB_PROJECT_ID: 'group/project',
        GITLAB_TOKEN: 'secret',
      },
      platformAdapter: adapter,
    });
    assert.equal(recovered.workItem.iid, 12);
    assert.equal(recovered.changeRequest.iid, 21);
    assert.equal(adapter.comments.length, 2);
    assert.equal(git(repo.root, 'rev-parse', 'HEAD'), headBeforeRetry);
  } finally {
    repo.cleanup();
  }
});

test('new requirement and submit synchronize a GitHub Issue and Draft PR', async () => {
  const repo = makeRepository();
  const adapter = new FakeRepositoryPlatform('github');
  repo.config.repositoryPlatforms.github = {
    baseUrl: 'https://api.github.example.test',
    repository: 'group/project',
    token: 'secret',
    targetBranch: 'main',
    labels: {
      draft: 'factory::draft',
      ready: 'factory::ready',
      running: 'factory::running',
      needsFix: 'factory::needs-fix',
      passed: 'factory::passed',
    },
  };
  try {
    const created = await createDraftRequirement('GitHub feature', 'handoff', repo.config, {
      platform: 'github',
      platformAdapter: adapter,
    });
    assert.equal(created.repositoryProvider, 'github');
    assert.equal(created.workItem?.iid, 12);
    assert.equal(created.changeRequest?.iid, 21);
    const requirementPath = join(repo.root, created.requirementFile);
    let markdown = readFileSync(requirementPath, 'utf8');
    assert.match(markdown, /repositoryProvider: github/);
    assert.match(markdown, /githubIssueIid: 12/);
    assert.match(markdown, /githubPullRequestIid: 21/);

    completeDraft(requirementPath);
    const submitted = await submitRequirement(created.requirementId, repo.config, {
      createHandoff: async () => 'github-handoff',
      platformAdapter: adapter,
    });

    assert.equal(submitted.status, 'ready');
    assert.equal(submitted.runId, 'github-handoff');
    assert.deepEqual(adapter.workItem?.labels, ['factory::ready']);
    assert.equal(adapter.comments.length, 3);
    markdown = readFileSync(requirementPath, 'utf8');
    assert.match(markdown, /status: ready/);
  } finally {
    repo.cleanup();
  }
});

test('cancel closes an existing GitLab MR before deleting its branch', async () => {
  const repo = makeRepository();
  const adapter = new FakeRepositoryPlatform();
  const environment = {
    GITLAB_URL: 'https://gitlab.example.test',
    GITLAB_PROJECT_ID: 'group/project',
    GITLAB_TOKEN: 'secret',
  };
  try {
    const created = await createDraftRequirement('Cancelled GitLab feature', 'handoff', repo.config, {
      environment,
      platformAdapter: adapter,
    });
    const result = await cancelRequirement(created.requirementId, repo.config, {
      reason: 'Superseded',
      environment,
      platformAdapter: adapter,
    });

    assert.equal(result.changeRequest?.iid, 21);
    assert.equal(result.changeRequest?.state, 'closed');
    assert.equal(adapter.closedChangeRequests, 1);
    assert.equal(result.remoteBranchDeleted, true);
    assert.equal(result.localBranchDeleted, true);
  } finally {
    repo.cleanup();
  }
});

test('cancel closes an existing GitHub PR before deleting its branch', async () => {
  const repo = makeRepository();
  const adapter = new FakeRepositoryPlatform('github');
  repo.config.repositoryPlatforms.github = {
    baseUrl: 'https://api.github.example.test',
    repository: 'group/project',
    token: 'secret',
    targetBranch: 'main',
    labels: {
      draft: 'factory::draft',
      ready: 'factory::ready',
      running: 'factory::running',
      needsFix: 'factory::needs-fix',
      passed: 'factory::passed',
    },
  };
  try {
    const created = await createDraftRequirement('Cancelled GitHub feature', 'handoff', repo.config, {
      platform: 'github',
      platformAdapter: adapter,
    });
    const result = await cancelRequirement(created.requirementId, repo.config, {
      platform: 'github',
      platformAdapter: adapter,
    });

    assert.equal(result.changeRequest?.iid, 21);
    assert.equal(result.changeRequest?.state, 'closed');
    assert.equal(adapter.closedChangeRequests, 1);
    assert.equal(result.remoteBranchDeleted, true);
    assert.equal(result.localBranchDeleted, true);
  } finally {
    repo.cleanup();
  }
});
