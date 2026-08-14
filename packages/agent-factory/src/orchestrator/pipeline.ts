import { writeFileSync, existsSync, readFileSync, readdirSync } from 'fs';
import { extname, resolve, join } from 'path';
import { z } from 'zod';
import {
  PlanOutputSchema,
  ArchitectureOutputSchema,
  CodePatchOutputSchema,
  TestOutputSchema,
  ReviewOutputSchema,
  DomainGuardOutputSchema,
  type PlanOutput,
  type ArchitectureOutput,
  type CodePatchOutput,
  type TestOutput,
  type ReviewOutput,
  type DomainGuardOutput,
  type GateResults,
  type Task,
  type Requirement,
} from '@aifactory/contracts';
import type { FactoryConfig, TargetProjectConfig } from '../config';
import type { ModelAdapter } from '../model/adapter';
import { createModelAdapter, createReviewerAdapter } from '../model';
import { PromptRegistry } from '../prompts/registry';
import {
  buildPlannerPrompt,
  buildArchitectPrompt,
  buildCoderPrompt,
  buildTesterPrompt,
  buildReviewerPrompt,
  buildDomainGuardPrompt,
  buildQualityGateRepairPrompt,
  type FixContext,
} from '../prompts/builders';
import { parseRequirement } from '../requirements/parser';
import { extractJSON } from '../utils/json';
import {
  buildCodePatchResponseSchema,
  buildTestOutputResponseSchema,
} from '../model/response-schemas';
import {
  applyArtifactToTarget,
  resolveTargetRoot,
  shouldApplyArtifacts,
  validateTargetPath,
} from '../workspace/apply';
import {
  createRunDir,
  readManifest,
  setRunStatus,
  writeArtifact,
  addArtifact,
  updateGateResults,
  updateStep,
} from './manifest';
import { runAgent } from './runner';
import { runAllGates, type GateReport } from '@aifactory/quality-gates';
import {
  buildGroundingQuestion,
  formatGroundingContext,
  queryConfiguredRag,
  shouldQueryGrounding,
  type RagGroundingResponse,
} from '../rag/grounding-client';
import {
  loadProjectGuidelines,
  recordProjectGuidelines,
  withProjectGuidelines,
  type ProjectGuidelinesContext,
} from '../project-guidelines';
import { assertRequirementExecution } from '../requirement-lifecycle';
import {
  describeCheckpointResume,
  type CheckpointTaskUpdate,
  type PipelineCheckpointProgress,
  type PipelineCheckpoint,
  type PipelineStage,
} from './checkpoint';
import {
  failedGateNames,
  formatFailureSummary,
  writeFailureSummary,
  type TaskFailureSummary,
} from './failure-summary';

// ============================================================
// HELPERS
// ============================================================

function generateRunId(requirementId: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\..+/, '')
    .slice(0, 14);
  return `${ts}-${requirementId}`;
}

function loadConstraints(id: string, constraintsDir: string): Record<string, unknown> {
  const path = resolve(join(constraintsDir, `${id}.json`));
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function makeValidator<T>(schema: z.ZodType<T>, label: string) {
  return (raw: unknown): T => {
    const r = schema.safeParse(raw);
    if (!r.success) {
      throw new Error(`${label} output schema invalid:\n${r.error.message}`);
    }
    return r.data;
  };
}

function taskAllowsPath(task: Task, artifactPath: string): boolean {
  if (!task.targetFiles?.length) return true;
  return task.targetFiles.some((targetPath) =>
    extname(targetPath) ? artifactPath === targetPath : artifactPath === targetPath || artifactPath.startsWith(`${targetPath}/`),
  );
}

function taskTestPaths(task: Task): string[] {
  const targetFiles = task.targetFiles ?? [];
  const explicitTestPaths = targetFiles.filter((path) =>
    path === 'tests' ||
    path.startsWith('tests/') ||
    /(?:^|\/)(?:test|tests|spec)(?:\/|\.|$)/i.test(path) ||
    /\.(?:test|spec)\.[^.]+$/i.test(path),
  );
  return explicitTestPaths.length ? explicitTestPaths : targetFiles;
}

function taskAllowsTestPath(task: Task, artifactPath: string): boolean {
  const targetPaths = taskTestPaths(task);
  if (!targetPaths.length) return true;
  return targetPaths.some((targetPath) =>
    extname(targetPath)
      ? artifactPath === targetPath
      : artifactPath === targetPath || artifactPath.startsWith(`${targetPath}/`),
  );
}

function constraintAllowedPaths(constraints: Record<string, unknown>): string[] {
  const configured = constraints.allowedImplementationPaths;
  return Array.isArray(configured) ? configured.filter((value): value is string => typeof value === 'string') : [];
}

function pathAllowedByHints(artifactPath: string, hints: readonly string[]): boolean {
  if (!hints.length) return true;
  return hints.some((hint) =>
    extname(hint) ? artifactPath === hint : artifactPath === hint || artifactPath.startsWith(`${hint}/`),
  );
}

function validateConfiguredPath(target: TargetProjectConfig, artifactPath: string): string | undefined {
  const targetRoot = resolveTargetRoot(target);
  if (!targetRoot) return undefined;
  return validateTargetPath(targetRoot, artifactPath, target.allowedPaths);
}

function existingTaskFiles(task: Task, target: TargetProjectConfig): Array<{ path: string; content: string }> {
  if (!task.targetFiles?.length) return [];
  return task.targetFiles.flatMap((artifactPath) => {
    const absolutePath = validateConfiguredPath(target, artifactPath);
    if (!absolutePath || !existsSync(absolutePath) || extname(artifactPath) === '') return [];
    return [{ path: artifactPath, content: readFileSync(absolutePath, 'utf8') }];
  });
}

function existingTestPaths(target: TargetProjectConfig): string[] {
  const targetRoot = resolveTargetRoot(target);
  if (!targetRoot) return [];
  const testsRoot = join(targetRoot, 'tests');
  if (!existsSync(testsRoot)) return [];
  return readdirSync(testsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `tests/${entry.name}`)
    .sort();
}

function existingTaskTestFiles(
  task: Task,
  target: TargetProjectConfig,
): Array<{ path: string; content: string }> {
  let remainingChars = 60_000;
  return existingTestPaths(target)
    .filter((path) => taskAllowsTestPath(task, path))
    .flatMap((path) => {
      if (remainingChars <= 0) return [];
      const absolutePath = validateConfiguredPath(target, path);
      if (!absolutePath || !existsSync(absolutePath)) return [];
      const content = readFileSync(absolutePath, 'utf8').slice(0, remainingChars);
      remainingChars -= content.length;
      return [{ path, content }];
    });
}

function existingArtifactFiles(
  runDir: string,
  target: TargetProjectConfig,
): Array<{ path: string; content: string }> {
  return [...new Set(readManifest(runDir).artifacts)].flatMap((artifactPath) => {
    const absolutePath = validateConfiguredPath(target, artifactPath);
    if (!absolutePath || !existsSync(absolutePath) || extname(artifactPath) === '') return [];
    return [{ path: artifactPath, content: readFileSync(absolutePath, 'utf8') }];
  });
}

const REVIEW_CONTEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.json',
]);
const REVIEW_CONTEXT_MAX_FILES = 8;
const REVIEW_CONTEXT_MAX_CHARS = 40_000;

