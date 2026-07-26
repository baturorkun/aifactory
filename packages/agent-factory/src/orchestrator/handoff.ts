import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, normalize, resolve, sep } from 'path';
import type { FactoryConfig } from '../config';
import { parseRequirement } from '../requirements/parser';
import { runAllGates } from '@aifactory/quality-gates';
import type { GateResults, RunManifest } from '@aifactory/contracts';
import { resolveTargetRoot, validateTargetPath } from '../workspace/apply';
import {
  addArtifact,
  addStep,
  copyArtifact,
  createRunDir,
  readManifest,
  setRunStatus,
  updateGateResults,
  updateManifest,
  updateStep,
} from './manifest';
import {
  buildGroundingQuestion,
  formatGroundingReference,
  queryConfiguredRag,
  shouldQueryGrounding,
  type RagGroundingResponse,
} from '../rag/grounding-client';

interface HandoffBaseline {
  targetRoot: string;
  files: Record<string, string>;
}

function timestampRunId(requirementId: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\..+/, '')
    .slice(0, 14);
  return `${timestamp}-${requirementId}`;
}

function generateRunId(requirementId: string, runsDir: string, handoffsDir: string): string {
  const base = timestampRunId(requirementId);
  let runId = base;
  let sequence = 2;
  while (existsSync(join(runsDir, runId)) || existsSync(join(handoffsDir, runId))) {
    runId = `${base}-${sequence}`;
    sequence += 1;
  }
  return runId;
}

function loadConstraints(id: string, constraintsDir: string): Record<string, unknown> {
  const path = resolve(join(constraintsDir, id + '.json'));
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function listTargetFiles(root: string): string[] {
  const ignored = new Set(['node_modules', 'runs', 'handoffs', 'dist', '.git', '.env']);
  const results: string[] = [];
  function walk(dir: string, prefix = ''): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.name.startsWith('.env.')) continue;
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) results.push(rel);
    }
  }
  walk(root);
  return results.sort();
}

function normalizeRelativePath(path: string): string {
  return normalize(path).split(sep).join('/');
}

function allowedTargetFiles(root: string, allowedPaths: string[]): string[] {
  return listTargetFiles(root).filter((file) => {
    try {
      validateTargetPath(root, file, allowedPaths);
      return true;
    } catch {
      return false;
    }
  });
}

function fileHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function targetSnapshot(root: string, allowedPaths: string[]): Record<string, string> {
  return Object.fromEntries(
    allowedTargetFiles(root, allowedPaths).map((file) => [
      file,
      fileHash(join(root, file)),
    ]),
  );
}

function baselinePath(runDir: string): string {
  return join(runDir, 'handoff-baseline.json');
}

function writeBaseline(runDir: string, targetRoot: string, allowedPaths: string[]): void {
  const baseline: HandoffBaseline = {
    targetRoot,
    files: targetSnapshot(targetRoot, allowedPaths),
  };
  writeFileSync(baselinePath(runDir), JSON.stringify(baseline, null, 2) + '\n', 'utf8');
}

function readBaseline(runDir: string): HandoffBaseline {
  if (!existsSync(baselinePath(runDir))) {
    throw new Error(`Handoff baseline is missing for run ${readManifest(runDir).runId}.`);
  }
  return JSON.parse(readFileSync(baselinePath(runDir), 'utf8')) as HandoffBaseline;
}

function requireHandoffRun(runDir: string): RunManifest {
  if (!existsSync(join(runDir, 'manifest.json'))) {
    throw new Error(`Run not found: ${runDir}`);
  }
  const manifest = readManifest(runDir);
  if (manifest.executionMode !== 'handoff') {
    throw new Error(`Run ${manifest.runId} is not a handoff run.`);
  }
  return manifest;
}

export function beginHandoffRun(runId: string, config: FactoryConfig): RunManifest {
  const runDir = resolve(config.paths.runs, runId);
  const manifest = requireHandoffRun(runDir);
  if (manifest.status === 'passed' || manifest.status === 'approved') {
    throw new Error(`Handoff run ${runId} is already ${manifest.status}.`);
  }
  setRunStatus(runDir, 'running');
  updateStep(runDir, 'handoff', undefined, {
    status: 'running',
    startedAt: new Date().toISOString(),
    error: undefined,
  });
  return readManifest(runDir);
}

export interface FinishHandoffOptions {
  skipGates?: boolean;
}

