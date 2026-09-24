import assert from 'node:assert/strict';
import test from 'node:test';
import { ClaudeCliAdapter, type ClaudeProcessRunner } from './claude-cli';

const envelope = (fields: Record<string, unknown>) => JSON.stringify({
  result: 'ANSWER',
  is_error: false,
  stop_reason: 'end_turn',
  modelUsage: { 'claude-opus-5': { inputTokens: 120, outputTokens: 7 } },
  ...fields,
});

test('Claude CLI adapter drives a print-mode completion and reports its usage', async () => {
  let invocation: Parameters<ClaudeProcessRunner>[0] | undefined;
  const runner: ClaudeProcessRunner = async (input) => {
    invocation = input;
    return { exitCode: 0, signal: null, stdout: envelope({}), stderr: '', timedOut: false };
  };
  const adapter = new ClaudeCliAdapter(
    { model: 'claude-opus-5', executable: '/usr/local/bin/claude', timeoutMs: 1234, effort: 'high' },
    runner,
  );

  const response = await adapter.call({ systemPrompt: 'SYSTEM RULES', userPrompt: 'DO THE TASK' });

  assert.equal(response.content, 'ANSWER');
  assert.equal(response.model, 'claude-opus-5');
  assert.equal(response.finishReason, 'end_turn');
  assert.deepEqual(response.usage, { promptTokens: 120, completionTokens: 7 });

  assert.ok(invocation);
  assert.equal(invocation.executable, '/usr/local/bin/claude');
  assert.equal(invocation.timeoutMs, 1234);
  // Both halves of the request travel on stdin, so neither can overflow an
  // argument list.
  assert.match(invocation.stdin, /## System Instructions\n\nSYSTEM RULES/);
  assert.match(invocation.stdin, /## Task\n\nDO THE TASK/);

  // A completion, not an agent: printing, JSON out, the named model, no tool
  // may run and nothing may stop to ask.
  assert.ok(invocation.args.includes('--print'));
  assert.deepEqual(
    invocation.args.slice(invocation.args.indexOf('--output-format'), invocation.args.indexOf('--output-format') + 2),
    ['--output-format', 'json'],
  );
  assert.ok(invocation.args.includes('claude-opus-5'));
  assert.deepEqual(
    invocation.args.slice(invocation.args.indexOf('--permission-prompts'), invocation.args.indexOf('--permission-prompts') + 2),
    ['--permission-prompts', 'none'],
  );
  const denied = invocation.args[invocation.args.indexOf('--disallowedTools') + 1];
  for (const tool of ['Bash', 'Edit', 'Write', 'Read', 'WebFetch']) {
    assert.ok(denied.includes(tool), `${tool} is denied`);
  }
  assert.deepEqual(
    invocation.args.slice(invocation.args.indexOf('--effort'), invocation.args.indexOf('--effort') + 2),
    ['--effort', 'high'],
  );
  assert.equal(invocation.args.includes('--json-schema'), false);
});

test('Claude CLI adapter passes a response schema through --json-schema', async () => {
  let schema: unknown;
  const runner: ClaudeProcessRunner = async (input) => {
    schema = JSON.parse(input.args[input.args.indexOf('--json-schema') + 1]);
    return { exitCode: 0, signal: null, stdout: envelope({ result: '{"ok":true}' }), stderr: '', timedOut: false };
  };
  const adapter = new ClaudeCliAdapter({ model: 'claude-opus-5' }, runner);

  const response = await adapter.call({
    systemPrompt: 'S',
    userPrompt: 'U',
    responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  });

  assert.equal(response.content, '{"ok":true}');
  assert.deepEqual(schema, { type: 'object', properties: { ok: { type: 'boolean' } } });
});

test('Claude CLI adapter fails on an error envelope even when the exit code is zero', async () => {
  const runner: ClaudeProcessRunner = async () => ({
    exitCode: 0,
    signal: null,
    stdout: envelope({ is_error: true, result: 'Not logged in · Please run /login' }),
    stderr: '',
    timedOut: false,
  });
  const adapter = new ClaudeCliAdapter({ model: 'claude-opus-5' }, runner);

  await assert.rejects(
    () => adapter.call({ systemPrompt: 'S', userPrompt: 'U' }),
    /Claude CLI reported an error: Not logged in/,
  );
});

test('Claude CLI adapter reports a missing executable as a setup problem', async () => {
  const runner: ClaudeProcessRunner = async () => {
    throw new Error('spawn claude ENOENT');
  };
  const adapter = new ClaudeCliAdapter({ model: 'claude-opus-5' }, runner);

  await assert.rejects(
    () => adapter.call({ systemPrompt: 'S', userPrompt: 'U' }),
    /Install Claude Code and sign in on this machine/,
  );
});

test('Claude CLI adapter rejects output that is not the JSON envelope', async () => {
  const runner: ClaudeProcessRunner = async () => ({
    exitCode: 0, signal: null, stdout: 'plain text, not json', stderr: '', timedOut: false,
  });
  const adapter = new ClaudeCliAdapter({ model: 'claude-opus-5' }, runner);

  await assert.rejects(
    () => adapter.call({ systemPrompt: 'S', userPrompt: 'U' }),
    /did not return JSON/,
  );
});
