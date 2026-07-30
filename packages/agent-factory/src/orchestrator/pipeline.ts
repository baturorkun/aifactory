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
import { buildCodePatchResponseSchema } from '../model/response-schemas';
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

function makeCodeValidator(task: Task, target: TargetProjectConfig) {
  return (raw: unknown): CodePatchOutput => {
    const parsed = CodePatchOutputSchema.parse(raw);
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
    console.log('  ▸ Planner...');
    const plan = await runPlannerAgent(
      requirement,
      constraints,
      runDir,
      primaryModel,
      promptRegistry,
      config,
      ragGrounding,
      projectGuidelines,
    );
    console.log(`    └ ${plan.tasks.length} task(s)`);

    // ---- 2. Per-task pipeline
    const tasks = opts.taskIds
      ? plan.tasks.filter((t) => opts.taskIds!.includes(t.id))
      : plan.tasks;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!;
      console.log(`\n  ▸ Task ${i + 1}/${tasks.length}: ${task.title}`);
      const passed = await runTaskPipeline(
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
      );
      if (!passed) hasFailedTasks = true;
    }

    // ---- 3. Quality gates
    if (!opts.skipGates) {
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
        opts.fast &&
        targetRoot &&
        hasRepairableGateFailure(gateResults) &&
        !hasUnsafeGateFailure(gateResults)
      ) {
        gateResults = await runFastQualityRepair({
          requirement,
          runDir,
          config: effectiveConfig,
          model: primaryModel,
          promptRegistry,
          projectGuidelines,
          dryRun: Boolean(opts.dryRun),
          initialResults: gateResults,
        });
        updateGateResults(runDir, gateResults);
      }
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
    const hasFailedSteps = manifest.steps.some(
      (s) => s.status === 'failed' || s.status === 'needs-fix',
    );
    setRunStatus(
      runDir,
      hasFailedGates || hasFailedSteps || hasFailedTasks ? 'needs-fix' : 'passed',
    );
  } catch (err) {
    setRunStatus(runDir, 'failed');
    throw err;
  }

  return runId;
}

interface FastQualityRepairOptions {
  requirement: Requirement;
  runDir: string;
  config: FactoryConfig;
  model: ModelAdapter;
  promptRegistry: PromptRegistry;
  projectGuidelines?: ProjectGuidelinesContext;
  dryRun: boolean;
  initialResults: GateResults;
}

