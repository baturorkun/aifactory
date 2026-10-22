// The embedded template (RQ-0044): the Vivado/Vitis flow, its design check,
// the phase-ordered gates and the CI that runs them.
import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync, gunzipSync, gzipSync } from 'node:zlib';
import test from 'node:test';
import { DEFAULT_EMBEDDED_PHASES, embeddedPhaseList, embeddedPhaseReached } from '@aifactory/contracts';
import { runAllGates, type GateReport } from '@aifactory/quality-gates';
import { createTargetProject, PROJECT_TEMPLATES } from './scaffold';
import { applyKey, renderCheckboxes, type CheckboxItem } from './utils/checkbox-prompt';

function scaffold(template = 'embedded') {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-embedded-'));
  // No lab inventory: a test project must never point at the real lab hosts.
  const { projectRoot } = createTargetProject('fw', { dir: parent, template, labInventoryPath: join(parent, 'no-inventory.json') });
  const read = (path: string) => readFileSync(join(projectRoot, path), 'utf8');
  const flow = (...args: string[]) => spawnSync(process.execPath, [join(projectRoot, 'scripts/flow.mjs'), ...args], {
    encoding: 'utf8',
    // A clean environment: no VIVADO_* of the machine running the tests.
    env: { PATH: process.env.PATH ?? '' },
  });
  return { parent, root: projectRoot, read, flow, done: () => rmSync(parent, { recursive: true, force: true }) };
}

test('embedded is offered next to the other templates', () => {
  // --template and --simulator are refused together by the CLI for every template.
  assert.deepEqual(PROJECT_TEMPLATES, ['empty', 'vanilla-ts', 'python', 'c', 'embedded']);
});

test('the embedded template lays out the Vivado flow and two starting designs', () => {
  const project = scaffold();
  try {
    for (const path of [
      'flow.tcl', 'flow.ps1', 'flow.sh', 'common/flow_lib.tcl', 'common/tool_check.tcl', 'common/gates.tcl',
      'common/boards/README.md', 'ip/README.md', 'boards/zedboard.yaml', 'scripts/flow.mjs', 'scripts/vivado-host.mjs',
      'designs/led_counter/project.tcl', 'designs/led_counter/src/counter.vhd', 'designs/led_counter/tb/tb_counter.vhd',
      'designs/led_counter/constraints/zedboard.xdc', 'designs/hello_ps/project.tcl', 'designs/hello_ps/tcl/bd.tcl',
      'designs/hello_ps/sw/src/main.c', 'designs/hello_ps/sw/create_vitis.py', 'scripts/vitis_sw.py', '.gitattributes',
    ]) {
      assert.ok(existsSync(join(project.root, path)), `${path} is there`);
    }
    // The Vitis workspace (RQ-0063): the design's script hands its work to the
    // template's; on Windows the workspace is short and fixed, elsewhere under out/.
    assert.match(project.read('designs/hello_ps/sw/create_vitis.py'), /^import vitis_sw\b.*\n\nvitis_sw\.main\(SW_DIR\)/m);
    const python = spawnSync('python3', ['-c', 'exit(0)'], { stdio: 'pipe' });
    if (python.status === 0) {
      const fake = mkdtempSync(join(tmpdir(), 'fake-vitis-'));
      try {
        writeFileSync(join(fake, 'vitis.py'), '');
        const probe = [
          'import sys, os',
          `sys.path[:0] = [${JSON.stringify(fake)}, ${JSON.stringify(join(project.root, 'scripts'))}]`,
          'import vitis_sw',
          "print(vitis_sw.workspace_of('/x/ab/embedded1-b-factory-rq-0004', 'hdmi_colorbar', '/x/ab/embedded1-b-factory-rq-0004/out/hdmi_colorbar'))",
          "vitis_sw.os.name = 'nt'",
          "print(vitis_sw.workspace_of('/x/ab/embedded1-b-factory-rq-0004', 'hdmi_colorbar', '/x/ab/embedded1-b-factory-rq-0004/out/hdmi_colorbar'))",
          "print(vitis_sw.workspace_of('/x/ab/embedded1-kavci', 'hdmi_colorbar', '/x/ab/embedded1-kavci/out/hdmi_colorbar'))",
          'print(vitis_sw.PLATFORM_NAME)',
        ].join('\n');
        const run = spawnSync('python3', ['-I', '-c', probe], { stdio: 'pipe' });
        assert.equal(run.status, 0, String(run.stderr));
        const [elsewhere, windows, other, platform] = String(run.stdout).trim().split('\n');
        assert.equal(elsewhere, '/x/ab/embedded1-b-factory-rq-0004/out/hdmi_colorbar/vitis');
        assert.match(windows, /^\/x\/ab\/\.v\/[0-9a-f]{8}$/, 'next to the copies, named by a hash');
        assert.notEqual(windows, other, 'one per copy and design');
        assert.equal(platform, 'platform');
        assert.match(project.read('scripts/vitis_sw.py'), /open\(os\.path\.join\(workspace, "\.owner"\), "w"/, 'the workspace names its copy (RQ-0065)');
      } finally {
        rmSync(fake, { recursive: true, force: true });
      }
    }
    assert.match(project.read('designs/led_counter/project.tcl'), /set MODE\s+non_project/);
    assert.match(project.read('designs/hello_ps/project.tcl'), /set MODE\s+project/);
    assert.match(project.read('boards/zedboard.yaml'), /^tool_version: "\d{4}\.\d"/m);
    assert.match(project.read('.gitignore'), /^out\/$/m);
    // aifactory next to the project (RQ-0069): pnpm factory -- <command> reaches it.
    assert.equal((JSON.parse(project.read('package.json')) as { scripts: Record<string, string> }).scripts.factory, 'node ../aifactory/packages/agent-factory/bin/factory.js');

    const config = JSON.parse(project.read('factory.config.json')) as {
      targetProject: { profile: string; commands: Record<string, string>; commandTimeoutMs: number; allowedPaths: string[] };
      requirementDefaults: { kind: string };
    };
    assert.equal(config.targetProject.profile, 'embedded');
    assert.deepEqual(config.targetProject.commands, {
      designCheck: 'pnpm check', templateCheck: 'pnpm template:check', hdlSim: 'pnpm sim', fpgaBuild: 'pnpm run build', firmwareBuild: 'pnpm sw', twinTest: 'pnpm twin', boardTest: 'pnpm board',
      codingStandard: 'pnpm standard', // RQ-0076: there with no standard too, passing
    });
    assert.ok(config.targetProject.commandTimeoutMs >= 3_600_000, 'a project-mode build fits in the gate timeout');
    assert.equal(config.requirementDefaults.kind, 'embedded');
    assert.ok(config.targetProject.allowedPaths.includes('designs'));

    const scripts = (JSON.parse(project.read('package.json')) as { scripts: Record<string, string> }).scripts;
    assert.equal(scripts.check, 'node scripts/flow.mjs check');
    assert.equal(scripts.build, 'node scripts/flow.mjs build');

    // Every machine setting is named, none is filled in.
    const env = project.read('.env.example');
    for (const name of ['VIVADO_HOST_TYPE', 'VIVADO_REMOTE_HOST', 'VIVADO_REMOTE_USER', 'VIVADO_REMOTE_BASE_PATH', 'VIVADO_REMOTE_PROJECT_NAME', 'VIVADO_BIN', 'VITIS_BIN',
      'TWIN_GITLAB_TOKEN', 'TWIN_TAG', 'TWIN_REMOTE_HOST', 'TWIN_REMOTE_USER', 'TWIN_REMOTE_BASE_PATH', 'TWIN_REMOTE_PROJECT_NAME',
      'BOT_API_URL', 'BOT_API_TOKEN', 'BOARD_POWER_NAME', 'BOARD_REMOTE_HOST', 'BOARD_HW_SERVER', 'BOARD_JTAG_CABLE', 'BOARD_SERIAL_PORT', 'XSDB_BIN']) {
      assert.match(env, new RegExp(`^${name}=`, 'm'), name);
    }
    assert.match(env, /^VIVADO_REMOTE_HOST=$/m);
    assert.match(env, /^VIVADO_BIN=$/m);

    assert.match(project.read('AGENTS.md'), /## The Embedded Workflow \(Vivado and Vitis\)/);
    assert.match(project.read('AGENTS.md'), /The twin is the default test/);
    assert.deepEqual((JSON.parse(project.read('factory.config.json')) as { requirementDefaults: { embeddedPhases: string[] } }).requirementDefaults.embeddedPhases, ['spec', 'sim', 'build', 'twin']);
    // No ZedBoard twin exists yet: the section is there to fill, commented.
    assert.match(project.read('boards/zedboard.yaml'), /^# twin:\n# {3}gitlab: /m);
    assert.doesNotMatch(project.read('boards/zedboard.yaml'), /^twin:/m);
    assert.match(project.read('designs/hello_ps/test.yaml'), /expect:\n {2}- "hello_ps: Hello from the Zynq PS"/);
    assert.match(project.read('.gitignore'), /^twin-run\/$/m);
    assert.match(project.read('.gitignore'), /^board-run\/$/m);
    assert.equal(scripts.board, 'node scripts/flow.mjs board');
    assert.match(project.read('AGENTS.md'), /Naming the `board` phase in a requirement is its author's consent to power and program the board/);
    assert.equal(scripts.twin, 'node scripts/flow.mjs twin');
  } finally {
    project.done();
  }
});

test('the other templates have no embedded workflow', () => {
  for (const template of ['c', 'python']) {
    const project = scaffold(template);
    try {
      assert.doesNotMatch(project.read('AGENTS.md'), /Embedded Workflow/);
      assert.doesNotMatch(project.read('.gitlab-ci.yml'), /embedded_|VIVADO_/);
      assert.doesNotMatch(project.read('.env.example'), /VIVADO_/);
    } finally {
      project.done();
    }
  }
});

test('the design check passes the generated project and names each problem it finds', () => {
  const project = scaffold();
  try {
    let result = project.flow('check');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DESIGN CHECK: 2 design\(s\) pass: hello_ps, led_counter/);

    const tcl = join(project.root, 'designs/led_counter/project.tcl');
    writeFileSync(tcl, readFileSync(tcl, 'utf8') + 'set IP_REPO "C:\\\\Xilinx\\\\ip"\n');
    const board = join(project.root, 'boards/zedboard.yaml');
    writeFileSync(board, readFileSync(board, 'utf8').replace(/^tool_version: .*$/m, '').replace('xc7z020clg484-1', 'xc7z010clg400-1'));
    result = project.flow('check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /designs\/led_counter\/project.tcl:\d+: a Windows drive path/);
    assert.match(result.stderr, /boards\/zedboard.yaml: no tool_version/);
    assert.match(result.stderr, /PART xc7z020clg484-1 is not the part of boards\/zedboard.yaml \(xc7z010clg400-1\)/);
  } finally {
    project.done();
  }
});

test('a Vivado stage says which setting is missing instead of guessing a host or a path', () => {
  const project = scaffold();
  try {
    let result = project.flow('sim', 'led_counter');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /VIVADO_BIN is not set/);

    writeFileSync(join(project.root, '.env'), 'VIVADO_REMOTE_HOST=build-host\nVIVADO_BIN=vivado\n');
    result = project.flow('sim', 'led_counter');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /VIVADO_REMOTE_USER is not set, but VIVADO_REMOTE_HOST names a remote Vivado host/);

    result = project.flow('sim', 'no_such_design');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /No design "no_such_design"/);

    result = project.flow('bitstream');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown stage "bitstream"/);
  } finally {
    project.done();
  }
});

