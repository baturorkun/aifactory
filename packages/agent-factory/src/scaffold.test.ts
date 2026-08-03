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
      };
    };
    assert.deepEqual(config.model, {
      provider: '${AI_PROVIDER}',
      name: '${AI_MODEL}',
      reviewerName: '${AI_REVIEWER_MODEL}',
      baseUrl: '${AI_BASE_URL}',
      apiKey: '${AI_API_KEY}',
      maxTokens: 32768,
    });
    const ci = readFileSync(join(result.projectRoot, '.gitlab-ci.yml'), 'utf8');
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
    assert.match(ci, /ai_factory_requirement_branch:/);
    assert.match(ci, /git -C \.\.\/aifactory fetch origin main/);
    assert.match(ci, /git -C \.\.\/aifactory switch --detach FETCH_HEAD/);
    assert.match(ci, /- factory\.config\.json/);
    assert.match(ci, /requirement decision/);
    assert.match(ci, /sync-requirement/);
    assert.match(ci, /--project "\$CI_PROJECT_DIR"/);
    assert.match(ci, /cd \.\.\/aifactory/);
    assert.match(ci, /RQ-\[0-9\]\+/);
    assert.match(ci, /container_image:/);
    assert.match(ci, /stages:\n  - ai_factory\n  - build\n  - package\n  - image\n  - deploy/);
    assert.match(ci, /default:\n  tags:\n    - linux/);
    assert.match(ci, /container_image:\n  stage: image/);
    assert.match(ci, /deploy_container:/);
    assert.match(ci, /DEPLOY_PORT: "8282"/);
    assert.match(ci, /--publish "\$\{DEPLOY_PORT\}:8282"/);
    assert.match(ci, /docker push "\$CONTAINER_IMAGE"/);
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
    const envExample = readFileSync(join(result.projectRoot, '.env.example'), 'utf8');
    assert.match(envExample, /GITLAB_URL=/);
    assert.match(envExample, /GITLAB_PROJECT_ID=/);
    assert.match(envExample, /GITLAB_TOKEN=/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
