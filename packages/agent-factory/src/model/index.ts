import type { ModelConfig } from '../config';
import type { ModelAdapter } from './adapter';
import { OllamaAdapter } from './ollama';
import { OpenAICompatAdapter } from './openai-compat';
import { MockAdapter } from './mock';
import { GeminiAdapter } from './gemini';

export type { ModelAdapter } from './adapter';
export type { ModelRequest, ModelResponse, ModelUsage } from './adapter';
export { OllamaAdapter } from './ollama';
export { OpenAICompatAdapter } from './openai-compat';
export { MockAdapter } from './mock';
export { GeminiAdapter } from './gemini';

export function createModelAdapter(config: ModelConfig): ModelAdapter {
  switch (config.provider) {
    case 'mock':
      return new MockAdapter();
    case 'ollama':
      return new OllamaAdapter({
        model: config.name,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        temperature: config.temperature,
      });
    case 'openai-compat':
      return new OpenAICompatAdapter({
        model: config.name,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
      });
    case 'gemini':
      return new GeminiAdapter({
        model: config.name,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        apiKeyEnv: config.apiKeyEnv,
        timeoutMs: config.timeoutMs,
        temperature: config.temperature,
      });
  }
}

export function createReviewerAdapter(config: ModelConfig): ModelAdapter {
  if (config.provider === 'mock') return new MockAdapter();

  const reviewerName = config.reviewerName ?? config.name;

  if (config.provider === 'ollama') {
    return new OllamaAdapter({
      model: reviewerName,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      temperature: config.temperature,
    });
  }

  if (config.provider === 'gemini') {
    return new GeminiAdapter({
      model: reviewerName,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      apiKeyEnv: config.apiKeyEnv,
      timeoutMs: config.timeoutMs,
      temperature: config.temperature,
    });
  }

  // openai-compat
  return new OpenAICompatAdapter({
    model: reviewerName,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });
}
