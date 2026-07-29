import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  Requirement,
  RequirementExecutionMode,
} from '@aifactory/contracts';
import type { FactoryConfig } from './config';
import {
  findRequirementFile,
  parseRequirement,
  updateRequirementMetadata,
} from './requirements/parser';
import { requirementBranchName } from './requirement-branches';

const REQUIREMENT_ID_PATTERN = /^RQ-(\d+)$/i;
const REQUIREMENT_FILE_PATTERN = /^(RQ-(\d+))(?:[-.].*)?\.(?:md|markdown)$/i;

export interface NewRequirementResult {
  requirementId: string;
  requirementFile: string;
  branch: string;
  mode: RequirementExecutionMode;
}

export interface SubmitRequirementResult {
  requirementId: string;
  mode: RequirementExecutionMode;
  status: 'ready';
  pushed: boolean;
  runId?: string;
}

interface SubmitDependencies {
  createHandoff: (
    requirementId: string,
    config: FactoryConfig,
  ) => Promise<string>;
}

function git(
  cwd: string,
  args: string[],
  options: { allowFailure?: boolean } = {},
): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.status === 0 ? result.stdout.trim() : '';
}

function projectRoot(config: FactoryConfig): string {
  if (!config.requirementBranches.enabled) {
    throw new Error('requirementBranches.enabled must be true.');
  }
  return resolve(config.targetProject.root ?? '.');
}

function assertRequirementId(requirementId: string): string {
  const normalized = requirementId.toUpperCase();
  if (!REQUIREMENT_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid requirement ID: ${requirementId}`);
  }
  return normalized;
}

function assertClean(root: string): void {
  if (git(root, ['status', '--porcelain'])) {
    throw new Error('This operation requires a clean Git worktree.');
  }
}

function currentBranch(root: string): string {
  return git(root, ['branch', '--show-current']);
}

function effectiveBranch(root: string): string {
  const localBranch = currentBranch(root);
  if (localBranch) return localBranch;

  const ciBranch = process.env.CI_COMMIT_BRANCH;
  const ciCommit = process.env.CI_COMMIT_SHA;
  if (
    process.env.GITLAB_CI === 'true' &&
    ciBranch &&
    ciCommit &&
    git(root, ['rev-parse', 'HEAD']) === ciCommit
  ) {
    return ciBranch;
  }
  return '';
}

function parsePorcelainPath(line: string): string {
  const value = (
    line.match(/^[ MADRCU?!]{2}\s+(.*)$/)?.[1] ??
    line.match(/^[MADRCU?!]\s+(.*)$/)?.[1] ??
    line
  ).trim();
  const renameTarget = value.includes(' -> ') ? value.split(' -> ').at(-1)! : value;
  return renameTarget.replace(/^"|"$/g, '');
}

function changedPaths(root: string): string[] {
  return git(root, ['status', '--porcelain'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parsePorcelainPath);
}

function assertActiveRequirementBranch(
  requirementId: string,
  config: FactoryConfig,
): { root: string; branch: string; requirementPath: string } {
  const id = assertRequirementId(requirementId);
  const root = projectRoot(config);
  const branch = requirementBranchName(id, config.requirementBranches.branchPrefix);
  if (effectiveBranch(root) !== branch) {
    throw new Error(`Requirement ${id} must be managed from branch ${branch}.`);
  }
  const requirementPath = findRequirementFile(id, resolve(config.paths.requirements));
  if (!requirementPath) throw new Error(`Requirement file not found: ${id}`);
  return { root, branch, requirementPath };
}

function assertRequirementIsolation(
  requirementId: string,
  root: string,
  requirementPath: string,
  config: FactoryConfig,
): void {
  const id = assertRequirementId(requirementId);
  const requirementRelative = relative(root, requirementPath).replace(/\\/g, '/');
  const otherWorkingChanges = changedPaths(root).filter((path) => path !== requirementRelative);
  if (otherWorkingChanges.length > 0) {
    throw new Error(
      `Only ${requirementRelative} may have uncommitted changes before submit: ${otherWorkingChanges.join(', ')}`,
    );
  }

  const baseRef = `${config.requirementBranches.remote}/${config.requirementBranches.baseBranch}`;
  const activeRequirementFile = relative(root, requirementPath).replace(/\\/g, '/');
  const changedRequirementFiles = git(
    root,
    ['diff', '--name-only', `${baseRef}...HEAD`, '--', 'requirements'],
    { allowFailure: true },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  const foreignFiles = changedRequirementFiles.filter(
    (path) => path !== activeRequirementFile,
  );
  if (foreignFiles.length > 0) {
    throw new Error(
      `Branch ${effectiveBranch(root)} may not modify other requirements: ${foreignFiles.join(', ')}`,
    );
  }
}

function slugify(title: string): string {
  const transliterated = title
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u');
  const slug = transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'requirement';
}

function nextRequirementId(requirementsDir: string): string {
  const max = existsSync(requirementsDir)
    ? readdirSync(requirementsDir)
        .map((file) => file.match(REQUIREMENT_FILE_PATTERN)?.[2])
        .filter((value): value is string => Boolean(value))
        .reduce((current, value) => Math.max(current, Number(value)), 0)
    : 0;
  return `RQ-${String(max + 1).padStart(4, '0')}`;
}

function quoteMetadata(value: string): string {
  return JSON.stringify(value);
}

function draftMarkdown(input: {
  id: string;
  title: string;
  mode: RequirementExecutionMode;
  name: string;
  email: string;
  createdAt: string;
  branch: string;
  createdFromCommit: string;
}): string {
  return [
    '---',
    `id: ${input.id}`,
    'status: draft',
    `executionMode: ${input.mode}`,
    `createdByName: ${quoteMetadata(input.name)}`,
    `createdByEmail: ${quoteMetadata(input.email)}`,
    `createdAt: ${quoteMetadata(input.createdAt)}`,
    `branch: ${quoteMetadata(input.branch)}`,
    `createdFromCommit: ${quoteMetadata(input.createdFromCommit)}`,
    '---',
    `# ${input.id} - ${input.title}`,
    '',
    '<!-- Describe the requirement here. -->',
    '',
    '## Acceptance Criteria',
    '',
    '<!-- Add one acceptance criterion per bullet. -->',
    '',
  ].join('\n');
}

