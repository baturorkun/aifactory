import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCodePatchResponseSchema } from './response-schemas';

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
