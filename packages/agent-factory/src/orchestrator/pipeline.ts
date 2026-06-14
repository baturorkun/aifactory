import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
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
  type Task,
  type Requirement,
} from '@aifactory/contracts';
import type { FactoryConfig } from '../config';
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
  type FixContext,
} from '../prompts/builders';
import { parseRequirement } from '../requirements/parser';
import { extractJSON } from '../utils/json';
import {
  applyArtifactToTarget,
  resolveTargetRoot,
  shouldApplyArtifacts,
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
import { runAllGates } from '@aifactory/quality-gates';

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
  const constraints = loadConstraints(requirementId, config.paths.constraints);

  // -- Run directory
  const runId = generateRunId(requirementId);
  const runDir = createRunDir(resolve(config.paths.runs), runId, requirementId);

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

    // ---- 1. Planning
    console.log('  ▸ Planner...');
    const plan = await runPlannerAgent(
      requirement,
      constraints,
      runDir,
      primaryModel,
      promptRegistry,
      config,
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
      const gateResults = await runAllGates(runDir, process.cwd(), {
        targetRoot,
        artifactPaths: readManifest(runDir).artifacts,
        commands: effectiveConfig.targetProject.commands,
      });
      updateGateResults(runDir, gateResults);
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
): Promise<PlanOutput> {
  const result = await runAgent({
    agent: 'planner',
    runDir,
    systemPrompt: promptRegistry.get('planner'),
    userPrompt: buildPlannerPrompt(requirement, constraints),
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
): Promise<boolean> {
  // ---- Architect
  console.log('    ▸ Architect...');
  const archResult = await runAgent({
    agent: 'architect',
    taskId: task.id,
    runDir,
    systemPrompt: promptRegistry.get('architect'),
    userPrompt: buildArchitectPrompt(task, plan, requirement),
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
      systemPrompt: promptRegistry.get('coder'),
      userPrompt: buildCoderPrompt(task, architecture, requirement, fixContext),
      model: primaryModel,
      maxRetries: config.pipeline.maxRetries,
      validate: makeValidator(CodePatchOutputSchema, 'Coder'),
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
      systemPrompt: promptRegistry.get('tester'),
      userPrompt: buildTesterPrompt(task, code, requirement),
      model: primaryModel,
      maxRetries: config.pipeline.maxRetries,
      validate: makeValidator(TestOutputSchema, 'Tester'),
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
      systemPrompt: promptRegistry.get('reviewer'),
      userPrompt: buildReviewerPrompt(task, code, tests, requirement),
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
      systemPrompt: promptRegistry.get('domain-guard'),
      userPrompt: buildDomainGuardPrompt(task, code, requirement, config.domain.rules),
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
