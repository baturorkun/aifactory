import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import type { FactoryConfig } from '../config';
import { parseRequirement } from '../requirements/parser';

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

export function createHandoffPackage(requirementId: string, config: FactoryConfig): string {
  const requirement = parseRequirement(requirementId, config.paths.requirements);
  const constraints = loadConstraints(requirementId, config.paths.constraints);
  const handoffsDir = resolve(config.paths.handoffs);
  const runId = generateRunId(requirementId);
  const handoffDir = join(handoffsDir, runId);
  mkdirSync(handoffDir, { recursive: true });
  const targetRoot = resolve(config.targetProject.root ?? '.');
  const files = listTargetFiles(targetRoot);
  const content = [
    '# Manual Handoff',
    '',
    'Use this handoff in the manual implementation flow when you want an external implementer to complete the requirement without spending LLM API calls.',
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
