import type { ModelAdapter, ModelRequest, ModelResponse } from './adapter';

export interface OpenAICompatConfig {
  model: string;
  baseUrl?: string; // e.g. http://localhost:8080 for LM Studio / vLLM
  apiKey?: string;
  timeoutMs?: number;
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class OpenAICompatAdapter implements ModelAdapter {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: OpenAICompatConfig) {
    this.name = `openai-compat:${config.model}`;
    this.baseUrl = (config.baseUrl ?? 'http://localhost:8080').replace(/\/$/, '');
    this.apiKey = config.apiKey ?? 'local';
    this.timeoutMs = config.timeoutMs ?? 180_000;
  }

  async call(req: ModelRequest): Promise<ModelResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 8192,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(
        `OpenAI-compat endpoint unreachable at ${this.baseUrl}.\nCause: ${String(err)}`,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Model API HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices[0]?.message.content ?? '';
    return {
      content,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
