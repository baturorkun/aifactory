import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ArchitectureOutput, Requirement, Task } from '@aifactory/contracts';
import { collectReviewSupportingFiles, validateTestOutputForTask } from './pipeline';

const task: Task = {
  id: 'task-1',
  title: 'Controls',
  description: 'Update controls.',
  dependsOn: [],
  acceptanceCriteria: ['Keep keyboard behavior.'],
  targetFiles: [
    'src/editor/core/render.ts',
    'src/styles/canvas.css',
    'tests/vertex-array-widgets-browser-harness.html',
  ],
};

const requirement: Requirement = {
  id: 'RQ-0037',
  title: 'Controls',
  description: 'Controls',
  acceptanceCriteria: [],
  nfr: [],
  rawMarkdown: 'Keep the existing handler in `canvas-interaction.ts`.',
};

const architecture: ArchitectureOutput = {
  taskId: 'task-1',
  components: [{
    name: 'Renderer', type: 'file', path: 'src/editor/core/render.ts',
    description: 'Renderer', dependencies: [],
  }],
  patterns: [], risks: [],
};

test('tester output is restricted to explicit task test targets', () => {
  const target = { root: process.cwd(), applyArtifacts: false, allowedPaths: ['src', 'tests'], commands: {} };
  const output = (path: string) => ({
    taskId: 'task-1',
    tests: [{ name: 'browser', path, content: '<html></html>', covers: ['controls'], framework: 'browser' }],
    coverage: [], setupNotes: [],
  });
  assert.equal(
    validateTestOutputForTask(
      output('tests/vertex-array-widgets-browser-harness.html'), task, {}, target,
    ).tests.length,
    1,
  );
  assert.throws(
    () => validateTestOutputForTask(output('tests/parallel-harness.html'), task, {}, target),
    /outside task test targets/,
  );
  assert.throws(
    () => validateTestOutputForTask(output('src/editor/core/render.ts'), task, {}, target),
    /outside task test targets/,
  );
});

test('review context resolves referenced unchanged files by basename', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-review-context-'));
  try {
    mkdirSync(join(root, 'src/editor/core'), { recursive: true });
    mkdirSync(join(root, 'tests'), { recursive: true });
    writeFileSync(join(root, 'src/editor/core/render.ts'), 'changed renderer');
    writeFileSync(join(root, 'src/editor/core/canvas-interaction.ts'), 'existing keyboard handler');
    const files = collectReviewSupportingFiles(requirement, architecture, task, {
      root,
      applyArtifacts: true,
      allowedPaths: ['src', 'tests'],
      commands: {},
    });
    assert.deepEqual(files, [{
      path: 'src/editor/core/canvas-interaction.ts',
      content: 'existing keyboard handler',
    }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
