import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { FactoryConfig } from './config';
import { findRequirementFile, parseRequirement } from './requirements/parser';
import { runPipeline, type PipelineOptions } from './orchestrator/pipeline';
import { readManifest, updateManifest } from './orchestrator/manifest';

export interface RequirementBranchMetadata {
  requirementId: string;
  requirementFile: string;
  requirementSha256: string;
  branch: string;
  baseBranch: string;
  sourceCommit: string;
  lastRunId: string;
  fast: boolean;
  updatedAt: string;
}

export interface SyncRequirementOptions extends PipelineOptions {
  sourceRef?: string;
  push?: boolean;
}

export interface SyncRequirementResult {
  requirementId: string;
  branch: string;
  changed: boolean;
  runId?: string;
  pushed: boolean;
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertRequirementId(requirementId: string): void {
  if (!/^RQ-[0-9]+$/i.test(requirementId)) {
    throw new Error(`Invalid requirement ID: ${requirementId}`);
  }
}

export function requirementBranchName(
  requirementId: string,
  branchPrefix = 'factory/',
): string {
  assertRequirementId(requirementId);
  return `${branchPrefix}${requirementId.toUpperCase()}`;
}

export function resolveRequirementFast(
  requirementId: string,
  config: FactoryConfig,
  override?: boolean,
): boolean {
  if (override !== undefined) return override;
  return parseRequirement(requirementId, config.paths.requirements).lifecycle?.pipelineFast ?? false;
}

export function changedRequirementIds(
  projectRoot: string,
  baseRef: string,
  headRef = 'HEAD',
): string[] {
  const root = resolve(projectRoot);
  const zeroRef = /^0+$/.test(baseRef);
  const output = zeroRef
    ? git(root, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', headRef])
    : git(root, ['diff', '--name-only', '--diff-filter=AMR', baseRef, headRef, '--', 'requirements']);
  return [...new Set(
    output
      .split(/\r?\n/)
      .map((path) => path.match(/^requirements\/(RQ-[0-9]+)(?:[-.].*)?\.(?:md|markdown)$/i)?.[1]?.toUpperCase())
      .filter((value): value is string => Boolean(value)),
  )].sort();
}

function metadataPath(projectRoot: string, requirementId: string): string {
  return resolve(projectRoot, '.aifactory', 'requirements', `${requirementId.toUpperCase()}.json`);
}

function readMetadata(path: string): RequirementBranchMetadata | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as RequirementBranchMetadata;
}

function prepareBranch(
  requirementId: string,
  config: FactoryConfig,
  sourceRef?: string,
): {
  root: string;
  branch: string;
  sourceCommit: string;
  requirementFile: string;
  requirementSha256: string;
  previous?: RequirementBranchMetadata;
} {
  if (!config.requirementBranches.enabled) {
    throw new Error('requirementBranches.enabled must be true to synchronize requirement branches.');
  }
  const root = resolve(config.targetProject.root ?? '.');
  if (git(root, ['status', '--porcelain'])) {
    throw new Error('Requirement branch synchronization requires a clean Git worktree.');
  }
  const remote = config.requirementBranches.remote;
  let sourceCommit: string;
  if (sourceRef) {
    sourceCommit = git(root, ['rev-parse', sourceRef]);
  } else {
    git(root, ['fetch', remote, config.requirementBranches.baseBranch]);
    sourceCommit = git(root, ['rev-parse', 'FETCH_HEAD']);
  }
  const branch = requirementBranchName(requirementId, config.requirementBranches.branchPrefix);
  const remoteBranchExists = Boolean(
    git(root, ['ls-remote', '--exit-code', '--heads', remote, branch], { allowFailure: true }),
  );

  if (remoteBranchExists) {
    git(root, ['fetch', remote, branch]);
    git(root, ['switch', '--force-create', branch, 'FETCH_HEAD']);
    git(root, ['merge', '--no-edit', sourceCommit]);
  } else {
    git(root, ['switch', '--create', branch, sourceCommit]);
  }

  const requirementPath = findRequirementFile(
    requirementId,
    resolve(config.paths.requirements),
  );
  if (!requirementPath) {
    throw new Error(`Requirement file not found after preparing branch: ${requirementId}`);
  }
  const requirementFile = relative(root, requirementPath).split('\\').join('/');
  const requirementSha256 = sha256(readFileSync(requirementPath, 'utf8'));
  const path = metadataPath(root, requirementId);
  return {
    root,
    branch,
    sourceCommit,
    requirementFile,
    requirementSha256,
    previous: readMetadata(path),
  };
}

export async function syncRequirementBranch(
  requirementId: string,
  config: FactoryConfig,
  options: SyncRequirementOptions = {},
): Promise<SyncRequirementResult> {
  assertRequirementId(requirementId);
  const prepared = prepareBranch(requirementId, config, options.sourceRef);
  if (prepared.previous?.requirementSha256 === prepared.requirementSha256) {
    return {
      requirementId,
      branch: prepared.branch,
      changed: false,
      pushed: false,
    };
  }

  const fast = resolveRequirementFast(requirementId, config, options.fast);
  const runId = await runPipeline(requirementId, config, { ...options, fast });
  const runDir = resolve(config.paths.runs, runId);
  const manifest = readManifest(runDir);
  updateManifest(runDir, (current) => ({
    ...current,
    git: {
      branch: prepared.branch,
      baseBranch: config.requirementBranches.baseBranch,
      sourceCommit: prepared.sourceCommit,
      requirementSha256: prepared.requirementSha256,
    },
  }));
  if (manifest.status !== 'passed') {
    throw new Error(`Run ${runId} finished with status ${manifest.status}; branch was not committed or pushed.`);
  }

  const metadata: RequirementBranchMetadata = {
    requirementId: requirementId.toUpperCase(),
    requirementFile: prepared.requirementFile,
    requirementSha256: prepared.requirementSha256,
    branch: prepared.branch,
    baseBranch: config.requirementBranches.baseBranch,
    sourceCommit: prepared.sourceCommit,
    lastRunId: runId,
    fast,
    updatedAt: new Date().toISOString(),
  };
  const path = metadataPath(prepared.root, requirementId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

  git(prepared.root, ['add', '--all']);
  const stagedDiff = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd: prepared.root,
  });
  if (stagedDiff.status === 1) {
    git(prepared.root, ['commit', '-m', `factory(${requirementId.toUpperCase()}): synchronize requirement branch`]);
  } else if (stagedDiff.status !== 0) {
    throw new Error('Could not inspect staged requirement branch changes.');
  }

  if (options.push) {
    git(prepared.root, ['push', '--set-upstream', config.requirementBranches.remote, prepared.branch]);
  }
  return {
    requirementId,
    branch: prepared.branch,
    changed: true,
    runId,
    pushed: Boolean(options.push),
  };
}
