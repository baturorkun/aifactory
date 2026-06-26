#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';
import { loadConfig } from './config';
import { runPipeline } from './orchestrator/pipeline';
import { createHandoffPackage } from './orchestrator/handoff';
import { createTargetProject, PROJECT_TEMPLATES } from './scaffold';
import { readManifest, updateManifest } from './orchestrator/manifest';
import { runRagEnv, runRagPython } from './rag/python-runner';
import type { RunManifest } from '@aifactory/contracts';

const program = new Command();

program
  .name('factory')
  .description('AI Factory — requirement-driven, multi-agent code generation')
  .version('0.1.0');

// ============================================================
// factory run <req-id>
// ============================================================

program
  .command('run <reqId>')
  .description('Start a new pipeline run for a requirement')
  .option('--dry-run', 'Use mock model (no real LLM calls)', false)
  .option('--skip-gates', 'Skip quality gates after agent pipeline', false)
  .option('--fast', 'Cost-controlled mode: skip tester/reviewer/domain-guard agents', false)
  .option('--tasks <ids>', 'Comma-separated task IDs to run (subset)')
  .action(
    async (reqId: string, opts: { dryRun: boolean; skipGates: boolean; fast: boolean; tasks?: string }) => {
      console.log(chalk.bold.cyan('\n⚙  AI Factory\n'));

      try {
        const config = loadConfig();

        if (opts.dryRun) {
          console.log(chalk.yellow('  [dry-run] Mock adapter — no real LLM calls.\n'));
        }

        const taskIds = opts.tasks ? opts.tasks.split(',').map((t) => t.trim()) : undefined;

        const runId = await runPipeline(reqId, config, {
          dryRun: opts.dryRun,
          skipGates: opts.skipGates,
          fast: opts.fast,
          taskIds,
        });

        const runDir = resolve(config.paths.runs, runId);
        const manifest = readManifest(runDir);

        console.log();
        printRunSummary(manifest);

        if (manifest.status === 'passed') {
          console.log(chalk.green(`\n✓ Passed  — Run: ${chalk.bold(runId)}`));
          console.log(chalk.dim(`  Approve : pnpm factory -- approve ${runId}\n`));
        } else if (manifest.status === 'needs-fix') {
          console.log(chalk.yellow(`\n⚠ Needs fix — Run: ${chalk.bold(runId)}`));
          console.log(chalk.dim(`  Logs    : pnpm factory -- logs ${runId}\n`));
          process.exit(1);
        } else {
          console.log(chalk.red(`\n✗ Failed — Run: ${chalk.bold(runId)}\n`));
          process.exit(2);
        }
      } catch (err) {
        console.error(chalk.red('\n✗'), err instanceof Error ? err.message : String(err));
        process.exit(2);
      }
    },
  );

// ============================================================
// factory handoff <req-id>
// ============================================================

