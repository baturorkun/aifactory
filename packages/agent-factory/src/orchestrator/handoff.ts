import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import type { FactoryConfig } from '../config';
import { parseRequirement } from '../requirements/parser';
import {
  buildGroundingQuestion,
  formatGroundingReference,
  queryConfiguredRag,
  shouldQueryGrounding,
  type RagGroundingResponse,
} from '../rag/grounding-client';

function generateRunId(requirementId: string): string {
  return requirementId;
}

function loadConstraints(id: string, constraintsDir: string): Record<string, unknown> {
  const path = resolve(join(constraintsDir, id + '.json'));
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function listTargetFiles(root: string): string[] {
  const ignored = new Set(['node_modules', 'runs', 'handoffs', 'dist', '.git', '.env']);
  const results: string[] = [];
  function walk(dir: string, prefix = ''): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.name.startsWith('.env.')) continue;
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) results.push(rel);
    }
  }
  walk(root);
  return results.sort();
}

export async function createHandoffPackage(
  requirementId: string,
  config: FactoryConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const requirement = parseRequirement(requirementId, config.paths.requirements);
  const constraints = loadConstraints(requirementId, config.paths.constraints);
  const handoffsDir = resolve(config.paths.handoffs);
  const runId = generateRunId(requirementId);
  const handoffDir = join(handoffsDir, runId);
  mkdirSync(handoffDir, { recursive: true });
  const targetRoot = resolve(config.targetProject.root ?? '.');
  const files = listTargetFiles(targetRoot);
  let ragGrounding: RagGroundingResponse | undefined;
  let ragError: string | undefined;

  if (shouldQueryGrounding(config, requirement.rawMarkdown)) {
    console.log('  ▸ Project RAG grounding...');
    try {
      ragGrounding = await queryConfiguredRag(
        config,
        buildGroundingQuestion(config, requirement),
        fetchImpl,
      );
      writeFileSync(
        join(handoffDir, 'rag-context.json'),
        JSON.stringify(ragGrounding, null, 2) + '\n',
        'utf8',
      );
      console.log(`    └ ${ragGrounding.sources.length} cited source(s)`);
    } catch (error) {
      ragError = error instanceof Error ? error.message : String(error);
      if (!config.rag.grounding.failOpen) throw error;
      console.log(`    ⚠ RAG unavailable; creating handoff without grounding: ${ragError}`);
    }
  }

  const ragSection = ragGrounding
    ? ['## RAG Grounding', '', formatGroundingReference(config, ragGrounding), '']
    : ragError
      ? [
          '## RAG Grounding',
          '',
          `RAG grounding was requested but unavailable: ${ragError}`,
          'Verify domain-specific claims against the authoritative documents before implementation.',
          '',
        ]
      : [];
  const content = [
    '# Manual Handoff',
    '',
    'Use this handoff in the manual implementation flow when you want an external implementer to complete the requirement without running the AI Factory agent pipeline.',
    '',
    '## Instruction for Implementer',
    '',
    'Read the requirement and constraints below, inspect the target project, implement the change directly in the workspace, and run the configured local checks. Do not call the AI Factory LLM pipeline for this task.',
    '',
    '## Target Project',
    '',
    '- Root: ' + targetRoot,
    '- Allowed paths: ' + ((config.targetProject.allowedPaths ?? []).join(', ') || '(not configured)'),
    '- Typecheck: ' + (config.targetProject.commands.typeCheck ?? '(not configured)'),
    '- Lint: ' + (config.targetProject.commands.lint ?? '(not configured)'),
    '- Test: ' + (config.targetProject.commands.test ?? '(not configured)'),
    '',
    '## Existing Files',
    '',
    ...files.map((file) => '- ' + file),
    '',
    '## Requirement',
    '',
    requirement.rawMarkdown,
    '',
    ...ragSection,
    '## Constraints',
    '',
    '```json',
    JSON.stringify(constraints, null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(join(handoffDir, 'handoff.md'), content, 'utf8');
  return runId;
}
