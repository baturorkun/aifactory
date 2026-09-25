import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTargetProject } from './scaffold';

test('project creation adds the Superpowers policy conditionally and preserves existing guidelines', () => {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-superpowers-'));
  try {
    const without = createTargetProject('without-superpowers', {
      dir: parent,
      template: 'empty',
      codexHome: join(parent, 'empty-codex-home'),
    });
    assert.doesNotMatch(
      readFileSync(join(without.projectRoot, 'AGENTS.md'), 'utf8'),
      /superpowers-token-policy:start/,
    );

    const existingRoot = join(parent, 'with-superpowers');
    mkdirSync(existingRoot);
    writeFileSync(join(existingRoot, 'AGENTS.md'), '# Existing project rules\n', 'utf8');
    const options = {
      dir: parent,
      template: 'empty' as const,
      force: true,
      availableSkills: ['superpowers:brainstorming'],
    };
    const withSuperpowers = createTargetProject('with-superpowers', options);
    createTargetProject('with-superpowers', options);
    const guidelines = readFileSync(join(withSuperpowers.projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(guidelines, /^# Existing project rules/);
    assert.match(guidelines, /## Superpowers düşük-token çalışma politikası/);
    assert.equal(guidelines.match(/<!-- superpowers-token-policy:start -->/g)?.length, 1);
    assert.equal(guidelines.match(/<!-- superpowers-token-policy:end -->/g)?.length, 1);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('new projects enable the draft requirement branch workflow', () => {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-scaffold-'));
  try {
    const result = createTargetProject('lifecycle-project', {
      dir: parent,
      template: 'vanilla-ts',
    });
    const config = JSON.parse(
      readFileSync(join(result.projectRoot, 'factory.config.json'), 'utf8'),
    ) as {
      model: {
        provider: string;
        name: string;
        reviewerName: string;
        baseUrl: string;
        apiKey: string;
        executable: string;
        reasoningEffort: string;
        maxTokens: number;
      };
      requirementBranches: {
        enabled: boolean;
        branchPrefix: string;
        baseBranch: string;
      };
      repositoryPlatforms: {
        gitlab: {
          baseUrl: string;
          projectId: string;
          token: string;
          targetBranch: string;
          removeSourceBranchOnMerge: boolean;
        };
        github: {
          baseUrl: string;
          repository: string;
          token: string;
          targetBranch: string;
          removeSourceBranchOnMerge: boolean;
        };
      };
      projectGuidelines: {
        files: string[];
        required: boolean;
        maxContextChars: number;
      };
      rag: {
        grounding: {
          enabled: boolean;
          chatUrl: string;
          sourceIds: string;
        };
      };
    };
    assert.deepEqual(config.model, {
      provider: '${AI_PROVIDER}',
      name: '${AI_MODEL}',
      reviewerName: '${AI_REVIEWER_MODEL}',
      baseUrl: '${AI_BASE_URL:-}',
      apiKey: '${AI_API_KEY:-}',
      executable: '${AI_CLI_EXECUTABLE:-codex}',
      reasoningEffort: '${AI_CODEX_REASONING_EFFORT:-medium}',
      effort: '${AI_CLAUDE_EFFORT:-high}',
      maxTokens: 32768,
    });
    const ci = readFileSync(join(result.projectRoot, '.gitlab-ci.yml'), 'utf8');
    const githubActions = readFileSync(
      join(result.projectRoot, '.github/workflows/ai-factory.yml'),
      'utf8',
    );
    const packageJson = JSON.parse(
      readFileSync(join(result.projectRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    assert.equal(packageJson.scripts?.factory, undefined);
    assert.deepEqual(config.requirementBranches, {
      enabled: true,
      branchPrefix: 'factory/',
      baseBranch: 'main',
      remote: 'origin',
    });
    assert.deepEqual(config.projectGuidelines, {
      files: ['./AGENTS.md'],
      required: true,
      maxContextChars: 20000,
    });
    assert.equal(config.rag.grounding.enabled, false);
    assert.equal(
      config.rag.grounding.chatUrl,
      '${RAG_CHAT_URL:-http://127.0.0.1:8765/query}',
    );
    assert.equal(config.rag.grounding.sourceIds, '${RAG_SOURCE_IDS:-fileserver}');
    assert.equal(config.repositoryPlatforms.gitlab.removeSourceBranchOnMerge, true);
    assert.equal(config.repositoryPlatforms.github.removeSourceBranchOnMerge, true);
    const agentGuidelines = readFileSync(join(result.projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentGuidelines, /## AI Factory Workflow/);
    // Work began in a sibling checkout of a similarly named project, and
    // continued after `requirement new` failed, because nothing barred either.
    assert.match(agentGuidelines, /## Requirement-First Execution/);
    assert.match(agentGuidelines, /Workspace changes require an active requirement/);
    assert.match(agentGuidelines, /A failed lifecycle command is a blocker/);
    // Calling documentation authoritative without saying it is reachable left
    // the configured corpus unused while its absence was read as a gap.
    assert.match(agentGuidelines, /## Configured Documentation/);
    assert.match(agentGuidelines, /RAG_CHAT_URL/);
    // Documents are looked up before anyone is asked for them.
    assert.match(agentGuidelines, /Query the RAG first/);
    assert.match(agentGuidelines, /before asking the user or the team/);
    assert.match(agentGuidelines, /RAG_SOURCE_IDS/);
    assert.match(agentGuidelines, /not its summary/);
    // A lifecycle commit edits the requirement file it is recording, which
    // matches the trigger below it and restarts finished work.
    assert.match(
      ci,
      /\$CI_PIPELINE_SOURCE == "push" && \$CI_COMMIT_MESSAGE =~ .*\(approve\|complete\)/,
    );
    assert.match(githubActions, /!startsWith\(github\.event\.head_commit\.message, 'requirement\('\)/);
    // `runner` does not resolve in job-level env; GitHub then refuses to parse
    // the whole workflow and every run fails in 0s before any step starts.
    assert.match(githubActions, /^ {10}CODEX_HOME: \$\{\{ runner\.temp \}\}\/aifactory-codex$/m);
    const jobEnvBlock = githubActions.slice(
      githubActions.indexOf('\n    env:\n'),
      githubActions.indexOf('\n    steps:\n'),
    );
    assert.ok(!jobEnvBlock.includes('runner.'), 'job-level env must not use the runner context');
    assert.match(githubActions, /git config --global --add safe\.directory "\$GITHUB_WORKSPACE"/);
    assert.match(agentGuidelines, /git rev-parse --show-toplevel/);
    assert.match(agentGuidelines, /git branch --show-current/);
    assert.ok(
      agentGuidelines.includes(
        'do **not** use `pnpm --dir ../aifactory factory -- --project <project> ...` locally',
      ),
    );
    assert.ok(
      agentGuidelines.includes(
        '`../aifactory/node_modules/.bin/tsx --tsconfig ../aifactory/tsconfig.json ../aifactory/packages/agent-factory/src/cli.ts --project . <command>`',
      ),
    );
    assert.match(agentGuidelines, /requirement new <title>/);
    assert.match(agentGuidelines, /requirement submit <requirement-id>/);
    assert.match(agentGuidelines, /requirement mode <requirement-id> <pipeline\|handoff\|direct>/);
    assert.match(agentGuidelines, /requirement platform-sync <requirement-id>/);
    assert.match(agentGuidelines, /requirement cancel <requirement-id>/);
    assert.match(agentGuidelines, /## Draft Requirement Push Policy/);
    assert.match(agentGuidelines, /edit the requirement draft only in the local requirement branch/);
    assert.match(agentGuidelines, /They do not authorize a Git commit, push, platform sync/);
    assert.match(agentGuidelines, /Before any requirement-related push/);
    assert.match(ci, /ai_factory_requirement_branch:/);
    assert.match(ci, /factory-checkpoint\\\//);
    assert.match(ci, /when: never/);
    assert.match(ci, /git -C \.\.\/aifactory fetch origin main/);
    assert.match(ci, /git -C \.\.\/aifactory switch --detach FETCH_HEAD/);
    assert.match(ci, /- factory\.config\.json/);
    assert.match(ci, /requirement decision/);
    assert.match(ci, /sync-requirement/);
    assert.match(ci, /AIFACTORY_FRESH/);
    assert.match(ci, /fresh_args\+=\(--fresh\)/);
    assert.match(ci, /--project "\$CI_PROJECT_DIR"/);
    assert.match(ci, /cd \.\.\/aifactory/);
    assert.match(ci, /RQ-\[0-9\]\+/);
    assert.match(ci, /build_static:/);
    assert.match(ci, /package_offline:/);
    assert.match(ci, /docker_image:/);
    assert.match(ci, /stages:\n {2}- ai_factory\n {2}- build\n {2}- package\n {2}- image\n {2}- deploy/);
    assert.match(ci, /AIFACTORY_RUNNER_IMAGE: "node:20-bullseye"/);
    assert.match(ci, /CODEX_HOME: "\/home\/gitlab-runner\/\.codex"/);
    assert.match(ci, /ai_factory_requirement_branch:\n {2}image: "\$AIFACTORY_RUNNER_IMAGE"\n {2}tags:\n {4}- linux/);
    assert.match(ci, /MODEL_PROVIDER=.*model-provider/);
    assert.match(ci, /if \[ "\$MODEL_PROVIDER" = "codex-cli" \]/);
    assert.match(ci, /if \[ -n "\$\{CODEX_AUTH_JSON_FILE:-\}" \]/);
    assert.match(ci, /install -m 600 "\$CODEX_AUTH_JSON_FILE" "\$CODEX_HOME\/auth\.json"/);
    assert.match(ci, /export CODEX_HOME="\$MOUNTED_CODEX_HOME"/);
    assert.match(ci, /test -r "\$CODEX_HOME\/auth\.json"/);
    assert.match(ci, /codex login status/);
    assert.match(ci, /handoff\|direct\)[\s\S]*GitLab AI Factory pipeline execution is skipped/);
    assert.match(githubActions, /name: AI Factory/);
    assert.match(githubActions, /factory\/RQ-\*/);
    assert.match(githubActions, /contents: write/);
    assert.match(githubActions, /issues: write/);
    assert.match(githubActions, /pull-requests: write/);
    assert.match(githubActions, /container:\n {6}image:.*aifactory-codex-runner:codex-0\.147\.0/);
    assert.match(githubActions, /defaults:\n {6}run:\n {8}shell: bash/);
    assert.match(githubActions, /AI_PROVIDER:.*codex-cli/);
    assert.match(githubActions, /AI_API_KEY:.*secrets\.AI_API_KEY/);
    assert.match(githubActions, /CODEX_AUTH_JSON:.*secrets\.CODEX_AUTH_JSON/);
    assert.match(githubActions, /OPENAI_API_KEY:.*secrets\.OPENAI_API_KEY/);
    assert.match(githubActions, /codex-cli provider requires Codex CLI in AIFACTORY_RUNNER_IMAGE/);
    assert.doesNotMatch(githubActions, /npm install --global @openai\/codex@latest/);
    assert.match(githubActions, /codex login --with-api-key/);
    assert.match(githubActions, /sync-requirement.*--push/);
    assert.match(githubActions, /AIFACTORY_FRESH/);
    assert.match(githubActions, /requirement decision/);
    assert.match(githubActions, /upload-artifact@v4/);
    assert.match(githubActions, /requirements\/\$\{\{ steps\.requirement\.outputs\.id \}\}-\*\.md/);
    assert.match(ci, /build_static:\n {2}stage: build\n {2}image: node:20-alpine\n {2}tags:\n {4}- linux/);
    assert.match(ci, /docker_image:\n {2}stage: image\n {2}image: docker:27-cli\n {2}tags:\n {4}- linux/);
    assert.match(ci, /docker_image:\n {2}stage: image/);
    assert.match(ci, /deploy_linux:/);
    assert.match(ci, /deploy_linux:[\s\S]*?rules:\n {4}- if: '\$CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH'\n {6}when: on_success/);
    assert.match(ci, /deploy_preview_linux:/);
    assert.match(ci, /deploy_preview_linux:[\s\S]*?rules:\n {4}- if: '\$CI_COMMIT_BRANCH && \$CI_COMMIT_BRANCH != \$CI_DEFAULT_BRANCH'\n {6}when: on_success/);
    assert.match(ci, /on_stop: stop_preview_linux/);
    assert.match(ci, /stop_preview_linux:[\s\S]*?GIT_STRATEGY: none/);
    assert.match(ci, /stop_preview_linux:[\s\S]*?docker rm --force "\$PREVIEW_CONTAINER_NAME"/);
    assert.match(ci, /stop_preview_linux:[\s\S]*?action: stop/);
    assert.match(ci, /APP_PORT: "8282"/);
    assert.match(ci, /--publish "\$APP_PORT:8282"/);
    assert.doesNotMatch(ci, /APP_PREVIEW_PORT: "8283"/);
    assert.match(ci, /PREVIEW_CONTAINER_NAME="\$CONTAINER_NAME-preview-\$CI_COMMIT_REF_SLUG"/);
    assert.match(ci, /\^\(factory-\)\?rq-\[0-9\]\+\(\$\|-\)/);
    assert.match(ci, /DEPLOYMENT_ID="\$REQUIREMENT_NUMBER"/);
    assert.match(ci, /DEPLOYMENT_ID="\$CI_PIPELINE_ID"/);
    assert.match(ci, /LEGACY_PREVIEW_PORT="81\$\{DEPLOYMENT_ID\}"/);
    assert.match(ci, /PREVIEW_PORT=\$\(\(20000 \+ DEPLOYMENT_ID % 40000\)\)/);
    assert.match(ci, /--publish "\$PREVIEW_PORT:8282"/);
    assert.match(ci, /docker rm --force "\$PREVIEW_CONTAINER_NAME"/);
    assert.match(ci, /docker save "\$LOCAL_DOCKER_IMAGE"/);
    assert.match(ci, /docker load --input lifecycle-project-image\.tar/);
    assert.match(ci, /DOCKER_HOST: "unix:\/\/\/var\/run\/docker\.sock"/);
    assert.match(readFileSync(join(result.projectRoot, 'Dockerfile'), 'utf8'), /FROM nginx:1\.27-alpine/);
    assert.match(readFileSync(join(result.projectRoot, 'Dockerfile'), 'utf8'), /EXPOSE 8282/);
    assert.match(readFileSync(join(result.projectRoot, 'nginx.conf'), 'utf8'), /listen 8282;/);
    assert.match(readFileSync(join(result.projectRoot, '.dockerignore'), 'utf8'), /node_modules/);
    assert.deepEqual(
      {
        baseUrl: config.repositoryPlatforms.gitlab.baseUrl,
        projectId: config.repositoryPlatforms.gitlab.projectId,
        token: config.repositoryPlatforms.gitlab.token,
        targetBranch: config.repositoryPlatforms.gitlab.targetBranch,
      },
      {
        baseUrl: '${GITLAB_URL:-}',
        projectId: '${GITLAB_PROJECT_ID:-}',
        token: '${GITLAB_TOKEN:-}',
        targetBranch: 'main',
      },
    );
    assert.deepEqual(config.repositoryPlatforms.github, {
      baseUrl: '${GITHUB_API_URL:-https://api.github.com}',
      repository: '${GITHUB_REPOSITORY:-}',
      token: '${GITHUB_TOKEN:-}',
      targetBranch: 'main',
      removeSourceBranchOnMerge: true,
      labels: {
        draft: 'factory::draft',
        ready: 'factory::ready',
        running: 'factory::running',
        needsFix: 'factory::needs-fix',
        passed: 'factory::passed',
      },
    });
    const envExample = readFileSync(join(result.projectRoot, '.env.example'), 'utf8');
    assert.match(envExample, /GITLAB_URL=/);
    assert.match(envExample, /GITLAB_PROJECT_ID=/);
    assert.match(envExample, /GITLAB_TOKEN=/);
    assert.match(envExample, /GITHUB_API_URL=/);
    assert.match(envExample, /GITHUB_REPOSITORY=/);
    assert.match(envExample, /GITHUB_TOKEN=/);
    assert.match(envExample, /RAG_CHAT_URL=/);
    assert.match(envExample, /RAG_SOURCE_IDS=fileserver/);
    assert.doesNotMatch(envExample, /RAG_SOURCE_\d+_ID/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('simics template scaffolds a licensed-runner project without proprietary dependencies', () => {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-simics-scaffold-'));
  try {
    const result = createTargetProject('board-twin', { dir: parent, simulator: 'simics' });
    const config = JSON.parse(readFileSync(join(result.projectRoot, 'factory.config.json'), 'utf8')) as {
      targetProject: {
        profile: string;
        allowedPaths: string[];
        commandTimeoutMs: number;
        commands: Record<string, string>;
      };
      rag: { sources: Array<{ include: string[] }> };
    };
    assert.equal(config.targetProject.profile, 'simics');
    assert.equal(config.targetProject.commandTimeoutMs, 900_000);
    assert.deepEqual(config.targetProject.commands, {
      build: 'pnpm simics:build',
      typeCheck: 'pnpm simics:check',
      test: 'pnpm simics:test',
      probeBuild: 'pnpm probe:build',
      probeSimulatorRun: 'pnpm probe:sim-run',
    });
    assert.ok(config.targetProject.allowedPaths.includes('dml'));

    // The gate command is recorded in the repository. Leaving it only in an
    // untracked .env lets it drift as later requirements add their own
    // validation scripts, with every report still saying passed and nothing
    // saying what had passed.
    const simicsConfig = JSON.parse(
      readFileSync(join(result.projectRoot, 'simics.config.json'), 'utf8'),
    ) as { gates: Record<string, string[] | string> };
    // The build entry works as generated; check and test stay placeholders
    // until the project has validation of its own to name.
    assert.deepEqual(simicsConfig.gates.build.slice(0, 3), ['node', 'scripts/sync-run.mjs', '--']);
    assert.deepEqual(simicsConfig.gates.test, ['./scripts/batch-test-command', 'arg']);
    assert.match(String(simicsConfig.gates.$override), /SIMICS_TEST_COMMAND_JSON/);

    // The generated wrapper runs the recorded command when nothing overrides
    // it, reports where the command came from, and preserves the child status.
    const gateWrapper = join(result.projectRoot, 'scripts/simics-command.mjs');
    writeFileSync(
      join(result.projectRoot, 'simics.config.json'),
      JSON.stringify({ gates: { test: [process.execPath, '-e', 'process.exit(3)'] } }),
    );
    const environment = { ...process.env };
    delete environment.SIMICS_TEST_COMMAND_JSON;
    const recorded = spawnSync(process.execPath, [gateWrapper, 'test'], {
      cwd: result.projectRoot,
      env: environment,
      encoding: 'utf8',
    });
    assert.equal(recorded.status, 3);
    assert.match(recorded.stdout, /\(gates\.test\)\]/);

    const overridden = spawnSync(process.execPath, [gateWrapper, 'test'], {
      cwd: result.projectRoot,
      env: { ...environment, SIMICS_TEST_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(0)']) },
      encoding: 'utf8',
    });
    assert.equal(overridden.status, 0);
    assert.match(overridden.stdout, /\[SIMICS_TEST_COMMAND_JSON\]/);

    // With neither source the gate must fail rather than report a silent pass.
    rmSync(join(result.projectRoot, 'simics.config.json'));
    const withoutConfig = spawnSync(process.execPath, [gateWrapper, 'test'], {
      cwd: result.projectRoot,
      env: environment,
      encoding: 'utf8',
    });
    assert.equal(withoutConfig.status, 2);
    assert.ok(config.targetProject.allowedPaths.includes('targets'));
    assert.ok(config.rag.sources[0]?.include.includes('**/*.dml'));
    assert.ok(config.rag.sources[0]?.include.includes('**/*.simics'));
    assert.ok(config.rag.sources[0]?.include.includes('**/*.mk'));
    assert.ok(config.rag.sources[0]?.include.includes('**/*.include'));
    assert.ok(config.rag.sources[0]?.include.includes('**/GNUmakefile'));
    for (const path of [
      'dml/README.md',
      'targets/README.md',
      'python/README.md',
      'scripts/simics-command.mjs',
      'tests/README.md',
      '.gitattributes',
    ]) {
      assert.equal(existsSync(join(result.projectRoot, path)), true, path);
    }
    const wrapper = readFileSync(join(result.projectRoot, 'scripts/simics-command.mjs'), 'utf8');
    assert.match(wrapper, /SIMICS_BUILD_COMMAND_JSON/);
    assert.match(wrapper, /shell: false/);
    const guidelines = readFileSync(join(result.projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(guidelines, /## Simics Model Development/);
    assert.match(guidelines, /not behaviorally verified/);
    const readme = readFileSync(join(result.projectRoot, 'README.md'), 'utf8');
    assert.match(readme, /does not install or redistribute Simics/);
    assert.match(readme, /missing command is a failed, unverified gate/);
    const unconfigured = spawnSync(
      process.execPath,
      ['scripts/simics-command.mjs', 'build'],
      {
        cwd: result.projectRoot,
        encoding: 'utf8',
        env: { ...process.env, SIMICS_BUILD_COMMAND_JSON: '' },
      },
    );
    assert.equal(unconfigured.status, 2);
    assert.match(unconfigured.stderr, /licensed Simics validation was not run/);
    const childFailure = spawnSync(
      process.execPath,
      ['scripts/simics-command.mjs', 'test'],
      {
        cwd: result.projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          SIMICS_TEST_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(7)']),
        },
      },
    );
    assert.equal(childFailure.status, 7);
    assert.throws(
      () => createTargetProject('invalid-template', { dir: parent, template: 'unknown' }),
      /empty, vanilla-ts, python/,
    );
    assert.throws(
      () => createTargetProject('invalid-simulator', { dir: parent, simulator: 'qemu' }),
      /Invalid simulator "qemu". Choose one: simics, renode/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('simics template scaffolds the hardware-twin probe workflow without naming any machine', () => {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-twin-'));
  try {
    const { projectRoot } = createTargetProject('twin-sim', {
      dir: parent,
      simulator: 'simics',
      codexHome: join(parent, 'codex-home'),
    });
    const read = (file: string) => readFileSync(join(projectRoot, file), 'utf8');

    for (const file of ['probes/README.md', 'probes/_template/probe.h', 'probes/_template/probe.c',
      'probes/_template/main.c', 'probes/_template/board.c', 'probes/_template/linker.ld', 'probes/_template/probe.json']) {
      assert.ok(existsSync(join(projectRoot, file)), `${file} is generated`);
    }
    // The runtime reads first and prints later; the marker the build gate looks for is embedded.
    const runtime = read('probes/_template/probe.c');
    assert.ok(runtime.indexOf('captured[i] = ') < runtime.indexOf('board_uart_init();'));
    assert.match(runtime, /"PROBE_SOURCE=" PROBE_STRINGIFY\(PROBE_SOURCE_HASH\)/);
    assert.match(runtime, /#error/, 'a build without the hash is refused');
    assert.match(read('probes/_template/board.c'), /#error/, 'the template does not pretend to know the board');
    // The runtime is a step list: a probe can act and observe, not only read.
    const header = read('probes/_template/probe.h');
    for (const macro of ['PROBE_READ_STEP', 'PROBE_WRITE_STEP', 'PROBE_WAIT_STEP', 'PROBE_MEM_STEP']) {
      assert.match(header, new RegExp(`#define ${macro}\\(`), macro);
    }
    for (const line of ['put_string("WRITE ")', 'put_string("WAIT ")', 'put_string("MEM @0x")', '" -> timeout spins="']) {
      assert.ok(runtime.includes(line), `runtime prints ${line}`);
    }
    const main = read('probes/_template/main.c');
    assert.match(main, /PROBE_WAIT_STEP\(/);
    const manifest = JSON.parse(read('probes/_template/probe.json'));
    assert.equal(manifest.scope, 'reset-state');
    assert.deepEqual(manifest.steps.map((step: { kind: string }) => step.kind), ['read']);

    const config = JSON.parse(read('factory.config.json'));
    assert.ok(config.targetProject.allowedPaths.includes('probes'));
    assert.equal(config.targetProject.commands.probeBuild, 'pnpm probe:build');
    // The defaults section is generated so a project can flip its kind in one
    // place instead of typing --kind on every requirement.
    assert.equal(config.requirementDefaults.kind, 'hardware-twin');
    assert.equal(config.requirementDefaults.executionMode, 'handoff');
    assert.match(config.requirementDefaults.$comment.join(' '), /hardware-twin/);
    assert.equal(config.targetProject.commands.probeSimulatorRun, 'pnpm probe:sim-run');
    const scripts = JSON.parse(read('package.json')).scripts;
    assert.equal(scripts['probe:build'], 'node scripts/simics-command.mjs probe-build');
    const simicsConfig = JSON.parse(read('simics.config.json'));
    assert.deepEqual(Object.keys(simicsConfig.probe).filter((k) => !k.startsWith('$')), ['target', 'probe-build', 'probe-sim-run']);
    assert.match(read('scripts/simics-command.mjs'), /probe-build/);

    const envExample = read('.env.example');
    for (const name of ['SIMULATOR_HOST_TYPE', 'SIMULATOR_BIN', 'SIMULATOR_REMOTE_HOST', 'SIMULATOR_REMOTE_USER',
      'SIMULATOR_REMOTE_PORT', 'SIMULATOR_REMOTE_BASE_PATH', 'SIMULATOR_REMOTE_PROJECT_NAME',
      'SIMULATOR_REMOTE_IDENTITY_FILE', 'SIMULATOR_TOOLCHAIN_BIN',
      'BOARD_PROGRAM_COMMAND_JSON', 'BOARD_RESET_COMMAND_JSON', 'BOARD_SERIAL_PORT', 'BOARD_SERIAL_BAUD',
      'BOARD_CAPTURE_COMMAND_JSON', 'BOARD_CAPTURE_TIMEOUT_MS', 'BOARD_POWER_NAME', 'BOT_API_URL', 'BOT_API_TOKEN',
      'BOT_API_AGENT', 'PROTOTYPE_POWER_NAME', 'PROTOTYPE_AGENT', 'PROTOTYPE_GDB', 'PROTOTYPE_OPENOCD_TELNET',
      'PROTOTYPE_SERIAL_PORT']) {
      assert.match(envExample, new RegExp(`^${name}=`, 'm'), `${name} is documented`);
    }

    const agents = read('AGENTS.md');
    assert.match(agents, /## Hardware-Twin Requirements/);
    assert.match(agents, /--kind hardware-twin/);
    assert.match(agents, /board is the oracle/);

    // The runner and transport scripts are generated, not hand-written per project.
    for (const file of ['scripts/sync-run.mjs', 'scripts/windows/SimicsTools.ps1', 'scripts/windows/Build-Modules.ps1',
      'scripts/windows/Build-Probe.ps1', 'scripts/windows/Run-Probe.ps1', 'scripts/board/capture-serial.mjs',
      'targets/probe-run/README.md']) {
      assert.ok(existsSync(join(projectRoot, file)), `${file} is generated`);
    }
    assert.equal(existsSync(join(projectRoot, 'scripts/sync-run.sh')), false, 'the Bash wrapper is gone');

    // Every gate and probe command goes through the transport, which is what
    // makes a project work locally and against a remote host without edits.
    for (const argv of [simicsConfig.gates.build, simicsConfig.probe['probe-build'], simicsConfig.probe['probe-sim-run']]) {
      assert.deepEqual(argv.slice(0, 2), ['node', 'scripts/sync-run.mjs']);
    }
    assert.equal(simicsConfig.probe.target, 'targets/probe-run/run.simics');
    for (const argv of [simicsConfig.probe['probe-build'], simicsConfig.probe['probe-sim-run']]) {
      assert.ok(argv.some((a: string) => a.startsWith('--pull')) || argv.includes('--pull'), 'the probe commands carry their output back');
    }
    // The module build is the directory listing, not a literal list that drifts.
    assert.match(read('scripts/windows/Build-Modules.ps1'), /Get-ChildItem -LiteralPath \$source -Directory/);
    assert.doesNotMatch(read('scripts/windows/Build-Modules.ps1'), /msys64/, 'no compiler path is assumed');

    // The rules a board-verified model has to follow are written down.
    assert.match(agents, /## Modelling Against a Board/);
    assert.match(agents, /derived, never written/);
    assert.match(agents, /never re-frozen against a new value/);
    assert.match(agents, /Parity is part of the boundary gate/);
    assert.match(agents, /is \(uint64_attr, init\)/);
    assert.match(agents, /lookup-file/);
    assert.match(agents, /inquiry accesses/);

    // Nothing generated carries a host, user, remote path or serial port as a value.
    for (const file of ['scripts/simics-command.mjs', 'simics.config.json', 'factory.config.json', 'AGENTS.md', 'README.md']) {
      assert.doesNotMatch(read(file), /\b(?!127\.)\d{1,3}(\.\d{1,3}){3}\b|Administrator|C:\\\\Windriver|\/dev\/tty\.usbserial-[A-Z]/, `${file} names no machine`);
    }
    assert.doesNotMatch(envExample, /\b(?!127\.)\d{1,3}(\.\d{1,3}){3}\b|Administrator|C:\\\\Windriver/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('renode template scaffolds a local hardware-twin project with the neutral parameter names', () => {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-renode-scaffold-'));
  try {
    const { projectRoot } = createTargetProject('board-twin-renode', {
      dir: parent,
      simulator: 'renode',
      codexHome: join(parent, 'codex-home'),
    });
    const read = (file: string) => readFileSync(join(projectRoot, file), 'utf8');

    // The config names the simulator and uses the neutral command keys.
    const config = JSON.parse(read('factory.config.json'));
    assert.equal(config.targetProject.profile, 'renode');
    assert.equal(config.targetProject.simulator, 'renode');
    assert.deepEqual(config.targetProject.commands, {
      build: 'pnpm renode:build',
      test: 'pnpm renode:test',
      probeBuild: 'pnpm probe:build',
      probeSimulatorRun: 'pnpm probe:sim-run',
    });
    for (const path of ['platforms', 'peripherals', 'probes']) {
      assert.ok(config.targetProject.allowedPaths.includes(path), `${path} is allowed`);
    }
    // A simulator project defaults its requirements to hardware-twin.
    assert.equal(config.requirementDefaults.kind, 'hardware-twin');

    // The package scripts are the local Renode ones; there is no gate wrapper.
    const scripts = JSON.parse(read('package.json')).scripts;
    assert.equal(scripts['renode:build'], 'node scripts/build-model.mjs');
    assert.equal(scripts['probe:build'], 'node scripts/build-probe.mjs');
    assert.equal(scripts['probe:sim-run'], 'node scripts/renode-run.mjs');

    // The Renode-specific and shared-twin files are generated.
    for (const file of ['platforms/board.repl', 'peripherals/README.md', 'scripts/renode-run.mjs',
      'scripts/build-probe.mjs', 'scripts/build-model.mjs', 'scripts/run-probe.resc',
      'scripts/board/capture-serial.mjs', 'scripts/board/lab-agent.mjs',
      'probes/_template/probe.c', 'probes/README.md', 'README.md']) {
      assert.ok(existsSync(join(projectRoot, file)), `${file} is generated`);
    }
    // The runner reaches a remote Renode over the common axis and hands the
    // .resc its inputs as Monitor variables, which Renode does not read from
    // the environment.
    const runner = read('scripts/renode-run.mjs');
    assert.match(runner, /SIMULATOR_REMOTE_HOST/);
    assert.match(runner, /\$PROBE_ELF=@/);
    const resc = read('scripts/run-probe.resc');
    assert.match(resc, /RunFor \$PROBE_RUN_SECONDS/);
    assert.match(resc, /CreateFileBackend \$PROBE_UART_LOG/);
    // references/ holds the reading material, so the source rooted there has to
    // index documents and not only code.
    for (const pattern of ['**/*.pdf', '**/*.docx', '**/*.xlsx', '**/*.repl']) {
      assert.ok(config.rag.sources[0].include.includes(pattern), `${pattern} is indexed`);
    }
    assert.match(config.rag.sources[0].rootPath, /references/);

    // No Simics artefacts leak into a Renode project.
    assert.equal(existsSync(join(projectRoot, 'simics.config.json')), false, 'no Simics config');
    assert.equal(existsSync(join(projectRoot, 'scripts/simics-command.mjs')), false, 'no Simics wrapper');

    // The three axes and the common env are documented, with the simulator set
    // to linux by default and the same SIMULATOR_*/BOARD_* names as Simics.
    const envExample = read('.env.example');
    assert.match(envExample, /^SIMULATOR_HOST_TYPE=linux$/m);
    for (const name of ['SIMULATOR_BIN', 'SIMULATOR_REMOTE_HOST', 'SIMULATOR_REMOTE_USER',
      'SIMULATOR_TOOLCHAIN_BIN', 'SIMULATOR_TIMEOUT_MS', 'BOARD_PROGRAM_COMMAND_JSON', 'BOARD_SERIAL_PORT',
      'BOT_API_URL', 'BOT_API_TOKEN', 'BOT_API_AGENT']) {
      assert.match(envExample, new RegExp(`^${name}=`, 'm'), `${name} is documented`);
    }

    const agents = read('AGENTS.md');
    assert.match(agents, /## Three Axes of a Hardware-Twin Project/);
    assert.match(agents, /## Hardware-Twin Requirements/);
    assert.match(agents, /## Renode Model Development/);
    assert.match(agents, /board is the oracle/);
    assert.match(agents, /factory probe sim-run/);
    assert.doesNotMatch(agents, /## Simics Model Development/, 'no Simics guidance in a Renode project');

    // The build-model gate runs and passes on the non-empty starter platform.
    const build = spawnSync(process.execPath, ['scripts/build-model.mjs'], {
      cwd: projectRoot, encoding: 'utf8',
    });
    assert.equal(build.status, 0, build.stderr);
    assert.match(build.stdout, /Renode model: platforms\/board.repl/);

    // Nothing generated carries a host, user, remote path or serial port value.
    for (const file of ['factory.config.json', 'AGENTS.md', 'README.md', 'scripts/renode-run.mjs']) {
      assert.doesNotMatch(read(file), /\b(?!127\.)\d{1,3}(\.\d{1,3}){3}\b|Administrator|C:\\\\Windriver|\/dev\/tty\.usbserial-[A-Z]/, `${file} names no machine`);
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
