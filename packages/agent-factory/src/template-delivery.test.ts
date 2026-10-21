import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTargetProject } from './scaffold';
import { bringMainUpToDate, deliverTemplateUpdate, runProjectCheck, TemplateDeliveryError, updateAifactory } from './template-delivery';
import type { ChangeRequest, RepositoryPlatformAdapter } from './repository-platform/types';

// RQ-0069: template update delivers the current template as a merge
// request, from a clean, current main only. Real Git repositories with a bare
// origin each; the merge request platform is a fake that records its calls.

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENTITY } });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

// A checkout of `name` with a bare origin, `files` committed on main and pushed.
function repository(work: string, name: string, fill: (root: string) => void) {
  const origin = join(work, `${name}.git`);
  const root = join(work, name);
  git(work, 'init', '-q', '--bare', '-b', 'main', origin);
  git(work, 'clone', '-q', origin, root);
  fill(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'start');
  git(root, 'push', '-q', 'origin', 'main');
  return { origin, root };
}

function fakePlatform() {
  const calls: { draft?: { title: string; description: string; sourceBranch: string; targetBranch: string }; ready?: ChangeRequest } = {};
  const adapter = {
    provider: 'gitlab',
    targetBranch: 'main',
    async createDraftChangeRequest(input: { title: string; description: string; sourceBranch: string; targetBranch: string }) {
      calls.draft = input;
      return { iid: 8, title: `Draft: ${input.title}`, url: 'http://gitlab/agentic/fw/-/merge_requests/8', state: 'opened', sourceBranch: input.sourceBranch, targetBranch: input.targetBranch };
    },
    async markChangeRequestReady(changeRequest: ChangeRequest) {
      calls.ready = changeRequest;
      return { ...changeRequest, title: changeRequest.title.replace(/^Draft: /, '') };
    },
  } as unknown as RepositoryPlatformAdapter;
  return { adapter, calls };
}

function setup() {
  const work = mkdtempSync(join(tmpdir(), 'template-delivery-'));
  const aifactory = repository(work, 'aifactory', (root) => writeFileSync(join(root, 'README.md'), 'aifactory\n'));
  // An embedded project made from this template, then one template file made old.
  const project = repository(work, 'fw', (root) => {
    rmSync(root, { recursive: true, force: true });
    createTargetProject('fw', { dir: work, template: 'embedded', labInventoryPath: join(work, 'none.json') });
    git(work, 'init', '-q', '-b', 'main', root);
    git(root, 'remote', 'add', 'origin', join(work, 'fw.git'));
  });
  appendFileSync(join(project.root, 'scripts/flow.mjs'), '\n// OLD-TEMPLATE-MARKER\n');
  git(project.root, 'commit', '-q', '-am', 'older template');
  git(project.root, 'push', '-q', 'origin', 'main');
  return { work, aifactory, project, done: () => rmSync(work, { recursive: true, force: true }) };
}

test('template update opens a merge request with the template-owned changes and leaves the project on a clean main', async () => {
  const { aifactory, project, done } = setup();
  try {
    const { adapter, calls } = fakePlatform();
    const mainBefore = git(project.root, 'rev-parse', 'HEAD');
    const checked: string[] = [];
    const result = await deliverTemplateUpdate(project.root, { aifactoryRoot: aifactory.root, adapter, check: (root) => checked.push(git(root, 'branch', '--show-current')) });

    const commit = git(aifactory.root, 'rev-parse', '--short=7', 'HEAD');
    assert.equal(result.status, 'opened');
    assert.equal(result.branch, `template/aifactory-${commit}`);
    assert.equal(result.url, 'http://gitlab/agentic/fw/-/merge_requests/8');
    assert.deepEqual(result.changes, [{ kind: 'replace', path: 'scripts/flow.mjs' }]);
    assert.deepEqual(checked, [result.branch], 'the check runs on the branch, with the new files');
    assert.equal(calls.draft?.sourceBranch, result.branch);
    assert.equal(calls.draft?.targetBranch, 'main');
    assert.match(calls.draft?.title ?? '', new RegExp(`aifactory template update \\(${commit}\\)`));
    assert.match(calls.draft?.description ?? '', /- replace scripts\/flow\.mjs/);
    assert.ok(calls.ready, 'the merge request is opened ready, not as a draft');

    // On origin: the branch with the template's file; main untouched.
    const pushed = git(project.root, 'show', `origin/${result.branch}:scripts/flow.mjs`);
    assert.doesNotMatch(pushed, /OLD-TEMPLATE-MARKER/);
    assert.match(git(project.root, 'log', '-1', '--format=%B', `origin/${result.branch}`), /chore\(template\): the aifactory embedded template at/);
    assert.equal(git(project.root, 'rev-parse', 'origin/main'), mainBefore);
    // Here: back on main, clean, the old file still in place, no local branch left.
    assert.equal(git(project.root, 'branch', '--show-current'), 'main');
    assert.equal(git(project.root, 'status', '--porcelain'), '');
    assert.match(readFileSync(join(project.root, 'scripts/flow.mjs'), 'utf8'), /OLD-TEMPLATE-MARKER/);
    assert.equal(git(project.root, 'branch', '--list', 'template/*'), '');

    // A second run while that merge request is open opens none.
    await assert.rejects(deliverTemplateUpdate(project.root, { aifactoryRoot: aifactory.root, adapter }), /A template update is already open on template\/aifactory-/);
  } finally {
    done();
  }
});

