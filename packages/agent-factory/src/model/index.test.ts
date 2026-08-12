import assert from 'node:assert/strict';
import test from 'node:test';
import { FactoryConfigSchema } from '../config';
import { CodexCliAdapter, createModelAdapter, createReviewerAdapter } from '.';

test('model factory selects Codex CLI primary and reviewer models', () => {
  const config = FactoryConfigSchema.parse({
    model: {
      provider: 'codex-cli',
      name: 'gpt-primary',
      reviewerName: 'gpt-reviewer',
      executable: '/opt/bin/codex',
      reasoningEffort: 'medium',
    },
  }).model;

  const primary = createModelAdapter(config);
  const reviewer = createReviewerAdapter(config);

  assert.ok(primary instanceof CodexCliAdapter);
  assert.ok(reviewer instanceof CodexCliAdapter);
  assert.equal(primary.name, 'codex-cli:gpt-primary');
  assert.equal(reviewer.name, 'codex-cli:gpt-reviewer');
});
