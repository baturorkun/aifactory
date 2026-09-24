import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelAdapter, ModelRequest, ModelResponse } from './adapter';

/**
 * Drives the Claude Code CLI as a plain completion provider, the way
 * `codex-cli` drives Codex. It exists for one reason: the CLI authenticates
 * from the developer's own Claude session, so a project with no Anthropic API
 * key can still run the factory.
 *
 * Two consequences are worth knowing before choosing it. The CLI starts a fresh
 * session per call and carries its own harness prompt, measured at about 35k
 * input tokens per invocation, and that prefix is not reused between calls, so
 * a short prompt is never a cheap call. And `--bare`, which would strip the
 * harness, reads only an API key and never the logged-in session, so it cannot
 * be used here. That makes this provider a good fit for the factory's long
 * agent turns and a poor one for short, frequent requests.
 */
export interface ClaudeCliConfig {
  model: string;
  executable?: string;
  timeoutMs?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxBudgetUsd?: number;
}

interface ClaudeProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type ClaudeProcessRunner = (input: {
  executable: string;
  args: string[];
  stdin: string;
  cwd: string;
  timeoutMs: number;
}) => Promise<ClaudeProcessResult>;

const MAX_ERROR_CHARS = 2_000;
const MAX_CAPTURE_CHARS = 2_000_000;

/**
 * The adapter is a completion, not an agent: every tool the CLI would otherwise
 * offer is denied, so a prompt cannot reach the filesystem, the network or a
 * shell. `--permission-prompts none` closes the remaining door by denying
 * anything that would otherwise stop and ask.
 */
const DENIED_TOOLS = [
  'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
  'Task', 'NotebookEdit', 'TodoWrite', 'Artifact', 'Skill',
];

function cleanError(value: string): string {
  const ansiEscape = String.fromCharCode(27);
  return value
    .replace(new RegExp(`${ansiEscape}\\[[0-9;]*m`, 'g'), '')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/("(?:access_token|refresh_token|id_token)"\s*:\s*")[^"]+/gi, '$1[REDACTED]')
    .trim()
    .slice(-MAX_ERROR_CHARS);
}

const runClaudeProcess: ClaudeProcessRunner = ({ executable, args, stdin, cwd, timeoutMs }) =>
  new Promise((resolveResult, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(executable, args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-MAX_CAPTURE_CHARS);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_ERROR_CHARS * 10);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolveResult({ exitCode, signal, stdout, stderr, timedOut });
    });
    child.stdin.end(stdin);
  });

interface ClaudeCliEnvelope {
  result?: unknown;
  is_error?: unknown;
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number }>;
  stop_reason?: unknown;
}

export class ClaudeCliAdapter implements ModelAdapter {
  readonly name: string;
  private readonly executable: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ClaudeCliConfig,
    private readonly processRunner: ClaudeProcessRunner = runClaudeProcess,
  ) {
    this.name = `claude-cli:${config.model}`;
    this.executable = config.executable ?? 'claude';
    this.timeoutMs = config.timeoutMs ?? 600_000;
  }

  async call(req: ModelRequest): Promise<ModelResponse> {
    // A throwaway working directory keeps the call hermetic: the CLI discovers
    // no project CLAUDE.md and no repository state, so the answer depends on
    // the prompt alone.
    const callDirectory = mkdtempSync(join(tmpdir(), 'aifactory-claude-cli-'));
    try {
      const args = [
        '--print',
        '--output-format', 'json',
        '--model', this.config.model,
        '--permission-prompts', 'none',
        '--disallowedTools', DENIED_TOOLS.join(' '),
      ];
      if (this.config.effort) args.push('--effort', this.config.effort);
      if (this.config.maxBudgetUsd !== undefined) {
        args.push('--max-budget-usd', String(this.config.maxBudgetUsd));
      }
      if (req.responseSchema) {
        args.push('--json-schema', JSON.stringify(req.responseSchema));
      }

      const prompt = [
        '## System Instructions',
        '',
        req.systemPrompt,
        '',
        '## Task',
        '',
        req.userPrompt,
      ].join('\n');

      let result: ClaudeProcessResult;
      try {
        result = await this.processRunner({
          executable: this.executable,
          args,
          stdin: prompt,
          cwd: callDirectory,
          timeoutMs: this.timeoutMs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Claude CLI could not start (${this.executable}). Install Claude Code and sign in on this machine. Cause: ${cleanError(message)}`,
        );
      }

      if (result.timedOut) throw new Error(`Claude CLI timed out after ${this.timeoutMs}ms.`);
      if (result.exitCode !== 0) {
        const detail = cleanError(result.stderr || result.stdout);
        throw new Error(
          `Claude CLI exited with code ${result.exitCode ?? 'unknown'}${result.signal ? ` (${result.signal})` : ''}${detail ? `: ${detail}` : ''}`,
        );
      }

      let envelope: ClaudeCliEnvelope;
      try {
        envelope = JSON.parse(result.stdout) as ClaudeCliEnvelope;
      } catch {
        throw new Error(`Claude CLI did not return JSON: ${cleanError(result.stdout)}`);
      }

      const content = typeof envelope.result === 'string' ? envelope.result.trim() : '';
      // A refused or unauthenticated run still exits 0 and reports itself here,
      // so the envelope, not the exit code, decides whether the call worked.
      if (envelope.is_error === true) {
        throw new Error(`Claude CLI reported an error: ${cleanError(content || 'no detail')}`);
      }
      if (!content) throw new Error('Claude CLI returned an empty result.');

      const usage = Object.values(envelope.modelUsage ?? {}).reduce(
        (total, entry) => ({
          promptTokens: total.promptTokens + (entry.inputTokens ?? 0),
          completionTokens: total.completionTokens + (entry.outputTokens ?? 0),
        }),
        { promptTokens: 0, completionTokens: 0 },
      );

      return {
        content,
        model: this.config.model,
        finishReason: typeof envelope.stop_reason === 'string' ? envelope.stop_reason : 'stop',
        usage,
      };
    } finally {
      rmSync(callDirectory, { recursive: true, force: true });
    }
  }
}
