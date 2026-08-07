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
    throw new Error('Multiple repository platforms are configured. Use --platform <name>.');
  }
  if (githubComplete) {
    return githubSettings(config, githubValues as Record<keyof typeof githubValues, string>, env);
  }
  if (gitlabComplete) {
    return gitlabSettings(config, gitlabValues as Record<keyof typeof gitlabValues, string>);
  }
  return { provider: 'none' };
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
    labels: {
      draft: nonEmpty(labels?.draft) ?? 'factory::draft',
      ready: nonEmpty(labels?.ready) ?? 'factory::ready',
      running: nonEmpty(labels?.running) ?? 'factory::running',
      needsFix: nonEmpty(labels?.needsFix) ?? 'factory::needs-fix',
      passed: nonEmpty(labels?.passed) ?? 'factory::passed',
    },
  };
  return { provider: 'github', settings };
}
