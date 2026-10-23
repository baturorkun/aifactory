// RQ-0089: a vanilla-ts project takes aifactory's template changes as an
// embedded one does: the lock, the three-way merge, overrides, the check, and
// a merge request. A project from before profiles (website) is known by its
// layout and gets the profile.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ChangeRequest, RepositoryPlatformAdapter } from './repository-platform/types';
import { createTargetProject } from './scaffold';
import { deliverTemplateUpdate, runProjectCheck } from './template-delivery';
import { LOCK_PATH, contentHash, readLock, templateStatus, writeOverrides } from './template-lock';
import { updateTemplateProject } from './template-update';

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const RELEASE = 'scripts/release.sh';

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENTITY } });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

// A vanilla-ts project from this template, committed on main.
function project(work = mkdtempSync(join(tmpdir(), 'vanilla-sync-'))) {
  const { projectRoot: root } = createTargetProject('shop', { dir: work, template: 'vanilla-ts' });
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'start');
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const write = (path: string, text: string) => writeFileSync(join(root, path), text);
  const commit = (message: string) => {
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', message);
  };
  // What an older template delivered: the file and its lock entry, as one update.
  const olderTemplate = (path: string, text: string) => {
    write(path, text);
    const lock = JSON.parse(read(LOCK_PATH));
    lock.files[path] = contentHash(path, Buffer.from(text));
    write(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
    commit('chore(template): the aifactory vanilla-ts template at 0000000');
  };
  const config = () => JSON.parse(read('factory.config.json')) as { targetProject: Record<string, unknown> & { commands: Record<string, string> } };
  return { work, root, read, write, commit, olderTemplate, config, done: () => rmSync(work, { recursive: true, force: true }) };
}

const kinds = (changes: ReturnType<typeof updateTemplateProject>) => changes.map((change) => `${change.kind} ${change.path}`);

