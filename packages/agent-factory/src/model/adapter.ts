export interface ModelRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ModelResponse {
  content: string;
  model: string;
  usage: ModelUsage;
}

export interface ModelAdapter {
  readonly name: string;
  call(req: ModelRequest): Promise<ModelResponse>;
}
