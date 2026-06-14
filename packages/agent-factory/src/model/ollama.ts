import type { ModelAdapter, ModelRequest, ModelResponse } from './adapter';

export interface OllamaConfig {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  temperature?: number;
}

interface OllamaChatResponse {
  message: { content: string };
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaAdapter implements ModelAdapter {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: OllamaConfig) {
    this.name = `ollama:${config.model}`;
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 180_000;
  }

  async call(req: ModelRequest): Promise<ModelResponse> {
    const url = `${this.baseUrl}/api/chat`;
    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      stream: false,
      options: {
        temperature: req.temperature ?? this.config.temperature ?? 0.2,
        num_predict: req.maxTokens ?? 8192,
      },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(
        `Ollama unreachable at ${this.baseUrl}. Is Ollama running? (ollama serve)\n` +
          `Cause: ${String(err)}`,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    return {
      content: data.message.content,
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      },
    };
  }
}
