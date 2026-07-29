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
      model: 'test-model',
      apiKey: 'test-key',
      maxTokens: 32768,
    });
    const result = await adapter.call({ systemPrompt: 'system', userPrompt: 'user' });
    const generationConfig = requestBody?.generationConfig as Record<string, unknown>;

    assert.equal(generationConfig.maxOutputTokens, 32768);
    assert.equal(generationConfig.responseMimeType, 'application/json');
    assert.equal(result.content, '{"ok":true}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini reports output truncation explicitly', async () => {
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
    await assert.rejects(
      adapter.call({ systemPrompt: 'system', userPrompt: 'user' }),
      /Gemini output was truncated at 32768 tokens/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
