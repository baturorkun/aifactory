import { execSync } from 'child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'path';
import type { GateResults } from '@aifactory/contracts';

// ============================================================
// TYPES
// ============================================================

export type { GateResults } from '@aifactory/contracts';

export interface GateReport {
  gate: keyof GateResults;
  status: 'passed' | 'failed' | 'skipped';
  output: string;
  durationMs: number;
}

export interface TargetGateOptions {
  targetRoot?: string;
  artifactPaths?: string[];
  commands?: {
    typeCheck?: string;
    lint?: string;
    test?: string;
  };
}

// ============================================================
// HELPERS
// ============================================================

function findFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];

  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findFiles(full, suffix));
    } else if (item.isFile() && item.name.endsWith(suffix)) {
      results.push(full);
    }
  }
  return results;
}

function exec(
  cmd: string,
  cwd?: string,
): { output: string; success: boolean } {
  try {
    const out = execSync(cmd, {
      cwd: cwd ?? process.cwd(),
      timeout: 120_000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { output: (out ?? '').trim(), success: true };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const out = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n');
    return { output: out.trim(), success: false };
  }
}

function commandGate(
  gate: keyof GateResults,
  command: string | undefined,
  cwd: string,
): GateReport {
  const start = Date.now();
  const configKey = gate === 'tests' ? 'test' : gate;
  if (!command) {
    return {
      gate,
      status: 'skipped',
      output: `No targetProject.commands.${configKey} configured.`,
      durationMs: 0,
    };
  }

  const { output, success } = exec(command, cwd);
  return {
    gate,
    status: success ? 'passed' : 'failed',
    output: output || (success ? `${command} passed` : `${command} failed`),
    durationMs: Date.now() - start,
  };
}

// ============================================================
// GATE 1 — Schema Check
// Validates that all step output files are valid JSON.
// ============================================================

function schemaCheck(runDir: string): GateReport {
  const start = Date.now();
  const stepsDir = join(runDir, 'steps');

  if (!existsSync(stepsDir)) {
    return { gate: 'schemaCheck', status: 'passed', output: 'No steps yet.', durationMs: 0 };
  }

  const files = readdirSync(stepsDir).filter((f) => f.endsWith('.json'));
  const errors: string[] = [];

  for (const f of files) {
    try {
      JSON.parse(readFileSync(join(stepsDir, f), 'utf8'));
    } catch {
      errors.push(`Invalid JSON: ${f}`);
    }
  }

  return {
    gate: 'schemaCheck',
    status: errors.length === 0 ? 'passed' : 'failed',
    output: errors.length === 0 ? `${files.length} step file(s) valid` : errors.join('\n'),
    durationMs: Date.now() - start,
  };
}

// ============================================================
// GATE 2 — Type Check
// Runs tsc --noEmit on generated TypeScript artifacts.
// ============================================================

function typeCheck(runDir: string, projectRoot: string): GateReport {
  const start = Date.now();
  const artifactsDir = join(runDir, 'artifacts');
  const tsFiles = findFiles(artifactsDir, '.ts').filter((f) => !f.endsWith('.d.ts'));

  if (tsFiles.length === 0) {
    return { gate: 'typeCheck', status: 'skipped', output: 'No .ts artifacts.', durationMs: 0 };
  }

  // Write a temporary tsconfig pointing at artifacts
  const tmpConfig = {
    extends: resolve(projectRoot, 'tsconfig.base.json'),
    include: [artifactsDir + '/**/*'],
    compilerOptions: { noEmit: true, skipLibCheck: true },
  };
  const tmpPath = join(runDir, 'gates', 'tsconfig.artifacts.json');
  writeFileSync(tmpPath, JSON.stringify(tmpConfig, null, 2));

  const { output, success } = exec(`npx tsc --project "${tmpPath}"`, projectRoot);

  return {
    gate: 'typeCheck',
    status: success ? 'passed' : 'failed',
    output: output || (success ? 'No type errors' : 'Type errors found'),
    durationMs: Date.now() - start,
  };
}

function targetTypeCheck(targetRoot: string, command?: string): GateReport {
  return commandGate('typeCheck', command, targetRoot);
}

// ============================================================
// GATE 3 — Lint Check
// Runs eslint on generated TypeScript artifacts.
// ============================================================

function lintCheck(runDir: string, projectRoot: string): GateReport {
  const start = Date.now();
  const artifactsDir = join(runDir, 'artifacts');
  const tsFiles = findFiles(artifactsDir, '.ts');

  if (tsFiles.length === 0) {
    return { gate: 'lint', status: 'skipped', output: 'No .ts artifacts.', durationMs: 0 };
  }

  const { output, success } = exec(
    `npx eslint --ext .ts "${artifactsDir}" --no-error-on-unmatched-pattern`,
    projectRoot,
  );

  return {
    gate: 'lint',
    status: success ? 'passed' : 'failed',
    output: output || (success ? 'No lint errors' : 'Lint errors found'),
    durationMs: Date.now() - start,
  };
}

function targetLintCheck(targetRoot: string, command?: string): GateReport {
  return commandGate('lint', command, targetRoot);
}

// ============================================================
// GATE 4 — Test Check
// Runs generated test files via Jest.
// ============================================================

function testCheck(runDir: string, projectRoot: string): GateReport {
  const start = Date.now();
  const artifactsDir = join(runDir, 'artifacts');

  const testFiles = [
    ...findFiles(artifactsDir, '.test.ts'),
    ...findFiles(artifactsDir, '.spec.ts'),
  ];

  if (testFiles.length === 0) {
    return { gate: 'tests', status: 'skipped', output: 'No test files.', durationMs: 0 };
  }

  const { output, success } = exec(
    `npx jest --testPathPattern="${artifactsDir.replace(/\\/g, '/')}" --passWithNoTests --no-coverage`,
    projectRoot,
  );

  return {
    gate: 'tests',
    status: success ? 'passed' : 'failed',
    output: output || (success ? 'All tests passed' : 'Tests failed'),
    durationMs: Date.now() - start,
  };
}

function targetTestCheck(targetRoot: string, command?: string): GateReport {
  return commandGate('tests', command, targetRoot);
}

// ============================================================
// GATE 5 — Security Check
// Static pattern scan for common security anti-patterns.
// ============================================================

const SECURITY_PATTERNS: Array<{ re: RegExp; message: string }> = [
  { re: /\beval\s*\(/, message: 'eval() usage detected' },
  { re: /new\s+Function\s*\(/, message: 'new Function() detected' },
  { re: /require\(['"]child_process['"]\)/, message: 'child_process import — verify intent' },
  { re: /query\s*\(\s*`[^`]*\$\{/, message: 'potential SQL injection (template literal in query)' },
  { re: /process\.env\.[A-Z_]+=/, message: 'env variable assignment detected' },
];

function securityCheck(runDir: string): GateReport {
  const start = Date.now();
  const artifactsDir = join(runDir, 'artifacts');
  const files = [...findFiles(artifactsDir, '.ts'), ...findFiles(artifactsDir, '.js')];

  if (files.length === 0) {
    return { gate: 'security', status: 'skipped', output: 'No files to scan.', durationMs: 0 };
  }

  const issues: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const rel = file.replace(runDir + '/', '');
    for (const { re, message } of SECURITY_PATTERNS) {
      if (re.test(content)) {
        issues.push(`${rel}: ${message}`);
      }
    }
  }

  // Persist report
  writeFileSync(
    join(runDir, 'gates', 'security-report.json'),
    JSON.stringify({ scannedFiles: files.length, issues }, null, 2),
  );

  return {
    gate: 'security',
    status: issues.length === 0 ? 'passed' : 'failed',
    output:
      issues.length === 0
        ? `${files.length} file(s) scanned — no issues`
        : issues.join('\n'),
    durationMs: Date.now() - start,
  };
}

function targetSecurityCheck(targetRoot: string, artifactPaths: string[] = []): GateReport {
  const start = Date.now();
  const files = artifactPaths
    .filter((p) => p.endsWith('.ts') || p.endsWith('.js'))
    .map((p) => safeTargetPath(targetRoot, p));

  if (files.length === 0) {
    return { gate: 'security', status: 'skipped', output: 'No files to scan.', durationMs: 0 };
  }

  const issues: string[] = [];

  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    const rel = normalizeRelativePath(relative(targetRoot, file));
    for (const { re, message } of SECURITY_PATTERNS) {
      if (re.test(content)) {
        issues.push(`${rel}: ${message}`);
      }
    }
  }

  return {
    gate: 'security',
    status: issues.length === 0 ? 'passed' : 'failed',
    output:
      issues.length === 0
        ? `${files.length} applied file(s) scanned — no issues`
        : issues.join('\n'),
    durationMs: Date.now() - start,
  };
}

function safeTargetPath(targetRoot: string, artifactPath: string): string {
  if (isAbsolute(artifactPath)) {
    throw new Error(`Artifact path must be relative: ${artifactPath}`);
  }

  const normalized = normalizeRelativePath(artifactPath);
  if (normalized === '.' || normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error(`Artifact path escapes target project: ${artifactPath}`);
  }

  const absolutePath = resolve(targetRoot, normalized);
  const relFromRoot = relative(targetRoot, absolutePath);
  if (relFromRoot.startsWith('..') || isAbsolute(relFromRoot)) {
    throw new Error(`Artifact path escapes target project: ${artifactPath}`);
  }

  return absolutePath;
}

function normalizeRelativePath(path: string): string {
  return normalize(path).split(sep).join('/');
}

// ============================================================
// MAIN RUNNER
// ============================================================

/**
 * Runs all quality gates against a finished run directory.
 * @param runDir  Absolute path to the run directory (runs/<run-id>)
 * @param projectRoot  Root of the monorepo (for finding tsconfig/eslint config)
 */
export async function runAllGates(
  runDir: string,
  projectRoot: string,
  target?: TargetGateOptions,
): Promise<GateResults> {
  mkdirSync(join(runDir, 'gates'), { recursive: true });

  const targetRoot = target?.targetRoot ? resolve(target.targetRoot) : undefined;
  const reports: GateReport[] = [
    schemaCheck(runDir),
    targetRoot
      ? targetTypeCheck(targetRoot, target?.commands?.typeCheck)
      : typeCheck(runDir, projectRoot),
    targetRoot
      ? targetLintCheck(targetRoot, target?.commands?.lint)
      : lintCheck(runDir, projectRoot),
    targetRoot
      ? targetTestCheck(targetRoot, target?.commands?.test)
      : testCheck(runDir, projectRoot),
    targetRoot
      ? targetSecurityCheck(targetRoot, target?.artifactPaths)
      : securityCheck(runDir),
  ];

  // Persist full report
  writeFileSync(
    join(runDir, 'gates', 'report.json'),
    JSON.stringify(reports, null, 2),
  );

  // Print summary
  for (const r of reports) {
    const icon = r.status === 'passed' ? '✓' : r.status === 'skipped' ? '○' : '✗';
    console.log(`    ${icon} ${r.gate.padEnd(14)} ${r.durationMs}ms`);
    if (r.status === 'failed') {
      r.output
        .split('\n')
        .slice(0, 6)
        .forEach((line) => {
          if (line.trim()) console.log(`      ${line}`);
        });
    }
  }

  return reports.reduce(
    (acc, r) => {
      acc[r.gate] = r.status;
      return acc;
    },
    {} as GateResults,
  );
}
