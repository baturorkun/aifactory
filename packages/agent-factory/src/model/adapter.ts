export interface ModelRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Optional JSON Schema for providers that support structured output.
   * Providers without structured-output support may ignore it.
   */
  responseSchema?: Record<string, unknown>;
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ModelResponse {
  content: string;
  model: string;
  usage: ModelUsage;
  finishReason?: string;
}

export interface ModelAdapter {
  readonly name: string;
  call(req: ModelRequest): Promise<ModelResponse>;
}
