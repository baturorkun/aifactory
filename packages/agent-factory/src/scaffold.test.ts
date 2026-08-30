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
          sourceIds: string[];
        };
      };
    };
    assert.deepEqual(config.model, {
      provider: '${AI_PROVIDER}',
      name: '${AI_MODEL}',
      reviewerName: '${AI_REVIEWER_MODEL}',
      baseUrl: '${AI_BASE_URL:-}',
      apiKey: '${AI_API_KEY:-}',
      executable: '${AI_CODEX_EXECUTABLE:-codex}',
      reasoningEffort: '${AI_CODEX_REASONING_EFFORT:-medium}',
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
    assert.deepEqual(config.rag.grounding.sourceIds, ['${RAG_SOURCE_ID:-fileserver}']);
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
    assert.match(agentGuidelines, /RAG_SOURCE_ID/);
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
    assert.match(envExample, /RAG_SOURCE_ID=fileserver/);
    assert.doesNotMatch(envExample, /RAG_SOURCE_\d+_ID/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('simics template scaffolds a licensed-runner project without proprietary dependencies', () => {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-simics-scaffold-'));
  try {
    const result = createTargetProject('board-twin', { dir: parent, template: 'simics' });
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
    });
    assert.ok(config.targetProject.allowedPaths.includes('dml'));

    // The gate command is recorded in the repository. Leaving it only in an
    // untracked .env lets it drift as later requirements add their own
    // validation scripts, with every report still saying passed and nothing
    // saying what had passed.
    const simicsConfig = JSON.parse(
      readFileSync(join(result.projectRoot, 'simics.config.json'), 'utf8'),
    ) as { gates: Record<string, string[] | string> };
    assert.deepEqual(simicsConfig.gates.build, ['./scripts/project-build-command', 'arg']);
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
      /empty, vanilla-ts, python, simics/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
