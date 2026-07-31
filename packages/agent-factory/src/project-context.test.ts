import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { resolveTargetProjectPath } from './project-context';

test('bare project names resolve beside the AI Factory repository', () => {
  assert.equal(
    resolveTargetProjectPath('/work/agentic/aifactory', '/work/agentic/aifactory', 'arinc661-studio'),
    '/work/agentic/arinc661-studio',
  );
});

test('explicit relative and absolute project paths retain path semantics', () => {
  assert.equal(
    resolveTargetProjectPath('/work/agentic/aifactory', '/work/agentic/aifactory', '../arinc661-studio'),
    '/work/agentic/arinc661-studio',
  );
  const absolute = resolve('/tmp/arinc661-studio');
  assert.equal(
    resolveTargetProjectPath('/work/agentic/aifactory', '/work/agentic/aifactory', absolute),
    absolute,
  );
});
