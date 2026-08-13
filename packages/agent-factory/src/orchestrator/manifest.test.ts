import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { addStep, createRunDir, readManifest, updateStep } from './manifest';

test('step updates affect only the latest matching agent iteration', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-manifest-'));
  try {
    const runDir = createRunDir(root, 'run-1', 'RQ-0001');
    addStep(runDir, { agent: 'reviewer', taskId: 'task-1', status: 'running', retries: 0 });
    updateStep(runDir, 'reviewer', 'task-1', { status: 'needs-fix', outputFile: 'iter0.json' });
    addStep(runDir, { agent: 'reviewer', taskId: 'task-1', status: 'running', retries: 0 });
    updateStep(runDir, 'reviewer', 'task-1', { status: 'passed', outputFile: 'iter1.json' });

    const steps = readManifest(runDir).steps;
    assert.equal(steps[0]?.status, 'needs-fix');
    assert.equal(steps[0]?.outputFile, 'iter0.json');
    assert.equal(steps[1]?.status, 'passed');
    assert.equal(steps[1]?.outputFile, 'iter1.json');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
