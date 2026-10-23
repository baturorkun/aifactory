// RQ-0090: a Python service deployed as its compose stack takes aifactory's
// template as vanilla-ts does: the lock, the three-way merge, the check and a
// pull request. A project older than the template (NetForgeSH: no
// package.json, its own AGENTS.md, .env.example, compose files and CI) gets
// only the deploy files and keeps all of its own.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import type { ChangeRequest, RepositoryPlatformAdapter } from './repository-platform/types';
import { createTargetProject } from './scaffold';
import { deliverTemplateUpdate, runProjectCheck } from './template-delivery';
import { LOCK_PATH, contentHash, readLock } from './template-lock';
import { updateTemplateProject } from './template-update';

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const TEMPLATES = resolve(__dirname, '../templates');
const OWNED = ['scripts/deploy.sh', 'scripts/template-check.mjs', 'tests/deploy.test.sh', 'deploy/README.md', 'deploy/dev.env.example', '.github/workflows/deploy.yml'];

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENTITY } });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

const kinds = (changes: ReturnType<typeof updateTemplateProject>) => changes.map((change) => `${change.kind} ${change.path}`);

test('deploy.sh is one script: byte-identical in vanilla-ts and python-service', () => {
  assert.equal(readFileSync(join(TEMPLATES, 'python-service/scripts/deploy.sh'), 'utf8'), readFileSync(join(TEMPLATES, 'vanilla-ts/scripts/deploy.sh'), 'utf8'));
  assert.equal(readFileSync(join(TEMPLATES, 'python-service/scripts/template-check.mjs'), 'utf8'), readFileSync(join(TEMPLATES, 'vanilla-ts/scripts/template-check.mjs'), 'utf8'));
});