test('the GitLab CI runs every phase on every push and merge request, as far as the requirement names them', () => {
  const project = scaffold();
  try {
    const ci = project.read('.gitlab-ci.yml');
    assert.match(ci, /^stages:\n {2}- ai_factory\n {2}- check\n {2}- sim\n {2}- build\n {2}- standard\n {2}- twin\n {2}- board\n/m);
    const job = (name: string) => {
      const start = ci.indexOf(`\n${name}:`);
      assert.ok(start >= 0, `${name} exists`);
      const next = ci.indexOf('\n\n', start + 1);
      return ci.slice(start, next < 0 ? undefined : next);
    };
    assert.match(job('embedded_check'), /node scripts\/flow\.mjs check/);
    // Every design is built, the software from the XSA in the same job.
    const full = job('embedded_build');
    // Content built before is taken instead (RQ-0078): restore first, save last.
    assert.match(full, /- code=0; node scripts\/build-reuse\.mjs restore \|\| code=\$\?; if \[ "\$code" -eq 0 \]; then exit 0; elif \[ "\$code" -ne 10 \]; then exit "\$code"; fi\n {4}- node scripts\/flow\.mjs build --requirement-phases\n {4}- node scripts\/flow\.mjs sw --requirement-phases\n {4}- node scripts\/build-reuse\.mjs save\n/);
    assert.match(job('embedded_sim'), /node scripts\/flow\.mjs sim --requirement-phases/);
    assert.match(full, /- out\/\*\/artifacts\//);
    for (const name of ['embedded_check', 'embedded_sim', 'embedded_build']) {
      assert.match(job(name), /merge_request_event/, `${name} runs on merge requests`);
      assert.match(job(name), /\$CI_COMMIT_TAG/, `${name} runs on tags`);
    }
    assert.doesNotMatch(ci, /--mode|embedded_build_rtl/);
    // The twin runs the ELF the build job brought back, on its own Renode host project.
    // As bfi-sw's twin-test: the runner's Docker runs the twin image.
    const twin = job('embedded_twin');
    assert.match(twin, /stage: twin\n {2}image: docker:27/);
    assert.match(twin, /- job: embedded_build\n {6}artifacts: true/);
    assert.match(twin, /apk add --no-cache nodejs/);
    assert.match(twin, /node scripts\/flow\.mjs twin --requirement-phases/);
    assert.match(twin, /- out\/\*\/artifacts\/twin\//);
    // The board: one run at a time for the lab; nightly, when the requirement names it, and by hand.
    const board = job('embedded_board');
    assert.match(board, /resource_group: "lab-board"/);
    assert.match(board, /node scripts\/flow\.mjs board --requirement-phases/);
    assert.match(board, /\$CI_PIPELINE_SOURCE == "schedule"/);
    assert.match(board, /- out\/\*\/artifacts\/board\//);
    const onDemand = job('embedded_board_on_demand');
    assert.match(onDemand, /when: manual\n {6}allow_failure: true/);
    assert.match(onDemand, /- node scripts\/flow\.mjs board\n/);
    // Each Vivado job has its own project on the host, one ref at a time,
    // named short: its name is in the Vitis BSP's longest path (RQ-0063).
    assert.match(job('embedded_sim'), /VIVADO_REMOTE_PROJECT_NAME: "\$CI_PROJECT_NAME-s-\$CI_COMMIT_REF_SLUG"/);
    assert.match(job('embedded_build'), /VIVADO_REMOTE_PROJECT_NAME: "\$CI_PROJECT_NAME-b-\$CI_COMMIT_REF_SLUG"/);
    assert.match(job('embedded_build'), /resource_group: "vivado-embedded_build-\$CI_COMMIT_REF_SLUG"/);
    assert.match(job('embedded_sim'), /resource_group: "vivado-embedded_sim-\$CI_COMMIT_REF_SLUG"/);
    // The builder's leftovers go after every push to the default branch (RQ-0065).
    const prune = job('embedded_builder_prune');
    assert.match(prune, /- node scripts\/flow\.mjs prune\n/);
    assert.match(prune, /allow_failure: true/);
    assert.match(prune, /if: '\$CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH'/);
    assert.match(prune, /needs: \[\]/);
    // The factory job reaches the same host for its gates, with its own project.
    const factory = job('ai_factory_requirement_branch');
    assert.match(factory, /VIVADO_REMOTE_PROJECT_NAME: "\$CI_PROJECT_NAME-f-\$CI_COMMIT_REF_SLUG"/);
    assert.match(factory, /chmod 600 "\$VIVADO_REMOTE_IDENTITY_FILE"/);
    assert.match(factory, /- designs\//);
    assert.doesNotMatch(factory, /- public\/|- dist\//);
  } finally {
    project.done();
  }
});

test('an embedded run goes through its phases in order and stops at the first that fails', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-embedded-gates-'));
  const runDir = join(root, 'run');
  mkdirSync(runDir);
  const node = JSON.stringify(process.execPath);
  const ok = `${node} -e "process.exit(0)"`;
  const fail = `${node} -e "process.exit(1)"`;
  try {
    let results = await runAllGates(runDir, root, {
      targetRoot: root,
      commands: { designCheck: ok, hdlSim: fail, fpgaBuild: ok, firmwareBuild: ok },
    });
    assert.equal(results.designCheck, 'passed');
    assert.equal(results.hdlSim, 'failed');
    assert.equal(results.fpgaBuild, 'skipped');
    assert.equal(results.firmwareBuild, 'skipped');
    // The TypeScript gates do not apply to an embedded project.
    assert.equal(results.typeCheck, 'skipped');
    assert.equal(results.build, 'skipped');
    const reports = JSON.parse(readFileSync(join(runDir, 'gates/report.json'), 'utf8')) as GateReport[];
    assert.match(reports.find((report) => report.gate === 'fpgaBuild')?.output ?? '', /the sim phase failed/);
    assert.equal(embeddedPhaseReached(results), 'spec');

    results = await runAllGates(runDir, root, {
      targetRoot: root,
      commands: { designCheck: ok, hdlSim: ok, fpgaBuild: ok, firmwareBuild: ok },
    });
    assert.deepEqual(
      [results.designCheck, results.hdlSim, results.fpgaBuild, results.firmwareBuild],
      ['passed', 'passed', 'passed', 'passed'],
    );
    assert.equal(embeddedPhaseReached(results), 'build');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a run goes through the phases it is given; the others are skipped with the reason', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-embedded-phases-'));
  const runDir = join(root, 'run');
  mkdirSync(runDir);
  const ok = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
  try {
    const results = await runAllGates(runDir, root, {
      targetRoot: root,
      commands: { designCheck: ok, hdlSim: ok, fpgaBuild: ok, firmwareBuild: ok },
      embeddedPhases: ['spec', 'sim'],
    });
    assert.deepEqual(
      [results.designCheck, results.hdlSim, results.fpgaBuild, results.firmwareBuild],
      ['passed', 'passed', 'skipped', 'skipped'],
    );
    const reports = JSON.parse(readFileSync(join(runDir, 'gates/report.json'), 'utf8')) as GateReport[];
    assert.match(reports.find((report) => report.gate === 'fpgaBuild')?.output ?? '', /Not in the phases of this run \(spec, sim\)/);
    assert.equal(embeddedPhaseReached(results), 'sim');

    // A phase can be left out in the middle: spec and build, no simulation.
    const skipSim = await runAllGates(runDir, root, {
      targetRoot: root,
      commands: { designCheck: ok, hdlSim: ok, fpgaBuild: ok, firmwareBuild: ok },
      embeddedPhases: ['spec', 'build'],
    });
    assert.deepEqual(
      [skipSim.designCheck, skipSim.hdlSim, skipSim.fpgaBuild, skipSim.firmwareBuild],
      ['passed', 'skipped', 'passed', 'passed'],
    );
    assert.equal(embeddedPhaseReached(skipSim), 'build');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the phase reached is the last whose gates and every earlier one passed', () => {
  assert.equal(embeddedPhaseReached({ designCheck: 'failed' }), undefined);
  assert.equal(embeddedPhaseReached({ designCheck: 'passed', hdlSim: 'passed', fpgaBuild: 'passed', firmwareBuild: 'failed' }), 'sim');
  // A phase that was not run is passed over; a failure stops the count.
  assert.equal(embeddedPhaseReached({ designCheck: 'passed', hdlSim: 'skipped', fpgaBuild: 'passed', firmwareBuild: 'passed' }), 'build');
  assert.equal(embeddedPhaseReached({ designCheck: 'passed', hdlSim: 'failed', fpgaBuild: 'skipped', firmwareBuild: 'skipped' }), 'spec');
});

test('a phase list is put in workflow order, always with spec, and an unknown phase is refused', () => {
  assert.deepEqual(embeddedPhaseList('build,sim'), ['spec', 'sim', 'build']);
  assert.deepEqual(embeddedPhaseList('twin,build'), ['spec', 'build', 'twin']);
  assert.deepEqual(embeddedPhaseList(['build']), ['spec', 'build']);
  assert.deepEqual(embeddedPhaseList('spec, sim, build'), ['spec', 'sim', 'build']);
  assert.deepEqual(embeddedPhaseList('board'), ['spec', 'board']);
  assert.throws(() => embeddedPhaseList('sim,flash'), /Unknown phase "flash"/);
  // The board is not in a requirement's default phases.
  assert.deepEqual([...DEFAULT_EMBEDDED_PHASES], ['spec', 'sim', 'build', 'twin']);
});

test('the checkbox list moves, ticks, keeps spec ticked and accepts', () => {
  let state = {
    cursor: 0,
    items: [
      { value: 'spec', label: 'spec', checked: true, locked: true },
      { value: 'sim', label: 'sim', checked: true },
      { value: 'build', label: 'build', checked: false },
    ] as CheckboxItem[],
  };
  const press = (key: string) => {
    const result = applyKey(state.items, state.cursor, key);
    state = { items: result.items, cursor: result.cursor };
    return result;
  };
  press(' ');
  assert.equal(state.items[0].checked, true, 'spec stays ticked');
  press('\u001b[B');
  press(' ');
  press('\u001b[B');
  press(' ');
  assert.deepEqual(state.items.map((item) => item.checked), [true, false, true]);
  assert.deepEqual(renderCheckboxes(state.items, state.cursor), ['  [x] spec  (always)', '  [ ] sim', '› [x] build']);
  assert.equal(press('\r').done, true);
  assert.equal(press('\u0003').cancelled, true);
});

test('in CI a requirement branch runs only the phases its requirement names', () => {
  const project = scaffold();
  try {
    mkdirSync(join(project.root, 'requirements'), { recursive: true });
    writeFileSync(join(project.root, 'requirements/RQ-0007-uart.md'), '---\nid: RQ-0007\nkind: embedded\nphases: spec, sim\n---\n# RQ-0007 - UART\n');
    const ci = (stage: string, branch: string) => spawnSync(process.execPath, [join(project.root, 'scripts/flow.mjs'), stage, '--requirement-phases'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', CI_COMMIT_BRANCH: branch },
    });
    let result = ci('build', 'factory/RQ-0007');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /build: not run, RQ-0007 goes through spec, sim \(no build\)/);
    // A stage the requirement names, or any stage on main, goes on (and here
    // stops at the missing Vivado setting, which proves it went on).
    result = ci('sim', 'factory/RQ-0007');
    assert.match(result.stderr, /VIVADO_BIN is not set/);
    result = ci('build', 'main');
    assert.match(result.stderr, /VIVADO_BIN is not set/);
  } finally {
    project.done();
  }
});

// The twin's own logic, imported from the generated project's script.
async function twinModule(root: string) {
  return import(pathToFileURL(join(root, 'scripts/twin.mjs')).href) as Promise<{
    parseTestYaml: (text: string) => { timeout_s: number; expect: string[]; fail_on: string[]; summary: Record<string, { min?: number; max?: number; equals?: string }> };
    parseTwinSection: (text: string, board?: string) => { gitlab: string; project: string; registry: string; console?: string } | undefined;
    twinSettings: (env: Record<string, string>, text: string, board?: string) => { gitlab: string; project: string; registry: string; console?: string } | undefined;
    judgeRun: (run: { exitStatus: number; summary: unknown; consoleText?: string }, test: unknown) => { status: string; why: string | null; summary_checks: Record<string, { ok: boolean }> };
    runScript: () => string;
    twinAccess: (env: Record<string, string>) => string;
    twinJobArgs: (run: { image: string; elfName: string; seconds: string; owner: string; timeoutS?: number }) => { owner: string; image: string; cmd: string[]; inputs: string[]; timeout_s: number };
    summaryFromLog: (text: string) => Record<string, unknown> | null;
  }>;
}

async function labBotModule(root: string) {
  return import(pathToFileURL(join(root, 'scripts/lab-bot.mjs')).href) as Promise<{
    botUpload: (env: Record<string, string>, agent: string, name: string, data: Buffer, stage?: string) => Promise<string>;
    botDownload: (url: string, path: string, stage?: string) => Promise<void>;
    botJob: (env: Record<string, string>, agent: string, command: string, args: unknown, options?: { wait?: number; stage?: string }) => Promise<{ id: string }>;
    jobOwner: (env: Record<string, string>, projectName?: string) => string;
    outputUrl: (job: { stdout?: string }) => string | undefined;
    jobIsFinal: (job: { status?: string }) => boolean;
  }>;
}

// A lab bot and the twin's GitLab in one server: what the twin stage asks of
// them in bot mode, answered as the real ones did on 19 October.
function fakeLabBot(outputArchive: string, outcome: { status: string; exit_code: number }) {
  const seen = { uploads: {} as Record<string, number>, job: undefined as undefined | { command: string; args: Record<string, unknown> }, requestedBy: '', tokens: new Set<string>(), polls: 0 };
  const server = createHttpServer((req, res) => {
    const url = req.url ?? '';
    const auth = req.headers.authorization ?? '';
    if (url.startsWith('/api/agents') || url.startsWith('/api/jobs')) seen.tokens.add(auth);
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (url.startsWith('/api/v4/projects/') && url.includes('/releases')) return json(200, [{ tag_name: '0.5.0' }]);
      if (url === '/api/v4/user') return json(200, { username: 'twin-reader' });
      if (req.method === 'PUT' && url.startsWith('/api/agents/lab/files/')) {
        const name = decodeURIComponent(url.split('/').pop() ?? '');
        seen.uploads[name] = body.length;
        return json(200, { ok: true, url: `http://127.0.0.1/download/agent-files/lab/${name}`, size: body.length });
      }
      if (req.method === 'POST' && url.startsWith('/api/agents/lab/jobs')) {
        seen.job = JSON.parse(body.toString('utf8'));
        seen.requestedBy = String(req.headers['x-requested-by'] ?? '');
        return json(202, { id: 'job-1', agent_id: 'lab', status: 'running', stdout: '' });
      }
      if (url === '/api/jobs/job-1') {
        seen.polls += 1;
        const port = (server.address() as { port: number }).port;
        return json(200, { id: 'job-1', agent_id: 'lab', ...outcome, stdout: `twin stopped\nOUTPUT=http://127.0.0.1:${port}/download/agent-files/lab/job-1.tar.gz` });
      }
      if (url === '/download/agent-files/lab/job-1.tar.gz') { res.writeHead(200, { 'Content-Type': 'application/gzip' }); return res.end(readFileSync(outputArchive)); }
      json(404, { error: `unexpected ${req.method} ${url}` });
    });
  });
  return { server, seen, listen: () => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))) };
}

