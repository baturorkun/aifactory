#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';
import { loadConfig } from './config';
import { runPipeline } from './orchestrator/pipeline';
import {
  beginHandoffRun,
  createHandoffPackage,
  finishHandoffRun,
} from './orchestrator/handoff';
import { createTargetProject, PROJECT_TEMPLATES } from './scaffold';
import { readManifest, updateManifest } from './orchestrator/manifest';
import {
  installRagPython,
  parseRagEnvService,
  RAG_ENV_SERVICES,
  runRagEnv,
  runRagPython,
} from './rag/python-runner';
import { queryConfiguredRag } from './rag/grounding-client';
import {
  installRagService,
  runRagService,
  showRagServiceLogs,
  uninstallRagService,
} from './rag/systemd';
import type { RunManifest } from '@aifactory/contracts';
import {
  changedRequirementIds,
  syncRequirementBranch,
} from './requirement-branches';
import {
  cancelRequirement,
  createDraftRequirement,
  requirementExecutionDecision,
  setRequirementFast,
  setRequirementMode,
  submitRequirement,
  syncRequirementPlatform,
} from './requirement-lifecycle';
import type { RequirementExecutionMode } from '@aifactory/contracts';
import { resolveTargetProjectPath } from './project-context';

const program = new Command();
const factoryInvocationDirectory = process.cwd();
const factoryRepositoryDirectory = resolve(__dirname, '../../..');
process.env.AIFACTORY_HOME ??= factoryRepositoryDirectory;

program
  .name('factory')
  .description('AI Factory — requirement-driven, multi-agent code generation')
  .option(
    '--project <path>',
    'Target project directory containing factory.config.json',
    process.env.AIFACTORY_PROJECT,
  )
  .version('0.1.0');

program.hook('preAction', (_command, actionCommand) => {
  if (actionCommand.name() === 'new') return;
  const project = actionCommand.optsWithGlobals<{ project?: string }>().project;
  if (!project) return;
  const target = resolveTargetProjectPath(
    factoryRepositoryDirectory,
    factoryInvocationDirectory,
    project,
  );
  if (!existsSync(target)) {
    throw new Error(`Target project directory not found: ${target}`);
  }
  process.chdir(target);
});

// ============================================================
// factory requirement ...
// ============================================================

const requirement = program
  .command('requirement')
  .description('Manage draft requirement branches and submission');

