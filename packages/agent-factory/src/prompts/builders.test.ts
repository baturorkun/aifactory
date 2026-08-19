import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArchitectureOutput, Requirement, Task } from '@aifactory/contracts';
import { FilePatchSchema } from '@aifactory/contracts';
import {
  buildCoderPrompt,
  buildArchitectPrompt,
  buildDomainGuardPrompt,
  buildPlannerPrompt,
  buildQualityGateRepairPrompt,
  buildReviewerPrompt,
} from './builders';
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
  const prompt = buildPlannerPrompt(
    requirement,
    { exactTaskCount: 1 },
    ['src/editor/widgets/graphical/gp-line.ts'],
  );
  assert.match(prompt, /Full requirement with `src\/main\.ts` constraints/);
  assert.match(prompt, /"exactTaskCount": 1/);
  assert.match(prompt, /src\/editor\/widgets\/graphical\/gp-line\.ts/);
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
  assert.match(prompt, /appears exactly once/);
  assert.match(prompt, /target code is repeated/);
  assert.match(prompt, /### Task Artifact Paths/);
  assert.match(prompt, /These are planning hints/);
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
    find: '',
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

test('quality repair receives full gate errors and generated files', () => {
  const prompt = buildQualityGateRepairPrompt(
    requirement,
    [{
      gate: 'typeCheck',
      status: 'failed',
      output: 'Cannot find module ./colorResolver.js',
      durationMs: 10,
    }],
    [{ path: 'src/render/canvasRenderer.ts', content: 'import "./colorResolver.js";' }],
    ['src', 'tests'],
  );

  assert.match(prompt, /Cannot find module \.\/colorResolver\.js/);
  assert.match(prompt, /src\/render\/canvasRenderer\.ts/);
  assert.match(prompt, /You may create a missing source file/);
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
    [{
      path: 'tests/zorder-browser-harness.html',
      content: '<pre id="result">waiting</pre>',
    }],
  );
  assert.match(prompt, /allowedImplementationPaths/);
  assert.match(prompt, /tests\/zorder-browser-harness\.html/);
  assert.match(prompt, /<pre id="result">waiting<\/pre>/);
  assert.match(prompt, /do not introduce unrelated behavioral requirements/);
  assert.match(prompt, /Use Jest only when the project already uses Jest/);
  assert.match(prompt, /These are planning hints/);
  assert.match(prompt, /Prefer an existing listed harness/);
  assert.match(prompt, /data-pass="true"/);
  assert.match(prompt, /Do not replace this contract/);
  assert.match(prompt, /do not await `requestAnimationFrame`/);
});

test('review agents receive unchanged supporting integration context', () => {
  const code = {
    taskId: 'task-1',
    patches: [{ path: 'src/main.ts', language: 'typescript', mode: 'full' as const, content: 'render();' }],
    notes: [],
    dependencies: [],
  };
  const tests = {
    taskId: 'task-1',
    tests: [{ name: 'browser', path: 'tests/existing.html', content: '<html></html>', covers: ['keyboard'], framework: 'browser' }],
    coverage: [],
    setupNotes: [],
  };
  const supporting = [{ path: 'src/interaction.ts', content: 'handleKeyboardActivation();' }];
  const reviewer = buildReviewerPrompt(task, code, tests, requirement, supporting);
  const guard = buildDomainGuardPrompt(task, code, requirement, [], supporting);
  assert.match(reviewer, /handleKeyboardActivation/);
  assert.match(reviewer, /context, not submitted changes/);
  assert.match(guard, /handleKeyboardActivation/);
  assert.match(guard, /Do not treat these files as submitted changes/);
});

test('all pipeline prompts receive a Simics target profile without TypeScript or Jest defaults', () => {
  const code = {
    taskId: task.id,
    patches: [{ path: 'dml/device.dml', language: 'dml', mode: 'full' as const, content: 'dml 1.4;' }],
    notes: [],
    dependencies: [],
  };
  const tests = {
    taskId: task.id,
    tests: [{ name: 'register reset', path: 'tests/reset.simics', content: 'quit 0', covers: ['reset'], framework: 'simics-batch' }],
    coverage: [],
    setupNotes: [],
  };
  const profilePattern = /Target Project Profile[\s\S]*simics[\s\S]*Do not substitute TypeScript, npm, Jest/;
  const prompts = [
    buildPlannerPrompt(requirement, {}, [], undefined, 'simics'),
    buildArchitectPrompt(task, { requirementId: requirement.id, summary: 'plan', tasks: [task], assumptions: [], outOfScope: [] }, requirement, {}, [], undefined, 'simics'),
    buildCoderPrompt(task, architecture, requirement, {}, [], ['dml', 'tests'], undefined, undefined, 'simics'),
    buildTesterPrompt(task, code, requirement, {}, ['dml', 'tests'], [], undefined, 'simics'),
    buildReviewerPrompt(task, code, tests, requirement, [], undefined, 'simics'),
    buildDomainGuardPrompt(task, code, requirement, [], [], undefined, 'simics'),
    buildQualityGateRepairPrompt(requirement, [], [], ['dml', 'tests'], 'simics'),
  ];
  for (const prompt of prompts) assert.match(prompt, profilePattern);
});