// The fake bot answers from this process, so the flow must not block it:
// spawn, not spawnSync.
function flowAsync(root: string, ...args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, 'scripts/flow.mjs'), ...args], { cwd: root, env: { PATH: process.env.PATH ?? '' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// What a twin job leaves for the bot to collect: out/run with the console,
// and the job's log with the image's stderr around the summary line.
function twinOutputArchive(directory: string, consoleText: string, summary: unknown): string {
  mkdirSync(join(directory, 'out', 'run'), { recursive: true });
  writeFileSync(join(directory, 'out', 'run', 'display.bin'), consoleText);
  writeFileSync(join(directory, 'out', 'run', 'monitor.log'), 'monitor\n');
  writeFileSync(join(directory, 'log'), `[INFO] twin booting\n${JSON.stringify(summary)}\n[INFO] twin stopped\n`);
  const archive = join(directory, 'output.tar.gz');
  const tar = spawnSync('tar', ['-czf', archive, '-C', directory, 'out', 'log'], { stdio: 'pipe' });
  if (tar.status !== 0) throw new Error(String(tar.stderr));
  return archive;
}

const BFI_BOARD = [
  'vendor: microchip', 'tool: libero', 'tool_version: "2024.1"', 'part: M2S060',
  'twin:', '  gitlab: http://gitlab.bcintr.int', '  project: hardware-twin/bfi-sumilator', '  registry: gitlab.bcintr.int:5050', '  console: display.bin', '',
].join('\n');

test('the twin reads the board\'s twin and test.yaml, and judges a run as bfi-sw does', async () => {
  const project = scaffold();
  try {
    const twin = await twinModule(project.root);
    assert.equal(twin.parseTwinSection(project.read('boards/zedboard.yaml'), 'zedboard'), undefined, 'no ZedBoard twin yet');
    assert.deepEqual(twin.parseTwinSection(BFI_BOARD, 'bfi'), {
      gitlab: 'http://gitlab.bcintr.int', project: 'hardware-twin/bfi-sumilator', registry: 'gitlab.bcintr.int:5050', console: 'display.bin',
    });
    assert.throws(() => twin.parseTwinSection('twin:\n  gitlab: http://g\n', 'x'), /twin\.project/);

    // As bfi-sw: the environment names the twin; the board file fills the rest.
    const zed = project.read('boards/zedboard.yaml');
    assert.equal(twin.twinSettings({}, zed, 'zedboard'), undefined, 'no twin project anywhere');
    const bfiEnv = { TWIN_GITLAB_URL: 'http://gitlab.bcintr.int', TWIN_PROJECT: 'hardware-twin/bfi-sumilator', TWIN_REGISTRY: 'gitlab.bcintr.int:5050' };
    assert.deepEqual(twin.twinSettings(bfiEnv, zed, 'zedboard'), {
      gitlab: 'http://gitlab.bcintr.int', project: 'hardware-twin/bfi-sumilator', registry: 'gitlab.bcintr.int:5050', console: undefined,
    });
    assert.deepEqual(twin.twinSettings({ TWIN_PROJECT: 'hardware-twin/other', TWIN_CONSOLE: '' }, BFI_BOARD, 'bfi'), {
      gitlab: 'http://gitlab.bcintr.int', project: 'hardware-twin/other', registry: 'gitlab.bcintr.int:5050', console: 'display.bin',
    }, 'the environment wins field by field');
    assert.deepEqual(twin.twinSettings({}, BFI_BOARD, 'bfi'), twin.parseTwinSection(BFI_BOARD, 'bfi'), 'the board file alone as before');
    assert.throws(() => twin.twinSettings({ TWIN_PROJECT: 'hardware-twin/z' }, zed, 'zedboard'), /TWIN_GITLAB_URL \(or boards\/zedboard\.yaml twin\.gitlab\)/);

    const hello = twin.parseTestYaml(project.read('designs/hello_ps/test.yaml'));
    assert.deepEqual(hello.expect, ['hello_ps: Hello from the Zynq PS']);
    const bfi = twin.parseTestYaml('timeout_s: 2\nsummary:\n  sysTimeMs: { min: 1900, max: 2000 }\n  frames: { min: 1 }\n');
    assert.deepEqual(bfi.summary, { sysTimeMs: { min: 1900, max: 2000 }, frames: { min: 1 } });
    assert.throws(() => twin.parseTestYaml('timeout_s: 2\n'), /neither expect nor summary checks anything/);

    // The run bfi-sw 1.1.0 gave on bfi-sumilator 0.5.0: 2 s simulated, 100 frames.
    const ran = { exitStatus: 0, summary: { sysTimeMs: 2000, frames: 100 } };
    assert.equal(twin.judgeRun(ran, bfi).status, 'pass');
    assert.equal(twin.judgeRun({ ...ran, summary: { sysTimeMs: 1500, frames: 100 } }, bfi).status, 'fail');
    assert.match(twin.judgeRun({ ...ran, summary: { sysTimeMs: 1500, frames: 100 } }, bfi).why ?? '', /sysTimeMs=1500/);
    assert.equal(twin.judgeRun({ exitStatus: 1, summary: null }, bfi).status, 'error');
    assert.equal(twin.judgeRun({ exitStatus: 0, summary: {}, consoleText: 'boot\n' }, hello).status, 'timeout');
    assert.equal(twin.judgeRun({ exitStatus: 0, summary: {}, consoleText: 'hello_ps: Hello from the Zynq PS\nERROR: x\n' }, hello).status, 'fail');
    assert.equal(twin.judgeRun({ exitStatus: 0, summary: {}, consoleText: 'hello_ps: Hello from the Zynq PS\n' }, hello).status, 'pass');

    // The script on the Docker host: POSIX sh (docker:27 has no bash), the token removed at once.
    const script = twin.runScript();
    assert.match(script, /^#!\/bin\/sh/);
    assert.doesNotMatch(script, /\[\[|function |\bsource\b/);
    assert.match(script, /docker create "\$image" --elf \/io\/app\.elf --seconds "\$seconds" --out \/io\/run/);
    assert.match(script, /trap cleanup EXIT/);
    assert.match(script, /rm -f \.token\ndocker inspect/);
  } finally {
    project.done();
  }
});

test('the twin stage over the bot: the ELF through the store, a docker-run job owned by name, the archive back, no token to the lab', async () => {
  const project = scaffold();
  const outputs = mkdtempSync(join(tmpdir(), 'twin-bot-'));
  try {
    const twin = await twinModule(project.root);
    const labBot = await labBotModule(project.root);
    assert.equal(twin.twinAccess({}), 'ssh', 'ssh until a project says otherwise');
    assert.equal(twin.twinAccess({ TWIN_ACCESS: 'BOT' }), 'bot');
    assert.throws(() => twin.twinAccess({ TWIN_ACCESS: 'agent' }), /TWIN_ACCESS must be ssh or bot, not "agent"/);
    assert.deepEqual(twin.twinJobArgs({ image: 'reg:5050/hardware-twin/bfi-sumilator:0.5.0', elfName: 'fw-ada-bfi-1.elf', seconds: '2', owner: 'fw/ada' }), {
      owner: 'fw/ada', image: 'reg:5050/hardware-twin/bfi-sumilator:0.5.0',
      cmd: ['--elf', '/in/fw-ada-bfi-1.elf', '--seconds', '2', '--out', '/out/run'], inputs: ['fw-ada-bfi-1.elf'], timeout_s: 62,
    }, 'the image\'s own contract, a minute past the run for the pull and the boot');
    assert.deepEqual(twin.summaryFromLog('[INFO] boot\n{"sysTimeMs": 2000, "frames": 100}\n[INFO] twin stopped\n'), { sysTimeMs: 2000, frames: 100 });
    assert.equal(twin.summaryFromLog('no summary here\n{not json\n'), null);
    assert.equal(labBot.jobOwner({ BOT_API_AGENT: 'kavci' }, 'embedded1'), 'embedded1/kavci');
    assert.throws(() => labBot.jobOwner({}, 'fw'), /BOT_API_AGENT is not set/);
    assert.equal(labBot.outputUrl({ stdout: 'twin stopped\nOUTPUT=http://bot/download/agent-files/lab/j.tar.gz' }), 'http://bot/download/agent-files/lab/j.tar.gz');
    assert.equal(labBot.outputUrl({ stdout: 'nothing' }), undefined);
    assert.ok(labBot.jobIsFinal({ status: 'failed' }) && !labBot.jobIsFinal({ status: 'running' }));

    // The ELF the build left, and a twin to run it on.
    mkdirSync(join(project.root, 'out/hello_ps/artifacts'), { recursive: true });
    writeFileSync(join(project.root, 'out/hello_ps/artifacts/hello_ps_app.elf'), 'ELF');
    const env = (port: number, more = '') => [
      'TWIN_ACCESS=bot', 'TWIN_BOT_AGENT=lab', `BOT_API_URL=http://127.0.0.1:${port}`, 'BOT_API_TOKEN=bot-token', 'BOT_API_AGENT=ada',
      `TWIN_GITLAB_URL=http://127.0.0.1:${port}`, 'TWIN_PROJECT=hardware-twin/bfi-sumilator', 'TWIN_REGISTRY=reg:5050', 'TWIN_CONSOLE=display.bin',
      'TWIN_GITLAB_TOKEN=twin-secret', more, '',
    ].join('\n');

    const archive = twinOutputArchive(outputs, 'hello_ps: Hello from the Zynq PS\n', { sysTimeMs: 2000, frames: 100 });
    const bot = fakeLabBot(archive, { status: 'succeeded', exit_code: 0 });
    const port = await bot.listen();
    try {
      writeFileSync(join(project.root, '.env'), env(port));
      const result = await flowAsync(project.root, 'twin', 'hello_ps');
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.match(result.stdout, /on lab's Docker through the bot, 5 s, for \S+\/ada/);
      assert.match(result.stdout, /TWIN: hello_ps pass on hardware-twin\/bfi-sumilator 0\.5\.0/);

      const written = JSON.parse(project.read('out/hello_ps/artifacts/twin/result.json'));
      assert.equal(written.status, 'pass');
      assert.equal(written.access, 'bot');
      assert.equal(written.job, 'job-1');
      assert.match(written.owner, /^[A-Za-z0-9._-]+\/ada$/);
      assert.equal(written.twin_exit, 0);
      assert.equal(written.summary.sysTimeMs, 2000);
      assert.equal(written.host, 'lab (through the bot)');
      assert.equal(written.twin.release, '0.5.0');
      assert.equal(project.read('out/hello_ps/artifacts/twin/display.bin'), 'hello_ps: Hello from the Zynq PS\n');
      assert.match(project.read('out/hello_ps/artifacts/twin/job.log'), /twin booting/);

      // The job: the image's contract, the ELF from the store, owned by name, for 5 s plus a minute.
      assert.equal(bot.seen.job?.command, 'docker-run');
      const args = bot.seen.job?.args as { image: string; cmd: string[]; inputs: string[]; owner: string; timeout_s: number };
      assert.equal(args.image, 'reg:5050/hardware-twin/bfi-sumilator:0.5.0');
      assert.equal(args.inputs.length, 1);
      assert.equal(bot.seen.uploads[args.inputs[0]], 3, 'the ELF went into the store under the job\'s name');
      assert.deepEqual(args.cmd, ['--elf', `/in/${args.inputs[0]}`, '--seconds', '5', '--out', '/out/run']);
      assert.match(args.owner, /\/ada$/);
      assert.equal(args.timeout_s, 65);
      assert.equal(bot.seen.requestedBy, 'ada');
      assert.deepEqual([...bot.seen.tokens], ['Bearer bot-token'], 'the twin\'s GitLab token never reaches the bot');
      assert.ok(bot.seen.polls >= 1);
      assert.ok(!existsSync(join(project.root, 'twin-run/hello_ps/.token')) && !existsSync(join(project.root, 'twin-run/hello_ps/run.sh')), 'nothing of the ssh way is made');
    } finally {
      bot.server.closeAllConnections();
      bot.server.close();
    }

    // A job the bot ended (timeout: exit 124) is an error with that reason.
    const stopped = fakeLabBot(archive, { status: 'failed', exit_code: 124 });
    const port2 = await stopped.listen();
    try {
      writeFileSync(join(project.root, '.env'), env(port2));
      const result = await flowAsync(project.root, 'twin', 'hello_ps');
      assert.equal(result.status, 1, result.stderr + result.stdout);
      assert.match(result.stderr, /TWIN FAILED: hello_ps error \(the twin exited with 124\)/);
      assert.equal(JSON.parse(project.read('out/hello_ps/artifacts/twin/result.json')).twin_exit, 124);
    } finally {
      stopped.server.closeAllConnections();
      stopped.server.close();
    }

    // Bot mode needs the bot's name for the host and the person's name (the
    // first value of a key in .env wins, so the line is left out, not overridden).
    const without = (key: string) => env(1).split('\n').filter((line) => !line.startsWith(`${key}=`)).join('\n');
    writeFileSync(join(project.root, '.env'), without('TWIN_BOT_AGENT'));
    let result = project.flow('twin', 'hello_ps');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /TWIN_BOT_AGENT is not set/);
    writeFileSync(join(project.root, '.env'), without('BOT_API_AGENT'));
    result = project.flow('twin', 'hello_ps');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /BOT_API_AGENT is not set/);
  } finally {
    project.done();
    rmSync(outputs, { recursive: true, force: true });
  }
});

async function hostModule(root: string) {
  return import(pathToFileURL(join(root, 'scripts/vivado-host.mjs')).href) as Promise<{
    hostAccess: (env: Record<string, string>) => string;
    hostSettings: (env: Record<string, string>, prefix?: string) => { access: string; remote: boolean; host: string; botAgent?: string };
    botRunnerScript: (job: { settings: unknown; jobDirectory: string; command: string[] }) => string;
    botDiffScript: (job: { settings: unknown; jobDirectory: string; manifestUrl: string }) => string;
    botSyncScript: (job: { settings: unknown; jobDirectory: string; partUrls: string[]; entries: string[]; directories: string[] }) => string;
    botStartScript: (job: { settings: unknown; jobDirectory: string; command: string[] }) => string;
    botBackgroundScript: (job: { jobDirectory: string; name: string; script: string }) => string;
    botPollScript: (job: { jobDirectory: string; name: string }) => string;
    sourceManifest: (root?: string) => { path: string; size: number; hash: string }[];
    parseRanges: (text: string) => number[];
    chunkBytes: (env: Record<string, string>) => number;
    botStatusScript: (job: { jobDirectory: string; offset: number }) => string;
    botCollectScript: (job: { settings: unknown; jobDirectory: string; pulls: string[]; chunkBytes?: number }) => string;
    botStopScript: (job: { jobDirectory: string }) => string;
    botCleanScript: (job: { jobDirectory: string }) => string;
    parseStep: (text: string) => Record<string, string> & { log: string };
  }>;
}

// The step a background launcher (RQ-0067) writes out and starts: the longest
// base64 text in it.
const innerScript = (launcher: string) => {
  const encoded = [...launcher.matchAll(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/g)].map((match) => match[1]).sort((a, b) => b.length - a.length)[0] ?? '';
  return Buffer.from(encoded, 'base64').toString('utf8');
};

// The bot's Windows agent on the builder, as the stage uses it: free-form
// PowerShell steps (told apart by their "# aifactory: <step>" line), the
// store, the upload-file job. The steps' answers are canned; what the real
// PowerShell does is checked by parsing the scripts (when pwsh is here).
// `need` is what the diff step answers: every file in the list, or none.
// `resultParts`: how many parts the collect step cuts the results into (RQ-0066).
function fakeBuilderBot(resultsArchive: string, exitCode: number, need: 'all' | 'none' = 'all', resultParts = 1) {
  const seen = { steps: [] as string[], scripts: {} as Record<string, string>, uploads: {} as Record<string, number>, stored: {} as Record<string, Buffer>, uploadFile: undefined as undefined | string[], uploadFiles: [] as string[][], tokens: new Set<string>(), requestedBy: new Set<string>() };
  const archive = () => readFileSync(resultsArchive);
  const collectAnswer = () => {
    const parts = resultParts > 1 ? Array.from({ length: resultParts }, (_, n) => `C:\\ab\\.fw-ada-job-1\\results.tar.gz.part${String(n).padStart(3, '0')}`) : [];
    return `STATUS=OK\nPRESENT=1\nARCHIVE=C:\\ab\\.fw-ada-job-1\\results.tar.gz\nPARTS=${parts.length || 1}\n${parts.length ? `LOG:\n${parts.join('\n')}\n` : ''}`;
  };
  const slice = (part: number) => {
    const data = archive();
    const size = Math.ceil(data.length / resultParts);
    return data.subarray(part * size, (part + 1) * size);
  };
  let polls = 0;
  const server = createHttpServer((req, res) => {
    const url = req.url ?? '';
    // Downloads from the store carry no token, as the bot serves them; the API calls do.
    if (url.startsWith('/api/')) seen.tokens.add(req.headers.authorization ?? '');
    if (req.headers['x-requested-by']) seen.requestedBy.add(String(req.headers['x-requested-by']));
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (req.method === 'PUT' && url.startsWith('/api/agents/builder/files/')) {
        const name = decodeURIComponent(url.split('/').pop() ?? '');
        seen.uploads[name] = body.length;
        seen.stored[name] = body;
        return json(200, { ok: true, url: `http://127.0.0.1/download/agent-files/builder/${name}`, size: body.length });
      }
      if (req.method === 'POST' && url.startsWith('/api/agents/builder/pwsh')) {
        const script = body.toString('utf8');
        const step = /^# aifactory: (\w+)$/m.exec(script)?.[1] ?? 'unknown';
        seen.steps.push(step);
        seen.scripts[step] = script;
        const done = (stdout: string) => json(200, { id: `ps-${seen.steps.length}`, agent_id: 'builder', command: 'ps', status: 'succeeded', exit_code: 0, stdout, stderr: '', error: '' });
        if (step === 'diff') {
          const manifest = Object.entries(seen.stored).find(([name]) => name.endsWith('-manifest.gz'))?.[1];
          const files = manifest ? gunzipSync(manifest).toString('utf8').split('\n').filter(Boolean).length : 0;
          return done(`STATUS=OK\nFILES=${files}\nNEED=${need === 'all' && files > 0 ? `0-${files - 1}` : ''}\n`);
        }
        // sync and collect run in the background (RQ-0067): started, then polled.
        if (step === 'sync' || step === 'collect') return done('STATUS=STARTED\n');
        if (step === 'poll') {
          const name = /^# step: (\w+)$/m.exec(script)?.[1];
          if (name === 'sync') return done('STATUS=DONE\nEXIT=0\nLOG:\nSTATUS=SYNCED\nREMOVED=0\n');
          if (name === 'collect') return done(`STATUS=DONE\nEXIT=0\nLOG:\n${collectAnswer()}`);
        }
        if (step === 'start') return done('STATUS=STARTED\nPID=4242\n');
        if (step === 'status') {
          polls += 1;
          if (polls === 1) return done('STATUS=RUNNING\nOFFSET=20\nLOG:\nRunning on BUILDER\n');
          return done(`STATUS=DONE\nEXIT=${exitCode}\nOFFSET=40\nLOG:\nxsim finished\n`);
        }
        if (step === 'stop') return done('STATUS=STOPPED\n');
        if (step === 'clean') return done('STATUS=OK\n');
        return json(400, { error: `unknown step in ${script.slice(0, 80)}` });
      }
      if (req.method === 'POST' && url.startsWith('/api/agents/builder/jobs')) {
        const job = JSON.parse(body.toString('utf8')) as { command: string; args: string[] };
        if (job.command !== 'upload-file') return json(400, { error: `unexpected job ${job.command}` });
        seen.uploadFile = job.args;
        seen.uploadFiles.push(job.args);
        const port = (server.address() as { port: number }).port;
        return json(200, { id: 'up-1', agent_id: 'builder', command: 'upload-file', status: 'succeeded', exit_code: 0, stdout: `uploaded_url=http://127.0.0.1:${port}/download/agent-files/builder/${job.args[1]}\nsize=1`, stderr: '', error: '' });
      }
      if (url.startsWith('/download/agent-files/builder/') && url.endsWith('-results.tar.gz')) { res.writeHead(200, { 'Content-Type': 'application/gzip' }); return res.end(archive()); }
      const part = /-results\.tar\.gz\.part(\d{3})$/.exec(url);
      if (url.startsWith('/download/agent-files/builder/') && part) { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(slice(Number(part[1]))); }
      json(404, { error: `unexpected ${req.method} ${url}` });
    });
  });
  return { server, seen, listen: () => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))) };
}

