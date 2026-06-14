import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'path';
import {
  RunManifestSchema,
  type RunManifest,
  type AgentStepRecord,
  type GateResults,
} from '@aifactory/contracts';

// ============================================================
// READ / WRITE
// ============================================================

export function readManifest(runDir: string): RunManifest {
  const path = join(runDir, 'manifest.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return RunManifestSchema.parse(raw);
}

export function writeManifest(runDir: string, manifest: RunManifest): void {
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function touch(runDir: string): RunManifest {
  return readManifest(runDir);
}

export function updateManifest(
  runDir: string,
  updater: (m: RunManifest) => RunManifest,
): RunManifest {
  const current = touch(runDir);
  const updated = updater({ ...current, updatedAt: new Date().toISOString() });
  writeManifest(runDir, updated);
  return updated;
}

// ============================================================
// RUN DIRECTORY
// ============================================================

export function createRunDir(runsDir: string, runId: string, requirementId: string): string {
  const runDir = join(runsDir, runId);
  mkdirSync(join(runDir, 'steps'), { recursive: true });
  mkdirSync(join(runDir, 'artifacts'), { recursive: true });
  mkdirSync(join(runDir, 'gates'), { recursive: true });

  const manifest: RunManifest = {
    runId,
    requirementId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
    artifacts: [],
    gateResults: {
      schemaCheck: 'pending',
      typeCheck: 'pending',
      lint: 'pending',
      tests: 'pending',
      security: 'pending',
    },
  };

  writeManifest(runDir, manifest);
  return runDir;
}

// ============================================================
// STATUS
// ============================================================

export function setRunStatus(runDir: string, status: RunManifest['status']): void {
  updateManifest(runDir, (m) => ({ ...m, status }));
}

// ============================================================
// STEP RECORDS
// ============================================================

export function addStep(runDir: string, step: AgentStepRecord): void {
  updateManifest(runDir, (m) => ({ ...m, steps: [...m.steps, step] }));
}

export function updateStep(
  runDir: string,
  agent: string,
  taskId: string | undefined,
  updates: Partial<AgentStepRecord>,
): void {
  updateManifest(runDir, (m) => ({
    ...m,
    steps: m.steps.map((s) =>
      s.agent === agent && s.taskId === taskId
        ? { ...s, ...updates, finishedAt: new Date().toISOString() }
        : s,
    ),
  }));
}

// ============================================================
// ARTIFACTS
// ============================================================

export function addArtifact(runDir: string, relativePath: string): void {
  updateManifest(runDir, (m) => ({
    ...m,
    artifacts: [...new Set([...m.artifacts, relativePath])],
  }));
}

export function writeArtifact(runDir: string, relativePath: string, content: string): string {
  const artifactsDir = join(runDir, 'artifacts');
  const fullPath = safeArtifactPath(artifactsDir, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

function safeArtifactPath(artifactsDir: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Artifact path must be relative: ${relativePath}`);
  }

  const normalized = normalize(relativePath).split(sep).join('/');
  if (normalized === '.' || normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error(`Artifact path escapes run artifacts directory: ${relativePath}`);
  }

  const fullPath = resolve(artifactsDir, normalized);
  const relFromRoot = relative(artifactsDir, fullPath);
  if (relFromRoot.startsWith('..') || isAbsolute(relFromRoot)) {
    throw new Error(`Artifact path escapes run artifacts directory: ${relativePath}`);
  }

  return fullPath;
}

// ============================================================
// STEP OUTPUT FILES
// ============================================================

export function writeStepOutput(runDir: string, filename: string, data: unknown): string {
  const filePath = join(runDir, 'steps', filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return filePath;
}

export function readStepOutput<T = unknown>(runDir: string, filename: string): T {
  return JSON.parse(readFileSync(join(runDir, 'steps', filename), 'utf8')) as T;
}

// ============================================================
// GATE RESULTS
// ============================================================

export function updateGateResults(runDir: string, results: Partial<GateResults>): void {
  updateManifest(runDir, (m) => ({
    ...m,
    gateResults: { ...m.gateResults, ...results },
  }));
}
