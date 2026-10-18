// Embedded projects start configured (RQ-0047): the lab inventory fills .env,
// the repository platform follows the origin remote, an old project is brought
// up to the template, and .env's settings become CI/CD variables.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { ciVariables, labWideKeys, readDotEnv, writeCiVariables } from './ci-variables';
import { FactoryConfigSchema } from './config';
import { LAB_INVENTORY_PATH, embeddedEnvValues, fillEnv, labWideCiValues, loadLabInventory } from './lab-inventory';
import { resolveRepositoryPlatform } from './repository-platform/resolve';
import { createTargetProject } from './scaffold';
import { updateEmbeddedProject } from './template-update';

const temp = () => mkdtempSync(join(tmpdir(), 'aifactory-setup-'));

test('the lab inventory describes the lab as found on 17 October, and holds no secret', () => {
  const inventory = loadLabInventory();
  assert.ok(inventory, 'lab/inventory.json is there');
  assert.equal(inventory.vivado.host, '192.168.1.3');
  assert.equal(inventory.vivado.version, '2025.2');
  // The junction that keeps Vitis' BSP paths under the Windows limit (RQ-0048).
  assert.equal(inventory.vivado.basePath, 'C:\\ab');
  assert.equal(inventory.lab.hwServer, '192.168.1.2:3121');
  assert.deepEqual(inventory.units.zedboard, {
    board: 'zedboard',
    powerName: 'Zedboard - 1',
    jtagCable: '210248B849E0',
    serialPort: '/dev/serial/by-id/usb-2012_Cypress_Semiconductor_Cypress-USB2UART-Ver1.0G_825A11C34918-if00',
    serialBaud: 115200,
  });
  const text = readFileSync(LAB_INVENTORY_PATH, 'utf8');
  assert.doesNotMatch(text, /glpat-|"(token|password|secret|key)"\s*:/i, 'no token, password or key');
});