test('a new vanilla-ts project has its lock, the check and its CI job, and is on the template', () => {
  const p = project();
  try {
    const lock = readLock(p.root);
    for (const path of ['scripts/deploy.sh', 'scripts/release.sh', 'scripts/ci-remote-tools.sh', 'scripts/template-check.mjs', 'tests/deploy.test.sh',
      'deploy/README.md', 'Dockerfile', 'nginx.conf', '.dockerignore', '.gitlab-ci.yml', '.env.example', 'AGENTS.md']) {
      assert.equal(lock?.files[path], contentHash(path, readFileSync(join(p.root, path))), path);
    }
    for (const path of ['deploy/branch.env', 'package.json', 'factory.config.json', '.gitignore', 'src/main.ts', 'public/index.html']) {
      assert.equal(lock?.files[path], undefined, `${path} is not the template's to lock`);
    }
    assert.equal(p.config().targetProject.profile, 'vanilla-typescript');
    assert.equal(p.config().targetProject.commands.templateCheck, 'pnpm template:check');
    const pkg = JSON.parse(p.read('package.json')) as { scripts: Record<string, string> };
    assert.equal(pkg.scripts['template:check'], 'node scripts/template-check.mjs');
    assert.equal(pkg.scripts.factory, 'node ../aifactory/packages/agent-factory/bin/factory.js');
    assert.match(p.read('.gitlab-ci.yml'), /^template_check:\n {2}stage: build\n[\s\S]*?- node scripts\/template-check\.mjs --strict\n {2}rules:\n {4}- if: '\$CI_PIPELINE_SOURCE == "merge_request_event"'/m);
    assert.match(p.read('AGENTS.md'), /The aifactory template owns `scripts\/`/);
    const check = spawnSync(process.execPath, ['scripts/template-check.mjs', '--strict'], { cwd: p.root, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stdout + check.stderr);
    assert.deepEqual(updateTemplateProject(p.root), [], 'a new project is on the template');
  } finally {
    p.done();
  }
});

test('vanilla-ts update: replaced when only the template moved, kept when only the project did', () => {
  const p = project();
  try {
    const template = p.read(RELEASE);
    p.olderTemplate(RELEASE, template.replace(/^/, '# OLD TEMPLATE\n'));
    const nginx = p.read('nginx.conf') + '\n# the project\'s own cache rules\n';
    p.write('nginx.conf', nginx);
    p.commit('a project change');
    assert.deepEqual(kinds(updateTemplateProject(p.root, { write: true })), [`replace ${RELEASE}`, 'kept nginx.conf', `replace ${LOCK_PATH}`]);
    assert.equal(p.read(RELEASE), template);
    assert.equal(p.read('nginx.conf'), nginx, 'never overwritten');
  } finally {
    p.done();
  }
});

test('vanilla-ts update: merged when both changed apart, conflict when on the same line', () => {
  const p = project();
  try {
    const template = p.read(RELEASE);
    p.olderTemplate(RELEASE, template.replace('echo "release: $RELEASE"', 'echo "old release: $RELEASE"'));
    p.write(RELEASE, p.read(RELEASE).replace('#!/bin/sh\n', '#!/bin/sh\n# the project\'s note\n'));
    p.commit('a project change');
    assert.deepEqual(kinds(updateTemplateProject(p.root, { write: true })), [`merged ${RELEASE}`, `replace ${LOCK_PATH}`]);
    assert.match(p.read(RELEASE), /# the project's note/);
    assert.match(p.read(RELEASE), /^echo "release: \$RELEASE"$/m);
    p.commit('merged');

    const q = project();
    try {
      q.olderTemplate(RELEASE, q.read(RELEASE).replace('echo "release: $RELEASE"', 'echo "old release: $RELEASE"'));
      q.write(RELEASE, q.read(RELEASE).replace('echo "old release: $RELEASE"', 'echo "the project\'s release: $RELEASE"'));
      q.commit('a project change on the same line');
      assert.deepEqual(kinds(updateTemplateProject(q.root, { write: true })), [`conflict ${RELEASE}`, `replace ${LOCK_PATH}`]);
      assert.match(q.read(RELEASE), /^<{7} project$[\s\S]*^>{7} template$/m);
    } finally {
      q.done();
    }
  } finally {
    p.done();
  }
});

test('vanilla-ts update: the branch profile and main\'s profile are the project\'s; scripts and gates merge; an override stays', () => {
  const p = project();
  try {
    p.write('deploy/branch.env', p.read('deploy/branch.env').replace('DEPLOY_BRANCH_PORT_BASE=8100', 'DEPLOY_BRANCH_PORT_BASE=8300'));
    p.write('deploy/main.env', 'DEPLOY_TARGET=directory\nDEPLOY_ACCESS=remote\n');
    const pkg = JSON.parse(p.read('package.json'));
    delete pkg.scripts['template:check'];
    p.write('package.json', JSON.stringify(pkg, null, 2) + '\n');
    const config = p.config();
    delete config.targetProject.commands.templateCheck;
    p.write('factory.config.json', JSON.stringify(config, null, 2) + '\n');
    p.write('Dockerfile', p.read('Dockerfile') + 'LABEL owner=shop\n');
    writeOverrides(p.root, { Dockerfile: { reason: 'our label' } });
    p.commit('project settings');

    const changes = updateTemplateProject(p.root, { write: true });
    assert.ok(!changes.some((change) => change.path.startsWith('deploy/')), 'deploy/*.env untouched');
    assert.match(p.read('deploy/branch.env'), /^DEPLOY_BRANCH_PORT_BASE=8300$/m);
    assert.deepEqual(changes.filter((change) => change.kind === 'merge').map((change) => `${change.path}: ${'detail' in change ? change.detail : ''}`), [
      'factory.config.json: commands.templateCheck',
      'package.json: scripts.template:check',
    ]);
    assert.ok(changes.some((change) => change.kind === 'kept' && change.path === 'Dockerfile'));
    assert.match(p.read('Dockerfile'), /LABEL owner=shop/);
    assert.deepEqual(templateStatus(p.root).files.filter((file) => file.state !== 'in sync').map((file) => `${file.state} ${file.path}`), ['overridden Dockerfile']);
  } finally {
    p.done();
  }
});

test('a project without a profile laid out like website is taken as vanilla-ts and gets the profile; another is refused', () => {
  const p = project();
  try {
    const config = p.config();
    delete config.targetProject.profile;
    p.write('factory.config.json', JSON.stringify(config, null, 2) + '\n');
    unlinkSync(join(p.root, LOCK_PATH));
    p.commit('a project from before profiles');
    const changes = updateTemplateProject(p.root, { write: true });
    assert.ok(changes.some((change) => change.kind === 'merge' && change.path === 'factory.config.json' && change.detail.includes('profile "vanilla-typescript"')), JSON.stringify(changes));
    assert.equal(p.config().targetProject.profile, 'vanilla-typescript');
    assert.ok(existsSync(join(p.root, LOCK_PATH)), 'the lock is written');

    const config2 = p.config();
    delete config2.targetProject.profile;
    p.write('factory.config.json', JSON.stringify(config2, null, 2) + '\n');
    unlinkSync(join(p.root, 'Dockerfile'));
    assert.throws(() => updateTemplateProject(p.root), /template update applies to a project of profile "embedded" or "vanilla-typescript" or "python-service" \(targetProject\.profile is not set\)/);
  } finally {
    p.done();
  }
});

test('delivery opens a merge request named for the vanilla-ts template, with the deploy test as its check', async () => {
  const work = mkdtempSync(join(tmpdir(), 'vanilla-delivery-'));
  try {
    const aifactory = join(work, 'aifactory');
    git(work, 'init', '-q', '--bare', '-b', 'main', `${aifactory}.git`);
    git(work, 'clone', '-q', `${aifactory}.git`, aifactory);
    writeFileSync(join(aifactory, 'README.md'), 'aifactory\n');
    git(aifactory, 'add', '-A');
    git(aifactory, 'commit', '-q', '-m', 'aifactory');
    const p = project(work);
    git(work, 'init', '-q', '--bare', '-b', 'main', join(work, 'shop.git'));
    git(p.root, 'remote', 'add', 'origin', join(work, 'shop.git'));
    p.olderTemplate(RELEASE, p.read(RELEASE).replace(/^/, '# OLD TEMPLATE\n'));
    git(p.root, 'push', '-q', '-u', 'origin', 'main');

    const calls: { title?: string; description?: string } = {};
    const adapter = {
      provider: 'gitlab',
      targetBranch: 'main',
      async createDraftChangeRequest(input: { title: string; description: string; sourceBranch: string; targetBranch: string }) {
        Object.assign(calls, input);
        return { iid: 3, title: `Draft: ${input.title}`, url: 'http://gitlab/shop/-/merge_requests/3', state: 'opened', sourceBranch: input.sourceBranch, targetBranch: input.targetBranch };
      },
      async markChangeRequestReady(changeRequest: ChangeRequest) {
        return changeRequest;
      },
    } as unknown as RepositoryPlatformAdapter;
    const result = await deliverTemplateUpdate(p.root, { aifactoryRoot: aifactory, adapter, check: runProjectCheck });
    assert.equal(result.status, 'opened');
    assert.deepEqual(result.changes, [{ kind: 'replace', path: RELEASE }, { kind: 'replace', path: LOCK_PATH }]);
    assert.match(git(p.root, 'log', '-1', '--format=%B', `origin/${result.branch}`), /chore\(template\): the aifactory vanilla-ts template at/);
    assert.match(calls.description ?? '', /^The vanilla-ts template of aifactory at/);
    assert.match(calls.description ?? '', /`src\/`, `public\/`, `deploy\/\*\.env`/);
    assert.equal(git(p.root, 'branch', '--show-current'), 'main');

    // A failing deploy test pushes nothing.
    git(p.root, 'push', '-q', 'origin', '--delete', result.branch ?? '');
    p.write('tests/deploy.test.sh', '#!/bin/sh\nexit 3\n');
    p.commit('a broken test');
    git(p.root, 'push', '-q', 'origin', 'main');
    await assert.rejects(deliverTemplateUpdate(p.root, { aifactoryRoot: aifactory, adapter, check: runProjectCheck }), /The deploy test fails with the new template|nothing was pushed/);
    assert.equal(git(p.root, 'ls-remote', '--heads', 'origin', 'template/*'), '', 'nothing pushed');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('a file the project grew before it took updates is kept, its template version the next base; the tsc scripts stay the project\'s', () => {
  const work = mkdtempSync(join(tmpdir(), 'vanilla-grown-'));
  try {
    // Like website: no lock, no profile, nginx.conf added after the first commit, its own tsc path.
    const { projectRoot: root } = createTargetProject('shop', { dir: work, template: 'vanilla-ts' });
    const nginx = readFileSync(join(root, 'nginx.conf'), 'utf8');
    unlinkSync(join(root, 'nginx.conf'));
    unlinkSync(join(root, LOCK_PATH));
    const config = JSON.parse(readFileSync(join(root, 'factory.config.json'), 'utf8'));
    delete config.targetProject.profile;
    writeFileSync(join(root, 'factory.config.json'), JSON.stringify(config, null, 2) + '\n');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    pkg.scripts.typecheck = '../aifactory/node_modules/.bin/tsc --noEmit';
    pkg.scripts.build = '../aifactory/node_modules/.bin/tsc --project tsconfig.build.json';
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'Initial commit');
    const own = nginx + '\n# no-cache rules of the project\n';
    writeFileSync(join(root, 'nginx.conf'), own);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'its own nginx.conf');

    const changes = updateTemplateProject(root, { write: true });
    assert.ok(changes.some((change) => change.kind === 'kept' && change.path === 'nginx.conf'), JSON.stringify(changes));
    assert.equal(readFileSync(join(root, 'nginx.conf'), 'utf8'), own, 'never overwritten');
    assert.equal(readFileSync(join(root, '.factory/template-base/nginx.conf'), 'utf8'), nginx, 'the template\'s version is the next base');
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts as Record<string, string>;
    assert.equal(scripts.typecheck, '../aifactory/node_modules/.bin/tsc --noEmit');
    assert.equal(scripts.build, '../aifactory/node_modules/.bin/tsc --project tsconfig.build.json');
    assert.equal(scripts['template:check'], 'node scripts/template-check.mjs');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