program
  .command('handoff <reqId>')
  .description('Create a handoff package without calling an LLM provider')
  .action((reqId: string) => {
    try {
      const config = loadConfig();
      const runId = createHandoffPackage(reqId, config);
      const handoffPath = resolve(config.paths.handoffs, runId, 'handoff.md');
      console.log(chalk.green('\n✓ Handoff package created: ' + chalk.bold(runId)));
      console.log(chalk.dim('  File: ' + handoffPath + '\n'));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ============================================================
// factory status [run-id]
// ============================================================

program
  .command('status [runId]')
  .description('Show status of a run, or list recent runs')
  .action((runId?: string) => {
    try {
      const config = loadConfig();
      const runsDir = resolve(config.paths.runs);

      if (runId) {
        const runDir = join(runsDir, runId);
        if (!existsSync(runDir)) {
          console.error(chalk.red(`Run not found: ${runId}`));
          process.exit(1);
        }
        printRunSummary(readManifest(runDir));
      } else {
        listRuns(runsDir);
      }
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ============================================================
// factory artifacts <run-id>
// ============================================================

program
  .command('artifacts <runId>')
  .description('List artifacts produced by a run')
  .action((runId: string) => {
    try {
      const config = loadConfig();
      const runDir = resolve(config.paths.runs, runId);

      if (!existsSync(runDir)) {
        console.error(chalk.red(`Run not found: ${runId}`));
        process.exit(1);
      }

      const manifest = readManifest(runDir);
      console.log(chalk.bold(`\nArtifacts — ${chalk.cyan(runId)}\n`));

      if (manifest.artifacts.length === 0) {
        console.log(chalk.dim('  No artifacts yet.'));
      } else {
        manifest.artifacts.forEach((a) => console.log(`  ${chalk.green('•')} ${a}`));
      }
      console.log();
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ============================================================
// factory approve <run-id>
// ============================================================

program
  .command('approve <runId>')
  .description('Approve a passed run')
  .option('--by <name>', 'Approver name', 'human')
  .action((runId: string, opts: { by: string }) => {
    try {
      const config = loadConfig();
      const runDir = resolve(config.paths.runs, runId);

      if (!existsSync(runDir)) {
        console.error(chalk.red(`Run not found: ${runId}`));
        process.exit(1);
      }

      const manifest = readManifest(runDir);

      if (manifest.status !== 'passed') {
        console.error(
          chalk.yellow(
            `Run status is "${manifest.status}" — only "passed" runs can be approved.`,
          ),
        );
        process.exit(1);
      }

      updateManifest(runDir, (m: RunManifest) => ({
        ...m,
        status: 'approved' as const,
        approvedAt: new Date().toISOString(),
        approvedBy: opts.by,
      }));

      console.log(chalk.green(`\n✓ Approved: ${chalk.bold(runId)} by ${chalk.bold(opts.by)}\n`));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ============================================================
// factory logs <run-id>
// ============================================================

program
  .command('logs <runId>')
  .description('Show agent step logs for a run')
  .action((runId: string) => {
    try {
      const config = loadConfig();
      const runDir = resolve(config.paths.runs, runId);

      if (!existsSync(runDir)) {
        console.error(chalk.red(`Run not found: ${runId}`));
        process.exit(1);
      }

      const manifest = readManifest(runDir);
      console.log(chalk.bold(`\nAgent logs — ${chalk.cyan(runId)}\n`));

      manifest.steps.forEach((step) => {
        const icon =
          step.status === 'passed' ? chalk.green('✓')
          : step.status === 'failed' ? chalk.red('✗')
          : step.status === 'needs-fix' ? chalk.yellow('⚠')
          : chalk.dim('○');

        const task = step.taskId ? chalk.dim(` [${step.taskId}]`) : '';
        const model = step.model ? chalk.dim(` via ${step.model}`) : '';
        const tok = step.usage
          ? chalk.dim(` (${step.usage.promptTokens}↑ ${step.usage.completionTokens}↓ tok)`)
          : '';
        const retries = step.retries > 0 ? chalk.yellow(` retry×${step.retries}`) : '';

        console.log(`  ${icon} ${chalk.bold(step.agent)}${task}${model}${tok}${retries}`);

        if (step.error) {
          console.log(chalk.red(`     ↳ ${step.error}`));
        }
      });

      console.log();
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ============================================================
// factory new <project-name>
// ============================================================

program
  .command('new <projectName>')
  .description('Create a new target project scaffold as a sibling directory')
  .option('--template <name>', 'Project template: ' + PROJECT_TEMPLATES.join(', '))
  .option('--dir <path>', 'Parent directory for the new project', '..')
  .option('--force', 'Allow writing into an existing directory', false)
  .action((projectName: string, opts: { template?: string; dir: string; force: boolean }) => {
    try {
      const result = createTargetProject(projectName, {
        template: opts.template,
        dir: opts.dir,
        force: opts.force,
      });
      console.log(chalk.green("\n✓ Created target project: " + chalk.bold(result.projectName)));
      console.log(chalk.dim("  Root    : " + result.projectRoot));
      console.log(chalk.dim("  Template: " + result.template));
      console.log(chalk.dim("  Factory : pnpm factory <command>"));
      console.log(chalk.dim("\nNext:"));
      console.log(chalk.dim("  cd " + result.projectRoot));
      console.log(chalk.dim("  pnpm factory handoff <requirement-id>\n"));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ============================================================
// factory rag ...
// ============================================================

const rag = program
  .command('rag')
  .description('Run AI Factory RAG environment, ingest, and API commands');

const ragEnv = rag.command('env').description('Manage the local RAG container environment');

ragEnv
  .command('up')
  .description('Create and start PostgreSQL + pgvector using Podman/Docker Compose')
  .action(() => runRagCommand(() => runRagEnv('up')));

ragEnv
  .command('down')
  .description('Stop the RAG compose environment')
  .action(() => runRagCommand(() => runRagEnv('down')));

ragEnv
  .command('status')
  .description('Show RAG compose container status')
  .action(() => runRagCommand(() => runRagEnv('status')));

const ragDb = rag.command('db').description('Manage the RAG database');

ragDb
  .command('migrate')
  .description('Create or update RAG database tables')
  .action(() => runRagCommand(() => runRagPython(['db', 'migrate'])));

rag
  .command('ingest')
  .description('Ingest a configured RAG source')
  .requiredOption('--source <id>', 'RAG source ID from factory.config.json')
  .option('--force', 'Force re-ingest even when fingerprints match', false)
  .action((opts: { source: string; force: boolean }) =>
    runRagCommand(() =>
      runRagPython(['ingest', '--source', opts.source, ...(opts.force ? ['--force'] : [])]),
    ),
  );

rag
  .command('status')
  .description('Show RAG document, chunk, and ingest status')
  .action(() => runRagCommand(() => runRagPython(['status'])));

rag
  .command('query <question>')
  .description('Ask the RAG index a question from the CLI')
  .action((question: string) => runRagCommand(() => runRagPython(['query', question])));

const ragApi = rag.command('api').description('Run the RAG FastAPI service');

ragApi
  .command('start')
  .description('Start the Python FastAPI RAG service')
  .option('--host <host>', 'Bind host')
  .option('--port <port>', 'Bind port')
  .action((opts: { host?: string; port?: string }) =>
    runRagCommand(() =>
      runRagPython([
        'api',
        'start',
        ...(opts.host ? ['--host', opts.host] : []),
        ...(opts.port ? ['--port', opts.port] : []),
      ]),
    ),
  );

// ============================================================
// factory init
// ============================================================

program
  .command('init')
  .description('Create a default factory.config.json in the current directory')
  .action(() => {
    const configPath = resolve(process.cwd(), 'factory.config.json');

    if (existsSync(configPath)) {
      console.log(chalk.yellow('factory.config.json already exists — not overwriting.'));
      return;
    }

    const defaultConfig = {
      model: {
        provider: 'mock',
        name: 'codellama',
        reviewerName: 'llama3',
        baseUrl: 'http://localhost:11434',
        timeoutMs: 180000,
        temperature: 0.2,
      },
      pipeline: { maxRetries: 3, timeboxMs: 180000, maxFixIterations: 3 },
      paths: {
        requirements: './requirements',
        constraints: './constraints',
        runs: './runs',
        handoffs: './handoffs',
        templates: './templates',
        prompts: './packages/agent-factory/prompts',
      },
      targetProject: {
        root: undefined,
        applyArtifacts: false,
        allowedPaths: [
          'src',
          'app',
          'components',
          'lib',
          'tests',
          'tsconfig.json',
          'tsconfig.build.json',
          'package.json',
          'vite.config.ts',
        ],
        commands: {
          typeCheck: 'pnpm typecheck',
          lint: 'pnpm lint',
          test: 'pnpm test',
        },
      },
      domain: { rules: [] },
      rag: {
        database: {
          connectionString:
            '${RAG_DATABASE_URL:-postgresql://aifactory_rag:aifactory_rag@localhost:5432/aifactory_rag}',
        },
        sources: [
          {
            id: 'fileserver',
            type: 'filesystem',
            rootPath: '${RAG_FILESERVER_PATH:-./references}',
            include: ['**/*.txt', '**/*.md', '**/*.json', '**/*.csv', '**/*.html', '**/*.htm', '**/*.pdf', '**/*.docx', '**/*.pptx'],
            exclude: ['**/~$*', '**/.DS_Store'],
          },
        ],
        ingest: {
          chunkSize: 1200,
          chunkOverlap: 150,
          batchSize: 50,
        },
        embedding: {
          provider: '${RAG_EMBEDDING_PROVIDER:-gemini}',
          model: '${RAG_EMBEDDING_MODEL:-gemini-embedding-001}',
          dimensions: 1536,
          apiKey: '${RAG_API_KEY:-}',
        },
        llm: {
          provider: '${RAG_LLM_PROVIDER:-gemini}',
          model: '${RAG_LLM_MODEL:-gemini-2.5-flash}',
          apiKey: '${RAG_API_KEY:-}',
          temperature: 0.1,
        },
        retrieval: {
          topK: 6,
        },
        auth: {
          provider: 'none',
          enabled: false,
          tenantId: '${ENTRA_TENANT_ID:-}',
          audience: '${ENTRA_AUDIENCE:-}',
        },
        api: {
          host: '127.0.0.1',
          port: 8765,
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');
    console.log(chalk.green('✓ Created factory.config.json'));
    console.log(
      chalk.dim(
        "\nChange model.provider to 'ollama' or 'openai-compat' when your local model is ready.\n",
      ),
    );
  });

// ============================================================
// HELPERS
// ============================================================

function statusLabel(status: string): string {
  switch (status) {
    case 'passed':
    case 'approved':
      return chalk.green(status);
    case 'running':
      return chalk.blue(status);
    case 'needs-fix':
      return chalk.yellow(status);
    case 'failed':
      return chalk.red(status);
    default:
      return chalk.dim(status);
  }
}

function runRagCommand(action: () => void): void {
  try {
    action();
  } catch (err) {
    console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function printRunSummary(manifest: RunManifest): void {
  const passedSteps = manifest.steps.filter((s) => s.status === 'passed').length;

  console.log(chalk.bold(`Run: ${chalk.cyan(manifest.runId)}`));
  console.log(`  Requirement : ${manifest.requirementId}`);
  console.log(`  Status      : ${statusLabel(manifest.status)}`);
  console.log(`  Created     : ${manifest.createdAt}`);
  if (manifest.steps.length > 0) {
    console.log(`  Steps       : ${passedSteps}/${manifest.steps.length} passed`);
  }
  if (manifest.artifacts.length > 0) {
    console.log(`  Artifacts   : ${manifest.artifacts.length} file(s)`);
  }

  const gates = Object.entries(manifest.gateResults)
    .map(([k, v]) => {
      const icon =
        v === 'passed' ? chalk.green('✓')
        : v === 'failed' ? chalk.red('✗')
        : chalk.dim('○');
      return `${k}:${icon}`;
    })
    .join('  ');
  console.log(`  Gates       : ${gates}`);
}

function listRuns(runsDir: string): void {
  if (!existsSync(runsDir)) {
    console.log(chalk.dim('\nNo runs yet. Start with: pnpm factory -- run <req-id>\n'));
    return;
  }

  const dirs = readdirSync(runsDir).filter((d) =>
    existsSync(join(runsDir, d, 'manifest.json')),
  );

  if (dirs.length === 0) {
    console.log(chalk.dim('\nNo runs yet. Start with: pnpm factory -- run <req-id>\n'));
    return;
  }

  const manifests = dirs
    .map((d) => {
      try {
        return readManifest(join(runsDir, d));
      } catch {
        return null;
      }
    })
    .filter((m): m is RunManifest => m !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  console.log(chalk.bold('\nRecent runs:\n'));
  manifests.forEach((m) => {
    console.log(`  ${statusLabel(m.status).padEnd(20)} ${chalk.cyan(m.runId)}  ${chalk.dim(m.requirementId)}`);
  });
  console.log();
}

const argv =
  process.argv[2] === '--'
    ? [...process.argv.slice(0, 2), ...process.argv.slice(3)]
    : process.argv;

program.parse(argv);