function validateReady(requirement: Requirement): void {
  const description = requirement.description
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  if (!description) {
    throw new Error(`Requirement ${requirement.id} needs a description before submit.`);
  }
  const criteria = requirement.acceptanceCriteria.filter(
    (item) => item.trim() && !/\bTODO\b/i.test(item),
  );
  if (criteria.length === 0) {
    throw new Error(`Requirement ${requirement.id} needs at least one acceptance criterion before submit.`);
  }
}

export function createDraftRequirement(
  title: string,
  mode: RequirementExecutionMode,
  config: FactoryConfig,
): NewRequirementResult {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error('Requirement title cannot be empty.');
  const root = projectRoot(config);
  const baseBranch = config.requirementBranches.baseBranch;
  const remote = config.requirementBranches.remote;
  if (currentBranch(root) !== baseBranch) {
    throw new Error(`New requirements must be created from ${baseBranch}.`);
  }
  assertClean(root);
  git(root, ['fetch', remote, baseBranch]);
  git(root, ['merge', '--ff-only', `${remote}/${baseBranch}`]);

  const requirementsDir = resolve(config.paths.requirements);
  const authorName = git(root, ['config', 'user.name']);
  const authorEmail = git(root, ['config', 'user.email']);
  if (!authorName || !authorEmail) {
    throw new Error('Git user.name and user.email must be configured.');
  }

  let result: NewRequirementResult | undefined;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const requirementId = nextRequirementId(requirementsDir);
    const branch = requirementBranchName(
      requirementId,
      config.requirementBranches.branchPrefix,
    );
    const createdFromCommit = git(root, ['rev-parse', 'HEAD']);
    const requirementPath = resolve(
      requirementsDir,
      `${requirementId}-${slugify(normalizedTitle)}.md`,
    );
    writeFileSync(
      requirementPath,
      draftMarkdown({
        id: requirementId,
        title: normalizedTitle,
        mode,
        name: authorName,
        email: authorEmail,
        createdAt: new Date().toISOString(),
        branch,
        createdFromCommit,
      }),
      'utf8',
    );
    const requirementFile = relative(root, requirementPath).replace(/\\/g, '/');
    git(root, ['add', requirementFile]);
    git(root, [
      'commit',
      '-m',
      `requirement(${requirementId}): reserve draft [skip ci]`,
    ]);
    const push = spawnSync(
      'git',
      ['push', remote, `HEAD:${baseBranch}`],
      { cwd: root, encoding: 'utf8' },
    );
    if (push.status === 0) {
      result = { requirementId, requirementFile, branch, mode };
      break;
    }

    git(root, ['reset', '--mixed', createdFromCommit]);
    if (existsSync(requirementPath)) unlinkSync(requirementPath);
    git(root, ['fetch', remote, baseBranch]);
    const remoteHead = git(root, ['rev-parse', `${remote}/${baseBranch}`]);
    if (remoteHead === createdFromCommit) {
      const detail = (push.stderr || push.stdout || '').trim();
      throw new Error(`Could not push draft requirement${detail ? `: ${detail}` : ''}`);
    }
    git(root, ['merge', '--ff-only', `${remote}/${baseBranch}`]);
  }
  if (!result) {
    throw new Error('Could not reserve a requirement ID after 5 attempts.');
  }

  git(root, ['switch', '--create', result.branch]);
  git(root, ['push', '--set-upstream', remote, result.branch]);
  return result;
}

