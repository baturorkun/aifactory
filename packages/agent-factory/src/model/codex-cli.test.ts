import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { CodexCliAdapter, type CodexProcessRunner } from './codex-cli';

test('Codex CLI adapter maps prompts and structured output to codex exec', async () => {
  let invocation: Parameters<CodexProcessRunner>[0] | undefined;
  const runner: CodexProcessRunner = async (input) => {
    invocation = input;
    const outputIndex = input.args.indexOf('--output-last-message');
    writeFileSync(input.args[outputIndex + 1], '{"ok":true}\n', 'utf8');
    return { exitCode: 0, signal: null, stderr: '', timedOut: false };
  };
  const adapter = new CodexCliAdapter(
    {
      model: 'gpt-test-codex',
      executable: '/usr/local/bin/codex',
      timeoutMs: 1234,
      reasoningEffort: 'high',
      workingDirectory: process.cwd(),
    },
    runner,
  );

  const response = await adapter.call({
    systemPrompt: 'SYSTEM RULES',
    userPrompt: 'IMPLEMENT TASK',
    responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  });

  assert.ok(invocation);
  assert.equal(invocation.executable, '/usr/local/bin/codex');
  assert.equal(invocation.timeoutMs, 1234);
  assert.match(invocation.stdin, /## System Instructions\n\nSYSTEM RULES/);
  assert.match(invocation.stdin, /## Task\n\nIMPLEMENT TASK/);
  assert.deepEqual(invocation.args.slice(0, 8), [
    'exec', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only',
    '--ask-for-approval', 'never', '--color',
  ]);
  assert.ok(invocation.args.includes('--output-schema'));
  assert.ok(invocation.args.includes('--output-last-message'));
  assert.ok(invocation.args.includes('model_reasoning_effort="high"'));
  assert.equal(invocation.args.at(-1), '-');
  assert.equal(response.content, '{"ok":true}');
  assert.equal(response.model, 'gpt-test-codex');
  const schemaPath = invocation.args[invocation.args.indexOf('--output-schema') + 1];
  const outputPath = invocation.args[invocation.args.indexOf('--output-last-message') + 1];
  assert.equal(existsSync(schemaPath), false);
  assert.equal(existsSync(outputPath), false);
});

test('Codex CLI adapter reports timeout and cleans temporary files', async () => {
  let outputPath = '';
  const runner: CodexProcessRunner = async (input) => {
    outputPath = input.args[input.args.indexOf('--output-last-message') + 1];
    return { exitCode: null, signal: 'SIGTERM', stderr: '', timedOut: true };
  };
  const adapter = new CodexCliAdapter({ model: 'gpt-test', timeoutMs: 25 }, runner);

  await assert.rejects(
    adapter.call({ systemPrompt: 'system', userPrompt: 'user' }),
    /timed out after 25ms/,
  );
  assert.equal(existsSync(outputPath), false);
});

test('Codex CLI adapter emits a clear missing executable error', async () => {
  const runner: CodexProcessRunner = async () => {
    throw new Error('spawn codex ENOENT');
  };
  const adapter = new CodexCliAdapter({ model: 'gpt-test' }, runner);

  await assert.rejects(
    adapter.call({ systemPrompt: 'system', userPrompt: 'user' }),
    /Ensure the Codex runner image is selected and codex is on PATH/,
  );
});

test('Codex CLI adapter redacts credentials from failures and cleans temporary files', async () => {
  let outputPath = '';
  const runner: CodexProcessRunner = async (input) => {
    outputPath = input.args[input.args.indexOf('--output-last-message') + 1];
    return {
      exitCode: 1,
      signal: null,
      stderr: 'Bearer secret-token {"access_token":"secret-access"}',
      timedOut: false,
    };
  };
  const adapter = new CodexCliAdapter({ model: 'gpt-test' }, runner);

  await assert.rejects(
    adapter.call({ systemPrompt: 'system', userPrompt: 'user' }),
    (error: Error) => {
      assert.match(error.message, /Bearer \[REDACTED\]/);
      assert.match(error.message, /"access_token":"\[REDACTED\]"/);
      assert.doesNotMatch(error.message, /secret-token|secret-access/);
      return true;
    },
  );
  assert.equal(existsSync(outputPath), false);
});