async function runFastQualityRepair(options: FastQualityRepairOptions): Promise<GateResults> {
  const {
    requirement,
    runDir,
    config,
    model,
    promptRegistry,
    projectGuidelines,
    dryRun,
  } = options;
  const repairTask: Task = {
    id: 'quality-gates',
    title: 'Repair final quality-gate failures',
    description: 'Fix errors reported by the final project quality gates.',
    dependsOn: [],
    acceptanceCriteria: ['All configured quality gates pass.'],
  };
  let gateResults = options.initialResults;
  const repairRounds = Math.max(1, config.pipeline.maxFixIterations - 1);

  for (let round = 1; round <= repairRounds; round++) {
    console.log(`\n  ▸ Fast quality repair ${round}/${repairRounds}...`);
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
      responseSchema: buildCodePatchResponseSchema(),
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

    console.log('  ▸ Quality gates (after repair)...');
    gateResults = await runAllGates(runDir, process.cwd(), {
      targetRoot: resolveTargetRoot(config.targetProject),
      artifactPaths: readManifest(runDir).artifacts,
      commands: config.targetProject.commands,
    });
    updateGateResults(runDir, gateResults);

    if (!hasRepairableGateFailure(gateResults) || hasUnsafeGateFailure(gateResults)) break;
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
): Promise<PlanOutput> {
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
  return { ...plan, requirementId: requirement.id };
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
): Promise<boolean> {
  // ---- Architect
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
  const architecture = archResult.output as ArchitectureOutput;

  // ---- Code + fix loop
  let fixContext: FixContext | undefined;
  let taskPassed = false;

  for (let iter = 0; iter < config.pipeline.maxFixIterations; iter++) {
    const iterSuffix = iter > 0 ? ` (fix #${iter})` : '';

    // Coder
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
    const code = codeResult.output as CodePatchOutput;

    // Write code artifacts
    for (const patch of code.patches) {
      writeArtifact(runDir, patch.path, patch.content);
      addArtifact(runDir, patch.path);
      if (shouldApplyArtifacts(config.targetProject, dryRun)) {
        applyArtifactToTarget(config.targetProject, patch.path, patch.content);
      }
    }

    if (fast) {
      taskPassed = true;
      console.log(`    ✓ Task "${task.id}" coded (fast mode)`);
      break;
    }

    // Tester
    console.log('    ▸ Tester...');
    const testResult = await runAgent({
      agent: 'tester',
      taskId: task.id,
      runDir,
      systemPrompt: withProjectGuidelines(promptRegistry.get('tester'), projectGuidelines),
      userPrompt: buildTesterPrompt(
        task,
        code,
        requirement,
        constraints,
        config.targetProject.allowedPaths,
        existingTestPaths(config.targetProject),
        formatGroundingContext(config, ragGrounding, 'tester'),
      ),
      model: primaryModel,
      maxRetries: config.pipeline.maxRetries,
      validate: (raw: unknown): TestOutput => {
        const parsed = TestOutputSchema.parse(raw);
        const constraintPaths = constraintAllowedPaths(constraints);
        for (const test of parsed.tests) {
          if (!pathAllowedByHints(test.path, constraintPaths)) {
            throw new Error(`Tester artifact path is outside requirement constraints: ${test.path}`);
          }
          validateConfiguredPath(config.targetProject, test.path);
        }
        return parsed;
      },
      extractJSON,
      outputFileName: `tester-${task.id}-iter${iter}.json`,
    });
    const tests = testResult.output as TestOutput;

    for (const test of tests.tests) {
      writeArtifact(runDir, test.path, test.content);
      addArtifact(runDir, test.path);
      if (shouldApplyArtifacts(config.targetProject, dryRun)) {
        applyArtifactToTarget(config.targetProject, test.path, test.content);
      }
    }

    // Reviewer
    console.log('    ▸ Reviewer...');
    const reviewResult = await runAgent({
      agent: 'reviewer',
      taskId: task.id,
      runDir,
      systemPrompt: withProjectGuidelines(promptRegistry.get('reviewer'), projectGuidelines),
      userPrompt: buildReviewerPrompt(
        task,
        code,
        tests,
        requirement,
        formatGroundingContext(config, ragGrounding, 'reviewer'),
      ),
      model: reviewerModel,
      maxRetries: config.pipeline.maxRetries,
      validate: makeValidator(ReviewOutputSchema, 'Reviewer'),
      extractJSON,
      outputFileName: `reviewer-${task.id}-iter${iter}.json`,
    });
    const review = reviewResult.output as ReviewOutput;

    if (review.verdict === 'rejected') {
      console.log(`    ✗ Reviewer rejected — stopping task`);
      break;
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
        code,
        requirement,
        config.domain.rules,
        formatGroundingContext(config, ragGrounding, 'domain-guard'),
      ),
      model: reviewerModel,
      maxRetries: config.pipeline.maxRetries,
      validate: makeValidator(DomainGuardOutputSchema, 'DomainGuard'),
      extractJSON,
      outputFileName: `domain-guard-${task.id}-iter${iter}.json`,
    });
    const guard = guardResult.output as DomainGuardOutput;

    if (review.verdict === 'approved' && guard.verdict === 'passed') {
      taskPassed = true;
      console.log(`    ✓ Task "${task.id}" passed`);
      break;
    }

    // Prepare fix context for next iteration
    fixContext = {
      reviewFindings: review.findings,
      domainViolations: guard.violations,
    };

    if (iter < config.pipeline.maxFixIterations - 1) {
      console.log(`    ⚠ Needs fix — iteration ${iter + 2}/${config.pipeline.maxFixIterations}...`);
    }
  }

  if (!taskPassed) {
    console.log(
      `    ✗ Task "${task.id}" did not pass after ${config.pipeline.maxFixIterations} iteration(s)`,
    );
  }

  return taskPassed;
}
