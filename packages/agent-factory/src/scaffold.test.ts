import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTargetProject } from './scaffold';

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
        };
        github: {
          baseUrl: string;
          repository: string;
          token: string;
          targetBranch: string;
        };
      };
      projectGuidelines: {
        files: string[];
        required: boolean;
        maxContextChars: number;
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
    const agentGuidelines = readFileSync(join(result.projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentGuidelines, /## AI Factory Workflow/);
    assert.match(agentGuidelines, /factory requirement new <title>/);
    assert.match(agentGuidelines, /factory requirement submit <requirement-id>/);
    assert.match(agentGuidelines, /factory requirement platform-sync <requirement-id>/);
    assert.match(agentGuidelines, /factory requirement cancel <requirement-id>/);
    assert.match(ci, /ai_factory_requirement_branch:/);
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
    assert.match(ci, /handoff\)[\s\S]*GitLab AI Factory execution is skipped/);
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
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