function referencedFileHints(requirement: Requirement, architecture: ArchitectureOutput): string[] {
  const hints = new Set<string>();
  for (const component of architecture.components) {
    hints.add(component.path);
    for (const dependency of component.dependencies) hints.add(dependency);
  }
  const filePattern = /(?:^|[`\s(])([A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|cjs|html|css|json))(?=$|[`\s),:])/g;
  for (const match of requirement.rawMarkdown.matchAll(filePattern)) {
    if (match[1]) hints.add(match[1]);
  }
  return [...hints];
}

function walkContextFiles(root: string, relativePath: string, result: string[]): void {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) return;
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const child = join(relativePath, entry.name);
    if (entry.isDirectory()) walkContextFiles(root, child, result);
    else if (entry.isFile() && REVIEW_CONTEXT_EXTENSIONS.has(extname(entry.name))) result.push(child);
  }
}

export function collectReviewSupportingFiles(
  requirement: Requirement,
  architecture: ArchitectureOutput,
  task: Task,
  target: TargetProjectConfig,
): Array<{ path: string; content: string }> {
  const targetRoot = resolveTargetRoot(target);
  if (!targetRoot) return [];
  const taskPaths = new Set(task.targetFiles ?? []);
  const candidates: string[] = [];
  for (const allowedPath of target.allowedPaths) {
    const absolutePath = resolve(targetRoot, allowedPath);
    if (!existsSync(absolutePath)) continue;
    if (extname(allowedPath)) candidates.push(allowedPath);
    else walkContextFiles(targetRoot, allowedPath, candidates);
  }

  const selected = new Set<string>();
  for (const hint of referencedFileHints(requirement, architecture)) {
    const normalizedHint = hint.replace(/^\.\//, '');
    const basename = normalizedHint.split('/').at(-1);
    for (const candidate of candidates) {
      if (candidate === normalizedHint || (basename && candidate.endsWith(`/${basename}`))) {
        if (!taskPaths.has(candidate)) selected.add(candidate);
      }
    }
  }

  let remainingChars = REVIEW_CONTEXT_MAX_CHARS;
  return [...selected].sort().slice(0, REVIEW_CONTEXT_MAX_FILES).flatMap((path) => {
    if (remainingChars <= 0) return [];
    const absolutePath = validateConfiguredPath(target, path);
    if (!absolutePath || !existsSync(absolutePath)) return [];
    const content = readFileSync(absolutePath, 'utf8').slice(0, remainingChars);
    remainingChars -= content.length;
    return [{ path, content }];
  });
}

function cumulativeCodeForTask(
  task: Task,
  runDir: string,
  target: TargetProjectConfig,
  latest: CodePatchOutput,
): CodePatchOutput {
  const patches = existingArtifactFiles(runDir, target)
    .filter((file) => taskAllowsPath(task, file.path))
    .map((file) => ({
      path: file.path,
      content: file.content,
      language: extname(file.path).slice(1) || 'text',
      description: 'Cumulative task artifact after all applied repair iterations.',
      mode: 'full' as const,
    }));
  return patches.length ? { ...latest, patches } : latest;
}

function makeCodeValidator(task: Task, target: TargetProjectConfig) {
  return (raw: unknown): CodePatchOutput => {
    const parsed = CodePatchOutputSchema.parse(raw);
    const paths = parsed.patches.map((patch) => patch.path);
    if (new Set(paths).size !== paths.length) {
      throw new Error('Coder output contains duplicate patch paths. Return one cumulative patch per file.');
    }
    const patches = parsed.patches.map((patch) => {
      if (!taskAllowsPath(task, patch.path)) {
        throw new Error(`Coder artifact path is outside task.targetFiles: ${patch.path}`);
      }
      const absolutePath = validateConfiguredPath(target, patch.path);
      if (patch.mode !== 'replace') return patch;
      if (!absolutePath || !existsSync(absolutePath)) {
        throw new Error(`Cannot apply exact-text replacement to missing file: ${patch.path}`);
      }
      const current = readFileSync(absolutePath, 'utf8');
      const find = patch.find!;
      const occurrences = current.split(find).length - 1;
      if (occurrences !== 1) {
        throw new Error(`Replacement find text must occur exactly once in ${patch.path}; found ${occurrences}`);
      }
      return { ...patch, mode: 'full' as const, find: undefined, content: current.replace(find, patch.content) };
    });
    return { ...parsed, patches };
  };
}

function coderResponseSchema(task: Task): Record<string, unknown> {
  const targetFiles = task.targetFiles;
  const exactTargetFiles =
    targetFiles?.length && targetFiles.every((targetPath) => extname(targetPath))
      ? targetFiles
      : undefined;
  return buildCodePatchResponseSchema(exactTargetFiles);
}

function testerResponseSchema(task: Task): Record<string, unknown> {
  const targetFiles = taskTestPaths(task);
  const exactTargetFiles =
    targetFiles.length && targetFiles.every((targetPath) => extname(targetPath))
      ? targetFiles
      : undefined;
  return buildTestOutputResponseSchema(exactTargetFiles);
}

export function validateTestOutputForTask(
  raw: unknown,
  task: Task,
  constraints: Record<string, unknown>,
  target: TargetProjectConfig,
): TestOutput {
  const parsed = TestOutputSchema.parse(raw);
  const paths = parsed.tests.map((test) => test.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error('Tester output contains duplicate test paths. Return one complete test artifact per file.');
  }
  const constraintPaths = constraintAllowedPaths(constraints);
  for (const test of parsed.tests) {
    if (!taskAllowsTestPath(task, test.path)) {
      throw new Error(`Tester artifact path is outside task test targets: ${test.path}`);
    }
    if (!pathAllowedByHints(test.path, constraintPaths)) {
      throw new Error(`Tester artifact path is outside requirement constraints: ${test.path}`);
    }
    validateConfiguredPath(target, test.path);
  }
  return parsed;
}

function hasRepairableGateFailure(results: GateResults): boolean {
  return results.typeCheck === 'failed' || results.lint === 'failed' || results.tests === 'failed';
}

function hasUnsafeGateFailure(results: GateResults): boolean {
  return results.schemaCheck === 'failed' || results.security === 'failed';
}

function readGateReports(runDir: string): GateReport[] {
  const reportPath = join(runDir, 'gates', 'report.json');
  if (!existsSync(reportPath)) return [];
  return JSON.parse(readFileSync(reportPath, 'utf8')) as GateReport[];
}

// ============================================================
// OPTIONS
// ============================================================

export interface PipelineOptions {
  /** Use mock adapter — no real LLM calls */
  dryRun?: boolean;
  /** Skip quality gates after agent pipeline */
  skipGates?: boolean;
  /** Only run specific task IDs from the plan */
  taskIds?: string[];
  /** Cost-controlled mode: planner + architect + coder + gates only */
  fast?: boolean;
  /** Resume planner/task state restored from a validated checkpoint branch. */
  resumeCheckpoint?: PipelineCheckpoint;
  /** Persist resumable state after every completed pipeline stage. */
  onCheckpoint?: (progress: PipelineCheckpointProgress) => void;
}

// ============================================================
// MAIN PIPELINE
// ============================================================

export async function runPipeline(
  requirementId: string,
  config: FactoryConfig,
  opts: PipelineOptions = {},
): Promise<string> {
  // -- Inputs
  const requirement = parseRequirement(requirementId, config.paths.requirements);
  assertRequirementExecution(requirement, 'pipeline');
  const constraints = loadConstraints(requirementId, config.paths.constraints);
  const projectGuidelines = loadProjectGuidelines(config);

  // -- Run directory
  const runId = generateRunId(requirementId);
  const runDir = createRunDir(resolve(config.paths.runs), runId, requirementId, {
    fast: Boolean(opts.fast),
  });
  for (const artifactPath of opts.resumeCheckpoint?.artifactPaths ?? []) {
    addArtifact(runDir, artifactPath);
  }
  recordProjectGuidelines(runDir, projectGuidelines);

  // Save input copies for reproducibility
  writeFileSync(join(runDir, 'requirement.md'), requirement.rawMarkdown, 'utf8');
  if (Object.keys(constraints).length > 0) {
    writeFileSync(
      join(runDir, 'constraints.json'),
      JSON.stringify(constraints, null, 2) + '\n',
      'utf8',
    );
  }

  // -- Model adapters
  const effectiveConfig =
    opts.dryRun ? { ...config, model: { ...config.model, provider: 'mock' as const } } : config;

  const primaryModel = createModelAdapter(effectiveConfig.model);
  const reviewerModel = createReviewerAdapter(effectiveConfig.model);
  const promptRegistry = new PromptRegistry(resolve(config.paths.prompts));

  console.log(`  Run ID   : ${runId}`);
  console.log(`  Req      : ${requirement.title} (${requirement.id})`);
  console.log(`  Model    : ${primaryModel.name}`);
  console.log(`  Reviewer : ${reviewerModel.name}`);
  console.log(`  Pipeline : ${opts.fast ? 'fast' : 'full'}`);
  if (opts.resumeCheckpoint) {
    console.log(
      `  Resume   : ${describeCheckpointResume(opts.resumeCheckpoint, {
        provider: effectiveConfig.model.provider,
        model: effectiveConfig.model.name,
      })}`,
    );
  }
  if (effectiveConfig.targetProject.root) {
    console.log(`  Target   : ${resolveTargetRoot(effectiveConfig.targetProject)}`);
    console.log(
      `  Apply    : ${
        shouldApplyArtifacts(effectiveConfig.targetProject, Boolean(opts.dryRun))
          ? 'enabled'
          : 'disabled'
      }`,
    );
  }
  console.log();

  setRunStatus(runDir, 'running');

  try {
    let hasFailedTasks = false;
    const taskFailures: TaskFailureSummary[] = [];
    let ragGrounding: RagGroundingResponse | undefined;

    if (!opts.dryRun && shouldQueryGrounding(config, requirement.rawMarkdown)) {
      console.log('  ▸ Project RAG grounding...');
      try {
        ragGrounding = await queryConfiguredRag(config, buildGroundingQuestion(config, requirement));
        writeFileSync(
          join(runDir, 'rag-context.json'),
          JSON.stringify(ragGrounding, null, 2) + '\n',
          'utf8',
        );
        console.log(`    └ ${ragGrounding.sources.length} cited source(s)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!config.rag.grounding.failOpen) throw error;
        console.log(`    ⚠ RAG unavailable; continuing without grounding: ${message}`);
      }
    }

    // ---- 1. Planning
    let plan: PlanOutput;
    if (opts.resumeCheckpoint) {
      plan = opts.resumeCheckpoint.plan;
      writeFileSync(join(runDir, 'steps', 'planner-output.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
      console.log(`  ▸ Planner: restored from checkpoint (${plan.tasks.length} task(s))`);
    } else {
      console.log('  ▸ Planner...');
      const planner = await runPlannerAgent(
        requirement,
        constraints,
        runDir,
        primaryModel,
        promptRegistry,
        config,
        ragGrounding,
        projectGuidelines,
      );
      plan = planner.plan;
      console.log(`    └ ${plan.tasks.length} task(s)`);
      opts.onCheckpoint?.({
        runId,
        plan,
        stage: 'planner',
        nextStage: plan.tasks.length > 0 ? 'architect' : 'quality-gates',
        currentTaskId: plan.tasks[0]?.id,
        execution: planner.execution,
        artifactPaths: readManifest(runDir).artifacts,
      });
    }

    // ---- 2. Per-task pipeline
    const tasks = opts.taskIds
      ? plan.tasks.filter((t) => opts.taskIds!.includes(t.id))
      : plan.tasks;
    const restoredGateResults = opts.resumeCheckpoint?.qualityGateResults;
    const allTasksRestoredPassed = tasks.every(
      (task) => opts.resumeCheckpoint?.tasks[task.id]?.status === 'passed',
    );
    const canRestoreQualityGates = Boolean(
      allTasksRestoredPassed &&
      opts.resumeCheckpoint?.nextStage === 'complete' &&
      restoredGateResults &&
      !Object.values(restoredGateResults).some((status) => status === 'failed' || status === 'pending'),
    );

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!;
      const restoredTask = opts.resumeCheckpoint?.tasks[task.id];
      if (restoredTask?.status === 'passed') {
        console.log(`\n  ▸ Task ${i + 1}/${tasks.length}: ${task.title}`);
        console.log(`    ✓ Restored passed task "${task.id}" from checkpoint`);
        continue;
      }
      console.log(`\n  ▸ Task ${i + 1}/${tasks.length}: ${task.title}`);
      const result = await runTaskPipeline(
        task,
        plan,
        requirement,
        constraints,
        runDir,
        config,
        primaryModel,
        reviewerModel,
        promptRegistry,
        Boolean(opts.dryRun),
        Boolean(opts.fast),
        ragGrounding,
        projectGuidelines,
        restoredTask,
        (update) => opts.onCheckpoint?.({
          runId,
          plan,
          ...update,
          artifactPaths: readManifest(runDir).artifacts,
        }),
      );
      if (!result.passed) {
        hasFailedTasks = true;
        taskFailures.push({ taskId: task.id, review: result.review, guard: result.guard });
      }
    }

    opts.onCheckpoint?.({
      runId,
      plan,
      stage: 'complete',
      nextStage: opts.skipGates || canRestoreQualityGates ? 'complete' : 'quality-gates',
      artifactPaths: readManifest(runDir).artifacts,
    });

    // ---- 3. Quality gates
    if (canRestoreQualityGates && restoredGateResults) {
      console.log('\n  ▸ Quality gates: restored from checkpoint');
      updateGateResults(runDir, restoredGateResults);
    } else if (!opts.skipGates) {
      console.log('\n  ▸ Quality gates...');
      const targetRoot =
        shouldApplyArtifacts(effectiveConfig.targetProject, Boolean(opts.dryRun))
          ? resolveTargetRoot(effectiveConfig.targetProject)
          : undefined;
      let gateResults = await runAllGates(runDir, process.cwd(), {
        targetRoot,
        artifactPaths: readManifest(runDir).artifacts,
        commands: effectiveConfig.targetProject.commands,
      });
      updateGateResults(runDir, gateResults);

      if (
        targetRoot &&
        hasRepairableGateFailure(gateResults) &&
        !hasUnsafeGateFailure(gateResults)
      ) {
        gateResults = await runQualityGateRepair({
          requirement,
          runDir,
          config: effectiveConfig,
          model: primaryModel,
          promptRegistry,
          projectGuidelines,
          dryRun: Boolean(opts.dryRun),
          initialResults: gateResults,
          onCoderCheckpoint: ({ round, code, model, promptHash }) => opts.onCheckpoint?.({
            runId,
            plan,
            stage: 'coder',
            nextStage: 'quality-gates',
            currentTaskId: 'quality-gates',
            execution: {
              key: `quality-gates:coder:round${round}`,
              model,
              promptHash,
            },
            artifactPaths: readManifest(runDir).artifacts,
            qualityGateCoderOutput: code,
          }),
        });
        updateGateResults(runDir, gateResults);
      }
      const failedReports = readGateReports(runDir)
        .filter((report) => report.status === 'failed')
        .map((report) => `[${report.gate}]\n${report.output}`)
        .join('\n\n')
        .slice(-40_000);
      opts.onCheckpoint?.({
        runId,
        plan,
        stage: 'quality-gates',
        nextStage: Object.values(gateResults).some((status) => status === 'failed')
          ? 'quality-gates'
          : 'complete',
        artifactPaths: readManifest(runDir).artifacts,
        qualityGateResults: gateResults,
        testFailureOutput: failedReports || undefined,
      });
    } else {
      console.log('\n  ▸ Gates: skipped');
      updateGateResults(runDir, {
        schemaCheck: 'skipped',
        typeCheck: 'skipped',
        lint: 'skipped',
        tests: 'skipped',
        security: 'skipped',
      });
    }

    // ---- 4. Final status
    const manifest = readManifest(runDir);
    const hasFailedGates = Object.values(manifest.gateResults).some((r) => r === 'failed');
    const needsFix = hasFailedGates || hasFailedTasks;
    setRunStatus(runDir, needsFix ? 'needs-fix' : 'passed');
    if (needsFix) {
      const summary = {
        runId,
        requirementId: requirement.id,
        status: 'needs-fix' as const,
        tasks: taskFailures,
        failedGates: failedGateNames(manifest.gateResults),
        resumeCommand: `pnpm factory -- resume-requirement ${requirement.id} --push`,
      };
      writeFailureSummary(runDir, summary);
      console.log(formatFailureSummary(summary));
    }
  } catch (err) {
    setRunStatus(runDir, 'failed');
    throw err;
  }

  return runId;
}

interface QualityRepairOptions {
  requirement: Requirement;
  runDir: string;
  config: FactoryConfig;
  model: ModelAdapter;
  promptRegistry: PromptRegistry;
  projectGuidelines?: ProjectGuidelinesContext;
  dryRun: boolean;
  initialResults: GateResults;
  onCoderCheckpoint?: (progress: {
    round: number;
    code: CodePatchOutput;
    model: string;
    promptHash: string;
  }) => void;
}

async function runQualityGateRepair(options: QualityRepairOptions): Promise<GateResults> {
  const {
    requirement,
    runDir,
    config,
    model,
    promptRegistry,
    projectGuidelines,
    dryRun,
  } = options;
  const repairPaths = readManifest(runDir).artifacts;
  const originalFiles = existingArtifactFiles(runDir, config.targetProject)
    .filter((file) => repairPaths.includes(file.path));
  const repairTask: Task = {
    id: 'quality-gates',
    title: 'Repair final quality-gate failures',
    description: 'Fix errors reported by the final project quality gates.',
    dependsOn: [],
    acceptanceCriteria: ['All configured quality gates pass.'],
    targetFiles: repairPaths,
  };
  let gateResults = options.initialResults;
  const repairRounds = config.pipeline.maxFixIterations;

  for (let round = 1; round <= repairRounds; round++) {
    console.log(`\n  ▸ Quality gate repair ${round}/${repairRounds}...`);
    const reports = readGateReports(runDir);
    const codeResult = await runAgent({
      agent: 'coder',
      taskId: `quality-gates-${round}`,
      runDir,
      systemPrompt: withProjectGuidelines(promptRegistry.get('coder'), projectGuidelines),
      userPrompt: buildQualityGateRepairPrompt(
        requirement,
        reports,
        existingArtifactFiles(runDir, config.targetProject),
        config.targetProject.allowedPaths,
      ),
      model,
      maxRetries: config.pipeline.maxRetries,
      responseSchema: buildCodePatchResponseSchema(repairPaths),
      validate: makeCodeValidator(repairTask, config.targetProject),
      extractJSON,
      outputFileName: `coder-quality-gates-iter${round}.json`,
    });
    const code = codeResult.output as CodePatchOutput;

    for (const patch of code.patches) {
      writeArtifact(runDir, patch.path, patch.content);
      addArtifact(runDir, patch.path);
      if (shouldApplyArtifacts(config.targetProject, dryRun)) {
        applyArtifactToTarget(config.targetProject, patch.path, patch.content);
      }
    }
    options.onCoderCheckpoint?.({
      round,
      code,
      model: codeResult.model,
      promptHash: codeResult.promptHash,
    });

    console.log('  ▸ Quality gates (after repair)...');
    gateResults = await runAllGates(runDir, process.cwd(), {
      targetRoot: resolveTargetRoot(config.targetProject),
      artifactPaths: readManifest(runDir).artifacts,
      commands: config.targetProject.commands,
    });
    updateGateResults(runDir, gateResults);

    if (!hasRepairableGateFailure(gateResults) || hasUnsafeGateFailure(gateResults)) break;
  }

  if (hasRepairableGateFailure(gateResults) || hasUnsafeGateFailure(gateResults)) {
    console.log('  ↺ Quality-gate repairs did not pass; restoring the last reviewed task artifacts.');
    for (const file of originalFiles) {
      writeArtifact(runDir, file.path, file.content);
      if (shouldApplyArtifacts(config.targetProject, dryRun)) {
        applyArtifactToTarget(config.targetProject, file.path, file.content);
      }
    }
    gateResults = await runAllGates(runDir, process.cwd(), {
      targetRoot: resolveTargetRoot(config.targetProject),
      artifactPaths: readManifest(runDir).artifacts,
      commands: config.targetProject.commands,
    });
    updateGateResults(runDir, gateResults);
  }

  return gateResults;
}

// ============================================================
// PLANNER AGENT
// ============================================================

async function runPlannerAgent(
  requirement: Requirement,
  constraints: Record<string, unknown>,
  runDir: string,
  model: ModelAdapter,
  promptRegistry: PromptRegistry,
  config: FactoryConfig,
  ragGrounding?: RagGroundingResponse,
  projectGuidelines?: ProjectGuidelinesContext,
): Promise<{
  plan: PlanOutput;
  execution: { key: string; model: string; promptHash: string };
}> {
  const result = await runAgent({
    agent: 'planner',
    runDir,
    systemPrompt: withProjectGuidelines(promptRegistry.get('planner'), projectGuidelines),
    userPrompt: buildPlannerPrompt(
      requirement,
      constraints,
      formatGroundingContext(config, ragGrounding, 'planner'),
    ),
    model,
    maxRetries: config.pipeline.maxRetries,
    validate: makeValidator(PlanOutputSchema, 'Planner'),
    extractJSON,
    outputFileName: 'planner-output.json',
  });
  const plan = result.output as PlanOutput;
  return {
    plan: { ...plan, requirementId: requirement.id },
    execution: { key: 'planner', model: result.model, promptHash: result.promptHash },
  };
}

// ============================================================
// TASK PIPELINE
// ============================================================

async function runTaskPipeline(
  task: Task,
  plan: PlanOutput,
  requirement: Requirement,
  constraints: Record<string, unknown>,
  runDir: string,
  config: FactoryConfig,
  primaryModel: ModelAdapter,
  reviewerModel: ModelAdapter,
  promptRegistry: PromptRegistry,
  dryRun: boolean,
  fast: boolean,
  ragGrounding?: RagGroundingResponse,
  projectGuidelines?: ProjectGuidelinesContext,
  restoredTask?: PipelineCheckpoint['tasks'][string],
  onCheckpoint?: (update: {
    stage: PipelineStage;
    nextStage: PipelineStage;
    currentTaskId: string;
    task: CheckpointTaskUpdate;
    execution?: { key: string; model: string; promptHash: string };
  }) => void,
): Promise<{ passed: boolean; review?: ReviewOutput; guard?: DomainGuardOutput }> {
  // ---- Architect
  let architecture: ArchitectureOutput;
  if (restoredTask?.architecture) {
    architecture = restoredTask.architecture;
    writeFileSync(
      join(runDir, 'steps', `architect-${task.id}.json`),
      `${JSON.stringify(architecture, null, 2)}\n`,
      'utf8',
    );
    console.log('    ▸ Architect: restored from checkpoint');
  } else {
    console.log('    ▸ Architect...');
    const archResult = await runAgent({
      agent: 'architect',
      taskId: task.id,
      runDir,
      systemPrompt: withProjectGuidelines(promptRegistry.get('architect'), projectGuidelines),
      userPrompt: buildArchitectPrompt(
        task,
        plan,
        requirement,
        constraints,
        formatGroundingContext(config, ragGrounding, 'architect'),
      ),
      model: primaryModel,
      maxRetries: config.pipeline.maxRetries,
      validate: makeValidator(ArchitectureOutputSchema, 'Architect'),
      extractJSON,
      outputFileName: `architect-${task.id}.json`,
    });
    architecture = archResult.output as ArchitectureOutput;
    onCheckpoint?.({
      stage: 'architect',
      nextStage: 'coder',
      currentTaskId: task.id,
      execution: {
        key: `${task.id}:architect`,
        model: archResult.model,
        promptHash: archResult.promptHash,
      },
      task: {
        taskId: task.id,
        status: 'pending',
        architecture,
        nextStage: 'coder',
        iterations: restoredTask?.iterations ?? 0,
      },
    });
  }

  // ---- Code + fix loop
  let fixContext: FixContext | undefined = restoredTask?.status === 'needs-fix'
    ? {
        reviewFindings: restoredTask.reviewFindings,
        domainViolations: restoredTask.domainViolations,
      }
    : undefined;
  let lastCode = restoredTask?.lastCoderOutput;
  let lastTests = restoredTask?.lastTesterOutput;
  let lastReview = restoredTask?.lastReview;
  let lastGuard = restoredTask?.lastGuard;
  let appliedDiff = restoredTask?.appliedDiff ?? [];
  let completedIterations = restoredTask?.nextStage ? restoredTask.iterations : 0;
  let nextStage: PipelineStage = restoredTask?.nextStage ?? 'coder';
  if (nextStage === 'coder' && completedIterations >= config.pipeline.maxFixIterations) {
    completedIterations = 0;
  }
  if (restoredTask?.nextStage && restoredTask.nextStage !== 'coder') {
    console.log(`    ↳ Resuming at ${restoredTask.nextStage}; earlier task stages restored`);
  }
  const supportingFiles = collectReviewSupportingFiles(requirement, architecture, task, config.targetProject);

  while (completedIterations < config.pipeline.maxFixIterations) {
    const iter = nextStage === 'coder'
      ? completedIterations
      : Math.max(0, completedIterations - 1);
    const iterSuffix = iter > 0 ? ` (fix #${iter})` : '';

    // Coder
    if (nextStage === 'coder') {
      console.log(`    ▸ Coder${iterSuffix}...`);
      const codeResult = await runAgent({
        agent: 'coder',
        taskId: task.id,
        runDir,
        systemPrompt: withProjectGuidelines(promptRegistry.get('coder'), projectGuidelines),
        userPrompt: buildCoderPrompt(
          task,
          architecture,
          requirement,
          constraints,
          existingTaskFiles(task, config.targetProject),
          config.targetProject.allowedPaths,
          fixContext,
          formatGroundingContext(config, ragGrounding, 'coder'),
        ),
        model: primaryModel,
        maxRetries: config.pipeline.maxRetries,
        responseSchema: coderResponseSchema(task),
        validate: makeCodeValidator(task, config.targetProject),
        extractJSON,
        outputFileName: `coder-${task.id}-iter${iter}.json`,
      });
      lastCode = codeResult.output as CodePatchOutput;

      for (const patch of lastCode.patches) {
        writeArtifact(runDir, patch.path, patch.content);
        addArtifact(runDir, patch.path);
        if (shouldApplyArtifacts(config.targetProject, dryRun)) {
          applyArtifactToTarget(config.targetProject, patch.path, patch.content);
        }
      }
      appliedDiff = lastCode.patches;
      completedIterations += 1;
      nextStage = fast ? 'complete' : 'tester';
      onCheckpoint?.({
        stage: 'coder',
        nextStage,
        currentTaskId: task.id,
        execution: {
          key: `${task.id}:coder:iter${iter}`,
          model: codeResult.model,
          promptHash: codeResult.promptHash,
        },
        task: {
          taskId: task.id,
          status: fast ? 'passed' : 'pending',
          architecture,
          nextStage,
          lastCoderOutput: lastCode,
          lastTesterOutput: lastTests,
          review: lastReview,
          guard: lastGuard,
          appliedDiff,
          iterations: completedIterations,
        },
      });
    }

    if (fast) {
      console.log(`    ✓ Task "${task.id}" coded (fast mode)`);
      return { passed: true, review: lastReview, guard: lastGuard };
    }

    if (!lastCode) {
      throw new Error(`Checkpoint for task "${task.id}" cannot resume ${nextStage} without coder output.`);
    }

    // Tester
    if (nextStage === 'tester') {
      console.log('    ▸ Tester...');
      const testResult = await runAgent({
        agent: 'tester',
        taskId: task.id,
        runDir,
        systemPrompt: withProjectGuidelines(promptRegistry.get('tester'), projectGuidelines),
        userPrompt: buildTesterPrompt(
          task,
          lastCode,
          requirement,
          constraints,
          config.targetProject.allowedPaths,
          existingTaskTestFiles(task, config.targetProject),
          formatGroundingContext(config, ragGrounding, 'tester'),
        ),
        model: primaryModel,
        maxRetries: config.pipeline.maxRetries,
        responseSchema: testerResponseSchema(task),
        validate: (raw: unknown): TestOutput =>
          validateTestOutputForTask(raw, task, constraints, config.targetProject),
        extractJSON,
        outputFileName: `tester-${task.id}-iter${iter}.json`,
      });
      lastTests = testResult.output as TestOutput;

      for (const test of lastTests.tests) {
        writeArtifact(runDir, test.path, test.content);
        addArtifact(runDir, test.path);
        if (shouldApplyArtifacts(config.targetProject, dryRun)) {
          applyArtifactToTarget(config.targetProject, test.path, test.content);
        }
      }
      nextStage = 'reviewer';
      onCheckpoint?.({
        stage: 'tester',
        nextStage,
        currentTaskId: task.id,
        execution: {
          key: `${task.id}:tester:iter${iter}`,
          model: testResult.model,
          promptHash: testResult.promptHash,
        },
        task: {
          taskId: task.id,
          status: 'pending',
          architecture,
          nextStage,
          lastCoderOutput: lastCode,
          lastTesterOutput: lastTests,
          review: lastReview,
          guard: lastGuard,
          appliedDiff,
          iterations: completedIterations,
        },
      });
    }

    if (!lastTests) {
      throw new Error(`Checkpoint for task "${task.id}" cannot resume ${nextStage} without tester output.`);
    }

    // Reviewer
    const cumulativeCode = cumulativeCodeForTask(task, runDir, config.targetProject, lastCode);
    if (nextStage === 'reviewer') {
      console.log('    ▸ Reviewer...');
      const reviewResult = await runAgent({
        agent: 'reviewer',
        taskId: task.id,
        runDir,
        systemPrompt: withProjectGuidelines(promptRegistry.get('reviewer'), projectGuidelines),
        userPrompt: buildReviewerPrompt(
          task,
          cumulativeCode,
          lastTests,
          requirement,
          supportingFiles,
          formatGroundingContext(config, ragGrounding, 'reviewer'),
        ),
        model: reviewerModel,
        maxRetries: config.pipeline.maxRetries,
        validate: makeValidator(ReviewOutputSchema, 'Reviewer'),
        extractJSON,
        outputFileName: `reviewer-${task.id}-iter${iter}.json`,
      });
      lastReview = reviewResult.output as ReviewOutput;
      nextStage = lastReview.verdict === 'rejected' ? 'coder' : 'domain-guard';
      if (lastReview.verdict === 'rejected') {
        updateStep(runDir, 'reviewer', task.id, { status: 'needs-fix' });
      }
      onCheckpoint?.({
        stage: 'reviewer',
        nextStage,
        currentTaskId: task.id,
        execution: {
          key: `${task.id}:reviewer:iter${iter}`,
          model: reviewResult.model,
          promptHash: reviewResult.promptHash,
        },
        task: {
          taskId: task.id,
          status: lastReview.verdict === 'rejected' ? 'needs-fix' : 'pending',
          architecture,
          nextStage,
          lastCoderOutput: lastCode,
          lastTesterOutput: lastTests,
          review: lastReview,
          guard: lastGuard,
          appliedDiff,
          iterations: completedIterations,
        },
      });
    }

    if (!lastReview) {
      throw new Error(`Checkpoint for task "${task.id}" cannot resume ${nextStage} without reviewer output.`);
    }

    if (lastReview.verdict === 'rejected') {
      console.log(`    ✗ Reviewer rejected — stopping task`);
      return { passed: false, review: lastReview, guard: lastGuard };
    }

    // Domain Guard
    console.log('    ▸ Domain Guard...');
    const guardResult = await runAgent({
      agent: 'domain-guard',
      taskId: task.id,
      runDir,
      systemPrompt: withProjectGuidelines(promptRegistry.get('domain-guard'), projectGuidelines),
      userPrompt: buildDomainGuardPrompt(
        task,
        cumulativeCode,
        requirement,
        config.domain.rules,
        supportingFiles,
        formatGroundingContext(config, ragGrounding, 'domain-guard'),
      ),
      model: reviewerModel,
      maxRetries: config.pipeline.maxRetries,
      validate: makeValidator(DomainGuardOutputSchema, 'DomainGuard'),
      extractJSON,
      outputFileName: `domain-guard-${task.id}-iter${iter}.json`,
    });
    lastGuard = guardResult.output as DomainGuardOutput;

    if (lastReview.verdict === 'approved' && lastGuard.verdict === 'passed') {
      updateStep(runDir, 'reviewer', task.id, { status: 'passed' });
      updateStep(runDir, 'domain-guard', task.id, { status: 'passed' });
      onCheckpoint?.({
        stage: 'domain-guard',
        nextStage: 'complete',
        currentTaskId: task.id,
        execution: {
          key: `${task.id}:domain-guard:iter${iter}`,
          model: guardResult.model,
          promptHash: guardResult.promptHash,
        },
        task: {
          taskId: task.id,
          status: 'passed',
          architecture,
          nextStage: 'complete',
          lastCoderOutput: lastCode,
          lastTesterOutput: lastTests,
          review: lastReview,
          guard: lastGuard,
          appliedDiff,
          iterations: completedIterations,
        },
      });
      console.log(`    ✓ Task "${task.id}" passed`);
      return { passed: true, review: lastReview, guard: lastGuard };
    }

    updateStep(runDir, 'reviewer', task.id, {
      status: lastReview.verdict === 'approved' ? 'passed' : 'needs-fix',
    });
    updateStep(runDir, 'domain-guard', task.id, {
      status: lastGuard.verdict === 'passed' ? 'passed' : 'needs-fix',
    });
    onCheckpoint?.({
      stage: 'domain-guard',
      nextStage: 'coder',
      currentTaskId: task.id,
      execution: {
        key: `${task.id}:domain-guard:iter${iter}`,
        model: guardResult.model,
        promptHash: guardResult.promptHash,
      },
      task: {
        taskId: task.id,
        status: 'needs-fix',
        architecture,
        nextStage: 'coder',
        lastCoderOutput: lastCode,
        lastTesterOutput: lastTests,
        review: lastReview,
        guard: lastGuard,
        appliedDiff,
        iterations: completedIterations,
      },
    });

    // Prepare fix context for next iteration
    fixContext = {
      reviewFindings: lastReview.findings,
      domainViolations: lastGuard.violations,
    };
    nextStage = 'coder';

    if (completedIterations < config.pipeline.maxFixIterations) {
      console.log(`    ⚠ Needs fix — iteration ${completedIterations + 1}/${config.pipeline.maxFixIterations}...`);
    }
  }

  console.log(
    `    ✗ Task "${task.id}" did not pass after ${config.pipeline.maxFixIterations} iteration(s)`,
  );

  return { passed: false, review: lastReview, guard: lastGuard };
}