export function setRequirementMode(
  requirementId: string,
  mode: RequirementExecutionMode,
  config: FactoryConfig,
): Requirement {
  const { requirementPath } = assertActiveRequirementBranch(requirementId, config);
  const markdown = readFileSync(requirementPath, 'utf8');
  writeFileSync(
    requirementPath,
    updateRequirementMetadata(markdown, { executionMode: mode }),
    'utf8',
  );
  return parseRequirement(requirementId, config.paths.requirements);
}

export async function submitRequirement(
  requirementId: string,
  config: FactoryConfig,
  dependencies: SubmitDependencies,
): Promise<SubmitRequirementResult> {
  const id = assertRequirementId(requirementId);
  const { root, branch, requirementPath } = assertActiveRequirementBranch(id, config);
  assertRequirementIsolation(id, root, requirementPath, config);
  let requirement = parseRequirement(id, config.paths.requirements);
  if (!requirement.lifecycle) {
    throw new Error(`Requirement ${id} has no lifecycle metadata.`);
  }
  validateReady(requirement);
  if (requirement.lifecycle.status === 'completed') {
    throw new Error(`Requirement ${id} is already completed.`);
  }
  if (requirement.lifecycle.status === 'draft') {
    writeFileSync(
      requirementPath,
      updateRequirementMetadata(requirement.rawMarkdown, { status: 'ready' }),
      'utf8',
    );
    requirement = parseRequirement(id, config.paths.requirements);
  }

  if (requirement.lifecycle!.executionMode === 'handoff') {
    const runId = await dependencies.createHandoff(id, config);
    return {
      requirementId: id,
      mode: 'handoff',
      status: 'ready',
      pushed: false,
      runId,
    };
  }

  const requirementFile = relative(root, requirementPath).replace(/\\/g, '/');
  git(root, ['add', requirementFile]);
  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root });
  if (staged.status === 1) {
    git(root, ['commit', '-m', `requirement(${id}): submit for pipeline`]);
  } else if (staged.status !== 0) {
    throw new Error(`Could not inspect staged changes for ${id}.`);
  }
  git(root, ['push', config.requirementBranches.remote, `HEAD:${branch}`]);
  return {
    requirementId: id,
    mode: 'pipeline',
    status: 'ready',
    pushed: true,
  };
}

export function requirementExecutionDecision(
  requirementId: string,
  config: FactoryConfig,
): 'run' | 'draft' | 'handoff' | 'legacy' {
  const requirement = parseRequirement(requirementId, config.paths.requirements);
  if (!requirement.lifecycle) return 'legacy';
  const { root, requirementPath } = assertActiveRequirementBranch(requirementId, config);
  assertRequirementIsolation(requirementId, root, requirementPath, config);
  if (requirement.lifecycle.status !== 'ready') return 'draft';
  return requirement.lifecycle.executionMode === 'pipeline' ? 'run' : 'handoff';
}

export function assertRequirementExecution(
  requirement: Requirement,
  expectedMode: RequirementExecutionMode,
): void {
  if (!requirement.lifecycle) return;
  if (requirement.lifecycle.status !== 'ready') {
    throw new Error(
      `Requirement ${requirement.id} is ${requirement.lifecycle.status}; submit it before execution.`,
    );
  }
  if (requirement.lifecycle.executionMode !== expectedMode) {
    throw new Error(
      `Requirement ${requirement.id} uses ${requirement.lifecycle.executionMode} mode, not ${expectedMode}.`,
    );
  }
}
