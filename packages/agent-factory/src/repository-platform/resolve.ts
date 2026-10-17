import { spawnSync } from 'child_process';
import { resolve } from 'path';
import type { FactoryConfig } from '../config';
import type { GitHubPlatformSettings, GitLabPlatformSettings, ResolvedRepositoryPlatform } from './types';

type Environment = Record<string, string | undefined>;

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function missingVariables(values: Record<string, string | undefined>): string[] {
  return Object.entries(values)
    .filter(([, value]) => !nonEmpty(value))
    .map(([name]) => name);
}

export function resolveRepositoryPlatform(
  config: FactoryConfig,
  requestedPlatform?: string,
  env: Environment = process.env,
): ResolvedRepositoryPlatform {
  const configuredGitLab = config.repositoryPlatforms.gitlab;
  const gitlabValues = {
    GITLAB_URL: nonEmpty(configuredGitLab?.baseUrl) ?? nonEmpty(env.GITLAB_URL),
    GITLAB_PROJECT_ID: nonEmpty(configuredGitLab?.projectId) ?? nonEmpty(env.GITLAB_PROJECT_ID),
    GITLAB_TOKEN: nonEmpty(configuredGitLab?.token) ?? nonEmpty(env.GITLAB_TOKEN),
  };
  const gitlabAny = Object.values(gitlabValues).some(Boolean);
  const gitlabMissing = missingVariables(gitlabValues);
  const gitlabComplete = gitlabMissing.length === 0;

  const configuredGitHub = config.repositoryPlatforms.github;
  const githubValues = {
    GITHUB_TOKEN: nonEmpty(configuredGitHub?.token) ?? nonEmpty(env.GITHUB_TOKEN),
    GITHUB_REPOSITORY: nonEmpty(configuredGitHub?.repository) ?? nonEmpty(env.GITHUB_REPOSITORY),
  };
  const githubAny = Object.values(githubValues).some(Boolean);
  const githubMissing = missingVariables(githubValues);
  const githubComplete = githubMissing.length === 0;

  if (
    requestedPlatform &&
    requestedPlatform !== 'gitlab' &&
    requestedPlatform !== 'github' &&
    requestedPlatform !== 'none'
  ) {
    throw new Error(`Repository platform adapter is not installed: ${requestedPlatform}`);
  }
  if (requestedPlatform === 'none') return { provider: 'none' };

  if (requestedPlatform === 'gitlab') {
    if (!gitlabComplete) {
      throw new Error(`GitLab configuration is incomplete. Missing: ${gitlabMissing.join(', ')}`);
    }
    return gitlabSettings(config, gitlabValues as Record<keyof typeof gitlabValues, string>);
  }

  if (requestedPlatform === 'github') {
    if (!githubComplete) {
      throw new Error(`GitHub configuration is incomplete. Missing: ${githubMissing.join(', ')}`);
    }
    return githubSettings(config, githubValues as Record<keyof typeof githubValues, string>, env);
  }

  if (gitlabAny && !gitlabComplete) {
    throw new Error(`GitLab configuration is incomplete. Missing: ${gitlabMissing.join(', ')}`);
  }
  if (githubAny && !githubComplete) {
    throw new Error(`GitHub configuration is incomplete. Missing: ${githubMissing.join(', ')}`);
  }
  if (gitlabComplete && githubComplete) {
    // Both are set (a GitHub token in the shell for another project is enough):
    // the project's own remote says which one it lives on.
    const host = originHost(config);
    const gitlabHost = hostOf(gitlabValues.GITLAB_URL);
    const githubHost = githubWebHost(nonEmpty(configuredGitHub?.baseUrl) ?? nonEmpty(env.GITHUB_API_URL) ?? 'https://api.github.com');
    if (host && host === gitlabHost) return gitlabSettings(config, gitlabValues as Record<keyof typeof gitlabValues, string>);
    if (host && host === githubHost) return githubSettings(config, githubValues as Record<keyof typeof githubValues, string>, env);
    throw new Error('Multiple repository platforms are configured and the origin remote matches neither. Use --platform <name>.');
  }
  if (githubComplete) {
    return githubSettings(config, githubValues as Record<keyof typeof githubValues, string>, env);
  }
  if (gitlabComplete) {
    return gitlabSettings(config, gitlabValues as Record<keyof typeof gitlabValues, string>);
  }
  return { provider: 'none' };
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  // git@host:group/project.git, ssh://git@host/..., http(s)://host/...
  const scp = /^[^@/]+@([^:/]+):/.exec(url);
  if (scp) return scp[1].toLowerCase();
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

// The web host of a GitHub API URL: api.github.com is github.com, and a
// GitHub Enterprise API (host/api/v3) is its host.
function githubWebHost(apiUrl: string): string | undefined {
  const host = hostOf(apiUrl);
  return host === 'api.github.com' ? 'github.com' : host;
}

function originHost(config: FactoryConfig): string | undefined {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: resolve(config.targetProject.root ?? '.'),
    encoding: 'utf8',
  });
  return result.status === 0 ? hostOf(result.stdout.trim()) : undefined;
}

