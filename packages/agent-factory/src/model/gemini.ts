import type { ModelAdapter, ModelRequest, ModelResponse } from './adapter';

export interface GeminiConfig {
  model: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
  temperature?: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class GeminiAdapter implements ModelAdapter {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey: string;

  constructor(private readonly config: GeminiConfig) {
    this.name = `gemini:${config.model}`;
    this.baseUrl = (config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 180_000;
    const envName = config.apiKeyEnv ?? 'GEMINI_API_KEY';
    this.apiKey = config.apiKey ?? process.env[envName] ?? '';

    if (!this.apiKey) {
      throw new Error(`Gemini API key missing. Set ${envName} or model.apiKey.`);
    }
  }

  async call(req: ModelRequest): Promise<ModelResponse> {
    const model = encodeURIComponent(this.config.model);
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const body = {
      systemInstruction: {
        parts: [{ text: req.systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: req.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: req.temperature ?? this.config.temperature ?? 0.2,
        maxOutputTokens: req.maxTokens ?? 8192,
      },
    };

    const response = await this.fetchWithRetry(url, body);
    const data = (await response.json()) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

    return {
      content,
      model: this.config.model,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  private async fetchWithRetry(url: string, body: unknown): Promise<Response> {
    const maxAttempts = 4;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        lastError = new Error(`Gemini endpoint unreachable at ${this.baseUrl}.\nCause: ${String(err)}`);
        if (attempt === maxAttempts) throw lastError;
        await sleep(backoffMs(attempt));
        continue;
      }

      if (response.ok) return response;

      const text = await response.text().catch(() => '');
      lastError = new Error(`Gemini HTTP ${response.status}: ${text}`);

      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
        throw lastError;
      }

      await sleep(parseRetryDelayMs(text) ?? backoffMs(attempt));
    }

    throw lastError ?? new Error('Gemini request failed');
  }
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 1_500 * 2 ** (attempt - 1));
}

function parseRetryDelayMs(text: string): number | undefined {
  const match = text.match(/"retryDelay"s*:s*"(\d+)s"/);
  if (!match) return undefined;
  return Number(match[1]) * 1_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
