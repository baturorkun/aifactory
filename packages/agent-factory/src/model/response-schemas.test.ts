import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCodePatchResponseSchema, buildTestOutputResponseSchema } from './response-schemas';

test('coder schema limits patch paths to exact task target files', () => {
  const schema = buildCodePatchResponseSchema(['src/io/jsonSerializer.ts']);
  const properties = schema.properties as Record<string, unknown>;
  const patches = properties.patches as Record<string, unknown>;
  const items = patches.items as Record<string, unknown>;
  const patchProperties = items.properties as Record<string, unknown>;

  assert.deepEqual(patchProperties.path, {
    type: 'string',
    enum: ['src/io/jsonSerializer.ts'],
  });
});

test('coder schema leaves paths open when a task has no exact file list', () => {
  const schema = buildCodePatchResponseSchema();
  const properties = schema.properties as Record<string, unknown>;
  const patches = properties.patches as Record<string, unknown>;
  const items = patches.items as Record<string, unknown>;
  const patchProperties = items.properties as Record<string, unknown>;

  assert.deepEqual(patchProperties.path, { type: 'string' });
});

test('tester schema limits test paths to exact task target files', () => {
  const schema = buildTestOutputResponseSchema(['tests/existing-browser-harness.html']);
  const tests = (schema.properties as Record<string, any>).tests;
  assert.deepEqual(tests.items.properties.path, {
    type: 'string',
    enum: ['tests/existing-browser-harness.html'],
  });
});
