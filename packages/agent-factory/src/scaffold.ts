import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { relative, resolve } from 'path';

export type ProjectTemplate = 'empty' | 'vanilla-ts' | 'python';

export type NewProjectOptions = {
  dir?: string;
  force?: boolean;
  template?: string;
};

export type NewProjectResult = {
  projectName: string;
  projectRoot: string;
  template: ProjectTemplate;
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = ['empty', 'vanilla-ts', 'python'];

const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const TYPESCRIPT_CONFIG_PATHS = ['tsconfig.json', 'tsconfig.build.json'];

function assertValidProjectName(projectName: string): void {
  if (!PROJECT_NAME_PATTERN.test(projectName)) {
    throw new Error(
      'Invalid project name. Use letters, numbers, dot, underscore, or dash; start with a letter or number.',
    );
  }
}

function assertValidTemplate(template: string | undefined): asserts template is ProjectTemplate {
  if (!template) {
    throw new Error('Missing --template. Choose one: ' + PROJECT_TEMPLATES.join(', '));
  }

  if (!PROJECT_TEMPLATES.includes(template as ProjectTemplate)) {
    throw new Error('Invalid template "' + template + '". Choose one: ' + PROJECT_TEMPLATES.join(', '));
  }
}

function toPackageScriptPath(fromDir: string, toFile: string): string {
  const rel = relative(fromDir, toFile).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : './' + rel;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function writeCommonFiles(projectRoot: string, projectName: string): void {
  writeJson(resolve(projectRoot, 'package.json'), {
    name: projectName,
    private: true,
    version: '0.1.0',
    scripts: {},
  });

  writeFileSync(
    resolve(projectRoot, '.env.example'),
    [
      '# Required model settings. Copy this file to .env and provide real values.',
      'AI_PROVIDER=gemini',
      'AI_MODEL=gemini-2.5-flash',
      'AI_REVIEWER_MODEL=gemini-2.5-flash',
      'AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta',
      'AI_API_KEY=replace_me',
      '',
      '# xAI / Grok via OpenAI-compatible endpoint example:',
      '# AI_PROVIDER=openai-compat',
      '# AI_MODEL=grok-4-fast-reasoning',
      '# AI_REVIEWER_MODEL=grok-4-fast-reasoning',
      '# AI_BASE_URL=https://api.x.ai/v1',
      '# AI_API_KEY=replace_me',
      '',
      '# Codex CLI provider (pipeline mode only):',
      '# AI_PROVIDER=codex-cli',
      '# AI_MODEL=gpt-5.6-sol',
      '# AI_REVIEWER_MODEL=gpt-5.6-sol',
      '# AI_CODEX_EXECUTABLE=codex',
      '# AI_CODEX_REASONING_EFFORT=medium',
      '',
      '# RAG settings:',
      '# RAG_DATABASE_URL=postgresql://aifactory_rag:aifactory_rag@localhost:5432/aifactory_rag',
      '# RAG_FILESERVER_PATH=/mnt/company-share/docs',
      '# RAG_EMBEDDING_PROVIDER=gemini',
      '# RAG_EMBEDDING_MODEL=gemini-embedding-001',
      '# RAG_LLM_PROVIDER=gemini',
      '# RAG_LLM_MODEL=gemini-2.5-flash',
      '# RAG_API_KEY=replace_me',
      '# ENTRA_TENANT_ID=replace_me',
      '# ENTRA_AUDIENCE=api://replace_me',
      '',
      '# Optional repository-platform integration:',
      '# GITLAB_URL=https://gitlab.example.com',
      '# GITLAB_PROJECT_ID=group/project',
      '# GITLAB_TOKEN=replace_me',
      '# GITHUB_API_URL=https://api.github.com',
      '# GITHUB_REPOSITORY=owner/repository',
      '# GITHUB_TOKEN=replace_me',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, '.gitignore'),
    [
      'node_modules/',
      'dist/',
      '.env',
      '# Keep lightweight run history; generated artifacts and logs stay local.',
      'runs/*',
      '!runs/.gitkeep',
      '!runs/*/',
      'runs/*/*',
      '!runs/*/manifest.json',
      '!runs/*/gates/',
      'runs/*/gates/*',
      '!runs/*/gates/report.json',
      '.DS_Store',
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeReferencesReadme(projectRoot: string): void {
  writeFileSync(
    resolve(projectRoot, 'references/README.md'),
    [
      '# References',
      '',
      'Put source material for requirements here, such as PDFs, standards, screenshots, notes, and domain research.',
      '',
      'Suggested layout for a standard or specification:',
      '',
      '```text',
      'references/',
      '  arinc-661/',
      '    ARINC-661.pdf',
      '    summary.md',
      '    widget-model.md',
      '    requirements-notes.md',
      '```',
      '',
      'Requirements should link to concise markdown notes from this folder when possible. Keep large PDFs here as source material, but summarize the implementation-relevant parts in markdown before running the factory pipeline.',
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeGitlabCi(projectRoot: string, projectName: string, deployable: boolean): void {
  writeFileSync(
    resolve(projectRoot, '.gitlab-ci.yml'),
    [
      'stages:',
      '  - ai_factory',
      ...(deployable ? ['  - build', '  - package', '  - image', '  - deploy'] : []),
      '',
      'variables:',
      '  PNPM_HOME: "$CI_PROJECT_DIR/.pnpm"',
      '  AIFACTORY_REPO_URL: "https://github.com/baturorkun/aifactory.git"',
      '  AIFACTORY_RUNNER_IMAGE: "node:20-bullseye"',
      '  CODEX_HOME: "/home/gitlab-runner/.codex"',
      ...(deployable
        ? [
            '  APP_PORT: "8282"',
            '  LOCAL_DOCKER_IMAGE: "' + projectName + ':$CI_COMMIT_SHORT_SHA"',
            '  CONTAINER_NAME: "' + projectName + '"',
          ]
        : []),
      '',
      'cache:',
      '  key: "$CI_COMMIT_REF_SLUG"',
      '  paths:',
      '    - .pnpm-store/',
      '    - .pnpm/',
      '',
      'ai_factory_requirement_branch:',
      '  image: "$AIFACTORY_RUNNER_IMAGE"',
      '  tags:',
      '    - linux',
      '  stage: ai_factory',
      '  resource_group: "ai-factory-$CI_COMMIT_REF_SLUG"',
      '  variables:',
      '    GIT_DEPTH: "0"',
      '  rules:',
      '    - if: \'$CI_COMMIT_BRANCH =~ /^factory\\/RQ-[0-9]+$/\'',
      '      changes:',
      '        - requirements/**/*.md',
      '        - requirements/**/*.markdown',
      '        - factory.config.json',
      '      when: on_success',
      '    - when: never',
      '  before_script:',
      '    - node --version',
      '    - npm --version',
      '    - corepack enable',
      '    - corepack prepare pnpm@9.15.9 --activate',
      '    - |',
      '      if [ ! -f ../aifactory/package.json ]; then',
      '        git clone "$AIFACTORY_REPO_URL" ../aifactory',
      '      fi',
      '      git -C ../aifactory fetch origin main',
      '      git -C ../aifactory switch --detach FETCH_HEAD',
      '      echo "AI Factory commit: $(git -C ../aifactory rev-parse --short HEAD)"',
      '    - cd ../aifactory',
      '    - pnpm install --frozen-lockfile',
      '    - pnpm -r run typecheck',
      '    - cd "$CI_PROJECT_DIR"',
      '    - if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install --no-frozen-lockfile; fi',
      '    - git config user.name "AI Factory"',
      '    - git config user.email "ai-factory@local"',
      '  script:',
      '    - |',
      '      REQUIREMENT_ID="${CI_COMMIT_BRANCH#factory/}"',
      '      cd ../aifactory',
      '      DECISION="$(pnpm --silent factory -- --project "$CI_PROJECT_DIR" requirement decision "$REQUIREMENT_ID")"',
      '      case "$DECISION" in',
      '        run|legacy)',
      '          MODEL_PROVIDER="$(pnpm --silent factory -- --project "$CI_PROJECT_DIR" model-provider)"',
      '          if [ "$MODEL_PROVIDER" = "codex-cli" ]; then',
      '            command -v codex >/dev/null 2>&1 || { echo "codex-cli provider requires Codex CLI in AIFACTORY_RUNNER_IMAGE"; exit 1; }',
      '            MOUNTED_CODEX_HOME="${CODEX_HOME:-/home/gitlab-runner/.codex}"',
      '            if [ -n "${CODEX_AUTH_JSON_FILE:-}" ]; then',
      '              test -r "$CODEX_AUTH_JSON_FILE" || { echo "CODEX_AUTH_JSON_FILE must point to a readable GitLab File variable"; exit 1; }',
      '              export CODEX_HOME="$CI_PROJECT_DIR/.codex"',
      '              install -d -m 700 "$CODEX_HOME"',
      '              install -m 600 "$CODEX_AUTH_JSON_FILE" "$CODEX_HOME/auth.json"',
      '            else',
      '              export CODEX_HOME="$MOUNTED_CODEX_HOME"',
      '              test -r "$CODEX_HOME/auth.json" || { echo "codex-cli provider requires CODEX_AUTH_JSON_FILE or readable $CODEX_HOME/auth.json from the runner mount"; exit 1; }',
      '            fi',
      '            codex login status >/dev/null || { echo "Codex CLI authentication is invalid; refresh CODEX_AUTH_JSON_FILE or $CODEX_HOME/auth.json"; exit 1; }',
      '          fi',
      '          pnpm factory -- --project "$CI_PROJECT_DIR" sync-requirement "$REQUIREMENT_ID" --source-ref "$CI_COMMIT_SHA" --push',
      '          ;;',
      '        draft)',
      '          echo "$REQUIREMENT_ID is still draft; AI Factory execution is skipped."',
      '          ;;',
      '        handoff)',
      '          echo "$REQUIREMENT_ID uses handoff mode; GitLab AI Factory execution is skipped."',
      '          ;;',
      '        *)',
      '          echo "Unknown requirement execution decision: $DECISION"',
      '          exit 1',
      '          ;;',
      '      esac',
      '  artifacts:',
      '    name: "' + projectName + '-ai-factory-$CI_COMMIT_SHORT_SHA"',
      '    when: always',
      '    expire_in: 7 days',
      '    paths:',
      '      - public/',
      '      - src/',
      '      - dist/',
      '      - runs/',
      '      - handoffs/',
      '      - requirements/',
      '      - constraints/',
      '      - factory.config.json',
      '      - package.json',
      '      - tsconfig.json',
      '      - tsconfig.build.json',
      '      - pyproject.toml',
      '      - tests/',
      ...(deployable
        ? [
            '',
            'build_static:',
            '  stage: build',
            '  image: node:20-alpine',
            '  tags:',
            '    - linux',
            '  script:',
            '    - npm install --global typescript@5.4.5',
            '    - tsc --project tsconfig.build.json',
            '    - mkdir -p release/' + projectName + '/public release/' + projectName + '/src release/' + projectName + '/dist',
            '    - cp -R public/. release/' + projectName + '/public/',
            '    - cp src/styles.css release/' + projectName + '/src/styles.css',
            '    - cp -R dist/. release/' + projectName + '/dist/',
            '  artifacts:',
            '    name: "' + projectName + '-static-$CI_COMMIT_SHORT_SHA"',
            '    expire_in: 30 days',
            '    paths:',
            '      - release/' + projectName + '/',
            '  rules:',
            '    - if: \'$CI_COMMIT_BRANCH\'',
            '    - if: \'$CI_COMMIT_TAG\'',
            '',
            'package_offline:',
            '  stage: package',
            '  image: alpine:3.21',
            '  tags:',
            '    - linux',
            '  needs:',
            '    - job: build_static',
            '      artifacts: true',
            '  script:',
            '    - tar -czf "' + projectName + '-offline-$CI_COMMIT_SHORT_SHA.tar.gz" -C release ' + projectName,
            '  artifacts:',
            '    name: "' + projectName + '-offline-$CI_COMMIT_SHORT_SHA"',
            '    expire_in: 30 days',
            '    paths:',
            '      - ' + projectName + '-offline-*.tar.gz',
            '      - release/' + projectName + '/',
            '  rules:',
            '    - if: \'$CI_COMMIT_BRANCH\'',
            '    - if: \'$CI_COMMIT_TAG\'',
            '',
            'docker_image:',
            '  stage: image',
            '  image: docker:27-cli',
            '  tags:',
            '    - linux',
            '  variables:',
            '    DOCKER_HOST: "unix:///var/run/docker.sock"',
            '  needs:',
            '    - job: build_static',
            '      artifacts: true',
            '  before_script:',
            '    - |',
            '      if [ ! -S /var/run/docker.sock ]; then',
            '        echo "Docker image build requires /var/run/docker.sock mounted from the runner host."',
            '        echo "Add /var/run/docker.sock:/var/run/docker.sock to the runner Docker volumes."',
            '        exit 1',
            '      fi',
            '    - docker info',
            '  script:',
            '    - docker build --pull --label "org.opencontainers.image.revision=$CI_COMMIT_SHA" --tag "$LOCAL_DOCKER_IMAGE" .',
            '    - docker save "$LOCAL_DOCKER_IMAGE" --output ' + projectName + '-image.tar',
            '    - |',
            '      if [ -n "$CI_REGISTRY" ] && [ -n "$CI_REGISTRY_IMAGE" ] && [ -n "$CI_REGISTRY_USER" ] && [ -n "$CI_REGISTRY_PASSWORD" ]; then',
            '        echo "$CI_REGISTRY_PASSWORD" | docker login --username "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"',
            '        docker tag "$LOCAL_DOCKER_IMAGE" "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"',
            '        docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"',
            '        if [ "$CI_COMMIT_BRANCH" = "$CI_DEFAULT_BRANCH" ]; then',
            '          docker tag "$LOCAL_DOCKER_IMAGE" "$CI_REGISTRY_IMAGE:latest"',
            '          docker push "$CI_REGISTRY_IMAGE:latest"',
            '        fi',
            '      else',
            '        echo "GitLab Container Registry is not configured; using the Docker image artifact."',
            '      fi',
            '  artifacts:',
            '    name: "' + projectName + '-docker-image-$CI_COMMIT_SHORT_SHA"',
            '    expire_in: 7 days',
            '    paths:',
            '      - ' + projectName + '-image.tar',
            '  rules:',
            '    - if: \'$CI_COMMIT_BRANCH\'',
            '    - if: \'$CI_COMMIT_TAG\'',
            '',
            'deploy_linux:',
            '  stage: deploy',
            '  image: docker:27-cli',
            '  tags:',
            '    - linux',
            '  needs:',
            '    - job: docker_image',
            '      artifacts: true',
            '  resource_group: "' + projectName + '-linux"',
            '  variables:',
            '    DOCKER_HOST: "unix:///var/run/docker.sock"',
            '  before_script:',
            '    - |',
            '      if [ ! -S /var/run/docker.sock ]; then',
            '        echo "Persistent deployment requires /var/run/docker.sock mounted from the runner host."',
            '        echo "Add /var/run/docker.sock:/var/run/docker.sock to the runner Docker volumes."',
            '        exit 1',
            '      fi',
            '    - docker info',
            '  script:',
            '    - docker load --input ' + projectName + '-image.tar',
            '    - docker rm --force "$CONTAINER_NAME" || true',
            '    - |',
            '      PORT_OWNER="$(docker ps --filter "publish=$APP_PORT" --format \'{{.Names}}\' | head -n 1)"',
            '      if [ -n "$PORT_OWNER" ]; then',
            '        echo "Port $APP_PORT is already used by container: $PORT_OWNER"',
            '        echo "Set APP_PORT to a free host port and retry deploy_linux."',
            '        exit 1',
            '      fi',
            '    - docker run --detach --restart unless-stopped --name "$CONTAINER_NAME" --publish "$APP_PORT:8282" "$LOCAL_DOCKER_IMAGE"',
            '    - |',
            '      ATTEMPT=0',
            '      until docker exec "$CONTAINER_NAME" wget --quiet --output-document=/dev/null http://127.0.0.1:8282/healthz; do',
            '        ATTEMPT=$((ATTEMPT + 1))',
            '        if [ "$ATTEMPT" -ge 15 ]; then',
            '          docker logs "$CONTAINER_NAME"',
            '          echo "Application health check failed."',
            '          exit 1',
            '        fi',
            '        sleep 1',
            '      done',
            '    - docker ps --filter "name=$CONTAINER_NAME"',
            '  environment:',
            '    name: production',
            '  rules:',
            '    - if: \'$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH\'',
            '      when: on_success',
            '    - when: never',
            '',
            'deploy_preview_linux:',
            '  stage: deploy',
            '  image: docker:27-cli',
            '  tags:',
            '    - linux',
            '  needs:',
            '    - job: docker_image',
            '      artifacts: true',
            '  resource_group: "' + projectName + '-preview-linux"',
            '  variables:',
            '    DOCKER_HOST: "unix:///var/run/docker.sock"',
            '  before_script:',
            '    - |',
            '      if [ ! -S /var/run/docker.sock ]; then',
            '        echo "Persistent preview deployment requires /var/run/docker.sock mounted from the runner host."',
            '        echo "Add /var/run/docker.sock:/var/run/docker.sock to the runner Docker volumes."',
            '        exit 1',
            '      fi',
            '    - docker info',
            '  script:',
            '    - docker load --input ' + projectName + '-image.tar',
            '    - |',
            '      PREVIEW_CONTAINER_NAME="$CONTAINER_NAME-preview-$CI_COMMIT_REF_SLUG"',
            '',
            '      if [ -n "${APP_PREVIEW_PORT:-}" ]; then',
            '        PREVIEW_PORT="$APP_PREVIEW_PORT"',
            '      elif printf \'%s\' "$CI_COMMIT_REF_SLUG" | grep -Eq \'^(factory-)?rq-[0-9]+($|-)\'; then',
            '        REQUIREMENT_NUMBER="$(printf \'%s\' "$CI_COMMIT_REF_SLUG" | sed -E \'s/^(factory-)?rq-([0-9]+).*/\\2/\')"',
            '        REQUIREMENT_NUMBER="$(printf \'%s\' "$REQUIREMENT_NUMBER" | sed \'s/^0*//\')"',
            '        REQUIREMENT_NUMBER="${REQUIREMENT_NUMBER:-0}"',
            '        DEPLOYMENT_ID="$REQUIREMENT_NUMBER"',
            '      else',
            '        case "$CI_PIPELINE_ID" in',
            '          \'\'|*[!0-9]*) echo "CI_PIPELINE_ID must be a positive integer."; exit 1 ;;',
            '        esac',
            '        DEPLOYMENT_ID="$CI_PIPELINE_ID"',
            '      fi',
            '',
            '      if [ -z "${PREVIEW_PORT:-}" ]; then',
            '        LEGACY_PREVIEW_PORT="81${DEPLOYMENT_ID}"',
            '        if [ "$LEGACY_PREVIEW_PORT" -ge 1024 ] && [ "$LEGACY_PREVIEW_PORT" -le 65535 ]; then',
            '          PREVIEW_PORT="$LEGACY_PREVIEW_PORT"',
            '        else',
            '          PREVIEW_PORT=$((20000 + DEPLOYMENT_ID % 40000))',
            '        fi',
            '      fi',
            '',
            '      case "$PREVIEW_PORT" in',
            '        \'\'|*[!0-9]*) echo "Preview port must be an integer: $PREVIEW_PORT"; exit 1 ;;',
            '      esac',
            '      if [ "$PREVIEW_PORT" -lt 1024 ] || [ "$PREVIEW_PORT" -gt 65535 ]; then',
            '        echo "Preview port must be between 1024 and 65535: $PREVIEW_PORT"',
            '        exit 1',
            '      fi',
            '',
            '      docker rm --force "$PREVIEW_CONTAINER_NAME" 2>/dev/null || true',
            '      PORT_OWNER="$(docker ps --filter "publish=$PREVIEW_PORT" --format \'{{.Names}}\' | head -n 1)"',
            '      if [ -n "$PORT_OWNER" ]; then',
            '        echo "Preview port $PREVIEW_PORT for $CI_COMMIT_REF_NAME is already used by container: $PORT_OWNER"',
            '        echo "Set APP_PREVIEW_PORT to a free host port and retry deploy_preview_linux."',
            '        exit 1',
            '      fi',
            '',
            '      docker run --detach --restart unless-stopped \\',
            '        --name "$PREVIEW_CONTAINER_NAME" \\',
            '        --label "com.aifactory.preview=true" \\',
            '        --label "com.aifactory.branch=$CI_COMMIT_REF_NAME" \\',
            '        --publish "$PREVIEW_PORT:8282" \\',
            '        "$LOCAL_DOCKER_IMAGE"',
            '',
            '      ATTEMPT=0',
            '      until docker exec "$PREVIEW_CONTAINER_NAME" wget --quiet --output-document=/dev/null http://127.0.0.1:8282/healthz; do',
            '        ATTEMPT=$((ATTEMPT + 1))',
            '        if [ "$ATTEMPT" -ge 15 ]; then',
            '          docker logs "$PREVIEW_CONTAINER_NAME"',
            '          echo "Application preview health check failed."',
            '          exit 1',
            '        fi',
            '        sleep 1',
            '      done',
            '      docker ps --filter "name=^/${PREVIEW_CONTAINER_NAME}$"',
            '      echo "Branch preview: http://LINUX_HOST:$PREVIEW_PORT/"',
            '  environment:',
            '    name: "preview/$CI_COMMIT_REF_SLUG"',
            '    on_stop: stop_preview_linux',
            '  rules:',
            '    - if: \'$CI_COMMIT_BRANCH && $CI_COMMIT_BRANCH != $CI_DEFAULT_BRANCH\'',
            '      when: on_success',
            '    - when: never',
            '',
            'stop_preview_linux:',
            '  stage: deploy',
            '  image: docker:27-cli',
            '  tags:',
            '    - linux',
            '  resource_group: "' + projectName + '-preview-linux"',
            '  variables:',
            '    DOCKER_HOST: "unix:///var/run/docker.sock"',
            '    GIT_STRATEGY: none',
            '  before_script:',
            '    - |',
            '      if [ ! -S /var/run/docker.sock ]; then',
            '        echo "Preview cleanup requires /var/run/docker.sock mounted from the runner host."',
            '        exit 1',
            '      fi',
            '  script:',
            '    - PREVIEW_CONTAINER_NAME="$CONTAINER_NAME-preview-$CI_COMMIT_REF_SLUG"',
            '    - docker rm --force "$PREVIEW_CONTAINER_NAME" 2>/dev/null || true',
            '    - echo "Removed preview container for $CI_COMMIT_REF_NAME."',
            '  environment:',
            '    name: "preview/$CI_COMMIT_REF_SLUG"',
            '    action: stop',
            '  when: manual',
            '  allow_failure: true',
            '  rules:',
            '    - if: \'$CI_COMMIT_BRANCH && $CI_COMMIT_BRANCH != $CI_DEFAULT_BRANCH\'',
            '    - when: never',
          ]
        : []),
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeGithubActions(projectRoot: string, projectName: string): void {
  const workflowsDirectory = resolve(projectRoot, '.github/workflows');
  mkdirSync(workflowsDirectory, { recursive: true });
  writeFileSync(
    resolve(workflowsDirectory, 'ai-factory.yml'),
    [
      'name: AI Factory',
      '',
      'on:',
      '  push:',
      '    branches:',
      "      - 'factory/RQ-*'",
      '    paths:',
      "      - 'requirements/**/*.md'",
      "      - 'requirements/**/*.markdown'",
      "      - 'factory.config.json'",
      '  workflow_dispatch:',
      '',
      'permissions:',
      '  contents: write',
      '  issues: write',
      '  pull-requests: write',
      '',
      'concurrency:',
      "  group: ai-factory-${{ github.ref }}",
      '  cancel-in-progress: false',
      '',
      'jobs:',
      '  requirement:',
      '    runs-on: ubuntu-latest',
      '    container:',
      "      image: ${{ vars.AIFACTORY_RUNNER_IMAGE || 'ghcr.io/baturorkun/aifactory-codex-runner:codex-0.147.0' }}",
      '    defaults:',
      '      run:',
      '        shell: bash',
      '    timeout-minutes: 120',
      '    env:',
      "      AIFACTORY_REPO_URL: ${{ vars.AIFACTORY_REPO_URL || 'https://github.com/baturorkun/aifactory.git' }}",
      "      AIFACTORY_REF: ${{ vars.AIFACTORY_REF || 'main' }}",
      "      AI_PROVIDER: ${{ vars.AI_PROVIDER || 'codex-cli' }}",
      "      AI_MODEL: ${{ vars.AI_MODEL || 'gpt-5.6-sol' }}",
      "      AI_REVIEWER_MODEL: ${{ vars.AI_REVIEWER_MODEL || vars.AI_MODEL || 'gpt-5.6-sol' }}",
      "      AI_BASE_URL: ${{ vars.AI_BASE_URL }}",
      "      AI_API_KEY: ${{ secrets.AI_API_KEY }}",
      "      AI_CODEX_EXECUTABLE: ${{ vars.AI_CODEX_EXECUTABLE || 'codex' }}",
      "      AI_CODEX_REASONING_EFFORT: ${{ vars.AI_CODEX_REASONING_EFFORT || 'medium' }}",
      "      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}",
      "      CODEX_AUTH_JSON: ${{ secrets.CODEX_AUTH_JSON }}",
      "      CODEX_HOME: ${{ runner.temp }}/aifactory-codex",
      "      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
      "      GITHUB_API_URL: ${{ github.api_url }}",
      "      GITHUB_REPOSITORY: ${{ github.repository }}",
      '    steps:',
      '      - name: Check out requirement branch',
      '        uses: actions/checkout@v4',
      '        with:',
      '          fetch-depth: 0',
      '',
      '      - name: Validate requirement branch',
      '        id: requirement',
      '        env:',
      "          BRANCH_NAME: ${{ github.ref_name }}",
      '        run: |',
      "          if [[ ! \"$BRANCH_NAME\" =~ ^factory/(RQ-[0-9]+)$ ]]; then",
      '            echo "AI Factory must run from factory/RQ-<number>; got: $BRANCH_NAME"',
      '            exit 1',
      '          fi',
      '          echo "id=${BASH_REMATCH[1]}" >> "$GITHUB_OUTPUT"',
      '',
      '      - name: Set up Node.js',
      '        uses: actions/setup-node@v4',
      '        with:',
      "          node-version: '20'",
      '',
      '      - name: Set up pnpm',
      '        run: |',
      '          corepack enable',
      '          corepack prepare pnpm@9.15.9 --activate',
      '',
      '      - name: Install AI Factory and project dependencies',
      '        run: |',
      '          git clone --branch "$AIFACTORY_REF" --single-branch "$AIFACTORY_REPO_URL" ../aifactory',
      '          pnpm --dir ../aifactory install --frozen-lockfile',
      '          pnpm --dir ../aifactory -r run typecheck',
      '          if [ -f pnpm-lock.yaml ]; then',
      '            pnpm install --frozen-lockfile',
      '          elif [ -f package.json ]; then',
      '            pnpm install --no-frozen-lockfile',
      '          fi',
      '          git config user.name "AI Factory"',
      '          git config user.email "ai-factory@users.noreply.github.com"',
      '',
      '      - name: Run requirement pipeline',
      '        env:',
      "          REQUIREMENT_ID: ${{ steps.requirement.outputs.id }}",
      "          SOURCE_REF: ${{ github.sha }}",
      '        run: |',
      '          DECISION="$(pnpm --dir ../aifactory --silent factory -- --project "$GITHUB_WORKSPACE" requirement decision "$REQUIREMENT_ID")"',
      '          case "$DECISION" in',
      '            run|legacy)',
      '              MODEL_PROVIDER="$(pnpm --dir ../aifactory --silent factory -- --project "$GITHUB_WORKSPACE" model-provider)"',
      '              if [ "$MODEL_PROVIDER" = "codex-cli" ]; then',
      '                command -v codex >/dev/null 2>&1 || { echo "codex-cli provider requires Codex CLI in AIFACTORY_RUNNER_IMAGE"; exit 1; }',
      '                install -d -m 700 "$CODEX_HOME"',
      '                if [ -n "$CODEX_AUTH_JSON" ]; then',
      '                  printf \'%s\' "$CODEX_AUTH_JSON" > "$CODEX_HOME/auth.json"',
      '                  chmod 600 "$CODEX_HOME/auth.json"',
      '                elif [ -n "$OPENAI_API_KEY" ]; then',
      '                  printenv OPENAI_API_KEY | codex login --with-api-key',
      '                else',
      '                  echo "codex-cli requires the CODEX_AUTH_JSON or OPENAI_API_KEY repository secret."',
      '                  exit 1',
      '                fi',
      '                codex login status >/dev/null',
      '              fi',
      '              pnpm --dir ../aifactory factory -- --project "$GITHUB_WORKSPACE" sync-requirement "$REQUIREMENT_ID" --source-ref "$SOURCE_REF" --push',
      '              ;;',
      '            draft)',
      '              echo "$REQUIREMENT_ID is still draft; AI Factory execution is skipped."',
      '              ;;',
      '            handoff)',
      '              echo "$REQUIREMENT_ID uses handoff mode; GitHub AI Factory execution is skipped."',
      '              ;;',
      '            *)',
      '              echo "Unknown requirement execution decision: $DECISION"',
      '              exit 1',
      '              ;;',
      '          esac',
      '',
      '      - name: Upload AI Factory diagnostics',
      '        if: always()',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      "          name: " + projectName + "-ai-factory-${{ github.run_id }}-${{ github.run_attempt }}",
      '          if-no-files-found: ignore',
      '          retention-days: 7',
      '          path: |',
      '            runs/',
      '            handoffs/',
      "            requirements/${{ steps.requirement.outputs.id }}.md",
      "            requirements/${{ steps.requirement.outputs.id }}-*.md",
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeContainerFiles(projectRoot: string, projectName: string): void {
  writeFileSync(
    resolve(projectRoot, 'Dockerfile'),
    [
      'FROM nginx:1.27-alpine',
      '',
      'COPY nginx.conf /etc/nginx/conf.d/default.conf',
      'COPY release/' + projectName + '/ /usr/share/nginx/html/',
      '',
      'EXPOSE 8282',
      '',
      'HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --quiet --output-document=- http://127.0.0.1:8282/healthz || exit 1',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, 'nginx.conf'),
    [
      'server {',
      '    listen 8282;',
      '    server_name _;',
      '',
      '    root /usr/share/nginx/html;',
      '    index index.html;',
      '',
      '    location = /healthz {',
      '        access_log off;',
      '        default_type text/plain;',
      '        return 200 "ok\\n";',
      '    }',
      '',
      '    location = / {',
      '        try_files /public/index.html =404;',
      '    }',
      '',
      '    location / {',
      '        try_files $uri $uri/ =404;',
      '    }',
      '',
      '    location ~* \\.(?:css|js|svg|png|jpe?g|webp|woff2?)$ {',
      '        expires 1h;',
      '        add_header Cache-Control "public, max-age=3600";',
      '        try_files $uri =404;',
      '    }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, '.dockerignore'),
    [
      '.git',
      '.gitlab',
      '.env',
      'node_modules',
      'dist',
      'runs',
      'handoffs',
      'references',
      'requirements',
      'constraints',
      '*.md',
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeFactoryConfig(
  projectRoot: string,
  promptsPath: string,
  allowedPaths: string[],
  commands: { typeCheck?: string; lint?: string; test?: string },
): void {
  writeJson(resolve(projectRoot, 'factory.config.json'), {
    model: {
      provider: '${AI_PROVIDER}',
      name: '${AI_MODEL}',
      reviewerName: '${AI_REVIEWER_MODEL}',
      baseUrl: '${AI_BASE_URL:-}',
      apiKey: '${AI_API_KEY:-}',
      executable: '${AI_CODEX_EXECUTABLE:-codex}',
      reasoningEffort: '${AI_CODEX_REASONING_EFFORT:-medium}',
      maxTokens: 32768,
    },
    pipeline: {
      maxRetries: 3,
      timeboxMs: 180000,
      maxFixIterations: 3,
    },
    paths: {
      requirements: './requirements',
      constraints: './constraints',
      references: './references',
      runs: './runs',
      handoffs: './handoffs',
      templates: './templates',
      prompts: promptsPath,
    },
    targetProject: {
      root: '.',
      applyArtifacts: true,
      allowedPaths,
      commands,
    },
    projectGuidelines: {
      files: ['./AGENTS.md'],
      required: true,
      maxContextChars: 20000,
    },
    requirementBranches: {
      enabled: true,
      branchPrefix: 'factory/',
      baseBranch: 'main',
      remote: 'origin',
    },
    repositoryPlatforms: {
      gitlab: {
        baseUrl: '${GITLAB_URL:-}',
        projectId: '${GITLAB_PROJECT_ID:-}',
        token: '${GITLAB_TOKEN:-}',
        targetBranch: 'main',
        removeSourceBranchOnMerge: true,
        labels: {
          draft: 'factory::draft',
          ready: 'factory::ready',
          running: 'factory::running',
          needsFix: 'factory::needs-fix',
          passed: 'factory::passed',
        },
      },
      github: {
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
      },
    },
    domain: {
      rules: [],
    },
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
  });
}

function patchPackageScripts(projectRoot: string, scripts: Record<string, string>): void {
  const packageJsonPath = resolve(projectRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  packageJson.scripts = { ...(packageJson.scripts ?? {}), ...scripts };
  writeJson(packageJsonPath, packageJson);
}

function writeVanillaTsTemplate(projectRoot: string, projectName: string, tscScript: string): void {
  mkdirSync(resolve(projectRoot, 'public'), { recursive: true });
  mkdirSync(resolve(projectRoot, 'src'), { recursive: true });

  patchPackageScripts(projectRoot, {
    typecheck: tscScript + ' --noEmit',
    build: tscScript + ' --project tsconfig.build.json',
  });

  writeJson(resolve(projectRoot, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  });

  writeJson(resolve(projectRoot, 'tsconfig.build.json'), {
    extends: './tsconfig.json',
    compilerOptions: {
      noEmit: false,
      outDir: './dist',
      declaration: false,
      sourceMap: true,
    },
  });

  writeFileSync(
    resolve(projectRoot, 'public/index.html'),
    [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <title>' + projectName + '</title>',
      '  <link rel="stylesheet" href="../src/styles.css">',
      '</head>',
      '<body>',
      '  <main id="app"></main>',
      '  <script src="../dist/main.js"></script>',
      '</body>',
      '</html>',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, 'src/main.ts'),
    [
      "const app = document.getElementById('app');",
      '',
      'if (app) {',
      "  app.textContent = 'New AI Factory project: " + projectName + "';",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, 'src/styles.css'),
    ['body {', '  margin: 0;', '  font-family: Arial, Helvetica, sans-serif;', '}', ''].join('\n'),
    'utf8',
  );
}

function writePythonTemplate(projectRoot: string): void {
  mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
  mkdirSync(resolve(projectRoot, 'tests'), { recursive: true });

  patchPackageScripts(projectRoot, {
    typecheck: 'python3 -m py_compile src/main.py',
    test: 'python3 -m unittest discover -s tests',
  });
  writeFileSync(
    resolve(projectRoot, 'pyproject.toml'),
    ['[project]', 'name = "ai-factory-python-target"', 'version = "0.1.0"', 'requires-python = ">=3.11"', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    resolve(projectRoot, 'src/main.py'),
    ['def main() -> str:', '    return "New AI Factory Python project"', '', '', 'if __name__ == "__main__":', '    print(main())', ''].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, 'tests/test_main.py'),
    ['import unittest', '', 'from src.main import main', '', '', 'class MainTest(unittest.TestCase):', '    def test_main_returns_message(self):', '        self.assertIn("AI Factory", main())', '', '', 'if __name__ == "__main__":', '    unittest.main()', ''].join('\n'),
    'utf8',
  );

  writeFileSync(resolve(projectRoot, 'src/__init__.py'), '', 'utf8');
}

export function createTargetProject(projectName: string, options: NewProjectOptions): NewProjectResult {
  assertValidProjectName(projectName);
  assertValidTemplate(options.template);

  const parentDir = resolve(process.cwd(), options.dir ?? '..');
  const projectRoot = resolve(parentDir, projectName);

  if (existsSync(projectRoot) && !options.force && readdirSync(projectRoot).length > 0) {
    throw new Error('Target directory already exists and is not empty: ' + projectRoot);
  }

  const factoryRoot = resolve(__dirname, '../../..');
  const tscScript = toPackageScriptPath(projectRoot, resolve(factoryRoot, 'node_modules/.bin/tsc'));
  const promptsPath = toPackageScriptPath(projectRoot, resolve(factoryRoot, 'packages/agent-factory/prompts'));

  mkdirSync(projectRoot, { recursive: true });
  for (const dir of ['requirements', 'constraints', 'handoffs', 'runs', 'templates', 'references']) {
    mkdirSync(resolve(projectRoot, dir), { recursive: true });
  }

  writeCommonFiles(projectRoot, projectName);
  writeFileSync(
    resolve(projectRoot, 'AGENTS.md'),
    [
      '# Agent Guidelines',
      '',
      '## AI Factory Workflow',
      '',
      '- Use AI Factory lifecycle commands for requirement, branch, Issue, and Pull/Merge Request operations.',
      '- Create a requirement with `factory requirement new <title>`; do not create its requirement file, branch, Issue, or Draft Pull/Merge Request manually.',
      '- Submit a completed draft with `factory requirement submit <requirement-id>`.',
      '- Recover or synchronize repository-platform links with `factory requirement platform-sync <requirement-id>`.',
      '- Cancel a requirement with `factory requirement cancel <requirement-id>`; do not close its Pull/Merge Request or delete its branch manually.',
      '- Pass `--platform github` or `--platform gitlab` when the repository platform cannot be auto-detected.',
      '- Before running a lifecycle command, inspect `factory --help` and the relevant subcommand help for the invocation available in the current environment.',
      '',
      '## Project Guidelines',
      '',
      '- Preserve the existing project architecture and conventions.',
      '- Follow the active requirement and its acceptance criteria.',
      '- Do not make unrelated changes.',
      '- Verify implementation changes with the configured quality gates.',
      '',
    ].join('\n'),
    'utf8',
  );
  writeReferencesReadme(projectRoot);
  writeGitlabCi(projectRoot, projectName, options.template === 'vanilla-ts');
  writeGithubActions(projectRoot, projectName);

  if (options.template === 'vanilla-ts') {
    writeFactoryConfig(projectRoot, promptsPath, ['public', 'src', 'tests', 'Dockerfile', 'nginx.conf', '.dockerignore', '.gitlab-ci.yml', '.github/workflows', ...TYPESCRIPT_CONFIG_PATHS], {
      typeCheck: 'pnpm typecheck',
      test: undefined,
    });
    writeVanillaTsTemplate(projectRoot, projectName, tscScript);
    writeContainerFiles(projectRoot, projectName);
  } else if (options.template === 'python') {
    writeFactoryConfig(projectRoot, promptsPath, ['src', 'tests'], {
      typeCheck: 'pnpm typecheck',
      test: 'pnpm test',
    });
    writePythonTemplate(projectRoot);
  } else {
    writeFactoryConfig(projectRoot, promptsPath, [], {});
  }

  writeFileSync(resolve(projectRoot, 'requirements/.gitkeep'), '', 'utf8');
  writeFileSync(resolve(projectRoot, 'constraints/.gitkeep'), '', 'utf8');
  writeFileSync(resolve(projectRoot, 'handoffs/.gitkeep'), '', 'utf8');
  writeFileSync(resolve(projectRoot, 'runs/.gitkeep'), '', 'utf8');
  writeFileSync(resolve(projectRoot, 'templates/.gitkeep'), '', 'utf8');

  return { projectName, projectRoot, template: options.template };
}
