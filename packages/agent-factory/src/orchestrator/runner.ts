import { createHash } from 'crypto';
import type { AgentRole, AgentStepRecord } from '@aifactory/contracts';
import type { ModelAdapter } from '../model/adapter';
import { extractJSON as defaultExtractJSON } from '../utils/json';
import { addStep, updateStep, writeStepOutput } from './manifest';

// ============================================================
// TYPES
// ============================================================

export interface AgentRunConfig {
  agent: AgentRole;
  taskId?: string;
  runDir: string;
  systemPrompt: string;
  userPrompt: string;
  model: ModelAdapter;
  maxRetries?: number;
  outputFileName?: string;
  validate: (raw: unknown) => unknown;
  extractJSON?: (content: string) => unknown;
}

export interface AgentRunResult {
  output: unknown;
  usage: { promptTokens: number; completionTokens: number };
  promptHash: string;
  model: string;
  retries: number;
}

// ============================================================
// RUNNER
// ============================================================

/**
 * Runs a single agent call with retry logic and manifest tracking.
 * - Adds a step record before calling the model.
 * - Validates output against the provided Zod schema validator.
 * - Writes the validated output to the run's steps/ directory.
 * - Retries with exponential backoff on transient failures.
 */
export async function runAgent(config: AgentRunConfig): Promise<AgentRunResult> {
  const {
    agent,
    taskId,
    runDir,
    systemPrompt,
    userPrompt,
    model,
    maxRetries = 3,
    outputFileName,
    validate,
    extractJSON = defaultExtractJSON,
  } = config;

  const promptHash = createHash('sha256')
    .update(systemPrompt + userPrompt)
    .digest('hex')
    .slice(0, 16);

  const step: AgentStepRecord = {
    agent,
    taskId,
    status: 'running',
    startedAt: new Date().toISOString(),
    promptHash,
    model: model.name,
    retries: 0,
  };
  addStep(runDir, step);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      updateStep(runDir, agent, taskId, { status: 'running', retries: attempt });
      // Exponential backoff: 1s, 2s, 4s …
      await new Promise((r) => setTimeout(r, 1_000 * Math.pow(2, attempt - 1)));
    }

    try {
      const response = await model.call({ systemPrompt, userPrompt });
      const raw = extractJSON(response.content);
      const validated = validate(raw);

      const fname =
        outputFileName ?? `${agent}${taskId ? `-${taskId}` : ''}-output.json`;
      writeStepOutput(runDir, fname, validated);

      updateStep(runDir, agent, taskId, {
        status: 'passed',
        outputFile: fname,
        usage: response.usage,
        retries: attempt,
      });

      return {
        output: validated,
        usage: response.usage,
        promptHash,
        model: response.model,
        retries: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) break;
    }
  }

  updateStep(runDir, agent, taskId, {
    status: 'failed',
    error: lastError?.message ?? 'Unknown error',
  });

  throw lastError ?? new Error(`Agent "${agent}" failed after ${maxRetries + 1} attempts`);
}
