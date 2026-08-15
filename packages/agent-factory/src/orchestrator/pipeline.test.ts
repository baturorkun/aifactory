import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ArchitectureOutput, Requirement, Task } from '@aifactory/contracts';
import { FactoryConfigSchema } from '../config';
import { PipelineCheckpointSchema, type PipelineCheckpointProgress } from './checkpoint';
import { readManifest } from './manifest';
import {
  collectCoderExistingFiles,
  collectReviewSupportingFiles,
  runPipeline,
  validateCodeOutputForTask,
  validateTestOutputForTask,
} from './pipeline';

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

test('task test targets are hints while project allowed paths remain enforced', () => {
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
  assert.equal(
    validateTestOutputForTask(output('tests/parallel-harness.html'), task, {}, target).tests.length,
    1,
  );
  assert.throws(
    () => validateTestOutputForTask(output('package.json'), task, {}, target),
    /outside targetProject\.allowedPaths/,
  );
  const duplicate = output('tests/vertex-array-widgets-browser-harness.html');
  duplicate.tests.push({ ...duplicate.tests[0]! });
  assert.throws(
    () => validateTestOutputForTask(duplicate, task, {}, target),
    /duplicate test paths/,
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

test('coder context includes architecture dependencies and blocker files outside task hints', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-coder-context-'));
  try {
    mkdirSync(join(root, 'src/editor/core'), { recursive: true });
    mkdirSync(join(root, 'src/editor/geometry'), { recursive: true });
    mkdirSync(join(root, 'src/editor/widgets'), { recursive: true });
    writeFileSync(join(root, 'src/editor/widgets/definitions.ts'), 'task target');
    writeFileSync(join(root, 'src/editor/geometry/affine.ts'), 'architecture dependency');
    writeFileSync(join(root, 'src/editor/core/geometry.ts'), 'review blocker');
    const files = collectCoderExistingFiles(
      { ...task, targetFiles: ['src/editor/widgets/definitions.ts'] },
      {
        ...architecture,
        components: [{
          ...architecture.components[0]!,
          path: 'src/editor/widgets/definitions.ts',
          dependencies: ['src/editor/geometry/affine.ts'],
        }],
      },
      { root, applyArtifacts: true, allowedPaths: ['src'], commands: {} },
      {
        reviewFindings: [{
          severity: 'blocker', file: 'src/editor/core/geometry.ts', message: 'Fix geometry.',
        }],
        domainViolations: [],
      },
    );
    assert.deepEqual(files.map((file) => file.path), [
      'src/editor/core/geometry.ts',
      'src/editor/geometry/affine.ts',
      'src/editor/widgets/definitions.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('coder validator combines sequential replace patches for one file', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-coder-patches-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/feature.ts'), 'const first = 1;\nconst second = 2;\n');
    const output = validateCodeOutputForTask({
      taskId: task.id,
      patches: [
        { path: 'src/feature.ts', language: 'typescript', mode: 'replace', find: 'first = 1', content: 'first = 3' },
        { path: 'src/feature.ts', language: 'typescript', mode: 'replace', find: 'second = 2', content: 'second = 4' },
      ],
      notes: [], dependencies: [],
    }, task, { root, applyArtifacts: true, allowedPaths: ['src'], commands: {} });
    assert.deepEqual(output.patches, [{
      path: 'src/feature.ts', language: 'typescript', mode: 'full',
      find: undefined,
      content: 'const first = 3;\nconst second = 4;\n',
    }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pipeline resumes at reviewer without repeating planner, architect, coder, or tester', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-stage-resume-'));
  const requirements = join(root, 'requirements');
  const runs = join(root, 'runs');
  mkdirSync(requirements);
  mkdirSync(runs);
  writeFileSync(join(requirements, 'RQ-0099.md'), '# Resume test\n\nContinue saved work.\n');

  const resumedTask = {
    id: 'task-mock-1',
    title: 'Implement mock feature',
    description: 'A placeholder task generated by the mock model adapter.',
    dependsOn: [],
    acceptanceCriteria: ['Unit tests must pass'],
    targetFiles: ['src/mock/feature.ts', 'src/mock/feature.test.ts'],
  };
  const checkpoint = PipelineCheckpointSchema.parse({
    version: 1,
    requirementId: 'RQ-0099',
    requirementSha256: 'hash',
    sourceCommit: 'source',
    fast: false,
    previousRunId: 'previous-run',
    previousProvider: 'codex-cli',
    previousModel: 'gpt-5.6-sol',
    updatedAt: new Date().toISOString(),
    artifactPaths: ['src/mock/feature.ts', 'src/mock/feature.test.ts'],
    plan: {
      requirementId: 'RQ-0099', summary: 'Resume plan', assumptions: [], outOfScope: [],
      tasks: [resumedTask],
    },
    tasks: {
      'task-mock-1': {
        status: 'pending',
        architecture: {
          taskId: 'task-mock-1', components: [{
            name: 'MockFeature', type: 'file', path: 'src/mock/feature.ts',
            description: 'Feature', dependencies: [],
          }], patterns: [], risks: [],
        },
        iterations: 1,
        nextStage: 'reviewer',
        lastCoderOutput: {
          taskId: 'task-mock-1',
          patches: [{
            path: 'src/mock/feature.ts', language: 'typescript',
            content: 'export const mockFeature = () => "mock";',
          }],
          notes: [], dependencies: [],
        },
        lastTesterOutput: {
          taskId: 'task-mock-1',
          tests: [{
            name: 'mock test', path: 'src/mock/feature.test.ts',
            content: 'test("mock", () => {});', covers: ['mock'], framework: 'jest',
          }],
          coverage: ['mock'], setupNotes: [],
        },
        appliedDiff: [{
          path: 'src/mock/feature.ts', language: 'typescript',
          content: 'export const mockFeature = () => "mock";',
        }],
      },
    },
  });
  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    paths: {
      requirements,
      runs,
      prompts: join(process.cwd(), 'prompts'),
    },
    targetProject: {
      root,
      applyArtifacts: false,
      allowedPaths: ['src'],
      commands: {},
    },
  });

  try {
    const progress: PipelineCheckpointProgress[] = [];
    await runPipeline('RQ-0099', config, {
      dryRun: true,
      skipGates: true,
      resumeCheckpoint: checkpoint,
      onCheckpoint: (update) => progress.push(update),
    });
    const runDir = join(runs, readdirSync(runs)[0]!);
    const agents = readManifest(runDir).steps.map((step) => step.agent);
    assert.deepEqual(agents, ['reviewer', 'domain-guard']);
    assert.deepEqual(progress.map((update) => update.stage), [
      'reviewer', 'domain-guard', 'complete',
    ]);
    assert.equal(progress[0]?.task?.lastCoderOutput?.taskId, 'task-mock-1');
    assert.match(progress[0]?.execution?.promptHash ?? '', /^[a-f0-9]{16}$/);
    assert.equal(progress[1]?.task?.nextStage, 'complete');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