test('a new python-service project: its lock, its gates, no deploy path for an agent, and on the template', () => {
  const work = mkdtempSync(join(tmpdir(), 'python-service-'));
  try {
    const { projectRoot: root } = createTargetProject('svc', { dir: work, template: 'python-service' });
    const read = (path: string) => readFileSync(join(root, path), 'utf8');
    const lock = readLock(root);
    for (const path of OWNED) assert.equal(lock?.files[path], contentHash(path, readFileSync(join(root, path))), path);
    for (const path of ['AGENTS.md', '.env.example', 'compose.yml', 'Dockerfile', 'pyproject.toml', 'deploy/branch.env', 'package.json', '.gitlab-ci.yml']) {
      assert.equal(lock?.files[path], undefined, `${path} is not the template's to lock`);
    }
    const config = JSON.parse(read('factory.config.json')) as { targetProject: { profile: string; allowedPaths: string[]; commands: Record<string, string> } };
    assert.equal(config.targetProject.profile, 'python-service');
    assert.equal(config.targetProject.commands.templateCheck, 'node scripts/template-check.mjs');
    assert.ok(!config.targetProject.allowedPaths.some((path) => path.startsWith('deploy') || path.startsWith('.github')), config.targetProject.allowedPaths.join(', '));
    assert.match(read('AGENTS.md'), /An agent does not read or write them, and does not deploy/);
    assert.match(read('pyproject.toml'), /^name = "svc"$/m);
    assert.match(read('compose.yml'), /\$\{APP_PORT:-8000\}:8000/);
    const check = spawnSync(process.execPath, ['scripts/template-check.mjs', '--strict'], { cwd: root, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stdout + check.stderr);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'start');
    assert.deepEqual(updateTemplateProject(root), [], 'a new project is on the template');
    // The template's deploy test passes in the project it was delivered to.
    const tested = spawnSync('sh', ['tests/deploy.test.sh'], { cwd: root, encoding: 'utf8' });
    assert.equal(tested.status, 0, tested.stdout + tested.stderr);
    assert.match(tested.stdout, /all compose deploy tests passed/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// Like NetForgeSH: a Python service made before templates, on GitHub.
function legacyService(work: string, ownDeploy = false): string {
  const root = join(work, 'netsvc');
  const files: Record<string, string> = {
    'pyproject.toml': '[project]\nname = "netsvc"\nversion = "0.1.0"\n',
    'AGENTS.md': '# netsvc\n\nThe project\'s own guidance.\n',
    '.env.example': 'APP_SECRET=\n',
    'compose.yml': 'services: {app: {build: .}}\n',
    Dockerfile: 'FROM python:3.13-slim\n',
    '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs: {}\n',
    'frontend/package.json': '{"name": "netsvc-frontend"}\n',
    '.gitignore': '.env\n',
    'factory.config.json': JSON.stringify({
      targetProject: { root: '.', profile: 'python-service', allowedPaths: ['src', 'tests'], commands: { typeCheck: 'mypy', lint: 'ruff check .', test: 'pytest' } },
      requirementDefaults: {},
    }, null, 2) + '\n',
  };
  if (ownDeploy) files['scripts/deploy.sh'] = '#!/bin/sh\necho "the project\'s old deploy"\n';
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'Initial commit');
  return root;
}

test('a Python service older than the template takes only the deploy files and keeps its own', () => {
  const work = mkdtempSync(join(tmpdir(), 'python-legacy-'));
  try {
    const root = legacyService(work, true);
    const before = Object.fromEntries(['AGENTS.md', '.env.example', 'compose.yml', 'Dockerfile', '.github/workflows/ci.yml', 'scripts/deploy.sh'].map((path) => [path, readFileSync(join(root, path), 'utf8')]));
    const changes = kinds(updateTemplateProject(root, { write: true }));
    for (const path of ['scripts/template-check.mjs', 'tests/deploy.test.sh', 'deploy/README.md', 'deploy/dev.env.example', '.github/workflows/deploy.yml', 'deploy/branch.env', LOCK_PATH]) {
      assert.ok(changes.includes(`add ${path}`), `${path} added: ${changes.join(', ')}`);
    }
    // A differing file with no known base is the project's: kept, the template's version the next base.
    assert.ok(changes.includes('kept scripts/deploy.sh'), changes.join(', '));
    assert.ok(existsSync(join(root, '.factory/template-base/scripts/deploy.sh')));
    for (const [path, text] of Object.entries(before)) assert.equal(readFileSync(join(root, path), 'utf8'), text, `${path} untouched`);
    assert.ok(!existsSync(join(root, 'package.json')), 'no package.json is made');
    const config = JSON.parse(readFileSync(join(root, 'factory.config.json'), 'utf8')) as { targetProject: { commands: Record<string, string>; allowedPaths: string[] } };
    assert.deepEqual(config.targetProject.commands, { typeCheck: 'mypy', lint: 'ruff check .', test: 'pytest', templateCheck: 'node scripts/template-check.mjs' });
    assert.ok(!config.targetProject.allowedPaths.some((path) => path.startsWith('deploy')));
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'chore(template): the aifactory python-service template at 0000000');
    assert.deepEqual(kinds(updateTemplateProject(root)), ['kept scripts/deploy.sh'], 'the second update only keeps the project\'s file');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('the deploy workflow: main on a push, a release on its tag, a branch by hand, keys from secrets, nothing GitLab', () => {
  const workflow = readFileSync(join(TEMPLATES, 'python-service/.github/workflows/deploy.yml'), 'utf8');
  for (const job of ['main', 'branch', 'release']) assert.match(workflow, new RegExp(`^  ${job}:$`, 'm'), job);
  assert.match(workflow, /^ {2}push:\n {4}branches: \[main\]\n {4}tags: \['v\*'\]$/m);
  // RQ-0091: the tag's push deploys the release, on its own runner when one is named.
  const release = workflow.slice(workflow.indexOf('\n  release:'));
  assert.match(release, /github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)/);
  assert.match(release, /runs-on: \$\{\{ fromJSON\(vars\.DEPLOY_RELEASE_RUNS_ON \|\| vars\.DEPLOY_RUNS_ON \|\| '\["self-hosted"\]'\) \}\}/);
  assert.match(release, /\[ "\$BY_TAG" = true \] && exit 0 \|\| exit 1/);
  // A tag's push is not main's.
  assert.match(workflow, /github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/heads\/'\) && github\.ref_name == github\.event\.repository\.default_branch/);
  assert.match(workflow, /^ {2}delete:$/m);
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.match(workflow, /^ {4}environment: release$/m);
  assert.match(workflow, /runs-on: \$\{\{ fromJSON\(vars\.DEPLOY_RUNS_ON \|\| '\["self-hosted"\]'\) \}\}/);
  assert.match(workflow, /IDENTITY: \$\{\{ secrets\.DEPLOY_REMOTE_IDENTITY \}\}/);
  assert.match(workflow, /trap 'rm -rf "\$keys"' EXIT/);
  assert.match(workflow, /sh scripts\/deploy\.sh --profile main/);
  assert.match(workflow, /grep -qx 'DEPLOY_ACCESS=local' deploy\/branch\.env/);
  // The branch job never gets a key.
  const branch = workflow.slice(workflow.indexOf('\n  branch:'), workflow.indexOf('\n  release:'));
  assert.doesNotMatch(branch, /secrets\./);
  assert.doesNotMatch(workflow, /\bapk\b|CI_COMMIT|CI_PIPELINE/);
  for (const name of ['DEPLOY_BRANCH', 'DEPLOY_DEFAULT_BRANCH', 'DEPLOY_RUN_ID']) assert.match(workflow, new RegExp(`${name}: \\$\\{\\{`), name);
});

test('delivery to GitHub: a pull request named for python-service, checked with its deploy test', async () => {
  const work = mkdtempSync(join(tmpdir(), 'python-delivery-'));
  try {
    const aifactory = join(work, 'aifactory');
    git(work, 'init', '-q', '--bare', '-b', 'main', `${aifactory}.git`);
    git(work, 'clone', '-q', `${aifactory}.git`, aifactory);
    writeFileSync(join(aifactory, 'README.md'), 'aifactory\n');
    git(aifactory, 'add', '-A');
    git(aifactory, 'commit', '-q', '-m', 'aifactory');
    git(aifactory, 'push', '-q', 'origin', 'main');
    const root = legacyService(work);
    git(work, 'init', '-q', '--bare', '-b', 'main', join(work, 'netsvc.git'));
    git(root, 'remote', 'add', 'origin', join(work, 'netsvc.git'));
    git(root, 'push', '-q', '-u', 'origin', 'main');

    const calls: { title?: string; description?: string } = {};
    const adapter = {
      provider: 'github',
      targetBranch: 'main',
      async createDraftChangeRequest(input: { title: string; description: string; sourceBranch: string; targetBranch: string }) {
        Object.assign(calls, input);
        return { iid: 7, title: input.title, url: 'https://github.com/o/netsvc/pull/7', state: 'open', sourceBranch: input.sourceBranch, targetBranch: input.targetBranch };
      },
      async markChangeRequestReady(changeRequest: ChangeRequest) {
        return changeRequest;
      },
    } as unknown as RepositoryPlatformAdapter;
    const result = await deliverTemplateUpdate(root, { aifactoryRoot: aifactory, adapter, check: runProjectCheck });
    assert.equal(result.status, 'opened');
    assert.match(git(root, 'log', '-1', '--format=%B', `origin/${result.branch}`), /chore\(template\): the aifactory python-service template at/);
    assert.match(calls.description ?? '', /^The python-service template of aifactory at/);
    assert.match(calls.description ?? '', /`AGENTS\.md`, `\.env\.example`, compose files, `Dockerfile`, the project's own CI, `deploy\/\*\.env`/);
    assert.equal(git(root, 'branch', '--show-current'), 'main');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