test('the build stages over the bot: the sources through the store, the command in the background on the builder, the results back', async () => {
  const project = scaffold();
  const results = mkdtempSync(join(tmpdir(), 'builder-bot-'));
  try {
    const host = await hostModule(project.root);
    assert.equal(host.hostAccess({}), 'ssh');
    assert.throws(() => host.hostAccess({ VIVADO_ACCESS: 'agent' }), /VIVADO_ACCESS must be ssh or bot, not "agent"/);
    const botEnv = { VIVADO_ACCESS: 'bot', VIVADO_BOT_AGENT: 'builder', VIVADO_HOST_TYPE: 'windows', VIVADO_REMOTE_BASE_PATH: 'C:\\ab', VIVADO_REMOTE_PROJECT_NAME: 'fw-ada', VIVADO_BIN: 'C:\\Xilinx\\vivado.bat' };
    const settings = host.hostSettings(botEnv);
    assert.equal(settings.access, 'bot');
    assert.ok(settings.remote, 'the project lives on the builder');
    assert.equal(settings.host, 'builder', 'named by the agent when VIVADO_REMOTE_HOST is empty');
    assert.throws(() => host.hostSettings({ ...botEnv, VIVADO_BOT_AGENT: '' }), /VIVADO_BOT_AGENT is not set/);
    assert.throws(() => host.hostSettings({ ...botEnv, VIVADO_HOST_TYPE: 'linux' }), /VIVADO_HOST_TYPE must be windows with VIVADO_ACCESS=bot/);
    assert.throws(() => host.hostSettings({ ...botEnv, VIVADO_REMOTE_PROJECT_NAME: '' }), /VIVADO_REMOTE_PROJECT_NAME is not set, but VIVADO_ACCESS=bot/);
    assert.equal(host.hostSettings({ VIVADO_REMOTE_HOST: '', VIVADO_BIN: 'vivado' }).remote, false, 'ssh with no host: this machine');
    // The person's name, once (RQ-0058): the account and the host copy follow from it.
    const named = host.hostSettings({ VIVADO_REMOTE_HOST: '192.168.1.3', VIVADO_HOST_TYPE: 'windows', VIVADO_REMOTE_BASE_PATH: 'C:\\ab', BOT_API_AGENT: 'kaan' }) as unknown as { user: string; projectName: string };
    assert.equal(named.user, 'kaan');
    assert.match(named.projectName, /^[A-Za-z0-9._-]+-kaan$/);
    const explicit = host.hostSettings({ VIVADO_REMOTE_HOST: '192.168.1.3', VIVADO_HOST_TYPE: 'windows', VIVADO_REMOTE_BASE_PATH: 'C:\\ab', BOT_API_AGENT: 'kaan', VIVADO_REMOTE_USER: 'kaan.avci', VIVADO_REMOTE_PROJECT_NAME: 'fw-main' }) as unknown as { user: string; projectName: string };
    assert.deepEqual([explicit.user, explicit.projectName], ['kaan.avci', 'fw-main'], 'a line of .env still wins');
    assert.match(String((() => { try { host.hostSettings({ VIVADO_REMOTE_HOST: '192.168.1.3', VIVADO_HOST_TYPE: 'windows', VIVADO_REMOTE_BASE_PATH: 'C:\\ab' }); } catch (error) { return (error as Error).message; } return ''; })()), /VIVADO_REMOTE_USER is not set.*BOT_API_AGENT/);
    const lab = host.hostSettings({ BOARD_REMOTE_HOST: '192.168.1.2', BOARD_REMOTE_USER: 'root', BOARD_REMOTE_BASE_PATH: '/tmp/b', BOT_API_AGENT: 'kaan' }, 'BOARD') as unknown as { user: string; projectName: string };
    assert.equal(lab.user, 'root', 'the lab host\'s account is the lab\'s, not the person\'s');
    assert.match(lab.projectName, /-kaan$/);

    // The steps: every answer parsed the same way; the scripts carry their step name and no backtick escapes.
    assert.deepEqual(host.parseStep('STATUS=DONE\nEXIT=3\nOFFSET=12\nLOG:\nline one\nline two\n'), { STATUS: 'DONE', EXIT: '3', OFFSET: '12', log: 'line one\nline two\n' });
    assert.deepEqual(host.parseStep('STATUS=OK\n'), { STATUS: 'OK', log: '' });
    const jobDirectory = 'C:\\ab\\.fw-ada-job-1';
    const scripts = {
      runner: host.botRunnerScript({ settings, jobDirectory, command: ['C:\\Xilinx\\vivado.bat', '-mode', 'batch'] }),
      diff: host.botDiffScript({ settings, jobDirectory, manifestUrl: 'http://bot/download/agent-files/builder/m.gz' }),
      sync: host.botSyncScript({ settings, jobDirectory, partUrls: ['http://bot/download/agent-files/builder/src.tar.gz'], entries: ['designs', 'flow.tcl'], directories: ['out/led_counter'] }),
      start: host.botStartScript({ settings, jobDirectory, command: ['C:\\Xilinx\\vivado.bat', '-mode', 'batch'] }),
      status: host.botStatusScript({ jobDirectory, offset: 20 }),
      collect: host.botCollectScript({ settings, jobDirectory, pulls: ['out/led_counter/artifacts'] }),
      stop: host.botStopScript({ jobDirectory }),
      clean: host.botCleanScript({ jobDirectory }),
    };
    for (const [name, script] of Object.entries(scripts)) {
      if (name !== 'runner') assert.match(script, new RegExp(`^# aifactory: ${name}$`, 'm'));
      assert.doesNotMatch(script, /`/, `${name}: no PowerShell backtick escapes (they end a JS template)`);
    }
    assert.match(scripts.start, /Start-Process -FilePath 'powershell\.exe'[^\n]*-File/, 'the command runs in the background');
    assert.match(scripts.sync, /Unsafe entry/);
    assert.ok(scripts.sync.includes("-match '[\\\\/]'"), 'an entry with either separator is refused');
    assert.match(scripts.runner, /Set-Content -Path \(Join-Path \$Job 'exit\.txt'\)/);
    assert.match(scripts.stop, /taskkill\.exe \/PID \$ProcessId \/T \/F/);
    const pwsh = spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { stdio: 'pipe' });
    if (pwsh.status === 0) {
      for (const [name, script] of Object.entries(scripts)) {
        const path = join(results, `${name}.ps1`);
        writeFileSync(path, script);
        const parsed = spawnSync('pwsh', ['-NoProfile', '-Command', `$null = [scriptblock]::Create((Get-Content -Raw '${path}')); 'parsed'`], { stdio: 'pipe' });
        assert.match(String(parsed.stdout), /parsed/, `${name} parses as PowerShell: ${String(parsed.stderr)}`);
      }
    }

    // A sim through the bot: the stage prints the builder's log as it grows and brings the artifacts back.
    mkdirSync(join(results, 'out/led_counter/artifacts'), { recursive: true });
    writeFileSync(join(results, 'out/led_counter/artifacts/sim.log'), 'from the builder\n');
    const tar = spawnSync('tar', ['-czf', join(results, 'results.tar.gz'), '-C', results, 'out'], { stdio: 'pipe' });
    assert.equal(tar.status, 0, String(tar.stderr));
    const bot = fakeBuilderBot(join(results, 'results.tar.gz'), 0);
    const port = await bot.listen();
    const env = (more = '') => ['VIVADO_ACCESS=bot', 'VIVADO_BOT_AGENT=builder', 'VIVADO_HOST_TYPE=windows', 'VIVADO_REMOTE_BASE_PATH=C:\\ab', 'VIVADO_REMOTE_PROJECT_NAME=fw-ada',
      'VIVADO_BIN=C:\\Xilinx\\2025.2\\Vivado\\bin\\vivado.bat', 'VITIS_BIN=C:\\Xilinx\\2025.2\\Vitis\\bin\\vitis.bat',
      `BOT_API_URL=http://127.0.0.1:${port}`, 'BOT_API_TOKEN=bot-token', 'BOT_API_AGENT=ada', more, ''].join('\n');
    try {
      writeFileSync(join(project.root, '.env'), env());
      const result = await flowAsync(project.root, 'sim', 'led_counter');
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.match(result.stdout, /Running on BUILDER[\s\S]*xsim finished/, 'the log as it grew');
      assert.match(result.stdout, /Brought back out\/led_counter\/artifacts/);
      assert.equal(project.read('out/led_counter/artifacts/sim.log'), 'from the builder\n');
      assert.deepEqual(bot.seen.steps, ['diff', 'sync', 'poll', 'start', 'status', 'status', 'collect', 'poll', 'clean']);
      const [manifestName, archiveName] = Object.keys(bot.seen.uploads);
      assert.match(manifestName, /^fw-ada-\d+-\d+-manifest\.gz$/, 'the list first');
      assert.match(archiveName, /^fw-ada-\d+-\d+-src\.tar\.gz$/, 'then one archive: under 8 MB, no parts');
      assert.equal(Object.keys(bot.seen.uploads).length, 2);
      assert.ok(bot.seen.uploads[archiveName] > 100, 'the archive has the sources');
      const listed = gunzipSync(bot.seen.stored[manifestName]).toString('utf8').split('\n').filter(Boolean);
      assert.ok(listed.some((line) => /^[0-9a-f]{64}\t\d+\tscripts\/flow\.mjs$/.test(line)), 'sha256, size, path');
      assert.ok(!listed.some((line) => /\t(\.env|out\/.*|node_modules\/.*)$/.test(line)), 'what the archive always left out stays out');
      assert.match(result.stdout, new RegExp(`Sources: ${listed.length} of ${listed.length} files changed \\(\\d+ KB\\) sent to builder`));
      // Values travel base64-encoded JSON, so cmd.exe's quoting never sees them.
      const archiveUrl = `http://127.0.0.1/download/agent-files/builder/${archiveName}`;
      assert.ok(innerScript(bot.seen.scripts.sync).includes(Buffer.from(JSON.stringify([archiveUrl])).toString('base64')), 'the sync step fetches the archive the stage put in the store');
      assert.deepEqual(bot.seen.uploadFile?.[0], 'C:\\ab\\.fw-ada-job-1\\results.tar.gz');
      assert.match(bot.seen.uploadFile?.[1] ?? '', /^fw-ada-\d+-\d+-results\.tar\.gz$/);
      assert.deepEqual([...bot.seen.tokens], ['Bearer bot-token']);
      assert.deepEqual([...bot.seen.requestedBy], ['ada']);
      assert.ok(!existsSync(join(project.root, 'twin-run')), 'nothing of the ssh way');
    } finally {
      bot.server.closeAllConnections();
      bot.server.close();
    }

    // The command failing on the builder fails the stage with its exit code, after the results and the cleanup.
    const failing = fakeBuilderBot(join(results, 'results.tar.gz'), 3);
    const port2 = await failing.listen();
    try {
      writeFileSync(join(project.root, '.env'), env('BOT_API_CHUNK_KB=4').replace(`127.0.0.1:${port}`, `127.0.0.1:${port2}`));
      const result = await flowAsync(project.root, 'sim', 'led_counter');
      assert.equal(result.status, 3, result.stderr + result.stdout);
      assert.match(result.stderr, /failed with exit code 3/);
      assert.deepEqual(failing.seen.steps, ['diff', 'sync', 'poll', 'start', 'status', 'status', 'collect', 'poll', 'clean']);
      // Over BOT_API_CHUNK_KB the archive goes in parts, each its own upload, joined in order on the builder.
      const parts = Object.keys(failing.seen.uploads).filter((name) => /-src\.tar\.gz\.part\d{3}$/.test(name));
      assert.ok(parts.length > 1, `in parts: ${Object.keys(failing.seen.uploads).join(', ')}`);
      assert.ok(Object.entries(failing.seen.uploads).every(([name, size]) => !name.includes('.part') || size <= 4096));
      const joined = Buffer.concat(parts.map((name) => failing.seen.stored[name]));
      assert.ok(gunzipSync(joined).length > 0, 'the parts join into the archive');
      const urls = parts.map((name) => `http://127.0.0.1/download/agent-files/builder/${name}`);
      assert.ok(innerScript(failing.seen.scripts.sync).includes(Buffer.from(JSON.stringify(urls)).toString('base64')), 'the sync step gets every part, in order');
      assert.match(result.stdout, /Sources: part 1 of \d+/);
    } finally {
      failing.server.closeAllConnections();
      failing.server.close();
    }

    // Nothing changed on the builder's side: no archive at all.
    const unchanged = fakeBuilderBot(join(results, 'results.tar.gz'), 0, 'none', 3);
    const port3 = await unchanged.listen();
    try {
      writeFileSync(join(project.root, '.env'), env().replace(`127.0.0.1:${port}`, `127.0.0.1:${port3}`));
      const result = await flowAsync(project.root, 'sim', 'led_counter');
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.match(result.stdout, /Sources: up to date on builder \(\d+ files\)/);
      assert.deepEqual(Object.keys(unchanged.seen.uploads).filter((name) => !name.endsWith('-manifest.gz')), [], 'only the list goes up');
      assert.deepEqual(unchanged.seen.steps, ['diff', 'sync', 'poll', 'start', 'status', 'status', 'collect', 'poll', 'clean']);
      // The results in three parts (RQ-0066): each through the store on its own, joined here.
      assert.deepEqual(unchanged.seen.uploadFiles.map((args) => args[1].replace(/^fw-ada-\d+-\d+-/, '')), ['results.tar.gz.part000', 'results.tar.gz.part001', 'results.tar.gz.part002']);
      assert.deepEqual(unchanged.seen.uploadFiles.map((args) => args[0].slice(-7)), ['part000', 'part001', 'part002']);
      assert.match(result.stdout, /Results: part 3 of 3/);
      assert.equal(project.read('out/led_counter/artifacts/sim.log'), 'from the builder\n');
      assert.match(innerScript(unchanged.seen.scripts.collect), /\$ChunkBytes = \[long\]8388608/, 'BOT_API_CHUNK_KB sizes the parts');
    } finally {
      unchanged.server.closeAllConnections();
      unchanged.server.close();
    }
  } finally {
    project.done();
    rmSync(results, { recursive: true, force: true });
  }
});

// The diff and sync steps as the builder runs them, under PowerShell (pwsh
// here, Windows PowerShell there) against a project copy in a directory: the
// store is a small HTTP server, the archive is made as the stage makes it.
test('the sources go to the builder only as they change: the diff and sync steps under PowerShell', async (t) => {
  if (spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { stdio: 'pipe' }).status !== 0) {
    t.skip('pwsh is not installed');
    return;
  }
  const project = scaffold();
  const work = mkdtempSync(join(tmpdir(), 'builder-sync-'));
  const stored = new Map<string, Buffer>();
  const server = createHttpServer((req, res) => {
    const body = stored.get(decodeURIComponent((req.url ?? '').slice(1)));
    res.writeHead(body ? 200 : 404);
    res.end(body ?? '');
  });
  const port = await new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)));
  const pwsh = (script: string, name: string) => new Promise<string>((resolve, reject) => {
    const path = join(work, `${name}.ps1`);
    writeFileSync(path, script);
    execFile('pwsh', ['-NoProfile', '-NonInteractive', '-File', path], (error, stdout, stderr) => (error ? reject(new Error(`${name}: ${stderr || stdout}`)) : resolve(stdout)));
  });
  try {
    const host = await hostModule(project.root);
    const settings = { remote: true, hostType: 'linux', basePath: join(work, 'host'), projectName: 'fw-ada' };
    const copy = join(work, 'host', 'fw-ada');
    const entries = readdirSync(project.root).filter((name) => !['.env', '.git', '.DS_Store', 'node_modules', 'out', 'references', 'runs', 'handoffs'].includes(name) && !name.endsWith('.log')).sort();
    let round = 0;
    // One sync as the stage does it: the list, the diff, the needed files in `parts` parts, the sync.
    // `plain`: the list as Invoke-WebRequest leaves it when the bot serves the
    // .gz with Content-Encoding: gzip, as it does.
    const sync = async (parts = 1, plain = false) => {
      round += 1;
      const jobDirectory = join(work, `job-${round}`);
      const files = host.sourceManifest(project.root);
      const list = Buffer.from(files.map((file) => `${file.hash}\t${file.size}\t${file.path}\n`).join(''));
      stored.set(`m${round}.gz`, plain ? list : gzipSync(list));
      const diff = host.parseStep(await pwsh(host.botDiffScript({ settings, jobDirectory, manifestUrl: `http://127.0.0.1:${port}/m${round}.gz` }), 'diff'));
      assert.equal(Number(diff.FILES), files.length);
      const needed = host.parseRanges(diff.NEED).map((index) => files[index].path);
      const partUrls: string[] = [];
      if (needed.length > 0) {
        writeFileSync(join(work, 'list'), needed.map((path) => `${path}\n`).join(''));
        const tar = spawnSync('tar', ['-czf', join(work, 'src.tar.gz'), '-T', join(work, 'list')], { cwd: project.root, stdio: 'pipe', env: { ...process.env, COPYFILE_DISABLE: '1' } });
        assert.equal(tar.status, 0, String(tar.stderr));
        const data = readFileSync(join(work, 'src.tar.gz'));
        const size = Math.ceil(data.length / parts);
        for (let part = 0; part < parts; part += 1) {
          stored.set(`s${round}.${part}`, data.subarray(part * size, (part + 1) * size));
          partUrls.push(`http://127.0.0.1:${port}/s${round}.${part}`);
        }
      }
      const synced = host.parseStep(await pwsh(host.botSyncScript({ settings, jobDirectory, partUrls, entries, directories: ['out/led_counter'] }), 'sync'));
      assert.equal(synced.STATUS, 'SYNCED');
      return { needed, removed: Number(synced.REMOVED) };
    };
    const flow = 'scripts/flow.mjs';
    const sameAsHere = (path: string) => readFileSync(join(copy, path)).equals(readFileSync(join(project.root, path)));

    // The first sync sends everything, in three parts joined in order; the copy is the project.
    const first = await sync(3);
    assert.equal(first.needed.length, host.sourceManifest(project.root).length);
    assert.equal(first.removed, 0);
    for (const file of host.sourceManifest(project.root)) assert.ok(sameAsHere(file.path), file.path);
    assert.ok(existsSync(join(copy, 'out/led_counter')), 'the directories the command needs');
    assert.match(readFileSync(join(copy, '.aifactory-sync'), 'utf8'), /^[0-9a-f]{64}\t\d+\t\d+\tscripts\/flow\.mjs$/m, 'the sync is recorded');

    // Nothing changed: nothing to send (the list read unpacked as well).
    assert.deepEqual(await sync(1, true), { needed: [], removed: 0 });

    // One file changed here: that file alone.
    writeFileSync(join(project.root, flow), `${readFileSync(join(project.root, flow), 'utf8')}\n// changed\n`);
    assert.deepEqual((await sync()).needed, [flow]);
    assert.ok(sameAsHere(flow));

    // A file deleted here goes there too, and its emptied directory with it;
    // what the stages leave (out/) and stray files outside the sources stay.
    mkdirSync(join(project.root, 'notes/deep'), { recursive: true });
    writeFileSync(join(project.root, 'notes/deep/a.txt'), 'a\n');
    assert.deepEqual((await sync()).needed, ['notes/deep/a.txt']);
    rmSync(join(project.root, 'notes'), { recursive: true });
    writeFileSync(join(copy, 'out/led_counter/kept.txt'), 'a stage left this\n');
    const deleted = await sync();
    assert.deepEqual(deleted, { needed: [], removed: 1 });
    assert.ok(!existsSync(join(copy, 'notes')), 'the emptied directories go');
    assert.ok(existsSync(join(copy, 'out/led_counter/kept.txt')), 'out/ stays');

    // Changed there (a file of the sources edited on the builder, a stray file
    // among them): the source is sent again, the stray file goes.
    writeFileSync(join(copy, flow), 'edited on the builder\n');
    writeFileSync(join(copy, 'scripts/stray.tcl'), 'left by a tool\n');
    const repaired = await sync();
    assert.deepEqual(repaired, { needed: [flow], removed: 1 });
    assert.ok(sameAsHere(flow));
    assert.ok(!existsSync(join(copy, 'scripts/stray.tcl')));

    // Python's __pycache__ beside scripts/vitis_sw.py on the builder is no source: kept, not counted (RQ-0076).
    mkdirSync(join(copy, 'scripts/__pycache__'), { recursive: true });
    writeFileSync(join(copy, 'scripts/__pycache__/vitis_sw.cpython-313.pyc'), 'bytecode');
    assert.deepEqual(await sync(), { needed: [], removed: 0 });
    assert.ok(existsSync(join(copy, 'scripts/__pycache__/vitis_sw.cpython-313.pyc')));
    mkdirSync(join(project.root, 'scripts/__pycache__'), { recursive: true });
    writeFileSync(join(project.root, 'scripts/__pycache__/local.pyc'), 'bytecode');
    assert.ok(!host.sourceManifest(project.root).some((file) => file.path.includes('__pycache__')), 'nor one here');
    rmSync(join(project.root, 'scripts/__pycache__'), { recursive: true });

    // The results in parts (RQ-0066): the collect step cuts the archive; the
    // parts joined in order are the archive, and it unpacks to what was there.
    mkdirSync(join(copy, 'out/led_counter/artifacts'), { recursive: true });
    const bitstream = randomBytes(50_000); // a bitstream does not compress much either
    writeFileSync(join(copy, 'out/led_counter/artifacts/top.bit'), bitstream);
    const collectJob = join(work, 'job-collect');
    mkdirSync(collectJob);
    const collected = host.parseStep(await pwsh(host.botCollectScript({ settings, jobDirectory: collectJob, pulls: ['out/led_counter/artifacts', 'out/led_counter/missing.log'], chunkBytes: 16 * 1024 }), 'collect'));
    assert.equal(collected.PRESENT, '1');
    const parts = collected.log.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    assert.equal(Number(collected.PARTS), parts.length);
    assert.ok(parts.length > 1, `in parts: ${parts.join(', ')}`);
    assert.deepEqual(parts.map((path) => path.slice(-7)), parts.map((_, n) => `part${String(n).padStart(3, '0')}`));
    for (const path of parts) assert.ok(readFileSync(path).length <= 16 * 1024);
    assert.ok(Buffer.concat(parts.map((path) => readFileSync(path))).equals(readFileSync(collected.ARCHIVE)), 'the parts are the archive');
    const unpacked = join(work, 'unpacked');
    mkdirSync(unpacked);
    writeFileSync(join(work, 'joined.tar.gz'), Buffer.concat(parts.map((path) => readFileSync(path))));
    assert.equal(spawnSync('tar', ['-xf', join(work, 'joined.tar.gz'), '-C', unpacked]).status, 0);
    assert.ok(readFileSync(join(unpacked, 'out/led_counter/artifacts/top.bit')).equals(bitstream));
    const small = host.parseStep(await pwsh(host.botCollectScript({ settings, jobDirectory: collectJob, pulls: ['out/led_counter/artifacts'] }), 'collect'));
    assert.deepEqual([small.PARTS, small.log.trim()], ['1', small.ARCHIVE], 'under 8 MB: the archive itself');

    // In the background (RQ-0067): a step started, polled until it ends, its
    // own answer read from its output; a step that throws ends non-zero.
    const background = async (name: string, script: string) => {
      const jobDirectory = join(work, `bg-${name}`);
      assert.equal(host.parseStep(await pwsh(host.botBackgroundScript({ jobDirectory, name, script }), `${name}-start`)).STATUS, 'STARTED');
      for (let tries = 0; tries < 120; tries += 1) {
        const polled = host.parseStep(await pwsh(host.botPollScript({ jobDirectory, name }), `${name}-poll`));
        if (polled.STATUS === 'DONE') return polled;
        assert.equal(polled.STATUS, 'RUNNING');
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(`${name} did not end`);
    };
    const slow = await background('slow', "$ErrorActionPreference = 'Stop'\nStart-Sleep -Seconds 2\nWrite-Output 'STATUS=SYNCED'\nWrite-Output 'REMOVED=4'\nWrite-Output 'LOG:'\nWrite-Output 'a/b.v'\n");
    assert.equal(slow.EXIT, '0');
    const answer = host.parseStep(slow.log.replace(/^\uFEFF/, ''));
    assert.deepEqual([answer.STATUS, answer.REMOVED, answer.log.trim()], ['SYNCED', '4', 'a/b.v']);
    const broken = await background('broken', "$ErrorActionPreference = 'Stop'\nthrow 'no tar here'\n");
    assert.notEqual(broken.EXIT, '0');
    assert.match(broken.log, /no tar here/);

    // The ranges the diff step answers with.
    assert.deepEqual(host.parseRanges('0-2,5,7-8'), [0, 1, 2, 5, 7, 8]);
    assert.deepEqual(host.parseRanges(''), []);
    assert.throws(() => host.parseRanges('4-2'), /Not an index range: 4-2/);
    assert.equal(host.chunkBytes({}), 8192 * 1024);
    assert.equal(host.chunkBytes({ BOT_API_CHUNK_KB: '64' }), 64 * 1024);
    assert.throws(() => host.chunkBytes({ BOT_API_CHUNK_KB: 'big' }), /BOT_API_CHUNK_KB must be a positive whole number/);
  } finally {
    server.close();
    project.done();
    rmSync(work, { recursive: true, force: true });
  }
});

