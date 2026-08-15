import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FactoryConfig } from '../config';
import { resolveTargetRoot } from '../workspace/apply';
import { addArtifact, readManifest, setRunStatus, updateStep } from './manifest';
import {
  beginImplementationRun,
  createDirectPackage,
  finishImplementationRun,
} from './handoff';

function runCodex(executable: string, args: string[], prompt: string, cwd: string, timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    let stderr = '';
    const child = spawn(executable, args, { cwd, env: process.env, stdio: ['pipe', 'ignore', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-20_000); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); resolveResult({ code, stderr }); });
    child.stdin.end(prompt);
  });
}

/** Runs one workspace-writing Codex implementation pass, then records the normal project gates. */
export async function runDirectCodex(requirementId: string, config: FactoryConfig): Promise<string> {
  if (config.model.provider !== 'codex-cli') {
    throw new Error('Direct mode requires model.provider to be codex-cli.');
  }
  const runId = await createDirectPackage(requirementId, config);
  const runDir = resolve(config.paths.runs, runId);
  const targetRoot = resolveTargetRoot(config.targetProject);
  if (!targetRoot) throw new Error('Direct mode requires a configured target project root.');
  beginImplementationRun(runId, config, 'direct');
  const outputPath = join(runDir, 'codex-last-message.md');
  const prompt = [
    'You are the sole implementation agent. Work directly in the repository.',
    'Read AGENTS.md if present and then the requirement/context below.',
    'Make only changes within the configured allowed paths. Do not invoke AI Factory.',
    'Run the configured typecheck, build, and tests when available. Do not commit or push.',
    '',
    readFileSync(join(config.paths.handoffs, runId, 'handoff.md'), 'utf8'),
  ].join('\n');
  const args = [
    '--sandbox', 'workspace-write', '--ask-for-approval', 'never', '--cd', targetRoot,
    '--model', config.model.name, 'exec', '--ephemeral', '--ignore-user-config', '--color', 'never',
    '--skip-git-repo-check', '--output-last-message', outputPath,
  ];
  if (config.model.reasoningEffort) args.push('-c', `model_reasoning_effort=${JSON.stringify(config.model.reasoningEffort)}`);
  args.push('-');
  try {
    const result = await runCodex(config.model.executable ?? 'codex', args, prompt, targetRoot, config.model.timeoutMs ?? 600_000);
    if (existsSync(outputPath)) addArtifact(runDir, 'codex-last-message.md');
    if (result.code !== 0) throw new Error(`Codex direct run exited with ${String(result.code)}: ${result.stderr.slice(-2_000)}`);
    updateStep(runDir, 'direct', undefined, { status: 'passed', outputFile: existsSync(outputPath) ? 'codex-last-message.md' : undefined });
    await finishImplementationRun(runId, config, 'direct');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateStep(runDir, 'direct', undefined, { status: 'failed', error: message });
    setRunStatus(runDir, 'failed');
    throw error;
  }
  return readManifest(runDir).runId;
}