test('template update touches nothing unless the project is on a clean main that is not ahead of origin', async () => {
  const { aifactory, project, work, done } = setup();
  try {
    const { adapter, calls } = fakePlatform();
    const deliver = () => deliverTemplateUpdate(project.root, { aifactoryRoot: aifactory.root, adapter });

    writeFileSync(join(project.root, 'notes.txt'), 'mine\n');
    await assert.rejects(deliver(), /The project has 1 uncommitted change\(s\) \(notes\.txt\): commit or stash them first/);
    rmSync(join(project.root, 'notes.txt'));

    git(project.root, 'checkout', '-q', '-b', 'factory/RQ-0012');
    await assert.rejects(deliver(), /The project is on factory\/RQ-0012, not main: switch to main first/);
    git(project.root, 'checkout', '-q', 'main');

    writeFileSync(join(project.root, 'local.txt'), 'x\n');
    git(project.root, 'add', 'local.txt');
    git(project.root, 'commit', '-q', '-m', 'not pushed');
    await assert.rejects(deliver(), /The project's main has commits origin\/main does not/);
    git(project.root, 'reset', '-q', '--hard', 'origin/main');
    assert.equal(calls.draft, undefined, 'no merge request so far');

    // Behind origin: brought up to date first, then delivered.
    const other = join(work, 'fw-other');
    git(work, 'clone', '-q', join(work, 'fw.git'), other);
    writeFileSync(join(other, 'designs/README-team.md'), 'a teammate\'s commit\n');
    git(other, 'add', '-A');
    git(other, 'commit', '-q', '-m', 'teammate');
    git(other, 'push', '-q', 'origin', 'main');
    const result = await deliver();
    assert.equal(result.status, 'opened');
    assert.equal(readFileSync(join(project.root, 'designs/README-team.md'), 'utf8'), 'a teammate\'s commit\n', 'main was fast-forwarded');
  } finally {
    done();
  }
});

test('a project already on the template gets no branch and no merge request', async () => {
  const { aifactory, project, done } = setup();
  try {
    git(project.root, 'checkout', '-q', 'HEAD~1', '--', 'scripts/flow.mjs');
    git(project.root, 'commit', '-q', '-m', 'current template');
    git(project.root, 'push', '-q', 'origin', 'main');
    const { adapter, calls } = fakePlatform();
    const result = await deliverTemplateUpdate(project.root, { aifactoryRoot: aifactory.root, adapter });
    assert.deepEqual(result, { status: 'current', changes: [] });
    assert.equal(calls.draft, undefined);
    assert.equal(git(project.root, 'ls-remote', '--heads', 'origin', 'template/*'), '');
  } finally {
    done();
  }
});

test('a project checked out with CRLF line endings (Windows core.autocrlf) is current, not changed', async () => {
  // RQ-0075: on Kaan's PC the update saw three files as changed only by
  // their line endings, wrote them, and found nothing to commit.
  const { aifactory, project, done } = setup();
  try {
    git(project.root, 'checkout', '-q', 'HEAD~1', '--', 'scripts/flow.mjs');
    git(project.root, 'commit', '-q', '-m', 'current template');
    git(project.root, 'push', '-q', 'origin', 'main');
    git(project.root, 'config', 'core.autocrlf', 'true');
    for (const path of ['scripts/flow.mjs', 'scripts/vivado-host.mjs', '.gitlab-ci.yml']) rmSync(join(project.root, path));
    git(project.root, 'checkout', '-q', '--', '.');
    // Before the template's .gitattributes (RQ-0075) a checkout like this got CRLF.
    rmSync(join(project.root, '.gitattributes'));
    git(project.root, 'commit', '-q', '-am', 'a project from before .gitattributes');
    git(project.root, 'push', '-q', 'origin', 'main');
    for (const path of ['scripts/flow.mjs', 'scripts/vivado-host.mjs', '.gitlab-ci.yml']) rmSync(join(project.root, path));
    git(project.root, 'checkout', '-q', '--', '.');
    assert.match(readFileSync(join(project.root, 'scripts/flow.mjs'), 'utf8'), /\r\n/, 'checked out with CRLF');
    const { adapter, calls } = fakePlatform();
    const result = await deliverTemplateUpdate(project.root, { aifactoryRoot: aifactory.root, adapter });
    assert.deepEqual(result.changes, [{ kind: 'add', path: '.gitattributes' }], 'the CRLF files are no change; .gitattributes comes');
    assert.equal(calls.draft?.sourceBranch, result.branch);
    assert.equal(git(project.root, 'branch', '--show-current'), 'main');
    // With it, a checkout on that machine is LF.
    git(project.root, 'merge', '-q', `origin/${result.branch}`);
    for (const path of ['scripts/flow.mjs']) rmSync(join(project.root, path));
    git(project.root, 'checkout', '-q', '--', '.');
    assert.doesNotMatch(readFileSync(join(project.root, 'scripts/flow.mjs'), 'utf8'), /\r\n/, 'LF though core.autocrlf is true');
  } finally {
    done();
  }
});

test('a failing check pushes nothing and leaves the project as it was', async () => {
  const { aifactory, project, done } = setup();
  try {
    const { adapter, calls } = fakePlatform();
    await assert.rejects(deliverTemplateUpdate(project.root, {
      aifactoryRoot: aifactory.root,
      adapter,
      check: () => { throw new TemplateDeliveryError('pnpm check fails with the new template; nothing was pushed.'); },
    }), /pnpm check fails/);
    assert.equal(calls.draft, undefined);
    assert.equal(git(project.root, 'ls-remote', '--heads', 'origin', 'template/*'), '');
    assert.equal(git(project.root, 'branch', '--show-current'), 'main');
    assert.equal(git(project.root, 'status', '--porcelain'), '');
    assert.equal(git(project.root, 'branch', '--list', 'template/*'), '');
  } finally {
    done();
  }
});

test('aifactory brings itself up to date from a clean main, and says whether anything moved', () => {
  const { aifactory, work, done } = setup();
  try {
    assert.equal(updateAifactory(aifactory.root), false, 'already current');
    const other = join(work, 'aifactory-other');
    git(work, 'clone', '-q', aifactory.origin, other);
    writeFileSync(join(other, 'CHANGELOG.md'), 'RQ-0070\n');
    git(other, 'add', '-A');
    git(other, 'commit', '-q', '-m', 'RQ-0070');
    git(other, 'push', '-q', 'origin', 'main');
    const lines: string[] = [];
    assert.equal(updateAifactory(aifactory.root, (line) => lines.push(line)), true);
    assert.equal(readFileSync(join(aifactory.root, 'CHANGELOG.md'), 'utf8'), 'RQ-0070\n');
    assert.match(lines[0], /^aifactory: [0-9a-f]{7} → [0-9a-f]{7}$/);
    assert.ok(!lines.some((line) => /pnpm install/.test(line)), 'the lockfile did not move');

    git(aifactory.root, 'checkout', '-q', '-b', 'factory/RQ-0071');
    assert.throws(() => updateAifactory(aifactory.root), /aifactory is on factory\/RQ-0071, not main/);
    git(aifactory.root, 'checkout', '-q', 'main');
    writeFileSync(join(aifactory.root, 'README.md'), 'edited\n');
    assert.throws(() => bringMainUpToDate(aifactory.root, 'aifactory'), /aifactory has 1 uncommitted change\(s\) \(README\.md\)/);
  } finally {
    done();
  }
});

test('the check and the launcher start Node, never a .cmd, so they run on Windows as here', () => {
  // RQ-0073: on Kaan's Windows PC spawnSync('pnpm') could not start pnpm.cmd,
  // and the update said the check failed.
  const { project, done } = setup();
  try {
    runProjectCheck(project.root);
    rmSync(join(project.root, 'boards/zedboard.yaml'));
    assert.throws(() => runProjectCheck(project.root), /The design check fails with the new template \(exit code 1\); nothing was pushed/);
    rmSync(join(project.root, 'scripts/flow.mjs'));
    assert.throws(() => runProjectCheck(project.root), /no scripts\/flow\.mjs to check with/);
  } finally {
    done();
  }
  const launcher = readFileSync(join(__dirname, '..', 'bin', 'factory.js'), 'utf8');
  assert.doesNotMatch(launcher, /'tsx\.cmd'|'\.bin'/, 'no .cmd, no .bin shim in the paths it starts');
  assert.match(launcher, /spawnSync\(\s*process\.execPath,\s*\[tsxCli,/);
  const help = spawnSync(process.execPath, [join(__dirname, '..', 'bin', 'factory.js'), '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: factory/);
});