// The builder's leftovers (RQ-0065): the prune script under PowerShell
// against a base directory holding every kind of entry, and the branches
// that keep their CI copies read from origin.
test('prune removes the CI copies of gone branches, orphaned Vitis workspaces and stale job directories, and never a person\'s copy', async (t) => {
  const project = scaffold();
  const work = mkdtempSync(join(tmpdir(), 'builder-prune-'));
  try {
    const flow = await import(pathToFileURL(join(project.root, 'scripts/flow.mjs')).href) as {
      refSlug: (name: string) => string;
      liveRefSlugs: (root: string) => string[];
    };
    assert.equal(flow.refSlug('factory/RQ-0004'), 'factory-rq-0004');
    assert.equal(flow.refSlug('Feature/Über_HDMI--x'), 'feature--ber-hdmi--x');
    assert.equal(flow.refSlug(`-${'a'.repeat(70)}`), 'a'.repeat(62));

    // origin's branches, as GitLab keeps them after a merge removed one.
    const git = (cwd: string, ...args: string[]) => {
      const run = spawnSync('git', args, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
      assert.equal(run.status, 0, `git ${args.join(' ')}: ${String(run.stderr)}`);
    };
    const origin = join(work, 'origin.git');
    const clone = join(work, 'clone');
    git(work, 'init', '-q', '--bare', origin);
    git(work, 'init', '-q', '-b', 'main', clone);
    writeFileSync(join(clone, 'a'), 'a');
    git(clone, 'add', 'a');
    git(clone, 'commit', '-q', '-m', 'a');
    git(clone, 'remote', 'add', 'origin', origin);
    assert.throws(() => flow.liveRefSlugs(clone), /origin lists no branch; nothing removed/, 'an empty answer removes nothing');
    git(clone, 'push', '-q', 'origin', 'main', 'main:factory/RQ-0004');
    assert.deepEqual(flow.liveRefSlugs(clone), ['factory-rq-0004', 'main']);
    // Not a clone, and no "origin" next to it git could read as a path.
    const nowhere = join(work, 'nowhere');
    mkdirSync(nowhere);
    assert.throws(() => flow.liveRefSlugs(nowhere), /PRUNE FAILED: git ls-remote origin/);

    if (spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { stdio: 'pipe' }).status !== 0) {
      t.diagnostic('pwsh is not installed: the prune script itself is not run');
      return;
    }
    const host = await import(pathToFileURL(join(project.root, 'scripts/vivado-host.mjs')).href) as {
      hostPruneScript: (job: { settings: unknown; project: string; keep: string[] }) => string;
      parseStep: (text: string) => Record<string, string> & { log: string };
    };
    const base = join(work, 'ab');
    const old = (hours: number) => new Date(Date.now() - hours * 3600_000);
    const entry = (path: string, hours: number, owner?: string) => {
      mkdirSync(join(base, path), { recursive: true });
      writeFileSync(join(base, path, 'file'), 'x');
      if (owner !== undefined) writeFileSync(join(base, path, '.owner'), owner);
      utimesSync(join(base, path), old(hours), old(hours));
    };
    entry('embedded1-b-main', 30);                              // its branch is there
    entry('embedded1-b-factory-rq-0004', 30);                   // so is this one's
    entry('embedded1-b-factory-rq-0009', 30);                   // merged and gone
    entry('embedded1-s-factory-rq-0010', 1);                    // gone, but touched an hour ago
    entry('embedded1-embedded_build-factory-rq-0002', 300);     // the name before RQ-0063
    entry('embedded1-kavci', 900);                              // a person's copy
    entry('other-b-factory-rq-0001', 300);                      // another project's
    entry('.embedded1-batur-job-1-2', 30);                      // a bot job left behind
    entry('.embedded1-batur-job-3-4', 3);                       // one that may be running
    entry('.embedded1-b-main-sync-77', 30);                     // an ssh sync left behind
    entry('.v/aaaa1111', 30, join(base, 'embedded1-b-factory-rq-0009'));
    entry('.v/bbbb2222', 30, join(base, 'embedded1-kavci'));
    entry('.v/cccc3333', 200);                                  // no owner, over a week
    entry('.v/dddd4444', 30, join(base, 'other-b-factory-rq-0002'));
    entry('.v/eeee5555', 30);                                   // no owner, a day old
    // IP cache entries (RQ-0080), judged by their files' last write or read.
    const cached = (path: string, days: number, readDaysAgo = days) => {
      mkdirSync(join(base, '.ipc', path), { recursive: true });
      for (const name of ['stats.txt', 'ip.dcp']) {
        writeFileSync(join(base, '.ipc', path, name), 'x');
        utimesSync(join(base, '.ipc', path, name), old(readDaysAgo * 24), old(days * 24));
      }
      utimesSync(join(base, '.ipc', path), old(days * 24), old(days * 24));
    };
    cached('0/9/093202f91eb5376e', 45);                         // unused for 45 days
    cached('0/9/0911111111111111', 45, 2);                      // written 45 days ago, read two days ago
    cached('1/a/1a22222222222222', 3);                          // used this week
    cached('d/e/de33333333333333', 31);                         // alone in its folders
    const settings = { basePath: base, projectName: 'embedded1-b-prune' };
    const script = host.hostPruneScript({ settings, project: 'embedded1', keep: ['factory-rq-0004', 'main'] });
    assert.match(script, /^# aifactory: prune$/m);
    assert.doesNotMatch(script, /`/, 'no PowerShell backtick escapes');
    writeFileSync(join(work, 'prune.ps1'), script);
    const run = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', join(work, 'prune.ps1')], { stdio: 'pipe' });
    assert.equal(run.status, 0, String(run.stderr));
    const step = host.parseStep(String(run.stdout));
    const removed = step.log.split(/\r?\n/).map((line) => line.trim().replace(/\\/g, '/')).filter(Boolean).sort();
    assert.deepEqual(removed, [
      '.embedded1-b-main-sync-77', '.embedded1-batur-job-1-2', '.ipc/0/9/093202f91eb5376e', '.ipc/d/e/de33333333333333',
      '.v/aaaa1111', '.v/cccc3333', 'embedded1-b-factory-rq-0009', 'embedded1-embedded_build-factory-rq-0002',
    ]);
    assert.equal(step.REMOVED, '8');
    assert.ok(!existsSync(join(base, '.ipc/d')), 'the folders an entry leaves empty go');
    assert.ok(existsSync(join(base, '.ipc/0/9')), 'a folder with an entry left stays');
    for (const path of removed) assert.ok(!existsSync(join(base, path)), `${path} is gone`);
    for (const path of ['embedded1-b-main', 'embedded1-b-factory-rq-0004', 'embedded1-s-factory-rq-0010', 'embedded1-kavci',
      'other-b-factory-rq-0001', '.embedded1-batur-job-3-4', '.v/bbbb2222', '.v/dddd4444', '.v/eeee5555',
      '.ipc/0/9/0911111111111111', '.ipc/1/a/1a22222222222222']) {
      assert.ok(existsSync(join(base, path)), `${path} stays`);
    }
  } finally {
    project.done();
    rmSync(work, { recursive: true, force: true });
  }
});

test('the bot client sends an upload or a download again when the connection drops, and never a request that starts something', async () => {
  const project = scaffold();
  const directory = mkdtempSync(join(tmpdir(), 'bot-retry-'));
  const previous = process.env.BOT_API_RETRY_MS;
  process.env.BOT_API_RETRY_MS = '10';
  // Drops the first `drops` connections of each kind before answering, as a
  // flaky ZeroTier link did on 20 October.
  const seen = { puts: 0, gets: 0, jobs: 0, stored: 0 };
  let drops = 2;
  const server = createHttpServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (req.method === 'PUT') {
        seen.puts += 1;
        if (seen.puts <= drops) return req.socket.destroy();
        seen.stored = Buffer.concat(chunks).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, url: 'http://bot/download/agent-files/builder/src.tar.gz', size: seen.stored }));
      }
      if (req.method === 'GET') {
        seen.gets += 1;
        if (seen.gets <= drops) return req.socket.destroy();
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return res.end('results');
      }
      seen.jobs += 1;
      req.socket.destroy();
    });
  });
  const port = await new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)));
  try {
    const bot = await labBotModule(project.root);
    const env = { BOT_API_URL: `http://127.0.0.1:${port}`, BOT_API_TOKEN: 't', BOT_API_AGENT: 'kaan' };
    assert.equal(await bot.botUpload(env, 'builder', 'src.tar.gz', Buffer.alloc(64 * 1024, 1), 'BUILD'), 'http://bot/download/agent-files/builder/src.tar.gz');
    assert.equal(seen.puts, 3, 'two drops, then the upload went through');
    assert.equal(seen.stored, 64 * 1024, 'the whole archive the third time');
    await bot.botDownload(`http://127.0.0.1:${port}/download/agent-files/builder/results.tar.gz`, join(directory, 'results'), 'BUILD');
    assert.equal(readFileSync(join(directory, 'results'), 'utf8'), 'results');

    // Starting a job is sent once: a dropped start is an error, not a second job.
    await assert.rejects(bot.botJob(env, 'builder', 'upload-file', ['C:\\x', 'y'], { stage: 'BUILD' }), /BUILD FAILED: cannot reach the lab bot for upload-file on builder/);
    assert.equal(seen.jobs, 1);

    // A link that stays down ends with the cause and the tries.
    drops = 99;
    seen.puts = 0;
    await assert.rejects(bot.botUpload(env, 'builder', 'src.tar.gz', Buffer.alloc(10), 'BUILD'), /cannot reach the lab bot for the upload of src\.tar\.gz \(0 KB\): .*\(4 tries\)/);
    assert.equal(seen.puts, 4);
  } finally {
    if (previous === undefined) delete process.env.BOT_API_RETRY_MS;
    else process.env.BOT_API_RETRY_MS = previous;
    server.closeAllConnections();
    server.close();
    project.done();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the Vivado runs at once: --jobs, else VIVADO_JOBS, else 4', async () => {
  const project = scaffold();
  try {
    const flow = await import(pathToFileURL(join(project.root, 'scripts/flow.mjs')).href) as {
      parseArguments: (argv: string[]) => { jobs?: number };
      vivadoJobs: (options: { jobs?: number }, env: Record<string, string>) => number;
    };
    assert.equal(flow.vivadoJobs(flow.parseArguments(['build']), {}), 4);
    assert.equal(flow.vivadoJobs(flow.parseArguments(['build']), { VIVADO_JOBS: '8' }), 8);
    assert.equal(flow.vivadoJobs(flow.parseArguments(['build', '--jobs', '2']), { VIVADO_JOBS: '8' }), 2, '--jobs wins');
    assert.throws(() => flow.vivadoJobs(flow.parseArguments(['build']), { VIVADO_JOBS: 'many' }), /VIVADO_JOBS must be a positive integer, not "many"/);
    assert.match(project.read('.env.example'), /^VIVADO_JOBS=$/m);
  } finally {
    project.done();
  }
});

test('the threads of one Vivado run: --threads, else VIVADO_THREADS, else 8, in every run', async () => {
  const project = scaffold();
  try {
    const flow = await import(pathToFileURL(join(project.root, 'scripts/flow.mjs')).href) as {
      parseArguments: (argv: string[]) => { threads?: number };
      vivadoThreads: (options: { threads?: number }, env: Record<string, string>) => number;
    };
    assert.equal(flow.vivadoThreads(flow.parseArguments(['build']), {}), 8);
    assert.equal(flow.vivadoThreads(flow.parseArguments(['build']), { VIVADO_THREADS: '4' }), 4);
    assert.equal(flow.vivadoThreads(flow.parseArguments(['build', '--threads', '2']), { VIVADO_THREADS: '4' }), 2, '--threads wins');
    assert.throws(() => flow.vivadoThreads(flow.parseArguments(['build']), { VIVADO_THREADS: '64' }), /VIVADO_THREADS must be 1 to 32, not "64"/);
    assert.throws(() => flow.parseArguments(['build', '--threads', '0']), /--threads is 1 to 32/);
    assert.match(project.read('.env.example'), /^VIVADO_THREADS=$/m);
    assert.match(project.read('scripts/flow.mjs'), /'--threads', String\(options\.threads\)/);
    // Vivado takes it in this session and, through a hook, in each project run.
    const lib = project.read('common/flow_lib.tcl');
    assert.match(lib, /--jobs 4 --threads ""/);
    assert.match(lib, /set_param general\.maxThreads \$threads/);
    assert.match(lib, /foreach \{run step\} \{synth_1 SYNTH_DESIGN impl_1 INIT_DESIGN\}/);
    assert.match(lib, /set_property STEPS\.\$step\.TCL\.PRE \$hook \$handle/);
    assert.match(lib, /update_compile_order -fileset sources_1\n {4}thread_hooks\n/);
  } finally {
    project.done();
  }
});

test('the out-of-context IP cache is shared by the copies on a build host, and no run is incremental', async () => {
  const project = scaffold();
  try {
    const flow = await import(pathToFileURL(join(project.root, 'scripts/flow.mjs')).href) as {
      ipCachePath: (settings: { remote: boolean; basePath: string; hostType: string }) => string;
    };
    // Beside the copies on the host (C:\ab\.ipc, not in any copy), else under out/.
    assert.equal(flow.ipCachePath({ remote: true, basePath: 'C:\\ab', hostType: 'windows' }), 'C:\\ab\\.ipc');
    assert.equal(flow.ipCachePath({ remote: true, basePath: 'C:\\ab\\', hostType: 'windows' }), 'C:\\ab\\.ipc');
    assert.equal(flow.ipCachePath({ remote: true, basePath: '/srv/builds/', hostType: 'linux' }), '/srv/builds/.ipc');
    assert.equal(flow.ipCachePath({ remote: false, basePath: '', hostType: 'linux' }), 'out/ip_cache');
    assert.match(project.read('scripts/flow.mjs'), /'--ip-cache', ipCachePath\(settings\)/);
    const lib = project.read('common/flow_lib.tcl');
    assert.match(lib, /--threads "" --ip-cache ""/);
    // Set before the block design's output products are made, so its IP runs use it.
    const cache = lib.indexOf('config_ip_cache -use_cache_location');
    assert.ok(cache > 0 && cache < lib.indexOf('generate_target all $bd'));
    // No incremental flow (RQ-0086): set back to off on both runs, where Vivado has the property.
    assert.match(lib, /foreach name \{synth_1 impl_1\}/);
    assert.match(lib, /set_property AUTO_INCREMENTAL_CHECKPOINT 0 \$run/);
    assert.doesNotMatch(lib, /AUTO_INCREMENTAL_CHECKPOINT 1/);
  } finally {
    project.done();
  }
});

test('the twin stage says when there is nothing to run, and names what is missing', () => {
  const project = scaffold();
  try {
    let result = project.flow('twin');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /hello_ps: twin: no twin for zedboard yet \(TWIN_PROJECT/);
    assert.match(result.stdout, /led_counter: twin: no twin for zedboard yet \(TWIN_PROJECT/);

    writeFileSync(join(project.root, 'boards/zedboard.yaml'), project.read('boards/zedboard.yaml') + BFI_BOARD.split('\n').slice(4).join('\n'));
    result = project.flow('twin', 'led_counter');
    assert.match(result.stdout, /led_counter: twin: no software \(VITIS is not set\)/);
    result = project.flow('twin', 'hello_ps');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no out\/hello_ps\/artifacts\/hello_ps_app\.elf; run the build and sw stages first/);
    mkdirSync(join(project.root, 'out/hello_ps/artifacts'), { recursive: true });
    writeFileSync(join(project.root, 'out/hello_ps/artifacts/hello_ps_app.elf'), 'ELF');
    result = project.flow('twin', 'hello_ps');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /TWIN_GITLAB_TOKEN is not set: a token on http:\/\/gitlab\.bcintr\.int with read_api and read_registry/);
  } finally {
    project.done();
  }
});

async function boardModule(root: string) {
  return import(pathToFileURL(join(root, 'scripts/board.mjs')).href) as Promise<{
    findOutlet: (status: string, name: string) => { socket: string; on: boolean } | undefined;
    readFromZip: (zip: Buffer, suffix: string) => Buffer | undefined;
    processorType: (board: string) => string | undefined;
    loadScript: (options: { hwServer: string; cable: string; directory: string; processor: unknown; logFile?: string }) => string;
    runScript: () => string;
    boardAccess: (env: Record<string, string>) => string;
    parseConsole: (text: string) => { agent: string; com: string };
    bridgeOwner: (env: Record<string, string>, projectName?: string) => string;
    parseBridge: (text: string) => { host?: string; port?: number; owner?: string; error?: string };
    readConsole: (host: string, port: number) => { readonly text: string; error?: Error; ready: Promise<void>; stop: () => void };
    waitForConsole: (reader: unknown, test: unknown, options?: { pause?: number }) => Promise<string>;
  }>;
}

// A zip with one deflated entry, as an XSA holds ps7_init.tcl.
function zipOf(name: string, text: string): Buffer {
  const data = deflateRawSync(Buffer.from(text));
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(text.length, 22); local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(text.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12); end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
}

test('the board stage finds the outlet, reads the init from the XSA and programs only its own cable', async () => {
  const project = scaffold();
  try {
    const board = await boardModule(project.root);
    // The lab bot's power status, as it answered on 17 October.
    const status = 'Power status:\nA (Gen ZU-5EV 1) → Off\nD (Zedboard - 1) → Off\nG (Aselsan BFI Prototip) → On';
    assert.deepEqual(board.findOutlet(status, 'Zedboard - 1'), { socket: 'D', on: false });
    assert.deepEqual(board.findOutlet(status, 'Aselsan BFI Prototip'), { socket: 'G', on: true });
    assert.equal(board.findOutlet(status, 'Nexys'), undefined);

    assert.equal(board.readFromZip(zipOf('ps7_init.tcl', 'proc ps7_init {} {}\n'), 'ps7_init.tcl')?.toString(), 'proc ps7_init {} {}\n');
    assert.equal(board.readFromZip(zipOf('other.txt', 'x'), 'ps7_init.tcl'), undefined);
    assert.equal(board.processorType(project.read('boards/zedboard.yaml')), 'zynq7000');

    const processor = { init: 'ps7_init.tcl', run: ['ps7_init', 'ps7_post_config'], fpga: 'xc7z*', reset: 'APU*', core: '*Cortex-A9*#0' };
    const load = board.loadScript({ hwServer: 'lab:3121', cable: '210248B849E0', directory: '/srv/p/board-run/hello_ps', processor });
    // Every target is chosen on this cable: another board on the hw_server is never touched.
    const selections = load.match(/targets -set -filter \{[^}]*\}/g) ?? [];
    assert.ok(selections.length >= 4);
    for (const selection of selections) assert.match(selection, /jtag_cable_serial =~ "210248B849E0\*"/);
    assert.match(load, /rst -system[\s\S]*fpga \/srv\/p\/board-run\/hello_ps\/fpga\.bit[\s\S]*source \/srv\/p\/board-run\/hello_ps\/ps7_init\.tcl\n {4}ps7_init\n {4}ps7_post_config[\s\S]*dow \/srv\/p\/board-run\/hello_ps\/app\.elf\n {4}con/);
    assert.doesNotMatch(load, /flash|program_flash/i);

    const run = board.runScript();
    assert.match(run, /^#!\/bin\/sh/);
    assert.match(run, /cat "\$port" > console\.log &[\s\S]*"\$xsdb" load\.tcl/, 'the console is read before the board is programmed');
  } finally {
    project.done();
  }
});

test('the board stage over the bot: the console through the bridge, xsdb elsewhere, nothing on the lab host', async () => {
  const project = scaffold();
  try {
    const board = await boardModule(project.root);
    assert.equal(board.boardAccess({}), 'ssh', 'ssh until a project says otherwise');
    assert.equal(board.boardAccess({ BOARD_ACCESS: ' Bot ' }), 'bot');
    assert.throws(() => board.boardAccess({ BOARD_ACCESS: 'agent' }), /BOARD_ACCESS must be ssh or bot, not "agent"/);

    assert.deepEqual(board.parseConsole('lab/com21'), { agent: 'lab', com: 'COM21' });
    assert.throws(() => board.parseConsole('com21'), /BOARD_CONSOLE is <device agent>\/<COMx>/);
    assert.equal(board.bridgeOwner({ BOT_API_AGENT: 'kavci' }, 'embedded1'), 'embedded1/kavci');
    assert.throws(() => board.bridgeOwner({}, 'fw'), /BOT_API_AGENT is not set: your name as the bot knows you/, 'set by hand, never a login name');

    // The bot's answers, as it gave them on 19 October.
    assert.deepEqual(board.parseBridge('Portmap bridge started for `embedded1/test`: `lab` `COM21` -> `192.168.1.2:21000`.\nBRIDGE host=192.168.1.2 port=21000 owner=embedded1/test'),
      { host: '192.168.1.2', port: 21000, owner: 'embedded1/test' });
    assert.deepEqual(board.parseBridge('Portmap start blocked: `lab` `COM21` is in use by `embedded1/akara`.'),
      { error: 'Portmap start blocked: `lab` `COM21` is in use by `embedded1/akara`.' });

    // Without run.sh around it, load.tcl keeps its own log; the directory is the Vivado host's, forward slashes.
    const processor = { init: 'ps7_init.tcl', run: ['ps7_init', 'ps7_post_config'], fpga: 'xc7z*', reset: 'APU*', core: '*Cortex-A9*#0' };
    const load = board.loadScript({ hwServer: '192.168.1.2:3121', cable: '210248B849E0', directory: 'C:/ab/fw-ada/board-run/hello_ps', processor, logFile: 'C:/ab/fw-ada/board-run/hello_ps/xsdb.log' });
    assert.match(load, /set log \[open "C:\/ab\/fw-ada\/board-run\/hello_ps\/xsdb\.log" w\]/);
    assert.match(load, /say "BOARD LOADED"[\s\S]*say "BOARD LOAD FAILED: \$message"/);
    assert.match(board.loadScript({ hwServer: 'lab:3121', cable: 'c', directory: '/p', processor }), /proc say \{text\} \{ puts \$text \}/);

    // The console over TCP, as the bridge serves it: the wait ends as soon as the verdict is known.
    const lines = ['booting\n', 'hello_ps: Hello from the Zynq PS\n'];
    const server = createServer((socket) => { for (const line of lines) socket.write(line); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const test = { timeout_s: 20, expect: ['hello_ps: Hello from the Zynq PS'], fail_on: ['PANIC'], summary: {} };
      let reader = board.readConsole('127.0.0.1', port);
      await reader.ready;
      let started = Date.now();
      let text = await board.waitForConsole(reader, test, { pause: 20 });
      reader.stop();
      assert.match(text, /booting\nhello_ps: Hello from the Zynq PS/);
      assert.ok(Date.now() - started < 5000, 'stops when every expected line has been seen');

      lines.splice(0, lines.length, 'PANIC: no DDR\n');
      reader = board.readConsole('127.0.0.1', port);
      await reader.ready;
      started = Date.now();
      text = await board.waitForConsole(reader, test, { pause: 20 });
      reader.stop();
      assert.match(text, /PANIC/);
      assert.ok(Date.now() - started < 5000, 'stops when a fail_on line appeared');
    } finally {
      server.close();
    }

    // In bot mode the stage needs the console's name and no lab host.
    writeFileSync(join(project.root, '.env'), 'BOARD_ACCESS=bot\nBOARD_HW_SERVER=192.168.1.2:3121\nBOARD_JTAG_CABLE=210248B849E0\nXSDB_BIN=xsdb\n');
    let result = project.flow('board', 'hello_ps');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /BOARD_CONSOLE is not set/);
    writeFileSync(join(project.root, '.env'), 'BOARD_ACCESS=bot\nBOARD_HW_SERVER=192.168.1.2:3121\nBOARD_JTAG_CABLE=210248B849E0\nXSDB_BIN=xsdb\nBOARD_CONSOLE=lab/COM21\n');
    result = project.flow('board', 'hello_ps');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /BOT_API_AGENT is not set/);
    writeFileSync(join(project.root, '.env'), 'BOARD_ACCESS=agent\n');
    result = project.flow('board', 'hello_ps');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BOARD_ACCESS must be ssh or bot/);
  } finally {
    project.done();
  }
});

