import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArchitectureOutput, Requirement, Task } from '@aifactory/contracts';
import { FilePatchSchema } from '@aifactory/contracts';
import { buildCoderPrompt, buildPlannerPrompt } from './builders';
import { buildTesterPrompt } from './builders';

const requirement: Requirement = {
  id: 'RQ-0014',
  title: 'Build date',
  description: 'Short description.',
  acceptanceCriteria: ['Use YYYY.MM.DD.'],
  nfr: [],
  rawMarkdown: '# Build date\n\nFull requirement with `src/main.ts` constraints.',
};

const task: Task = {
  id: 'task-1',
  title: 'Update formatter',
  description: 'Update the existing formatter.',
  dependsOn: [],
  acceptanceCriteria: ['Use YYYY.MM.DD.'],
  targetFiles: ['src/main.ts'],
};

const architecture: ArchitectureOutput = {
  taskId: 'task-1',
  components: [{
    name: 'Formatter',
    type: 'file',
    path: 'src/main.ts',
    description: 'Existing formatter.',
    dependencies: [],
  }],
  patterns: [],
  risks: [],
};

test('planner receives the complete requirement and constraints', () => {
  const prompt = buildPlannerPrompt(requirement, { exactTaskCount: 1 });
  assert.match(prompt, /Full requirement with `src\/main\.ts` constraints/);
  assert.match(prompt, /"exactTaskCount": 1/);
});

test('coder receives existing target content and allowed paths', () => {
  const prompt = buildCoderPrompt(
    task,
    architecture,
    requirement,
    { forbiddenPaths: ['package.json'] },
    [{ path: 'src/main.ts', content: 'function formatBuildDate() {}' }],
    ['src', 'tests'],
  );
  assert.match(prompt, /function formatBuildDate\(\) \{\}/);
  assert.match(prompt, /package\.json/);
  assert.match(prompt, /mode "replace"/);
});

test('replace-mode file patches require exact find text', () => {
  assert.equal(FilePatchSchema.safeParse({
    path: 'src/main.ts',
    language: 'typescript',
    mode: 'replace',
    content: 'new',
  }).success, false);
  assert.equal(FilePatchSchema.safeParse({
    path: 'src/main.ts',
    language: 'typescript',
    mode: 'replace',
    find: 'old',
    content: 'new',
  }).success, true);
});

test('tester receives project constraints and existing browser harness conventions', () => {
  const prompt = buildTesterPrompt(
    task,
    {
      taskId: 'task-1',
      patches: [{
        path: 'src/main.ts',
        language: 'typescript',
        mode: 'full',
        content: 'function formatBuildDate() {}',
      }],
      notes: [],
      dependencies: [],
    },
    requirement,
    { allowedImplementationPaths: ['src/main.ts', 'tests'] },
    ['src', 'tests'],
    ['tests/zorder-browser-harness.html'],
  );
  assert.match(prompt, /allowedImplementationPaths/);
  assert.match(prompt, /tests\/zorder-browser-harness\.html/);
  assert.match(prompt, /Use Jest only when the project already uses Jest/);
});