requirement
  .command('new <title>')
  .description('Reserve the next requirement ID on main and switch to its draft branch')
  .option('--mode <mode>', 'Execution mode: handoff or pipeline', 'handoff')
  .option('--platform <platform>', 'Repository platform: gitlab or none')
  .option('--fast', 'Use the fast AI pipeline when execution mode is pipeline', false)
  .action(async (title: string, opts: { mode: string; fast: boolean; platform?: string }) => {
    try {
      if (opts.mode !== 'handoff' && opts.mode !== 'pipeline') {
        throw new Error('Invalid mode. Choose handoff or pipeline.');
      }
      const result = await createDraftRequirement(
        title,
        opts.mode as RequirementExecutionMode,
        loadConfig(),
        { pipelineFast: opts.fast, platform: opts.platform },
      );
      console.log(chalk.green(`\n✓ Draft requirement created: ${chalk.bold(result.requirementId)}`));
      console.log(chalk.dim(`  File   : ${result.requirementFile}`));
      console.log(chalk.dim(`  Branch : ${result.branch}`));
      console.log(chalk.dim(`  Mode   : ${result.mode}`));
      console.log(chalk.dim(`  Fast   : ${result.pipelineFast ? 'enabled' : 'disabled'}`));
      if (result.repositoryProvider === 'gitlab' && result.workItem && result.changeRequest) {
        console.log(chalk.dim(`  Issue  : #${result.workItem.iid} ${result.workItem.url}`));
        console.log(chalk.dim(`  Draft MR: !${result.changeRequest.iid} ${result.changeRequest.url}`));
      }
      console.log(chalk.dim(`\n  Submit : pnpm factory -- requirement submit ${result.requirementId}\n`));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

requirement
  .command('platform-sync <reqId>')
  .alias('gitlab-sync')
  .description('Create or recover the linked Issue and Draft Pull/Merge Request on GitHub or GitLab')
  .option('--platform <platform>', 'Repository platform: github, gitlab, or auto-detect')
  .action(async (reqId: string, opts: { platform?: string }) => {
    try {
      const result = await syncRequirementPlatform(reqId, loadConfig(), {
        platform: opts.platform,
      });
      const platformName = result.provider === 'github' ? 'GitHub' : 'GitLab';
      const crName = result.provider === 'github' ? 'Draft PR' : 'Draft MR';
      const crSymbol = result.provider === 'github' ? '#' : '!';
      console.log(chalk.green(`✓ ${result.requirementId} synchronized with ${platformName}.`));
      console.log(chalk.dim(`  Issue   : #${result.workItem.iid} ${result.workItem.url}`));
      console.log(chalk.dim(`  ${crName.padEnd(8)}: ${crSymbol}${result.changeRequest.iid} ${result.changeRequest.url}`));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

requirement
  .command('cancel <reqId>')
  .description('Cancel a requirement on the base branch and remove its requirement branch')
  .option('--reason <reason>', 'Record why the requirement was cancelled')
  .option('--platform <platform>', 'Repository platform: gitlab or none')
  .action(async (reqId: string, opts: { reason?: string; platform?: string }) => {
    try {
      const result = await cancelRequirement(reqId, loadConfig(), opts);
      console.log(chalk.green(`✓ ${result.requirementId} cancelled on ${result.baseBranch}.`));
      console.log(chalk.dim(`  Record : ${result.requirementFile}`));
      console.log(chalk.dim(`  Push   : ${result.pushed ? 'cancel status pushed' : 'already cancelled'}`));
      console.log(chalk.dim(`  MR     : ${result.changeRequest ? `!${result.changeRequest.iid} ${result.changeRequest.state}` : 'not found or platform disabled'}`));
      console.log(chalk.dim(`  Remote : ${result.remoteBranchDeleted ? `${result.branch} deleted` : 'branch not present'}`));
      console.log(chalk.dim(`  Local  : ${result.localBranchDeleted ? `${result.branch} deleted` : 'branch not present'}`));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

requirement
  .command('fast <reqId> <state>')
  .description('Enable or disable the fast AI pipeline for a requirement')
  .action((reqId: string, state: string) => {
    try {
      const normalized = state.toLowerCase();
      if (!['on', 'off', 'true', 'false'].includes(normalized)) {
        throw new Error('Invalid fast state. Choose on or off.');
      }
      const enabled = normalized === 'on' || normalized === 'true';
      const updated = setRequirementFast(reqId, enabled, loadConfig());
      console.log(
        chalk.green(
          `✓ ${updated.id} fast pipeline ${updated.lifecycle?.pipelineFast ? 'enabled' : 'disabled'}.`,
        ),
      );
      console.log(chalk.dim('  The requirement file was updated locally; it was not committed or pushed.'));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

requirement
  .command('mode <reqId> <mode>')
  .description('Change a draft requirement execution mode without committing or pushing')
  .action((reqId: string, mode: string) => {
    try {
      if (mode !== 'handoff' && mode !== 'pipeline') {
        throw new Error('Invalid mode. Choose handoff or pipeline.');
      }
      const updated = setRequirementMode(
        reqId,
        mode as RequirementExecutionMode,
        loadConfig(),
      );
      console.log(chalk.green(`✓ ${updated.id} mode changed to ${mode}.`));
      console.log(chalk.dim('  The requirement file was updated locally; it was not committed or pushed.'));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

requirement
  .command('submit <reqId>')
  .description('Mark a requirement ready and start its configured handoff or pipeline flow')
  .action(async (reqId: string) => {
    try {
      const result = await submitRequirement(reqId, loadConfig(), {
        createHandoff: createHandoffPackage,
      });
      console.log(chalk.green(`\n✓ Requirement submitted: ${chalk.bold(result.requirementId)}`));
      console.log(chalk.dim(`  Mode   : ${result.mode}`));
      console.log(chalk.dim(`  Fast   : ${result.pipelineFast ? 'enabled' : 'disabled'}`));
      console.log(chalk.dim(`  Push   : ${result.pushed ? 'completed' : 'not performed'}`));
      if (result.runId) {
        console.log(chalk.dim(`  Handoff: ${result.runId}`));
        console.log(chalk.dim(`  Apply  : ask Codex to apply handoff ${result.runId}`));
      }
      console.log();
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

requirement
  .command('decision <reqId>')
  .description('Print the CI execution decision: run, draft, handoff, or legacy')
  .action((reqId: string) => {
    try {
      console.log(requirementExecutionDecision(reqId, loadConfig()));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// ============================================================
// factory changed-requirements / sync-requirement
// ============================================================

program
  .command('changed-requirements')
  .description('List requirement IDs changed between two Git refs')
  .requiredOption('--base <ref>', 'Base Git ref or commit')
  .option('--head <ref>', 'Head Git ref or commit', 'HEAD')
  .action((opts: { base: string; head: string }) => {
    try {
      const config = loadConfig();
      changedRequirementIds(
        resolve(config.targetProject.root ?? '.'),
        opts.base,
        opts.head,
      ).forEach((id) => console.log(id));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command('sync-requirement <reqId>')
  .description('Create or update a requirement branch, run AI Factory, commit, and optionally push')
  .option('--source-ref <ref>', 'Commit containing the requirement update; defaults to configured remote/base branch')
  .option('--push', 'Push the synchronized branch to the configured remote', false)
  .option('--fast', 'Override the requirement and use the fast AI pipeline')
  .action(async (reqId: string, opts: { sourceRef?: string; push: boolean; fast?: boolean }) => {
    try {
      const config = loadConfig();
      const decision = requirementExecutionDecision(reqId, config);
      if (decision === 'draft' || decision === 'handoff') {
        console.log(chalk.dim(`${reqId.toUpperCase()} skipped: ${decision}.`));
        return;
      }
      const result = await syncRequirementBranch(reqId, config, {
        sourceRef: opts.sourceRef,
        push: opts.push,
        fast: opts.fast,
      });
      if (!result.changed) {
        console.log(chalk.dim(`${result.requirementId} is unchanged on ${result.branch}.`));
        return;
      }
      console.log(chalk.green(`✓ ${result.requirementId} synchronized on ${result.branch}`));
      if (result.runId) console.log(chalk.dim(`  Run: ${result.runId}`));
      console.log(chalk.dim(`  Push: ${result.pushed ? 'completed' : 'not requested'}`));
      console.log(chalk.dim('  Merge request: manual'));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

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
  .description('Create a handoff package without running the agent LLM pipeline')
  .action(async (reqId: string) => {
    try {
      const config = loadConfig();
      const runId = await createHandoffPackage(reqId, config);
      const handoffPath = resolve(config.paths.handoffs, runId, 'handoff.md');
      console.log(chalk.green('\n✓ Handoff package created: ' + chalk.bold(runId)));
      console.log(chalk.dim('  File: ' + handoffPath + '\n'));
      printRunSummary(readManifest(resolve(config.paths.runs, runId)));
      console.log(chalk.dim(`\n  Begin  : pnpm factory -- handoff-begin ${runId}`));
      console.log(chalk.dim(`  Finish : pnpm factory -- handoff-finish ${runId}\n`));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// ============================================================
// factory handoff-begin <run-id>
// ============================================================

program
  .command('handoff-begin <runId>')
  .description('Mark a generated handoff run as actively being implemented')
  .action((runId: string) => {
    try {
      const config = loadConfig();
      const manifest = beginHandoffRun(runId, config);
      console.log(chalk.blue(`\n▶ Handoff implementation started: ${chalk.bold(runId)}\n`));
      printRunSummary(manifest);
      console.log();
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// ============================================================
// factory handoff-finish <run-id>
// ============================================================

program
  .command('handoff-finish <runId>')
  .description('Capture handoff changes, run quality gates, and finalize its run history')
  .option('--skip-gates', 'Capture changes without running quality gates', false)
  .action(async (runId: string, opts: { skipGates: boolean }) => {
    try {
      const config = loadConfig();
      const manifest = await finishHandoffRun(runId, config, {
        skipGates: opts.skipGates,
      });
      console.log();
      printRunSummary(manifest);
      if (manifest.status === 'passed') {
        console.log(chalk.green(`\n✓ Passed  — Handoff run: ${chalk.bold(runId)}\n`));
      } else {
        console.log(chalk.yellow(`\n⚠ Needs fix — Handoff run: ${chalk.bold(runId)}`));
        console.log(chalk.dim(`  Logs: pnpm factory -- logs ${runId}\n`));
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
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
      console.log(chalk.bold(`\nRun logs — ${chalk.cyan(runId)}\n`));

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

rag
  .command('install')
  .description('Install Python dependencies for the RAG service')
  .action(() => runRagCommand(() => installRagPython()));

const ragEnv = rag.command('env').description('Manage the local RAG container environment');

ragEnv
  .command('up')
  .description('Build and start PostgreSQL, the RAG API, and web chat using Podman/Docker Compose')
  .action(() => runRagCommand(() => runRagEnv('up')));

ragEnv
  .command('down')
  .description('Stop the RAG compose environment')
  .action(() => runRagCommand(() => runRagEnv('down')));

ragEnv
  .command('status')
  .description('Show RAG compose container status')
  .action(() => runRagCommand(() => runRagEnv('status')));

ragEnv
  .command('start <service>')
  .description(`Build and start one RAG service and its declared dependencies: ${RAG_ENV_SERVICES.join(', ')}`)
  .action((service: string) =>
    runRagCommand(() => runRagEnv('start', parseRagEnvService(service))),
  );

ragEnv
  .command('stop <service>')
  .description(`Stop one RAG service: ${RAG_ENV_SERVICES.join(', ')}`)
  .action((service: string) =>
    runRagCommand(() => runRagEnv('stop', parseRagEnvService(service))),
  );

const ragDb = rag.command('db').description('Manage the RAG database');

ragDb
  .command('migrate')
  .description('Create or update RAG database tables')
  .action(() => runRagCommand(() => runRagPython(['db', 'migrate'])));

rag
  .command('ingest')
  .description('Ingest a configured RAG source')
  .requiredOption('--source <id>', 'RAG source ID from factory.config.json')
  .option('--subdir <path>', 'Only ingest this directory below the configured source root')
  .option('--force', 'Force re-ingest even when fingerprints match', false)
  .action((opts: { source: string; subdir?: string; force: boolean }) =>
    runRagCommand(() =>
      runRagPython(['ingest', '--source', opts.source, ...(opts.subdir ? ['--subdir', opts.subdir] : []), ...(opts.force ? ['--force'] : [])]),
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

rag
  .command('chat <question>')
  .description('Ask the project-configured remote RAG grounding endpoint')
  .action(async (question: string) => {
    try {
      const response = await queryConfiguredRag(loadConfig(), question);
      console.log(JSON.stringify(response, null, 2));
    } catch (err) {
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

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

const ragApiService = ragApi
  .command('service')
  .description('Manage the RAG API as an Ubuntu/Linux systemd service');

ragApiService
  .command('install')
  .description('Install, enable, and start the RAG API systemd service')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--port <port>', 'Bind port', '8765')
  .option('--user <user>', 'Linux user that runs the service')
  .option('--no-start', 'Install and enable without starting immediately')
  .action((opts: { host: string; port: string; user?: string; start: boolean }) =>
    runRagCommand(() => installRagService(opts)),
  );

for (const action of ['start', 'stop', 'restart', 'status'] as const) {
  ragApiService
    .command(action)
    .description(`${action[0].toUpperCase()}${action.slice(1)} the RAG API systemd service`)
    .action(() => runRagCommand(() => runRagService(action)));
}

ragApiService
  .command('logs')
  .description('Show RAG API systemd logs')
  .option('--lines <count>', 'Number of recent log lines', '100')
  .option('--follow', 'Follow new log entries', false)
  .action((opts: { lines: string; follow: boolean }) =>
    runRagCommand(() => showRagServiceLogs(opts.lines, opts.follow)),
  );

ragApiService
  .command('uninstall')
  .description('Stop, disable, and remove the RAG API systemd service')
  .action(() => runRagCommand(() => uninstallRagService()));

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
      requirementBranches: {
        enabled: true,
        branchPrefix: 'factory/',
        baseBranch: 'main',
        remote: 'origin',
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
          maxRetries: 6,
          retryBaseSeconds: 2,
          retryMaxSeconds: 60,
          minRequestIntervalSeconds: 1,
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
        grounding: {
          enabled: false,
          mode: 'always',
          marker: '@rag',
          sourceIds: [],
          agents: ['planner', 'architect', 'coder', 'tester', 'reviewer', 'domain-guard'],
          timeoutMs: 120000,
          failOpen: true,
          maxContextChars: 12000,
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
  console.log(`  Mode        : ${manifest.executionMode}`);
  console.log(`  Pipeline    : ${manifest.fast ? 'fast' : 'full'}`);
  console.log(`  Status      : ${statusLabel(manifest.status)}`);
  console.log(`  Created     : ${manifest.createdAt}`);
  if (manifest.steps.length > 0) {
    console.log(`  Steps       : ${passedSteps}/${manifest.steps.length} passed`);
  }
  if (manifest.artifacts.length > 0) {
    console.log(`  Artifacts   : ${manifest.artifacts.length} file(s)`);
  }
  if (manifest.deletedFiles.length > 0) {
    console.log(`  Deleted     : ${manifest.deletedFiles.length} file(s)`);
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
    console.log(`  ${statusLabel(m.status).padEnd(20)} ${chalk.cyan(m.runId)}  ${chalk.dim(m.requirementId)}  ${chalk.dim(m.executionMode)}`);
  });
  console.log();
}

const argv =
  process.argv[2] === '--'
    ? [...process.argv.slice(0, 2), ...process.argv.slice(3)]
    : process.argv;

void program.parseAsync(argv).catch((err: unknown) => {
  console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
