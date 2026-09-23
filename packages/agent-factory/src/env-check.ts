// `factory env-check` reads a project's .env.example (the committed list of
// every variable the project understands) and its .env (what the person filled
// in), and reports which values are still empty, grouped the way .env.example
// groups them. The point is to front-load env setup: see what a fresh project
// needs before a command fails halfway on a missing variable.
//
// .env.example is the source of truth for the variable list and the grouping,
// so this never drifts from what the scaffold wrote. A variable is:
//   - set      : present in .env with a non-empty value
//   - default  : absent/empty in .env, but .env.example gives a non-empty
//                default, so the command still has a value to use
//   - empty    : absent/empty in both — this is what needs a value
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export type EnvVarStatus = 'set' | 'default' | 'empty';

export interface EnvVarReport {
  key: string;
  status: EnvVarStatus;
  /** The non-empty default from .env.example, when the status is 'default'. */
  defaultValue?: string;
}

export interface EnvSectionReport {
  /** The section's leading comment lines from .env.example, '#' stripped. */
  description: string[];
  vars: EnvVarReport[];
}

export interface EnvCheckReport {
  envFileExists: boolean;
  sections: EnvSectionReport[];
  /** Keys that are empty in both .env and .env.example — the actionable set. */
  empty: string[];
  counts: { set: number; default: number; empty: number };
}

interface ExampleVar {
  key: string;
  defaultValue: string;
}

interface ExampleSection {
  description: string[];
  vars: ExampleVar[];
}

/** Read the values a .env file actually sets (non-empty), keyed by name. */
export function parseEnvValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (value !== '') values.set(key, value);
  }
  return values;
}

/**
 * Split .env.example into sections on blank lines. Within a section, '#' lines
 * are its description and `KEY=default` lines are its variables. A commented
 * example line (`# FOO=...`) stays part of the description, never a variable.
 */
export function parseEnvExample(text: string): ExampleSection[] {
  const sections: ExampleSection[] = [];
  let current: ExampleSection = { description: [], vars: [] };
  const flush = (): void => {
    if (current.description.length > 0 || current.vars.length > 0) sections.push(current);
    current = { description: [], vars: [] };
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') {
      flush();
      continue;
    }
    if (trimmed.startsWith('#')) {
      current.description.push(trimmed.replace(/^#+\s?/, ''));
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const defaultValue = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    current.vars.push({ key, defaultValue });
  }
  flush();
  return sections;
}

// A placeholder in .env.example (`replace_me`, `<host>`, `changeme`) is not a
// usable default: it exists precisely to say "you must provide this", so a
// variable carrying only a placeholder is reported empty, not defaulted.
function isPlaceholder(value: string): boolean {
  return /^(replace_me|change_?me|your[_-]|xxx+|todo|<.*>)/i.test(value);
}

/** Analyse one project's env, given the two files' contents (.env may be null). */
export function analyzeEnv(exampleText: string, envText: string | null): EnvCheckReport {
  const values = parseEnvValues(envText ?? '');
  const sections: EnvSectionReport[] = [];
  const empty: string[] = [];
  const counts = { set: 0, default: 0, empty: 0 };

  for (const section of parseEnvExample(exampleText)) {
    if (section.vars.length === 0) continue; // a pure prose block, nothing to check
    const vars: EnvVarReport[] = section.vars.map(({ key, defaultValue }) => {
      if (values.has(key)) {
        counts.set += 1;
        return { key, status: 'set' as const };
      }
      if (defaultValue !== '' && !isPlaceholder(defaultValue)) {
        counts.default += 1;
        return { key, status: 'default' as const, defaultValue };
      }
      counts.empty += 1;
      empty.push(key);
      return { key, status: 'empty' as const };
    });
    sections.push({ description: section.description, vars });
  }

  return { envFileExists: envText !== null, sections, empty, counts };
}

/** Read a project's files and analyse them. */
export function checkProjectEnv(projectRoot: string): EnvCheckReport {
  const examplePath = resolve(projectRoot, '.env.example');
  if (!existsSync(examplePath)) {
    throw new Error(`No .env.example in ${projectRoot}; this does not look like a factory project.`);
  }
  const envPath = resolve(projectRoot, '.env');
  const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null;
  return analyzeEnv(readFileSync(examplePath, 'utf8'), envText);
}

/** Human-readable report for the CLI. */
export function formatEnvCheck(report: EnvCheckReport, projectRoot: string): string {
  const lines: string[] = [`Env check for ${projectRoot}`];
  if (!report.envFileExists) {
    lines.push('  .env not found — copy .env.example to .env, then fill the values below.');
  }
  const mark: Record<EnvVarStatus, string> = { set: '✓', default: '·', empty: '○' };
  for (const section of report.sections) {
    lines.push('');
    // The section comment says what the group is for and which values are
    // optional (e.g. "empty runs locally", "manual mode when ... unset"), so
    // print it: whether an empty variable actually needs a value is a judgement
    // the reader makes per operation, not one this report can make.
    if (section.description.length > 0) lines.push(`# ${section.description[0]}`);
    for (const v of section.vars) {
      const note = v.status === 'set' ? 'set' : v.status === 'default' ? `default ${v.defaultValue}` : 'empty';
      lines.push(`  ${mark[v.status]} ${v.key.padEnd(30)} ${note}`);
    }
  }
  lines.push('');
  lines.push(`Summary: ${report.counts.set} set, ${report.counts.default} using a default, ${report.counts.empty} empty.`);
  if (report.empty.length > 0) {
    lines.push(`Empty: ${report.empty.join(', ')}`);
  }
  return lines.join('\n');
}
