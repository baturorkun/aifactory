// The vanilla-ts deploy (RQ-0088): one script deploys four ways, a developer's
// .env and CI's committed profiles for main, a branch and a tag. The scripts are
// template files written byte for byte into every project; the CI jobs are run
// here, out of the generated .gitlab-ci.yml, with fake docker and ssh.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { checkProjectEnv, stageHosts } from './env-check';
import { createTargetProject } from './scaffold';

const TEMPLATE = resolve(__dirname, '../templates/vanilla-ts');
const TEMPLATE_FILES = [
  'scripts/deploy.sh',
  'scripts/release.sh',
  'scripts/ci-remote-tools.sh',
  'tests/deploy.test.sh',
  'deploy/branch.env',
  'deploy/README.md',
];

function scaffold(name = 'shop') {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-vanilla-deploy-'));
  const result = createTargetProject(name, { dir: parent, template: 'vanilla-ts' });
  const root = result.projectRoot;
  return { parent, root, read: (path: string) => readFileSync(join(root, path), 'utf8') };
}

// The shell of one job's `script:` out of the generated YAML: `- command` items
// and `- |` blocks, comments dropped.
function jobScript(ci: string, job: string): string {
  const lines = ci.split('\n');
  let i = lines.indexOf(`${job}:`);
  assert.ok(i >= 0, `${job} is in .gitlab-ci.yml`);
  while (i < lines.length && lines[i] !== '  script:') i++;
  const out: string[] = [];
  for (i++; i < lines.length; i++) {
    const line = lines[i];
    if (line !== '' && !line.startsWith('    ')) break;
    if (line === '    - |') {
      for (i++; i < lines.length && (lines[i] === '' || lines[i].startsWith('      ')); i++) out.push(lines[i].slice(6));
      i--;
    } else if (line.startsWith('    - ')) out.push(line.slice(6));
  }
  return out.join('\n');
}

