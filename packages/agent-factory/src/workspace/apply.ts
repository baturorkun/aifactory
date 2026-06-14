import { mkdirSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, normalize, relative, resolve, sep } from 'path';
import type { TargetProjectConfig } from '../config';

export interface AppliedArtifact {
  path: string;
  absolutePath: string;
}

export function hasTargetProject(config: TargetProjectConfig): boolean {
  return Boolean(config.root);
}

export function shouldApplyArtifacts(config: TargetProjectConfig, dryRun: boolean): boolean {
  return Boolean(config.root && config.applyArtifacts && !dryRun);
}

export function resolveTargetRoot(config: TargetProjectConfig): string | undefined {
  return config.root ? resolve(config.root) : undefined;
}

export function applyArtifactToTarget(
  target: TargetProjectConfig,
  relativePath: string,
  content: string,
): AppliedArtifact {
  const targetRoot = resolveTargetRoot(target);
  if (!targetRoot) {
    throw new Error('targetProject.root is required to apply artifacts');
  }

  const safePath = validateTargetPath(targetRoot, relativePath, target.allowedPaths);
  mkdirSync(dirname(safePath), { recursive: true });
  writeFileSync(safePath, content, 'utf8');

  return {
    path: normalizeRelativePath(relative(targetRoot, safePath)),
    absolutePath: safePath,
  };
}

export function validateTargetPath(
  targetRoot: string,
  relativePath: string,
  allowedPaths: string[],
): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Artifact path must be relative: ${relativePath}`);
  }

  const normalized = normalizeRelativePath(relativePath);
  if (normalized === '.' || normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error(`Artifact path escapes target project: ${relativePath}`);
  }

  if (allowedPaths.length > 0 && !isAllowedPath(normalized, allowedPaths)) {
    throw new Error(
      `Artifact path is outside targetProject.allowedPaths: ${relativePath}`,
    );
  }

  const absolutePath = resolve(targetRoot, normalized);
  const relFromRoot = relative(targetRoot, absolutePath);
  if (relFromRoot.startsWith('..') || isAbsolute(relFromRoot)) {
    throw new Error(`Artifact path escapes target project: ${relativePath}`);
  }

  return absolutePath;
}

function isAllowedPath(path: string, allowedPaths: string[]): boolean {
  return allowedPaths
    .map(normalizeRelativePath)
    .some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

function normalizeRelativePath(path: string): string {
  return normalize(path).split(sep).join('/');
}
