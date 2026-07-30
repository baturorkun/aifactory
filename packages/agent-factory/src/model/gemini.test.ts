import assert from 'node:assert/strict';
import test from 'node:test';
import { GeminiAdapter } from './gemini';

test('Gemini requests JSON with the configured output-token limit', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const adapter = new GeminiAdapter({
      model: 'gemini-3.6-flash',
      apiKey: 'test-key',
      maxTokens: 32768,
      temperature: 0.2,
    });
    const result = await adapter.call({ systemPrompt: 'system', userPrompt: 'user' });
    const generationConfig = requestBody?.generationConfig as Record<string, unknown>;

    assert.equal(generationConfig.maxOutputTokens, 32768);
    assert.equal(generationConfig.responseMimeType, 'application/json');
    assert.equal('temperature' in generationConfig, false);
    assert.equal(result.content, '{"ok":true}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini exposes the model finish reason for truncation handling', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: '{"incomplete":' }] },
            finishReason: 'MAX_TOKENS',
          },
        ],
        usageMetadata: { candidatesTokenCount: 32768 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    const adapter = new GeminiAdapter({
      model: 'test-model',
      apiKey: 'test-key',
      maxTokens: 32768,
    });
    const result = await adapter.call({ systemPrompt: 'system', userPrompt: 'user' });
    assert.equal(result.finishReason, 'MAX_TOKENS');
    assert.equal(result.usage.completionTokens, 32768);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini forwards a structured-output JSON schema', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const schema = {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
    };
    const adapter = new GeminiAdapter({
      model: 'gemini-3.6-flash',
      apiKey: 'test-key',
    });
    await adapter.call({
      systemPrompt: 'system',
      userPrompt: 'user',
      responseSchema: schema,
    });
    const generationConfig = requestBody?.generationConfig as Record<string, unknown>;

    assert.deepEqual(generationConfig.responseSchema, schema);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
