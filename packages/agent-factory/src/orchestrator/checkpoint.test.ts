import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkpointBranchName,
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