test('the board stage names a missing lab setting', () => {
  const project = scaffold();
  try {
    let result = project.flow('board', 'led_counter');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /led_counter: board: no software/);
    result = project.flow('board', 'hello_ps');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BOARD_HW_SERVER is not set/);
  } finally {
    project.done();
  }
});

// RQ-0078: a build's artifacts kept by what it was built from, in a stand-in
// for GitLab's generic package registry, and taken by a job with the same inputs.
test('build reuse keeps a passed build under its inputs and takes it for the same content only', async () => {
  const project = scaffold();
  const stored = new Map<string, Buffer>();
  const seen: string[] = [];
  const server = createHttpServer((request, response) => {
    seen.push(`${request.method} ${request.headers['job-token'] ?? '-'}`);
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const url = request.url ?? '';
      if (request.method === 'PUT') {
        stored.set(url, Buffer.concat(chunks));
        response.writeHead(201).end('{}');
      } else if (stored.has(url)) {
        response.writeHead(200).end(stored.get(url));
      } else {
        response.writeHead(404).end('{"message":"404 Package Not Found"}');
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const git = (...args: string[]) => {
    const run = spawnSync('git', args, { cwd: project.root, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${String(run.stderr)}`);
  };
  const commit = (path: string, text: string) => {
    mkdirSync(join(project.root, path, '..'), { recursive: true });
    writeFileSync(join(project.root, path), text);
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', path);
  };
  try {
    const reuse = await import(pathToFileURL(join(project.root, 'scripts/build-reuse.mjs')).href) as {
      main: (argv: string[], env: Record<string, string>, root: string) => Promise<number>;
      inputsKey: (env: Record<string, string>, root: string) => string;
    };
    if (!existsSync(join(project.root, '.git'))) git('init', '-q', '-b', 'main');
    writeFileSync(join(project.root, '.gitignore'), 'out/\n');
    commit('requirements/RQ-0001-a.md', '---\nid: RQ-0001\nstatus: ready\n---\n');
    const ci = (api = `http://127.0.0.1:${port}/api/v4`) => ({
      PATH: process.env.PATH ?? '', CI_JOB_TOKEN: 'job-token', CI_API_V4_URL: api, CI_PROJECT_ID: '31',
      CI_COMMIT_SHA: 'abc12345', CI_JOB_URL: 'http://gitlab/job/1', VIVADO_BIN: 'C:\\Xilinx\\vivado.bat', VITIS_BIN: '',
    });
    const key = reuse.inputsKey(ci(), project.root);

    // Nothing built yet: build. Then a passed build keeps its artifacts.
    assert.equal(await reuse.main(['restore'], ci(), project.root), 10);
    const bit = join(project.root, 'out/hello_ps/artifacts/hello_ps.bit');
    mkdirSync(join(project.root, 'out/hello_ps/artifacts/sw'), { recursive: true });
    writeFileSync(bit, 'bitstream');
    writeFileSync(join(project.root, 'out/hello_ps/artifacts/sw/compile_commands.vitis.json'), JSON.stringify([{ file: 'C:/ab/x/src/main.c', arguments: ['gcc', '-DX=1', '-c', 'main.c'] }]));
    mkdirSync(join(project.root, 'out/hello_ps/project'), { recursive: true });
    writeFileSync(join(project.root, 'out/hello_ps/project/big.dcp'), 'not kept');
    assert.equal(await reuse.main(['save'], ci(), project.root), 0);
    assert.deepEqual([...stored.keys()], [`/api/v4/projects/31/packages/generic/embedded_build/${key}/artifacts.tar.gz`]);
    assert.ok(seen.every((line) => line.endsWith(' job-token')), 'the job token goes with every request');
    assert.ok(!existsSync(join(project.root, 'build-reuse.json')), 'the record is not left behind');

    // The completion commit changes only the requirement: same key, taken.
    rmSync(join(project.root, 'out'), { recursive: true, force: true });
    commit('requirements/RQ-0001-a.md', '---\nid: RQ-0001\nstatus: completed\n---\n');
    commit('runs/r1/manifest.json', '{}');
    assert.equal(reuse.inputsKey(ci(), project.root), key);
    assert.equal(await reuse.main(['restore'], ci(), project.root), 0);
    assert.equal(readFileSync(bit, 'utf8'), 'bitstream');
    assert.ok(!existsSync(join(project.root, 'out/hello_ps/project')), 'only artifacts are kept');
    assert.ok(existsSync(join(project.root, 'out/hello_ps/artifacts/sw/compile_commands.json')), 'the compile database is written for this checkout');

    // Another Vivado, or any other file, is other content: build.
    assert.notEqual(reuse.inputsKey({ ...ci(), VIVADO_BIN: 'C:\\Xilinx\\2026.1\\vivado.bat' }, project.root), key);
    commit('designs/hello_ps/sw/src/main.c', 'int main(void) { return 1; }\n');
    assert.notEqual(reuse.inputsKey(ci(), project.root), key);
    assert.equal(await reuse.main(['restore'], ci(), project.root), 10);

    // No registry, or no CI: build, and keeping fails nothing.
    const closed = `http://127.0.0.1:1/api/v4`;
    assert.equal(await reuse.main(['restore'], ci(closed), project.root), 10);
    assert.equal(await reuse.main(['save'], ci(closed), project.root), 0);
    const requests = seen.length;
    assert.equal(await reuse.main(['restore'], { PATH: process.env.PATH ?? '' }, project.root), 10);
    assert.equal(await reuse.main(['save'], { PATH: process.env.PATH ?? '' }, project.root), 0);
    assert.equal(seen.length, requests, 'outside CI the registry is not asked');
  } finally {
    server.close();
    project.done();
  }
});

// RQ-0082: a stage's designs at once, each with its lines under its name; one
// failing does not stop the others, and the stage then fails naming it.
test('the designs of a stage run at once, VIVADO_PARALLEL of them, each line under its design', async () => {
  const project = scaffold();
  const tools = mkdtempSync(join(tmpdir(), 'fake-vivado-'));
  try {
    const flow = await import(pathToFileURL(join(project.root, 'scripts/flow.mjs')).href) as {
      parallelDesigns: (env: Record<string, string>, settings: { remote: boolean }) => number;
    };
    assert.equal(flow.parallelDesigns({}, { remote: true }), 3);
    assert.equal(flow.parallelDesigns({}, { remote: false }), 1);
    assert.equal(flow.parallelDesigns({ VIVADO_PARALLEL: '2' }, { remote: false }), 2);
    assert.throws(() => flow.parallelDesigns({ VIVADO_PARALLEL: '0' }, { remote: true }), /VIVADO_PARALLEL must be 1 to 16, not "0"/);
    assert.match(project.read('.env.example'), /^VIVADO_PARALLEL=$/m);

    const trace = join(tools, 'trace');
    const vivado = (failing: string) => {
      const path = join(tools, `vivado-${failing || 'ok'}`);
      writeFileSync(path, [
        '#!/bin/sh',
        'while [ $# -gt 0 ]; do [ "$1" = "-tclargs" ] && break; shift; done',
        'design=$2',
        `echo "start $design" >> '${trace}'`,
        'echo "synth of $design"',
        'sleep 1',
        `echo "end $design" >> '${trace}'`,
        `[ "$design" = "${failing}" ] && { echo "ERROR: $design broke" >&2; exit 4; }`,
        'exit 0',
        '',
      ].join('\n'), { mode: 0o755 });
      return path;
    };
    writeFileSync(join(project.root, '.env'), `VIVADO_BIN=${vivado('')}\nVIVADO_PARALLEL=2\n`);
    let result = await flowAsync(project.root, 'synth');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /▸ synth: hello_ps, led_counter at once \(2 at a time\)/);
    assert.match(result.stdout, /^\[hello_ps\] synth of hello_ps$/m);
    assert.match(result.stdout, /^\[led_counter\] synth of led_counter$/m);
    const order = readFileSync(trace, 'utf8').trim().split('\n');
    assert.deepEqual(order.slice(0, 2).map((line) => line.split(' ')[0]), ['start', 'start'], `both started before either ended: ${order.join(', ')}`);

    // One fails: the other still ends, and the stage names the one that failed.
    rmSync(trace, { force: true });
    writeFileSync(join(project.root, '.env'), `VIVADO_BIN=${vivado('led_counter')}\nVIVADO_PARALLEL=2\n`);
    result = await flowAsync(project.root, 'synth');
    assert.equal(result.status, 4, result.stderr + result.stdout);
    assert.match(result.stderr, /^\[led_counter\] ERROR: led_counter broke$/m);
    assert.match(result.stderr, /SYNTH FAILED for led_counter; see their lines above/);
    assert.match(readFileSync(trace, 'utf8'), /end hello_ps/);

    // VIVADO_PARALLEL=1, or one design: one after the other, unlabelled, as before.
    rmSync(trace, { force: true });
    writeFileSync(join(project.root, '.env'), `VIVADO_BIN=${vivado('')}\nVIVADO_PARALLEL=1\n`);
    result = await flowAsync(project.root, 'synth');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.doesNotMatch(result.stdout, /at once|^\[/m);
    assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n'), ['start hello_ps', 'end hello_ps', 'start led_counter', 'end led_counter']);
  } finally {
    project.done();
    rmSync(tools, { recursive: true, force: true });
  }
});

test('a host copy synced once takes commands without the sources: the scripts skip the archive, or the command', async () => {
  const project = scaffold();
  try {
    const host = await hostModule(project.root);
    const writer = (host as unknown as { lineWriter: (label: string, stream: { write: (text: string) => void }) => { write: (chunk: string) => void; end: () => void } }).lineWriter;
    const written: string[] = [];
    const out = writer('hello_ps', { write: (text) => written.push(text) });
    out.write('one\ntw');
    out.write('o\nthree');
    out.end();
    assert.deepEqual(written, ['[hello_ps] one\n', '[hello_ps] two\n', '[hello_ps] three\n']);
    // The start step makes its job directory: no diff step before it then.
    const settings = host.hostSettings({ VIVADO_ACCESS: 'bot', VIVADO_BOT_AGENT: 'builder', VIVADO_HOST_TYPE: 'windows', VIVADO_REMOTE_BASE_PATH: 'C:\\ab', VIVADO_REMOTE_PROJECT_NAME: 'fw-ada', VIVADO_BIN: 'C:\\Xilinx\\vivado.bat' });
    assert.match(host.botStartScript({ settings, jobDirectory: 'C:\\ab\\.fw-ada-job-1', command: ['vivado.bat'] }), /New-Item -ItemType Directory -Force -Path \$Job/);
    const source = project.read('scripts/vivado-host.mjs');
    assert.match(source, /\$Sync = \$\{archiveName \? '\$true' : '\$false'\}/);
    assert.match(source, /if \(-not \$Run\) \{ Write-Output "Sources synced on/);
  } finally {
    project.done();
  }
});

test('designs at once over the bot: the sources once, then a job of its own for each design', async () => {
  const project = scaffold();
  const results = mkdtempSync(join(tmpdir(), 'builder-bot-at-once-'));
  try {
    for (const design of ['hello_ps', 'led_counter']) {
      mkdirSync(join(results, `out/${design}/artifacts`), { recursive: true });
      writeFileSync(join(results, `out/${design}/artifacts/sim.log`), `${design} from the builder\n`);
    }
    const tar = spawnSync('tar', ['-czf', join(results, 'results.tar.gz'), '-C', results, 'out'], { stdio: 'pipe' });
    assert.equal(tar.status, 0, String(tar.stderr));
    const bot = fakeBuilderBot(join(results, 'results.tar.gz'), 0);
    const port = await bot.listen();
    try {
      writeFileSync(join(project.root, '.env'), ['VIVADO_ACCESS=bot', 'VIVADO_BOT_AGENT=builder', 'VIVADO_HOST_TYPE=windows', 'VIVADO_REMOTE_BASE_PATH=C:\\ab',
        'VIVADO_REMOTE_PROJECT_NAME=fw-ada', 'VIVADO_BIN=C:\\Xilinx\\2025.2\\Vivado\\bin\\vivado.bat', `BOT_API_URL=http://127.0.0.1:${port}`,
        'BOT_API_TOKEN=bot-token', 'BOT_API_AGENT=ada', ''].join('\n'));
      const result = await flowAsync(project.root, 'sim');
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.match(result.stdout, /▸ sim: hello_ps, led_counter at once \(2 at a time\) on builder/);
      const count = (step: string) => bot.seen.steps.filter((name) => name === step).length;
      assert.deepEqual([count('diff'), count('sync'), count('start'), count('collect'), count('clean')], [1, 1, 2, 2, 3], `steps: ${bot.seen.steps.join(', ')}`);
      assert.deepEqual(bot.seen.steps.slice(0, 4), ['diff', 'sync', 'poll', 'clean'], 'the sources first, alone');
      assert.match(result.stdout, /^\[hello_ps\] xsim finished$/m);
      assert.match(result.stdout, /^\[led_counter\] xsim finished$/m);
      assert.equal(project.read('out/led_counter/artifacts/sim.log'), 'led_counter from the builder\n');
    } finally {
      bot.server.closeAllConnections();
      bot.server.close();
    }
  } finally {
    project.done();
    rmSync(results, { recursive: true, force: true });
  }
});

// The SSH way's scripts (CI's way to the builder), run: the copy synced with no
// command, then a command with no archive (RQ-0082).
test('the SSH host scripts sync without a command and run without an archive', async (t) => {
  const project = scaffold();
  const work = mkdtempSync(join(tmpdir(), 'ssh-scripts-'));
  try {
    const host = await import(pathToFileURL(join(project.root, 'scripts/vivado-host.mjs')).href) as {
      windowsScript: (settings: unknown, archiveName: string | null, entries: string[], command: string[] | null, directories: string[]) => string;
      linuxScript: (settings: unknown, archiveName: string | null, entries: string[], command: string[] | null, directories: string[]) => string;
    };
    const settings = { basePath: join(work, 'base'), projectName: 'fw-b-main' };
    // Linux: an archive of designs/ in $HOME, synced alone, then a command alone.
    mkdirSync(join(work, 'src/designs/a'), { recursive: true });
    writeFileSync(join(work, 'src/designs/a/project.tcl'), 'set TOP a\n');
    assert.equal(spawnSync('tar', ['-czf', join(work, 'src.tar.gz'), '-C', join(work, 'src'), 'designs']).status, 0);
    const bash = (script: string) => spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: work } });
    let ran = bash(host.linuxScript(settings, 'src.tar.gz', ['designs'], null, ['out/a']));
    assert.equal(ran.status, 0, ran.stderr);
    assert.match(ran.stdout, /Sources synced on .* in .*fw-b-main/);
    assert.ok(existsSync(join(work, 'base/fw-b-main/designs/a/project.tcl')) && existsSync(join(work, 'base/fw-b-main/out/a')));
    ran = bash(host.linuxScript(settings, null, [], ['sh', '-c', 'cat designs/a/project.tcl; exit 3'], []));
    assert.equal(ran.status, 3);
    assert.match(ran.stdout, /Running on .*\nset TOP a/);
    if (spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { stdio: 'pipe' }).status !== 0) {
      t.diagnostic('pwsh is not installed: the Windows script is not run');
      return;
    }
    // Windows (pwsh here): parsed with an archive; run with none, and with no command.
    const pwsh = (script: string) => spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: work } });
    const parsed = spawnSync('pwsh', ['-NoProfile', '-Command', '$null = [scriptblock]::Create([Console]::In.ReadToEnd()); "parsed"'], { input: host.windowsScript(settings, 'src.tar.gz', ['designs'], ['vivado.bat'], ['out/a']), encoding: 'utf8' });
    assert.match(parsed.stdout, /parsed/, parsed.stderr);
    ran = pwsh(host.windowsScript(settings, null, [], null, ['out/b']));
    assert.equal(ran.status, 0, ran.stderr + ran.stdout);
    assert.match(ran.stdout, /Sources synced on/);
    assert.ok(existsSync(join(work, 'base/fw-b-main/out/b')));
    ran = pwsh(host.windowsScript(settings, null, [], ['pwsh', '-NoProfile', '-Command', 'Get-Content designs/a/project.tcl; exit 5'], []));
    assert.equal(ran.status, 5, ran.stderr + ran.stdout);
    assert.match(ran.stdout, /Running on .*\n.*set TOP a/);
  } finally {
    project.done();
    rmSync(work, { recursive: true, force: true });
  }
});

