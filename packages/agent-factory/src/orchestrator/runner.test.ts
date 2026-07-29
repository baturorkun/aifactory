import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ModelAdapter, ModelRequest, ModelResponse } from '../model/adapter';
import { createRunDir } from './manifest';
import { runAgent } from './runner';

class RetryModel implements ModelAdapter {
  readonly name = 'retry-model';
  readonly requests: ModelRequest[] = [];

  async call(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const retry = this.requests.length > 1;
    return {
      content: retry ? '{"ok":true}' : '{"ok":',
      model: this.name,
      finishReason: 'STOP',
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  }
}

test('agent retries invalid JSON with corrective guidance and preserves the raw response', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-runner-'));
  try {
    const runDir = createRunDir(root, 'run-1', 'RQ-0001');
    const model = new RetryModel();
    const result = await runAgent({
      agent: 'coder',
      taskId: 'task-1',
      runDir,
      systemPrompt: 'system',
      userPrompt: 'user',
      model,
      maxRetries: 1,
      outputFileName: 'coder-task-1.json',
      validate: (raw) => raw,
    });

    assert.deepEqual(result.output, { ok: true });
    assert.equal(model.requests.length, 2);
    assert.match(model.requests[1]?.userPrompt ?? '', /RETRY REQUIREMENT/);
    const rawPath = join(runDir, 'steps', 'coder-task-1-attempt-1.raw.txt');
    assert.equal(existsSync(rawPath), true);
    assert.equal(readFileSync(rawPath, 'utf8'), '{"ok":');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