test('a vanilla-ts project gets the deploy scripts, byte for byte the template\'s, and their settings', () => {
  const { parent, root, read } = scaffold();
  try {
    for (const path of TEMPLATE_FILES) {
      assert.ok(existsSync(join(root, path)), `${path} is there`);
      assert.equal(read(path), readFileSync(join(TEMPLATE, path), 'utf8'), `${path} is the template's own`);
    }
    for (const path of ['deploy/main.env', 'deploy/release.env']) assert.ok(!existsSync(join(root, path)), `${path} is the project's to write`);
    for (const path of TEMPLATE_FILES.filter((p) => p.endsWith('.sh'))) {
      assert.doesNotMatch(read(path), /\bshop\b/, `${path} names no project`);
    }
    const pkg = JSON.parse(read('package.json')) as { name: string; scripts: Record<string, string> };
    assert.equal(pkg.scripts['deploy:dev'], 'sh scripts/deploy.sh');
    assert.equal(pkg.scripts.test, 'sh tests/deploy.test.sh');
    assert.equal(pkg.scripts.deploy, undefined, '`pnpm deploy` is a pnpm command');
    assert.match(read('.gitignore'), /^release\/$/m);
    const env = read('.env.example');
    for (const key of ['DEPLOY_TARGET', 'DEPLOY_ACCESS', 'DEPLOY_USER', 'DEPLOY_PORT', 'DEPLOY_BRANCH_PORT_BASE', 'DEPLOY_CONTAINER_NAME',
      'DEPLOY_DOCKER', 'DEPLOY_PATH', 'DEPLOY_REMOTE_HOST', 'DEPLOY_REMOTE_USER', 'DEPLOY_REMOTE_IDENTITY_FILE', 'DEPLOY_REMOTE_KNOWN_HOSTS']) {
      assert.match(env, new RegExp(`^${key}=$`, 'm'), `${key} is in .env.example, empty`);
    }
    assert.match(env, /^DEPLOY_REMOTE_PORT=22$/m);
    const config = JSON.parse(read('factory.config.json')) as { targetProject: { allowedPaths: string[]; commands: Record<string, string> } };
    for (const path of ['scripts', 'deploy', 'package.json', '.gitignore', '.env.example']) {
      assert.ok(config.targetProject.allowedPaths.includes(path), `allowedPaths has ${path}`);
    }
    assert.equal(config.targetProject.commands.test, 'pnpm test');
    const agents = read('AGENTS.md');
    assert.match(agents, /^## Deploy$/m);
    assert.match(agents, /deploy\/main\.env/);
    const ci = read('.gitlab-ci.yml');
    const factoryJob = ci.slice(ci.indexOf('ai_factory_requirement_branch:'), ci.indexOf('build_static:'));
    for (const path of ['scripts/', 'deploy/']) assert.match(factoryJob, new RegExp(`^ {6}- ${path}$`, 'm'), `the factory job keeps ${path}`);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

// Each shell in its own process, at once: the suite runs under a gate's time limit.
function runShell(shell: string, cwd: string, extra: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(shell, ['tests/deploy.test.sh'], { cwd, env: { ...process.env, ...extra } });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (out += chunk));
    child.on('close', (code) => done({ code, out }));
  });
}

test('the template\'s deploy test passes in a new project, under sh, dash and the C locale', async () => {
  const { parent, root } = scaffold();
  try {
    const shells = [['sh', {}], ['sh', { LC_ALL: 'C' }]] as Array<[string, Record<string, string>]>;
    if (spawnSync('sh', ['-c', 'command -v dash'], { encoding: 'utf8' }).status === 0) shells.push(['dash', { SHELL_UNDER_TEST: 'dash' }]);
    const runs = await Promise.all(shells.map(([shell, extra]) => runShell(shell, root, extra)));
    runs.forEach((run, i) => {
      assert.equal(run.code, 0, `${shells[i][0]} ${JSON.stringify(shells[i][1])}:\n${run.out}`);
      assert.match(run.out, /all deploy tests passed/);
    });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the CI deploy jobs: main and a tag by their profiles, a branch on the runner, each stopping with a reason', () => {
  const { parent, root, read } = scaffold();
  try {
    const ci = read('.gitlab-ci.yml');
    const work = join(parent, 'work');
    const bin = join(work, 'bin');
    const log = join(work, 'calls.log');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'docker'), `#!/bin/sh\necho "docker $*" >> "${log}"\n`);
    // The fake ssh runs the remote command here: the remote install step on real directories.
    writeFileSync(join(bin, 'ssh'), `#!/bin/sh\necho "ssh $*" >> "${log}"\neval "c=\\\${$#}"\nexec sh -c "$c"\n`);
    chmodSync(join(bin, 'docker'), 0o755);
    chmodSync(join(bin, 'ssh'), 0o755);
    // build_static's artifact.
    mkdirSync(join(root, 'release', 'shop', 'dist'), { recursive: true });
    writeFileSync(join(root, 'release', 'shop', 'index.html'), '<html></html>\n');
    writeFileSync(join(root, 'release', 'shop', 'dist', 'main.js'), '// built\n');
    const key = join(work, 'deploy_key');
    const known = join(work, 'known_hosts');
    writeFileSync(key, 'key\n', { mode: 0o644 });
    writeFileSync(known, 'host\n');

    const run = (job: string, env: Record<string, string>) => {
      writeFileSync(log, '');
      const result = spawnSync('sh', ['-e', '-c', jobScript(ci, job)], {
        cwd: root,
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          HOME: work,
          CONTAINER_NAME: 'shop',
          LOCAL_DOCKER_IMAGE: 'shop:abc',
          APP_PORT: '8282',
          CI_DEFAULT_BRANCH: 'main',
          CI_PIPELINE_ID: '41234',
          ...env,
        },
      });
      return { status: result.status, out: result.stdout + result.stderr, calls: readFileSync(log, 'utf8') };
    };
    const keys = { DEPLOY_REMOTE_IDENTITY_FILE: key, DEPLOY_REMOTE_KNOWN_HOSTS: known };

    // A branch: the runner's Docker, port 8100 + the RQ number.
    const preview = run('deploy_preview_linux', { CI_COMMIT_BRANCH: 'factory/RQ-0017', CI_COMMIT_REF_NAME: 'factory/RQ-0017', CI_COMMIT_REF_SLUG: 'factory-rq-0017' });
    assert.equal(preview.status, 0, preview.out);
    assert.match(preview.calls, /docker load --input shop-image\.tar/);
    assert.match(preview.calls, /docker run --detach --restart unless-stopped --name shop-preview-factory-rq-0017 --publish 8117:8282 .*--label com\.aifactory\.deploy=preview/);
    writeFileSync(join(root, 'deploy', 'branch.env'), 'DEPLOY_TARGET=directory\nDEPLOY_ACCESS=remote\n');
    const wrongBranch = run('deploy_preview_linux', { CI_COMMIT_BRANCH: 'factory/RQ-0017', CI_COMMIT_REF_SLUG: 'factory-rq-0017' });
    assert.notEqual(wrongBranch.status, 0);
    assert.match(wrongBranch.out, /deploy\/branch\.env must say DEPLOY_TARGET=container and DEPLOY_ACCESS=local/);
    writeFileSync(join(root, 'deploy', 'branch.env'), readFileSync(join(TEMPLATE, 'deploy', 'branch.env')));

    // main without deploy/main.env: the runner's Docker, as before.
    const runner = run('deploy_linux', { CI_COMMIT_BRANCH: 'main' });
    if (existsSync('/var/run/docker.sock')) {
      assert.equal(runner.status, 0, runner.out);
      assert.match(runner.calls, /--name shop --publish 8282:8282/);
    } else {
      assert.notEqual(runner.status, 0);
      assert.match(runner.out, /requires \/var\/run\/docker\.sock/, 'without a profile main takes the runner path');
    }

    // main with deploy/main.env: where it says, the keys from the File variables.
    const site = join(work, 'www', 'site');
    mkdirSync(join(work, 'www'), { recursive: true });
    writeFileSync(join(root, 'deploy', 'main.env'), `DEPLOY_TARGET=directory\nDEPLOY_ACCESS=remote\nDEPLOY_REMOTE_HOST=web.example\nDEPLOY_REMOTE_USER=site\nDEPLOY_PATH=${site}\n`);
    const noKeys = run('deploy_linux', { CI_COMMIT_BRANCH: 'main' });
    assert.notEqual(noKeys.status, 0);
    assert.match(noKeys.out, /DEPLOY_REMOTE_IDENTITY_FILE is empty/);
    assert.equal(noKeys.calls, '', 'nothing is called without the keys');
    const main = run('deploy_linux', { CI_COMMIT_BRANCH: 'main', ...keys });
    assert.equal(main.status, 0, main.out);
    assert.match(main.calls, new RegExp(`ssh -o BatchMode=yes -p 22 -i ${key} -o UserKnownHostsFile=${known} site@web\\.example`));
    assert.equal(readFileSync(join(site, 'dist', 'main.js'), 'utf8'), '// built\n', 'build_static\'s release, as it is');
    assert.match(readFileSync(join(site, '.aifactory-deploy'), 'utf8'), /^project=shop$/m);
    assert.equal(statSync(key).mode & 0o777, 0o600, 'the key is made private for ssh');

    // A tag: no profile, then a profile without a path.
    const noRelease = run('deploy_release', { CI_COMMIT_TAG: 'v1.0.0', ...keys });
    assert.notEqual(noRelease.status, 0);
    assert.match(noRelease.out, /No deploy\/release\.env/);
    writeFileSync(join(root, 'deploy', 'release.env'), 'DEPLOY_TARGET=directory\nDEPLOY_ACCESS=remote\nDEPLOY_REMOTE_HOST=web.example\nDEPLOY_PATH=\n');
    const noPath = run('deploy_release', { CI_COMMIT_TAG: 'v1.0.0', ...keys });
    assert.notEqual(noPath.status, 0);
    assert.match(noPath.out, /DEPLOY_PATH is empty/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('env-check groups the deploy settings and names a remote deploy host (RQ-0088)', () => {
  const { parent, root } = scaffold();
  try {
    const report = checkProjectEnv(root);
    const deploy = report.sections.find((section) => section.vars.some((v) => v.key === 'DEPLOY_TARGET'));
    assert.ok(deploy, 'a Deploy group');
    assert.match(deploy.description[0] ?? '', /Deploy \(pnpm run deploy:dev\)/);
    const values = new Map([['DEPLOY_ACCESS', 'remote'], ['DEPLOY_TARGET', 'directory'], ['DEPLOY_REMOTE_HOST', 'web.example'], ['DEPLOY_REMOTE_USER', 'site']]);
    assert.ok(stageHosts(values).some((host) => /^ssh site@web\.example +deploy:dev \(directory;/.test(host)));
    assert.ok(!stageHosts(new Map([['DEPLOY_ACCESS', 'local'], ['DEPLOY_REMOTE_HOST', 'web.example']])).some((host) => host.includes('deploy:dev')));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
