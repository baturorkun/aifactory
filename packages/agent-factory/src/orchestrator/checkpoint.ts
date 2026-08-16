import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import {
  ArchitectureOutputSchema,
  CodePatchOutputSchema,
  DomainGuardOutputSchema,
  GateResultsSchema,
  PlanOutputSchema,
  ReviewFindingSchema,
  ReviewOutputSchema,
  DomainViolationSchema,
  TestOutputSchema,
  type ArchitectureOutput,
  type CodePatchOutput,
  type DomainGuardOutput,
  type GateResults,
  type ReviewOutput,
  type TestOutput,
} from '@aifactory/contracts';

export const PipelineStageSchema = z.enum([
  'planner',
  'architect',
  'coder',
  'tester',
  'reviewer',
  'domain-guard',
  'quality-gates',
  'complete',
]);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

const StageExecutionSchema = z.object({
  model: z.string(),
  promptHash: z.string(),
  completedAt: z.string(),
});

const CheckpointTaskSchema = z.object({
  status: z.enum(['pending', 'passed', 'needs-fix']),
  architecture: ArchitectureOutputSchema.optional(),
  reviewFindings: z.array(ReviewFindingSchema).default([]),
  domainViolations: z.array(DomainViolationSchema).default([]),
  iterations: z.number().int().nonnegative().default(0),
  nextStage: PipelineStageSchema.optional(),
  lastCoderOutput: CodePatchOutputSchema.optional(),
  lastTesterOutput: TestOutputSchema.optional(),
  lastReview: ReviewOutputSchema.optional(),
  lastGuard: DomainGuardOutputSchema.optional(),
  appliedDiff: z.array(CodePatchOutputSchema.shape.patches.element).default([]),
});

export const PipelineCheckpointSchema = z.object({
  version: z.literal(1),
  requirementId: z.string(),
  requirementSha256: z.string(),
  sourceCommit: z.string(),
  fast: z.boolean(),
  plan: PlanOutputSchema,
  tasks: z.record(CheckpointTaskSchema),
  artifactPaths: z.array(z.string()).default([]),
  previousRunId: z.string(),
  previousProvider: z.string().optional(),
  previousModel: z.string().optional(),
  currentTaskId: z.string().optional(),
  lastCompletedStage: PipelineStageSchema.optional(),
  nextStage: PipelineStageSchema.optional(),
  stageExecutions: z.record(StageExecutionSchema).default({}),
  qualityGateResults: GateResultsSchema.optional(),
  qualityGateCoderOutput: CodePatchOutputSchema.optional(),
  testFailureOutput: z.string().optional(),
  updatedAt: z.string(),
});

export type PipelineCheckpoint = z.infer<typeof PipelineCheckpointSchema>;

export interface CheckpointTaskUpdate {
  taskId: string;
  status: 'pending' | 'passed' | 'needs-fix';
  architecture: ArchitectureOutput;
  nextStage: PipelineStage;
  lastCoderOutput?: CodePatchOutput;
  lastTesterOutput?: TestOutput;
  review?: ReviewOutput;
  guard?: DomainGuardOutput;
  appliedDiff?: CodePatchOutput['patches'];
  iterations: number;
}

export interface StageExecutionUpdate {
  key: string;
  model: string;
  promptHash: string;
}

export interface PipelineCheckpointProgress {
  runId: string;
  plan: PipelineCheckpoint['plan'];
  stage: PipelineStage;
  nextStage: PipelineStage;
  currentTaskId?: string;
  task?: CheckpointTaskUpdate;
  execution?: StageExecutionUpdate;
  artifactPaths: string[];
  qualityGateResults?: GateResults;
  qualityGateCoderOutput?: CodePatchOutput;
  testFailureOutput?: string;
}

export function describeCheckpointResume(
  checkpoint: PipelineCheckpoint,
  current: { provider: string; model: string },
): string {
  const currentLabel = `${current.provider}:${current.model}`;
  if (!checkpoint.previousProvider || !checkpoint.previousModel) {
    return `legacy checkpoint -> ${currentLabel}`;
  }

  const previousLabel = `${checkpoint.previousProvider}:${checkpoint.previousModel}`;
  const providerChanged = checkpoint.previousProvider !== current.provider;
  return `${previousLabel} -> ${currentLabel}${providerChanged ? ' (provider switch)' : ''}`;
}

export function checkpointBranchName(requirementId: string): string {
  if (!/^RQ-[0-9]+$/i.test(requirementId)) {
    throw new Error(`Invalid requirement ID: ${requirementId}`);
  }
  return `factory-checkpoint/${requirementId.toUpperCase()}`;
}

export function checkpointRefName(requirementId: string): string {
  if (!/^RQ-[0-9]+$/i.test(requirementId)) {
    throw new Error(`Invalid requirement ID: ${requirementId}`);
  }
  return `refs/aifactory/checkpoints/${requirementId.toUpperCase()}`;
}

export function checkpointStatePath(projectRoot: string, requirementId: string): string {
  return resolve(
    projectRoot,
    '.aifactory',
    'checkpoints',
    `${requirementId.toUpperCase()}.json`,
  );
}

export function readPipelineCheckpoint(path: string): PipelineCheckpoint | undefined {
  if (!existsSync(path)) return undefined;
  return PipelineCheckpointSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writePipelineCheckpoint(path: string, checkpoint: PipelineCheckpoint): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
}

export function validatePipelineCheckpoint(
  checkpoint: PipelineCheckpoint,
  expected: {
    requirementId: string;
    requirementSha256: string;
    sourceCommit: string;
    fast: boolean;
  },
): void {
  if (checkpoint.requirementId !== expected.requirementId.toUpperCase()) {
    throw new Error('Checkpoint requirement ID does not match the requested requirement.');
  }
  if (checkpoint.requirementSha256 !== expected.requirementSha256) {
    throw new Error('Checkpoint requirement content has changed and cannot be resumed safely.');
  }
  if (checkpoint.sourceCommit !== expected.sourceCommit) {
    throw new Error('Checkpoint source commit has changed and cannot be resumed safely.');
  }
  if (checkpoint.fast !== expected.fast) {
    throw new Error('Checkpoint pipeline mode does not match the requested run mode.');
  }
}