export async function finishHandoffRun(
  runId: string,
  config: FactoryConfig,
  options: FinishHandoffOptions = {},
): Promise<RunManifest> {
  const runDir = resolve(config.paths.runs, runId);
  let manifest = requireHandoffRun(runDir);
  if (manifest.status === 'approved') {
    throw new Error(`Handoff run ${runId} is already approved.`);
  }
  if (manifest.status !== 'running') beginHandoffRun(runId, config);

  try {
    const baseline = readBaseline(runDir);
    const targetRoot = resolveTargetRoot(config.targetProject);
    if (!targetRoot || resolve(targetRoot) !== resolve(baseline.targetRoot)) {
      throw new Error('The configured target project does not match the handoff baseline.');
    }

    const current = targetSnapshot(targetRoot, config.targetProject.allowedPaths);
    const changedFiles = Object.keys(current)
      .filter((file) => baseline.files[file] !== current[file])
      .sort();
    const deletedFiles = Object.keys(baseline.files)
      .filter((file) => !(file in current))
      .sort();

    for (const file of changedFiles) {
      copyArtifact(runDir, file, validateTargetPath(targetRoot, file, config.targetProject.allowedPaths));
      addArtifact(runDir, file);
    }
    updateManifest(runDir, (currentManifest) => ({
      ...currentManifest,
      deletedFiles,
    }));

    let gateResults: GateResults;
    if (options.skipGates) {
      gateResults = {
        schemaCheck: 'skipped',
        typeCheck: 'skipped',
        lint: 'skipped',
        tests: 'skipped',
        security: 'skipped',
      };
    } else {
      console.log('  ▸ Quality gates...');
      gateResults = await runAllGates(runDir, process.cwd(), {
        targetRoot,
        artifactPaths: changedFiles,
        commands: config.targetProject.commands,
      });
    }
    updateGateResults(runDir, gateResults);

    const hasFailedGates = Object.values(gateResults).some((result) => result === 'failed');
    updateStep(runDir, 'handoff', undefined, {
      status: hasFailedGates ? 'needs-fix' : 'passed',
      finishedAt: new Date().toISOString(),
    });
    setRunStatus(runDir, hasFailedGates ? 'needs-fix' : 'passed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateStep(runDir, 'handoff', undefined, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: message,
    });
    setRunStatus(runDir, 'failed');
    throw error;
  }

  manifest = readManifest(runDir);
  return manifest;
}

export async function createHandoffPackage(
  requirementId: string,
  config: FactoryConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const requirement = parseRequirement(requirementId, config.paths.requirements);
  const constraints = loadConstraints(requirementId, config.paths.constraints);
  const handoffsDir = resolve(config.paths.handoffs);
  const runsDir = resolve(config.paths.runs);
  const runId = generateRunId(requirementId, runsDir, handoffsDir);
  const handoffDir = join(handoffsDir, runId);
  mkdirSync(handoffDir, { recursive: true });
  const targetRoot = resolve(config.targetProject.root ?? '.');
  const handoffPath = normalizeRelativePath(join(config.paths.handoffs, runId, 'handoff.md'));
  const runDir = createRunDir(runsDir, runId, requirementId, {
    executionMode: 'handoff',
    handoffPath,
  });
  writeFileSync(join(runDir, 'requirement.md'), requirement.rawMarkdown, 'utf8');
  if (Object.keys(constraints).length > 0) {
    writeFileSync(
      join(runDir, 'constraints.json'),
      JSON.stringify(constraints, null, 2) + '\n',
      'utf8',
    );
  }
  writeBaseline(runDir, targetRoot, config.targetProject.allowedPaths);
  addStep(runDir, {
    agent: 'handoff',
    status: 'pending',
    retries: 0,
  });
  const files = listTargetFiles(targetRoot);
  let ragGrounding: RagGroundingResponse | undefined;
  let ragError: string | undefined;

  if (shouldQueryGrounding(config, requirement.rawMarkdown)) {
    console.log('  ▸ Project RAG grounding...');
    try {
      ragGrounding = await queryConfiguredRag(
        config,
        buildGroundingQuestion(config, requirement),
        fetchImpl,
      );
      writeFileSync(
        join(handoffDir, 'rag-context.json'),
        JSON.stringify(ragGrounding, null, 2) + '\n',
        'utf8',
      );
      writeFileSync(
        join(runDir, 'rag-context.json'),
        JSON.stringify(ragGrounding, null, 2) + '\n',
        'utf8',
      );
      console.log(`    └ ${ragGrounding.sources.length} cited source(s)`);
    } catch (error) {
      ragError = error instanceof Error ? error.message : String(error);
      if (!config.rag.grounding.failOpen) {
        updateStep(runDir, 'handoff', undefined, {
          status: 'failed',
          error: ragError,
        });
        setRunStatus(runDir, 'failed');
        throw error;
      }
      console.log(`    ⚠ RAG unavailable; creating handoff without grounding: ${ragError}`);
    }
  }

  const ragSection = ragGrounding
    ? ['## RAG Grounding', '', formatGroundingReference(config, ragGrounding), '']
    : ragError
      ? [
          '## RAG Grounding',
          '',
          `RAG grounding was requested but unavailable: ${ragError}`,
          'Verify domain-specific claims against the authoritative documents before implementation.',
          '',
        ]
      : [];
  const content = [
    '# Manual Handoff',
    '',
    `Run ID: \`${runId}\``,
    '',
    'Use this handoff in the manual implementation flow when you want an external implementer to complete the requirement without running the AI Factory agent pipeline.',
    '',
    '## Instruction for Implementer',
    '',
    'Read the requirement and constraints below, inspect the target project, implement the change directly in the workspace, and run the configured local checks. Do not call the AI Factory LLM pipeline for this task.',
    '',
    '## Target Project',
    '',
    '- Root: ' + targetRoot,
    '- Allowed paths: ' + ((config.targetProject.allowedPaths ?? []).join(', ') || '(not configured)'),
    '- Typecheck: ' + (config.targetProject.commands.typeCheck ?? '(not configured)'),
    '- Lint: ' + (config.targetProject.commands.lint ?? '(not configured)'),
    '- Test: ' + (config.targetProject.commands.test ?? '(not configured)'),
    '',
    '## Existing Files',
    '',
    ...files.map((file) => '- ' + file),
    '',
    '## Requirement',
    '',
    requirement.rawMarkdown,
    '',
    ...ragSection,
    '## Constraints',
    '',
    '```json',
    JSON.stringify(constraints, null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(join(handoffDir, 'handoff.md'), content, 'utf8');
  return runId;
}
