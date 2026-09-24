import assert from 'node:assert/strict';
import test from 'node:test';
import { FactoryConfigSchema } from '../config';
import { ClaudeCliAdapter, CodexCliAdapter, createModelAdapter, createReviewerAdapter } from '.';

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

test('model factory selects Claude CLI primary and reviewer models', () => {
  const config = FactoryConfigSchema.parse({
    model: {
      provider: 'claude-cli',
      name: 'claude-opus-5',
      reviewerName: 'claude-sonnet-5',
      executable: '/opt/bin/claude',
      effort: 'xhigh',
      // The scaffold writes one model block for every provider, so a
      // codex-only field arrives here too and must be dropped, not rejected.
      reasoningEffort: 'medium',
    },
  }).model;

  const primary = createModelAdapter(config);
  const reviewer = createReviewerAdapter(config);

  assert.ok(primary instanceof ClaudeCliAdapter);
  assert.ok(reviewer instanceof ClaudeCliAdapter);
  assert.equal(primary.name, 'claude-cli:claude-opus-5');
  assert.equal(reviewer.name, 'claude-cli:claude-sonnet-5');
  assert.equal('reasoningEffort' in config, false);
});
