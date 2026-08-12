import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ModelAdapter, ModelRequest, ModelResponse } from './adapter';

export interface CodexCliConfig {
  model: string;
  executable?: string;
  timeoutMs?: number;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  workingDirectory?: string;
}

interface CodexProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;
}

export type CodexProcessRunner = (input: {
  executable: string;
  args: string[];
  stdin: string;
  cwd: string;
  timeoutMs: number;
}) => Promise<CodexProcessResult>;

const MAX_ERROR_CHARS = 2_000;
const MAX_STDERR_CAPTURE_CHARS = 20_000;

function cleanError(value: string): string {
  const ansiEscape = String.fromCharCode(27);
  return value
    .replace(new RegExp(`${ansiEscape}\\[[0-9;]*m`, 'g'), '')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/("(?:access_token|refresh_token|id_token)"\s*:\s*")[^"]+/gi, '$1[REDACTED]')
    .trim()
    .slice(-MAX_ERROR_CHARS);
}

const runCodexProcess: CodexProcessRunner = ({ executable, args, stdin, cwd, timeoutMs }) =>
  new Promise((resolveResult, reject) => {
    let stderr = '';
    let timedOut = false;
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_STDERR_CAPTURE_CHARS);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolveResult({ exitCode, signal, stderr, timedOut });
    });
    child.stdin.end(stdin);
  });

export class CodexCliAdapter implements ModelAdapter {
  readonly name: string;
  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly workingDirectory: string;

  constructor(
    private readonly config: CodexCliConfig,
    private readonly processRunner: CodexProcessRunner = runCodexProcess,
  ) {
    this.name = `codex-cli:${config.model}`;
    this.executable = config.executable ?? 'codex';
    this.timeoutMs = config.timeoutMs ?? 600_000;
    this.workingDirectory = resolve(config.workingDirectory ?? process.cwd());
  }

  async call(req: ModelRequest): Promise<ModelResponse> {
    const callDirectory = mkdtempSync(join(tmpdir(), 'aifactory-codex-cli-'));
    const outputPath = join(callDirectory, 'last-message.txt');
    const schemaPath = join(callDirectory, 'response-schema.json');
    try {
      const args = [
        '--sandbox',
        'read-only',
        '--ask-for-approval',
        'never',
        '--cd',
        this.workingDirectory,
        '--model',
        this.config.model,
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--color',
        'never',
        '--skip-git-repo-check',
        '--output-last-message',
        outputPath,
      ];
      if (this.config.reasoningEffort) {
        args.push('-c', `model_reasoning_effort=${JSON.stringify(this.config.reasoningEffort)}`);
      }
      if (req.responseSchema) {
        writeFileSync(schemaPath, `${JSON.stringify(req.responseSchema, null, 2)}\n`, 'utf8');
        args.push('--output-schema', schemaPath);
      }
      args.push('-');

      const prompt = [
        '## System Instructions',
        '',
        req.systemPrompt,
        '',
        '## Task',
        '',
        req.userPrompt,
      ].join('\n');

      let result: CodexProcessResult;
      try {
        result = await this.processRunner({
          executable: this.executable,
          args,
          stdin: prompt,
          cwd: this.workingDirectory,
          timeoutMs: this.timeoutMs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Codex CLI could not start (${this.executable}). Ensure the Codex runner image is selected and codex is on PATH. Cause: ${cleanError(message)}`,
        );
      }

      if (result.timedOut) {
        throw new Error(`Codex CLI timed out after ${this.timeoutMs}ms.`);
      }
      if (result.exitCode !== 0) {
        const detail = cleanError(result.stderr);
        throw new Error(
          `Codex CLI exited with code ${result.exitCode ?? 'unknown'}${result.signal ? ` (${result.signal})` : ''}${detail ? `: ${detail}` : ''}`,
        );
      }

      let content: string;
      try {
        content = readFileSync(outputPath, 'utf8').trim();
      } catch {
        throw new Error('Codex CLI completed without writing the last-message output file.');
      }
      if (!content) throw new Error('Codex CLI returned an empty last message.');

      return {
        content,
        model: this.config.model,
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    } finally {
      rmSync(callDirectory, { recursive: true, force: true });
    }
  }
}
