import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import {
  ArchitectureOutputSchema,
  PlanOutputSchema,
  ReviewFindingSchema,
  DomainViolationSchema,
  type ArchitectureOutput,
  type DomainGuardOutput,
  type PlanOutput,
  type ReviewOutput,
} from '@aifactory/contracts';

const CheckpointTaskSchema = z.object({
  status: z.enum(['pending', 'passed', 'needs-fix']),
  architecture: ArchitectureOutputSchema.optional(),
  reviewFindings: z.array(ReviewFindingSchema).default([]),
  domainViolations: z.array(DomainViolationSchema).default([]),
  iterations: z.number().int().nonnegative().default(0),
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
  updatedAt: z.string(),
});

export type PipelineCheckpoint = z.infer<typeof PipelineCheckpointSchema>;

export interface CheckpointTaskUpdate {
  taskId: string;
  status: 'passed' | 'needs-fix';
  architecture: ArchitectureOutput;
  review?: ReviewOutput;
  guard?: DomainGuardOutput;
  iterations: number;
}

export function checkpointBranchName(requirementId: string): string {
  if (!/^RQ-[0-9]+$/i.test(requirementId)) {
    throw new Error(`Invalid requirement ID: ${requirementId}`);
  }
  return `factory-checkpoint/${requirementId.toUpperCase()}`;
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

