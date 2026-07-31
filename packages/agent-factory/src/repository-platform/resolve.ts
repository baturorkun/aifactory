import type { FactoryConfig } from '../config';
import type { GitLabPlatformSettings, ResolvedRepositoryPlatform } from './types';

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
  const configured = config.repositoryPlatforms.gitlab;
  const gitlabValues = {
    GITLAB_URL: nonEmpty(configured?.baseUrl) ?? nonEmpty(env.GITLAB_URL),
    GITLAB_PROJECT_ID: nonEmpty(configured?.projectId) ?? nonEmpty(env.GITLAB_PROJECT_ID),
    GITLAB_TOKEN: nonEmpty(configured?.token) ?? nonEmpty(env.GITLAB_TOKEN),
  };
  const gitlabAny = Object.values(gitlabValues).some(Boolean);
  const gitlabMissing = missingVariables(gitlabValues);
  const gitlabComplete = gitlabMissing.length === 0;

  const githubValues = {
    GITHUB_TOKEN: nonEmpty(env.GITHUB_TOKEN),
    GITHUB_REPOSITORY: nonEmpty(env.GITHUB_REPOSITORY),
  };
  const githubAny = Object.values(githubValues).some(Boolean);
  const githubComplete = missingVariables(githubValues).length === 0;

  if (requestedPlatform && requestedPlatform !== 'gitlab' && requestedPlatform !== 'none') {
    throw new Error(`Repository platform adapter is not installed: ${requestedPlatform}`);
  }
  if (requestedPlatform === 'none') return { provider: 'none' };

  if (requestedPlatform === 'gitlab') {
    if (!gitlabComplete) {
      throw new Error(`GitLab configuration is incomplete. Missing: ${gitlabMissing.join(', ')}`);
    }
    return gitlabSettings(config, gitlabValues as Record<keyof typeof gitlabValues, string>);
  }

  if (gitlabAny && !gitlabComplete) {
    throw new Error(`GitLab configuration is incomplete. Missing: ${gitlabMissing.join(', ')}`);
  }
  if (githubAny && !githubComplete) {
    const missing = missingVariables(githubValues);
    throw new Error(`GitHub configuration is incomplete. Missing: ${missing.join(', ')}`);
  }
  if (gitlabComplete && githubComplete) {
    throw new Error('Multiple repository platforms are configured. Use --platform <name>.');
  }
  if (githubComplete) {
    throw new Error('Repository platform adapter is not installed: github');
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
