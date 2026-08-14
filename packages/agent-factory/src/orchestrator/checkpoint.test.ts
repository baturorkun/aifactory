import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkpointBranchName,
  describeCheckpointResume,
  PipelineCheckpointSchema,
  validatePipelineCheckpoint,
} from './checkpoint';

const checkpoint = PipelineCheckpointSchema.parse({
  version: 1,
  requirementId: 'RQ-0037',
  requirementSha256: 'req-hash',
  sourceCommit: 'source-sha',
  fast: false,
  previousRunId: '20260812215016-RQ-0037',
  updatedAt: '2026-08-12T21:50:16.000Z',
  plan: {
    requirementId: 'RQ-0037',
    summary: 'Plan',
    assumptions: [],
    outOfScope: [],
    tasks: [{ id: 'task-1', title: 'Task', description: 'Do it', dependsOn: [], acceptanceCriteria: ['It works'], targetFiles: [] }],
  },
  tasks: {},
  artifactPaths: [],
});

test('checkpoint branch names are isolated from requirement branches', () => {
  assert.equal(checkpointBranchName('rq-37'), 'factory-checkpoint/RQ-37');
  assert.throws(() => checkpointBranchName('../main'), /Invalid requirement ID/);
});

test('checkpoint validation rejects stale requirement and source state', () => {
  assert.doesNotThrow(() => validatePipelineCheckpoint(checkpoint, {
    requirementId: 'RQ-0037', requirementSha256: 'req-hash', sourceCommit: 'source-sha', fast: false,
  }));
  assert.throws(() => validatePipelineCheckpoint(checkpoint, {
    requirementId: 'RQ-0037', requirementSha256: 'changed', sourceCommit: 'source-sha', fast: false,
  }), /requirement content has changed/);
  assert.throws(() => validatePipelineCheckpoint(checkpoint, {
    requirementId: 'RQ-0037', requirementSha256: 'req-hash', sourceCommit: 'other', fast: false,
  }), /source commit has changed/);
});

test('checkpoint resume description makes provider changes explicit', () => {
  const withModel = PipelineCheckpointSchema.parse({
    ...checkpoint,
    previousProvider: 'codex-cli',
    previousModel: 'gpt-5.6-sol',
  });

  assert.equal(
    describeCheckpointResume(withModel, { provider: 'gemini', model: 'gemini-2.5-pro' }),
    'codex-cli:gpt-5.6-sol -> gemini:gemini-2.5-pro (provider switch)',
  );
  assert.equal(
    describeCheckpointResume(withModel, { provider: 'codex-cli', model: 'gpt-5.6-sol' }),
    'codex-cli:gpt-5.6-sol -> codex-cli:gpt-5.6-sol',
  );
});

test('legacy checkpoints remain resumable without model metadata', () => {
  assert.equal(
    describeCheckpointResume(checkpoint, { provider: 'gemini', model: 'gemini-2.5-pro' }),
    'legacy checkpoint -> gemini:gemini-2.5-pro',
  );
});

test('stage checkpoint preserves resumable agent outputs and execution identity', () => {
  const staged = PipelineCheckpointSchema.parse({
    ...checkpoint,
    currentTaskId: 'task-1',
    lastCompletedStage: 'coder',
    nextStage: 'tester',
    stageExecutions: {
      'task-1:coder:iter0': {
        model: 'gpt-5.6-sol',
        promptHash: 'abc123',
        completedAt: '2026-08-14T10:00:00.000Z',
      },
    },
    tasks: {
      'task-1': {
        status: 'pending',
        architecture: {
          taskId: 'task-1', components: [{
            name: 'Feature', type: 'file', path: 'src/feature.ts',
            description: 'Feature implementation', dependencies: [],
          }], patterns: [], risks: [],
        },
        iterations: 1,
        nextStage: 'tester',
        lastCoderOutput: {
          taskId: 'task-1',
          patches: [{ path: 'src/feature.ts', content: 'export {};', language: 'ts' }],
          notes: [], dependencies: [],
        },
        appliedDiff: [{ path: 'src/feature.ts', content: 'export {};', language: 'ts' }],
      },
    },
  });

  assert.equal(staged.tasks['task-1']?.nextStage, 'tester');
  assert.equal(staged.tasks['task-1']?.lastCoderOutput?.patches[0]?.path, 'src/feature.ts');
  assert.equal(staged.stageExecutions['task-1:coder:iter0']?.promptHash, 'abc123');
});