function gitlabSettings(
  config: FactoryConfig,
  values: Record<'GITLAB_URL' | 'GITLAB_PROJECT_ID' | 'GITLAB_TOKEN', string>,
): ResolvedRepositoryPlatform {
  const configured = config.repositoryPlatforms.gitlab;
  const labels = configured?.labels;
  const settings: GitLabPlatformSettings = {
    baseUrl: values.GITLAB_URL.replace(/\/+$/, ''),
    projectId: values.GITLAB_PROJECT_ID,
    token: values.GITLAB_TOKEN,
    targetBranch: nonEmpty(configured?.targetBranch) ?? config.requirementBranches.baseBranch,
    removeSourceBranchOnMerge: configured?.removeSourceBranchOnMerge ?? true,
    labels: {
      draft: nonEmpty(labels?.draft) ?? 'factory::draft',
      ready: nonEmpty(labels?.ready) ?? 'factory::ready',
      running: nonEmpty(labels?.running) ?? 'factory::running',
      needsFix: nonEmpty(labels?.needsFix) ?? 'factory::needs-fix',
      passed: nonEmpty(labels?.passed) ?? 'factory::passed',
    },
    sourceLabels: {
      inProgress: nonEmpty(labels?.sourceInProgress) ?? 'factory::in-progress',
      resolved: nonEmpty(labels?.sourceResolved) ?? 'factory::resolved',
    },
  };
  return { provider: 'gitlab', settings };
}

function githubSettings(
  config: FactoryConfig,
  values: Record<'GITHUB_TOKEN' | 'GITHUB_REPOSITORY', string>,
  env: Environment,
): ResolvedRepositoryPlatform {
  const configured = config.repositoryPlatforms.github;
  const labels = configured?.labels;
  const settings: GitHubPlatformSettings = {
    baseUrl: nonEmpty(configured?.baseUrl) ?? nonEmpty(env.GITHUB_API_URL) ?? 'https://api.github.com',
    repository: values.GITHUB_REPOSITORY,
    token: values.GITHUB_TOKEN,
    targetBranch: nonEmpty(configured?.targetBranch) ?? config.requirementBranches.baseBranch,
    removeSourceBranchOnMerge: configured?.removeSourceBranchOnMerge ?? true,
    labels: {
      draft: nonEmpty(labels?.draft) ?? 'factory::draft',
      ready: nonEmpty(labels?.ready) ?? 'factory::ready',
      running: nonEmpty(labels?.running) ?? 'factory::running',
      needsFix: nonEmpty(labels?.needsFix) ?? 'factory::needs-fix',
      passed: nonEmpty(labels?.passed) ?? 'factory::passed',
    },
    sourceLabels: {
      inProgress: nonEmpty(labels?.sourceInProgress) ?? 'factory::in-progress',
      resolved: nonEmpty(labels?.sourceResolved) ?? 'factory::resolved',
    },
  };
  return { provider: 'github', settings };
}
