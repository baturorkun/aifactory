import assert from 'node:assert/strict';
import test from 'node:test';
import { FactoryConfigSchema } from '../config';
import { resolveRepositoryPlatform } from './resolve';

const config = FactoryConfigSchema.parse({
  model: { provider: 'mock', name: 'mock' },
  requirementBranches: { enabled: true, baseBranch: 'main' },
});

test('repository platform resolution preserves branch-only behavior without credentials', () => {
  assert.deepEqual(resolveRepositoryPlatform(config, undefined, {}), { provider: 'none' });
});

test('repository platform resolution auto-detects complete GitLab credentials', () => {
  const resolved = resolveRepositoryPlatform(config, undefined, {
    GITLAB_URL: 'https://gitlab.example.test/',
    GITLAB_PROJECT_ID: 'group/project',
    GITLAB_TOKEN: 'secret-token',
  });
  assert.equal(resolved.provider, 'gitlab');
  if (resolved.provider === 'gitlab') {
    assert.equal(resolved.settings.baseUrl, 'https://gitlab.example.test');
    assert.equal(resolved.settings.projectId, 'group/project');
    assert.equal(resolved.settings.targetBranch, 'main');
  }
});

test('repository platform resolution auto-detects complete GitHub credentials', () => {
  const resolved = resolveRepositoryPlatform(config, undefined, {
    GITHUB_TOKEN: 'ghp_secret',
    GITHUB_REPOSITORY: 'owner/repo',
  });
  assert.equal(resolved.provider, 'github');
  if (resolved.provider === 'github') {
    assert.equal(resolved.settings.baseUrl, 'https://api.github.com');
    assert.equal(resolved.settings.repository, 'owner/repo');
    assert.equal(resolved.settings.targetBranch, 'main');
    assert.equal(resolved.settings.removeSourceBranchOnMerge, true);
  }
});

test('repository platform resolution safely reports partial GitLab configuration', () => {
  assert.throws(
    () => resolveRepositoryPlatform(config, undefined, { GITLAB_URL: 'https://gitlab.example.test' }),
    /Missing: GITLAB_PROJECT_ID, GITLAB_TOKEN/,
  );
});

test('repository platform resolution safely reports partial GitHub configuration', () => {
  assert.throws(
    () => resolveRepositoryPlatform(config, undefined, { GITHUB_TOKEN: 'token' }),
    /Missing: GITHUB_REPOSITORY/,
  );
});

test('explicit platform selection validates requested platform', () => {
  const resolvedGitLab = resolveRepositoryPlatform(config, 'gitlab', {
    GITLAB_URL: 'https://gitlab.example.test',
    GITLAB_PROJECT_ID: '42',
    GITLAB_TOKEN: 'token',
    GITHUB_TOKEN: 'github-token',
    GITHUB_REPOSITORY: 'owner/repo',
  });
  assert.equal(resolvedGitLab.provider, 'gitlab');

  const resolvedGitHub = resolveRepositoryPlatform(config, 'github', {
    GITLAB_URL: 'https://gitlab.example.test',
    GITLAB_PROJECT_ID: '42',
    GITLAB_TOKEN: 'token',
    GITHUB_TOKEN: 'github-token',
    GITHUB_REPOSITORY: 'owner/repo',
  });
  assert.equal(resolvedGitHub.provider, 'github');

  assert.throws(
    () => resolveRepositoryPlatform(config, 'unknown_platform', {}),
    /adapter is not installed: unknown_platform/,
  );
});

test('auto-detection rejects ambiguous complete providers', () => {
  assert.throws(
    () =>
      resolveRepositoryPlatform(config, undefined, {
        GITLAB_URL: 'https://gitlab.example.test',
        GITLAB_PROJECT_ID: '42',
        GITLAB_TOKEN: 'token',
        GITHUB_TOKEN: 'github-token',
        GITHUB_REPOSITORY: 'owner/repo',
      }),
    /Multiple repository platforms/,
  );
});