test('a new embedded project takes its hosts and its board unit from the inventory', () => {
  const parent = temp();
  try {
    const { projectRoot } = createTargetProject('fw', { dir: parent, template: 'embedded', board: 'zedboard' });
    const env = readDotEnv(projectRoot);
    assert.equal(env.VIVADO_REMOTE_HOST, '192.168.1.3');
    assert.equal(env.VITIS_BIN, 'C:\\Xilinx\\2025.2\\Vitis\\bin\\vitis.bat');
    assert.equal(env.BOARD_POWER_NAME, 'Zedboard - 1');
    assert.equal(env.BOARD_JTAG_CABLE, '210248B849E0');
    assert.equal(env.TWIN_REMOTE_HOST, '192.168.1.2');
    assert.equal(env.GITLAB_PROJECT_ID, 'agentic/fw');
    // One copy per person on each host.
    assert.match(env.VIVADO_REMOTE_PROJECT_NAME, /^fw-[a-z0-9-]+$/);
    assert.equal(env.BOARD_REMOTE_PROJECT_NAME, env.VIVADO_REMOTE_PROJECT_NAME);
    // The secrets stay empty for env-check to name.
    for (const secret of ['GITLAB_TOKEN', 'BOT_API_TOKEN', 'TWIN_GITLAB_TOKEN']) assert.equal(env[secret], '', secret);
    assert.throws(
      () => createTargetProject('fw2', { dir: parent, template: 'embedded', board: 'genesys-zu5ev' }),
      /No lab unit "genesys-zu5ev"\. Configured: zedboard; known but not configured yet: genesys-zu5ev/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('without a unit the board settings stay empty; .env.example lines keep their order and comments', () => {
  const inventory = loadLabInventory()!;
  const values = embeddedEnvValues(inventory, 'fw', 'ada');
  assert.equal(values.BOARD_JTAG_CABLE, undefined);
  assert.equal(values.VIVADO_REMOTE_PROJECT_NAME, 'fw-ada');
  assert.equal(fillEnv('# hosts\nVIVADO_REMOTE_HOST=\nOTHER=x\nVIVADO_REMOTE_HOST=\n', values), '# hosts\nVIVADO_REMOTE_HOST=192.168.1.3\nOTHER=x\nVIVADO_REMOTE_HOST=\n');
});

test('with both platforms configured the origin remote decides', () => {
  const root = temp();
  try {
    spawnSync('git', ['init', '-q'], { cwd: root });
    const config = FactoryConfigSchema.parse({ model: { provider: 'mock', name: 'mock' }, targetProject: { root } });
    const env = { GITLAB_URL: 'http://gitlab.bc.int', GITLAB_PROJECT_ID: 'agentic/embedded1', GITLAB_TOKEN: 't', GITHUB_TOKEN: 'g', GITHUB_REPOSITORY: 'o/r' };
    spawnSync('git', ['remote', 'add', 'origin', 'git@gitlab.bc.int:agentic/embedded1.git'], { cwd: root });
    assert.equal(resolveRepositoryPlatform(config, undefined, env).provider, 'gitlab');
    spawnSync('git', ['remote', 'set-url', 'origin', 'https://github.com/o/r.git'], { cwd: root });
    assert.equal(resolveRepositoryPlatform(config, undefined, env).provider, 'github');
    spawnSync('git', ['remote', 'set-url', 'origin', 'git@elsewhere.example:o/r.git'], { cwd: root });
    assert.throws(() => resolveRepositoryPlatform(config, undefined, env), /origin remote matches neither/);
    assert.equal(resolveRepositoryPlatform(config, 'gitlab', env).provider, 'gitlab', '--platform still wins');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('template update brings a project made before the twin and board phases up to the template, and only that', () => {
  const parent = temp();
  try {
    const { projectRoot } = createTargetProject('old', { dir: parent, template: 'embedded', labInventoryPath: join(parent, 'none.json') });
    // Make it look like a project from before RQ-0045 and RQ-0046.
    for (const path of ['scripts/twin.mjs', 'scripts/board.mjs', 'designs/hello_ps/test.yaml']) unlinkSync(join(projectRoot, path));
    const configPath = join(projectRoot, 'factory.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    delete config.targetProject.commands.twinTest;
    delete config.targetProject.commands.boardTest;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    writeFileSync(join(projectRoot, 'scripts/flow.mjs'), '// an old flow\n');
    // A project's own changes: a design source and its board file.
    writeFileSync(join(projectRoot, 'designs/led_counter/src/counter.vhd'), '-- the project\'s own counter\n');
    writeFileSync(join(projectRoot, 'boards/zedboard.yaml'), 'vendor: amd\ntool: vivado\ntool_version: "2025.2"\npart: xc7z020clg484-1\n');
    writeFileSync(join(projectRoot, '.env'), 'SECRET=keep\n');

    const listed = updateEmbeddedProject(projectRoot);
    const paths = listed.map((change) => `${change.kind} ${change.path}`);
    for (const expected of ['add scripts/twin.mjs', 'add scripts/board.mjs', 'add designs/hello_ps/test.yaml', 'replace scripts/flow.mjs', 'merge factory.config.json']) {
      assert.ok(paths.includes(expected), `${expected} in ${paths.join(', ')}`);
    }
    assert.ok(!existsSync(join(projectRoot, 'scripts/twin.mjs')), 'nothing is written without --write');

    updateEmbeddedProject(projectRoot, { write: true });
    assert.ok(existsSync(join(projectRoot, 'scripts/twin.mjs')));
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).targetProject.commands.boardTest, 'pnpm board');
    assert.equal(readFileSync(join(projectRoot, 'designs/led_counter/src/counter.vhd'), 'utf8'), '-- the project\'s own counter\n');
    assert.doesNotMatch(readFileSync(join(projectRoot, 'boards/zedboard.yaml'), 'utf8'), /twin/);
    assert.equal(readFileSync(join(projectRoot, '.env'), 'utf8'), 'SECRET=keep\n');
    assert.deepEqual(updateEmbeddedProject(projectRoot), [], 'a second run has nothing to do');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('ci-variables takes the host and board settings, leaves secrets out unless asked, and creates or updates each', async () => {
  const env = {
    VIVADO_REMOTE_HOST: '192.168.1.3', VITIS_BIN: 'C:\\Xilinx\\vitis.bat', BOARD_JTAG_CABLE: '210248B849E0',
    VIVADO_REMOTE_PROJECT_NAME: 'fw-ada', BOARD_REMOTE_IDENTITY_FILE: '/home/ada/.ssh/id', BOT_API_TOKEN: 'secret-token-1',
    TWIN_TAG: '', AI_MODEL: 'x',
  };
  assert.deepEqual(ciVariables(env).map((variable) => variable.key), ['BOARD_JTAG_CABLE', 'VITIS_BIN', 'VIVADO_REMOTE_HOST']);
  const withSecrets = ciVariables(env, true);
  assert.deepEqual(withSecrets.find((variable) => variable.key === 'BOT_API_TOKEN'), { key: 'BOT_API_TOKEN', value: 'secret-token-1', secret: true });

  const calls: string[] = [];
  const fake = async (url: string, init?: { method?: string; body?: string }) => {
    calls.push(`${init?.method} ${url.replace(/^.*\/variables/, '')} ${init?.body}`);
    const exists = url.endsWith('/VIVADO_REMOTE_HOST');
    return { ok: init?.method === 'POST' || exists, status: exists || init?.method === 'POST' ? 200 : 404, text: async () => '' };
  };
  const done = await writeCiVariables({ baseUrl: 'http://gitlab.example', projectId: 'agentic/fw', token: 't' }, withSecrets, fake);
  assert.equal(done.VIVADO_REMOTE_HOST, 'updated');
  assert.equal(done.BOT_API_TOKEN, 'created');
  assert.ok(calls.some((call) => call.startsWith('POST  ') && call.includes('key=BOT_API_TOKEN') && call.includes('masked=true')));
  assert.ok(calls.some((call) => call.startsWith('PUT /VIVADO_REMOTE_HOST') && call.includes('masked=false') && call.includes('raw=true')));
});

test('ci-variables leaves out what the lab provides at instance level, but not a project value that differs', () => {
  const inventory = loadLabInventory();
  assert.ok(inventory, 'the lab inventory is present');
  const labWide = labWideCiValues(inventory);
  assert.equal(Object.keys(labWide).length, 14);
  assert.equal(labWide.TWIN_GITLAB_URL, undefined, 'the twin is the project\'s');
  const env = {
    VIVADO_REMOTE_HOST: labWide.VIVADO_REMOTE_HOST, VIVADO_REMOTE_BASE_PATH: 'D:\\fw', XSDB_BIN: labWide.XSDB_BIN,
    BOARD_JTAG_CABLE: '210248B849E0', BOT_API_TOKEN: 'secret-token-1', TWIN_GITLAB_TOKEN: 'secret-token-2',
  };
  assert.deepEqual(ciVariables(env, true, labWide).map((variable) => variable.key), ['BOARD_JTAG_CABLE', 'VIVADO_REMOTE_BASE_PATH']);
  assert.deepEqual(labWideKeys(env, labWide), ['BOT_API_TOKEN', 'TWIN_GITLAB_TOKEN', 'VIVADO_REMOTE_HOST', 'XSDB_BIN']);
  assert.deepEqual(ciVariables(env, true).length, 6, 'without an inventory everything is written');
});

test('on a Windows host files come back whole, the Vitis path is checked first, and the board job names its host project', async () => {
  const parent = temp();
  try {
    const { projectRoot } = createTargetProject('fw', { dir: parent, template: 'embedded', labInventoryPath: join(parent, 'none.json') });
    const host = await import(pathToFileURL(join(projectRoot, 'scripts/vivado-host.mjs')).href) as { scpOptions: (s: unknown) => string[] };
    const settings = { hostType: 'windows', port: '22', identityFile: '', knownHosts: '' };
    // scp's SFTP mode cut every file over 200 KiB at 204 800 bytes from Windows OpenSSH.
    assert.equal(host.scpOptions(settings)[0], '-O');
    assert.ok(!host.scpOptions({ ...settings, hostType: 'linux' }).includes('-O'));

    const flow = await import(pathToFileURL(join(projectRoot, 'scripts/flow.mjs')).href) as {
      checkVitisPath: (s: unknown, d: unknown) => void;
    };
    const windows = { remote: true, hostType: 'windows' };
    const design = { name: 'hello_ps', CPU: 'ps7_cortexa9_0' };
    // The cases measured on 18 October: 236 failed in the BSP build, 211 and 210 built.
    assert.throws(
      () => flow.checkVitisPath({ ...windows, basePath: 'C:\\Users\\Batur\\aifactory-builds', projectName: 'embedded1-embedded_build-factory-rq-0001' }, design),
      /about 236 characters[\s\S]*41 {2}host project \(VIVADO_REMOTE_PROJECT_NAME\)/,
    );
    flow.checkVitisPath({ ...windows, basePath: 'C:\\Users\\Batur\\aifactory-builds', projectName: 'embedded1-batur' }, design);
    flow.checkVitisPath({ ...windows, basePath: 'C:\\ab', projectName: 'embedded1-embedded_build-factory-rq-0001' }, design);
    flow.checkVitisPath({ remote: true, hostType: 'linux', basePath: '/very/long/'.repeat(30), projectName: 'x' }, design);

    const ci = readFileSync(join(projectRoot, '.gitlab-ci.yml'), 'utf8');
    for (const name of ['embedded_board', 'embedded_board_on_demand']) {
      const start = ci.indexOf(`\n${name}:`);
      const job = ci.slice(start, ci.indexOf('\n\n', start + 1));
      assert.match(job, /BOARD_REMOTE_PROJECT_NAME: "\$CI_PROJECT_NAME-board-\$CI_COMMIT_REF_SLUG"/, name);
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