// RQ-0086: a project is made again when what made its block design and IP
// changed; its HDL and constraints, read where they are, do not count.
test('a design project is made again when its block design or IP inputs change', async () => {
  const project = scaffold();
  try {
    const flow = await import(pathToFileURL(join(project.root, 'scripts/flow.mjs')).href) as { projectInputs: (design: string, root: string) => string };
    const inputs = () => flow.projectInputs('hello_ps', project.root);
    const first = inputs();
    assert.match(first, /^[0-9a-f]{16}$/);
    assert.equal(inputs(), first, 'the same files, the same hash');
    // HDL, software and other designs are not inputs.
    writeFileSync(join(project.root, 'designs/hello_ps/sw/src/main.c'), 'int main(void) { return 2; }\n');
    writeFileSync(join(project.root, 'designs/led_counter/project.tcl'), project.read('designs/led_counter/project.tcl') + '# other\n');
    writeFileSync(join(project.root, 'ip/README.md'), 'notes\n');
    assert.equal(inputs(), first);
    // The block design script, an IP file, project.tcl, a board file: each changes it.
    const changed = new Set([first]);
    for (const [path, text] of [
      ['designs/hello_ps/tcl/bd.tcl', project.read('designs/hello_ps/tcl/bd.tcl') + '# changed\n'],
      ['ip/drawer/hdl/drawer.vhd', '-- an IP of the project\n'],
      ['designs/hello_ps/project.tcl', project.read('designs/hello_ps/project.tcl') + '# changed\n'],
      ['common/boards/README.md.tcl', '# a board file\n'],
    ]) {
      mkdirSync(join(project.root, path, '..'), { recursive: true });
      writeFileSync(join(project.root, path), text);
      const now = inputs();
      assert.ok(!changed.has(now), `${path} changes the hash`);
      changed.add(now);
    }
    assert.match(project.read('scripts/flow.mjs'), /'--inputs', projectInputs\(design\)/);
    // flow.tcl compares it with the one the project was made with, and makes the project again.
    const lib = project.read('common/flow_lib.tcl');
    assert.match(lib, /--ip-cache "" --inputs ""\]/);
    assert.match(lib, /if \{\$before ne \$inputs\} \{\n[^\n]*\n {12}file delete -force \$project_dir/);
    assert.ok(lib.indexOf('file delete -force $project_dir') < lib.indexOf('open_project $xpr'), 'before the project is opened');
    assert.match(lib, /set stamp \[file join \$out project\.inputs\]/);
  } finally {
    project.done();
  }
});
