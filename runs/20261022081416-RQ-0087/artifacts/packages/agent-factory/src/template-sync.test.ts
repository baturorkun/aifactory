// RQ-0087: a project's change to a template-owned file is kept, merged or
// left for a hand, never overwritten silently; the lock records what the
// template delivered, an override marks a change kept on purpose, and the
// project's template-check.mjs judges it without aifactory.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EMBEDDED_PHASE_GATES } from '@aifactory/contracts';
import { createTargetProject } from './scaffold';
import { BASE_DIRECTORY, LOCK_PATH, contentHash, readLock, readOverrides, templateStatus, writeOverrides } from './template-lock';
import { overrideTemplateFile, proposalBody, proposeTemplateChanges, removeTemplateOverride, PROPOSAL_PATH } from './template-override';
import { updateEmbeddedProject } from './template-update';

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const FLOW_LIB = 'common/flow_lib.tcl';

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENTITY } });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

// An embedded project from this template, committed on main.
function project() {
  const parent = mkdtempSync(join(tmpdir(), 'template-sync-'));
  const { projectRoot: root } = createTargetProject('fw', { dir: parent, template: 'embedded', labInventoryPath: join(parent, 'none.json') });
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
    commit('chore(template): the aifactory embedded template at 0000000');
  };
  const check = (...args: string[]) => spawnSync(process.execPath, [join(root, 'scripts/template-check.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  return { parent, root, read, write, commit, olderTemplate, check, done: () => rmSync(parent, { recursive: true, force: true }) };
}

const kinds = (changes: ReturnType<typeof updateEmbeddedProject>) => changes.map((change) => `${change.kind} ${change.path}`);

test('the template takes embedded1\'s flow_lib changes: design IP in simulation, clean on Windows', () => {
  const p = project();
  try {
    const lib = p.read(FLOW_LIB);
    assert.match(lib, /foreach name \{PART BOARD BOARD_PART MODE TOP BD VITIS IPS\}/);
    assert.match(lib, /set cfg \[dict create BOARD "" BOARD_PART "" BD "" VITIS "" IPS ""\]/);
    assert.match(lib, /set all \[concat \[ip_sources\] \[hdl_sources\] \[files_in tb/);
    assert.match(lib, /if \{\[file tail \$entry\] ne "vivado-clean\.log"\} \{ file delete -force \$entry \}/);
    assert.match(p.read('ip/README.md'), /set IPS \{<ip> \.\.\.\}/);
  } finally {
    p.done();
  }
});

const tclsh = spawnSync('tclsh', [], { input: 'exit 0\n' }).status === 0;
test('ip_sources follows files.f, skips blank and # lines, sorts without it, and refuses a missing IP', { skip: !tclsh && 'no tclsh here' }, () => {
  const p = project();
  try {
    for (const path of ['ip/drawer/hdl', 'ip/plain/hdl']) mkdirSync(join(p.root, path), { recursive: true });
    p.write('ip/drawer/hdl/files.f', 'b.vhd\n# a comment\n\na.vhd\n');
    for (const path of ['ip/drawer/hdl/a.vhd', 'ip/drawer/hdl/b.vhd', 'ip/plain/hdl/z.v', 'ip/plain/hdl/c.vhd']) p.write(path, '');
    const script = [
      `source {${join(p.root, FLOW_LIB)}}`,
      `set ::flow::ROOT {${p.root}}`,
      'set ::flow::cfg [dict create IPS {drawer plain}]',
      'foreach file [::flow::ip_sources] { puts [file tail $file] }',
      'set ::flow::cfg [dict create IPS {nope}]',
      'catch {::flow::ip_sources} message',
      'puts $message',
    ].join('\n');
    const result = spawnSync('tclsh', [], { input: script, encoding: 'utf8' });
    assert.equal(result.stdout.trim(), ['b.vhd', 'a.vhd', 'c.vhd', 'z.v', "IPS names 'nope' but ip/nope/hdl does not exist"].join('\n'));
  } finally {
    p.done();
  }
});

test('factory new writes the lock: the aifactory commit and a hash per template-owned file, none for the project\'s or merged files', () => {
  const p = project();
  try {
    const lock = readLock(p.root);
    assert.ok(lock && /^([0-9a-f]{7}|unknown)$/.test(lock.aifactory));
    assert.equal(lock?.files[FLOW_LIB], contentHash(FLOW_LIB, readFileSync(join(p.root, FLOW_LIB))));
    for (const path of ['scripts/flow.mjs', 'scripts/template-check.mjs', '.gitlab-ci.yml', '.env.example', 'AGENTS.md', 'ip/README.md']) assert.ok(lock?.files[path], path);
    for (const path of Object.keys(lock?.files ?? {})) assert.ok(!path.startsWith('designs/') && !path.startsWith('boards/'), path);
    for (const path of ['factory.config.json', 'package.json', '.gitignore']) assert.equal(lock?.files[path], undefined, path);
    assert.deepEqual(updateEmbeddedProject(p.root), [], 'a new project is on the template');
    assert.ok(templateStatus(p.root).files.every((file) => file.state === 'in sync'));
  } finally {
    p.done();
  }
});

test('update: replaced when only the template moved', () => {
  const p = project();
  try {
    const template = p.read(FLOW_LIB);
    p.olderTemplate(FLOW_LIB, template.replace(/^/, '# OLD TEMPLATE\n'));
    assert.deepEqual(kinds(updateEmbeddedProject(p.root, { write: true })), [`replace ${FLOW_LIB}`, `replace ${LOCK_PATH}`]);
    assert.equal(p.read(FLOW_LIB), template);
    assert.equal(readLock(p.root)?.files[FLOW_LIB], contentHash(FLOW_LIB, Buffer.from(template)));
  } finally {
    p.done();
  }
});

test('update: kept when only the project changed it, and no change to deliver', () => {
  const p = project();
  try {
    const mine = p.read(FLOW_LIB) + '\n# the project\'s own\n';
    p.write(FLOW_LIB, mine);
    p.commit('a project change');
    assert.deepEqual(kinds(updateEmbeddedProject(p.root)), [`kept ${FLOW_LIB}`, `replace ${LOCK_PATH}`], 'listed; the lock gains its base copy');
    updateEmbeddedProject(p.root, { write: true });
    assert.equal(p.read(FLOW_LIB), mine, 'never overwritten');
    assert.ok(existsSync(join(p.root, BASE_DIRECTORY, FLOW_LIB)), 'the template\'s version is the next base');
    p.commit('lock');
    assert.deepEqual(kinds(updateEmbeddedProject(p.root)), [`kept ${FLOW_LIB}`], 'only kept: nothing to deliver');
  } finally {
    p.done();
  }
});

test('update: both changed apart is merged; the template\'s version becomes the base', () => {
  const p = project();
  try {
    const template = p.read(FLOW_LIB);
    const older = template.replace(/^/, '# OLD TEMPLATE\n');
    p.olderTemplate(FLOW_LIB, older);
    p.write(FLOW_LIB, older + '# the project\'s own\n');
    p.commit('a project change');
    assert.deepEqual(kinds(updateEmbeddedProject(p.root, { write: true })), [`merged ${FLOW_LIB}`, `replace ${LOCK_PATH}`]);
    assert.equal(p.read(FLOW_LIB), template + '# the project\'s own\n');
    assert.equal(readFileSync(join(p.root, BASE_DIRECTORY, FLOW_LIB), 'utf8'), template);
  } finally {
    p.done();
  }
});

test('update: both changed the same lines is a conflict, written with its markers', () => {
  const p = project();
  try {
    const template = p.read(FLOW_LIB);
    p.olderTemplate(FLOW_LIB, template.replace(/^/, '# OLD TEMPLATE\n'));
    p.write(FLOW_LIB, template.replace(/^/, '# THE PROJECT\n'));
    p.commit('a project change');
    assert.deepEqual(kinds(updateEmbeddedProject(p.root, { write: true })), [`conflict ${FLOW_LIB}`, `replace ${LOCK_PATH}`]);
    assert.match(p.read(FLOW_LIB), /^<{7} project\n# THE PROJECT\n={7}\n>{7} template\n/m);
    assert.equal(templateStatus(p.root).files.find((file) => file.path === FLOW_LIB)?.state, 'conflict');
  } finally {
    p.done();
  }
});

test('update: a file the template\'s again drops its override and its base copy', () => {
  const p = project();
  try {
    const template = p.read(FLOW_LIB);
    p.write(FLOW_LIB, template + '# the project\'s own\n');
    p.commit('a project change');
    updateEmbeddedProject(p.root, { write: true });
    overrideTemplateFile(p.root, FLOW_LIB, 'design IP in simulation');
    p.commit('kept on purpose');
    // aifactory took the change: the project's file is the template's.
    p.write(FLOW_LIB, template);
    p.commit('as the template');
    const changes = updateEmbeddedProject(p.root, { write: true });
    assert.deepEqual(kinds(changes), [`replace ${LOCK_PATH}`, 'merge factory.config.json']);
    assert.match(changes[1].kind === 'merge' ? changes[1].detail : '', /templateOverrides\.common\/flow_lib\.tcl removed/);
    assert.deepEqual(readOverrides(p.root), {});
    assert.ok(!existsSync(join(p.root, BASE_DIRECTORY, FLOW_LIB)));
  } finally {
    p.done();
  }
});

test('a project from before the lock takes its last template update commit as base, else its first commit', () => {
  const p = project();
  try {
    unlinkSync(join(p.root, LOCK_PATH));
    p.commit('from before RQ-0087');
    const template = p.read(FLOW_LIB);
    p.write(FLOW_LIB, template + '# the project\'s own\n');
    p.commit('a project change');
    // Base: the first commit, which has the template's file.
    assert.deepEqual(kinds(updateEmbeddedProject(p.root)), [`kept ${FLOW_LIB}`, `add ${LOCK_PATH}`]);
    // A later template update commit is the base when there is one.
    p.write(FLOW_LIB, '# an old template line\n' + template);
    p.commit('chore(template): the aifactory embedded template at 1111111');
    p.write(FLOW_LIB, '# an old template line\n' + template + '# the project\'s own\n');
    p.commit('another project change');
    assert.deepEqual(kinds(updateEmbeddedProject(p.root)), [`merged ${FLOW_LIB}`, `add ${LOCK_PATH}`]);
  } finally {
    p.done();
  }
});

test('template-check.mjs: a change without an override is reported, fails only with --strict; an override passes, conflict markers do not', () => {
  const p = project();
  try {
    let result = p.check('--strict');
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /none changed unmarked/);
    // The Coding Standard section of AGENTS.md is the project's.
    p.write('AGENTS.md', p.read('AGENTS.md') + '\n## Coding Standard\n\n- the project\'s standard\n');
    assert.equal(p.check('--strict').status, 0, 'the Coding Standard section is no change');

    p.write(FLOW_LIB, p.read(FLOW_LIB) + '# tried\n');
    result = p.check();
    assert.equal(result.status, 0, 'reports only');
    assert.match(result.stdout, /changed {4}common\/flow_lib\.tcl/);
    assert.match(result.stdout, /template override <path> --reason/);
    assert.equal(p.check('--strict').status, 1);

    overrideTemplateFile(p.root, FLOW_LIB, 'design IP in simulation');
    result = p.check('--strict');
    assert.equal(result.status, 0, result.stdout);
    assert.match(p.check('--all').stdout, /overridden common\/flow_lib\.tcl {2}\(design IP in simulation\)/);

    p.write(FLOW_LIB, '<<<<<<< project\na\n=======\nb\n>>>>>>> template\n');
    assert.equal(p.check('--strict').status, 1, 'conflict markers fail with an override too');
    unlinkSync(join(p.root, FLOW_LIB));
    assert.equal(p.check('--strict').status, 1, 'a missing file fails');

    // The gate and aifactory agree on every file.
    const fromScript = new Map(p.check('--all').stdout.split('\n').map((line) => /^ {2}(\S+(?: sync)?) +(\S+)/.exec(line)).filter(Boolean).map((match) => [match![2], match![1]]));
    for (const file of templateStatus(p.root).files) assert.equal(fromScript.get(file.path), file.state, file.path);

    unlinkSync(join(p.root, LOCK_PATH));
    result = p.check('--strict');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /no \.factory\/template\.lock\.json/);
  } finally {
    p.done();
  }
});

test('template override records and removes; only a template-owned file, only with a reason', () => {
  const p = project();
  try {
    assert.throws(() => overrideTemplateFile(p.root, 'designs/led_counter/project.tcl', 'x'), /not a template-owned file/);
    assert.throws(() => overrideTemplateFile(p.root, FLOW_LIB, ' '), /needs its reason/);
    overrideTemplateFile(p.root, FLOW_LIB, 'design IP');
    assert.deepEqual(readOverrides(p.root), { [FLOW_LIB]: { reason: 'design IP' } });
    assert.ok(removeTemplateOverride(p.root, FLOW_LIB));
    assert.equal(removeTemplateOverride(p.root, FLOW_LIB), false);
    assert.equal(JSON.parse(p.read('factory.config.json')).targetProject.templateOverrides, undefined);
  } finally {
    p.done();
  }
});

test('template propose: one issue with each file\'s reason and diff; its URL kept in the override; without a token a file', async () => {
  const p = project();
  const aifactory = mkdtempSync(join(tmpdir(), 'template-sync-aifactory-'));
  try {
    p.write(FLOW_LIB, p.read(FLOW_LIB) + '# design IP in simulation\n');
    p.write('.env', 'GITLAB_URL=http://gitlab\n');
    overrideTemplateFile(p.root, FLOW_LIB, 'design IP in simulation');
    const { title, body } = proposalBody(p.root, [FLOW_LIB]);
    assert.equal(title, `Template change from fw: ${FLOW_LIB}`);
    assert.match(body, /Reason: design IP in simulation/);
    assert.match(body, /```diff\n--- a\/common\/flow_lib\.tcl\n\+\+\+ b\/common\/flow_lib\.tcl\n@@[^\n]*\n[\s\S]*\+# design IP in simulation\n```/);

    // No token anywhere: the issue is written for a hand to open.
    let result = await proposeTemplateChanges(p.root, { aifactoryRoot: aifactory });
    assert.equal(result.file, PROPOSAL_PATH);
    assert.match(p.read(PROPOSAL_PATH), /^# Template change from fw/);

    writeFileSync(join(aifactory, '.env'), 'GITHUB_TOKEN=secret\nGITHUB_REPOSITORY=bytecraft/aifactory\n');
    const sent: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(JSON.stringify({ html_url: 'https://github.com/bytecraft/aifactory/issues/9' }), { status: 201 });
    }) as unknown as typeof fetch;
    result = await proposeTemplateChanges(p.root, { aifactoryRoot: aifactory, fetchFn });
    assert.equal(result.url, 'https://github.com/bytecraft/aifactory/issues/9');
    assert.equal(sent[0].url, 'https://api.github.com/repos/bytecraft/aifactory/issues');
    assert.equal((sent[0].init.headers as Record<string, string>).Authorization, 'Bearer secret');
    assert.deepEqual(readOverrides(p.root)[FLOW_LIB], { reason: 'design IP in simulation', issue: 'https://github.com/bytecraft/aifactory/issues/9' });

    writeOverrides(p.root, {});
    await assert.rejects(proposeTemplateChanges(p.root, { aifactoryRoot: aifactory }), /no template overrides/);
  } finally {
    p.done();
    rmSync(aifactory, { recursive: true, force: true });
  }
});

test('templateCheck is a spec-phase gate, a command of the project, and a strict CI job on merge requests', () => {
  const p = project();
  try {
    assert.deepEqual(EMBEDDED_PHASE_GATES.spec, ['designCheck', 'templateCheck']);
    const config = JSON.parse(p.read('factory.config.json'));
    assert.equal(config.targetProject.commands.templateCheck, 'pnpm template:check');
    assert.equal(JSON.parse(p.read('package.json')).scripts['template:check'], 'node scripts/template-check.mjs');
    const ci = p.read('.gitlab-ci.yml');
    const job = ci.slice(ci.indexOf('\ntemplate_check:'), ci.indexOf('\n\n', ci.indexOf('\ntemplate_check:') + 1));
    assert.match(job, /stage: check/);
    assert.match(job, /node scripts\/template-check\.mjs --strict/);
    assert.match(job, /\$CI_PIPELINE_SOURCE == "merge_request_event"/);
    assert.match(p.read('AGENTS.md'), /The aifactory template owns `common\/`, `scripts\/`[\s\S]*template override <path> --reason/);
  } finally {
    p.done();
  }
});
