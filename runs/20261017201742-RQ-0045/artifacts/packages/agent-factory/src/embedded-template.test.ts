// The embedded template (RQ-0044): the Vivado/Vitis flow, its design check,
// the phase-ordered gates and the CI that runs them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { embeddedPhaseList, embeddedPhaseReached } from '@aifactory/contracts';
import { runAllGates, type GateReport } from '@aifactory/quality-gates';
import { createTargetProject, PROJECT_TEMPLATES } from './scaffold';
import { applyKey, renderCheckboxes, type CheckboxItem } from './utils/checkbox-prompt';

function scaffold(template = 'embedded') {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-embedded-'));
  const { projectRoot } = createTargetProject('fw', { dir: parent, template });
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
      'designs/hello_ps/sw/src/main.c', 'designs/hello_ps/sw/create_vitis.py',
    ]) {
      assert.ok(existsSync(join(project.root, path)), `${path} is there`);
    }
    assert.match(project.read('designs/led_counter/project.tcl'), /set MODE\s+non_project/);
    assert.match(project.read('designs/hello_ps/project.tcl'), /set MODE\s+project/);
    assert.match(project.read('boards/zedboard.yaml'), /^tool_version: "\d{4}\.\d"/m);
    assert.match(project.read('.gitignore'), /^out\/$/m);

    const config = JSON.parse(project.read('factory.config.json')) as {
      targetProject: { profile: string; commands: Record<string, string>; commandTimeoutMs: number; allowedPaths: string[] };
      requirementDefaults: { kind: string };
    };
    assert.equal(config.targetProject.profile, 'embedded');
    assert.deepEqual(config.targetProject.commands, {
      designCheck: 'pnpm check', hdlSim: 'pnpm sim', fpgaBuild: 'pnpm run build', firmwareBuild: 'pnpm sw', twinTest: 'pnpm twin',
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
      'TWIN_GITLAB_TOKEN', 'TWIN_TAG', 'TWIN_REMOTE_HOST', 'TWIN_REMOTE_USER', 'TWIN_REMOTE_BASE_PATH', 'TWIN_REMOTE_PROJECT_NAME']) {
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
    assert.match(ci, /^stages:\n {2}- ai_factory\n {2}- check\n {2}- sim\n {2}- build\n {2}- twin\n/m);
    const job = (name: string) => {
      const start = ci.indexOf(`\n${name}:`);
      assert.ok(start >= 0, `${name} exists`);
      const next = ci.indexOf('\n\n', start + 1);
      return ci.slice(start, next < 0 ? undefined : next);
    };
    assert.match(job('embedded_check'), /node scripts\/flow\.mjs check/);
    // Every design is built, the software from the XSA in the same job.
    const full = job('embedded_build');
    assert.match(full, /- node scripts\/flow\.mjs build --requirement-phases\n {4}- node scripts\/flow\.mjs sw --requirement-phases/);
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
    // Each Vivado job has its own project on the host, one ref at a time.
    assert.match(job('embedded_sim'), /VIVADO_REMOTE_PROJECT_NAME: "\$CI_PROJECT_NAME-embedded_sim-\$CI_COMMIT_REF_SLUG"/);
    assert.match(job('embedded_sim'), /resource_group: "vivado-embedded_sim-\$CI_COMMIT_REF_SLUG"/);
    // The factory job reaches the same host for its gates, with its own project.
    const factory = job('ai_factory_requirement_branch');
    assert.match(factory, /VIVADO_REMOTE_PROJECT_NAME: "\$CI_PROJECT_NAME-factory-\$CI_COMMIT_REF_SLUG"/);
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
  assert.throws(() => embeddedPhaseList('sim,board'), /Unknown phase "board"/);
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
    judgeRun: (run: { exitStatus: number; summary: unknown; consoleText?: string }, test: unknown) => { status: string; why: string | null; summary_checks: Record<string, { ok: boolean }> };
    runScript: () => string;
  }>;
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
    assert.throws(() => twin.parseTwinSection('twin:\n  gitlab: http://g\n', 'x'), /twin\.project is not set/);

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

test('the twin stage says when there is nothing to run, and names what is missing', () => {
  const project = scaffold();
  try {
    let result = project.flow('twin');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /hello_ps: twin: boards\/zedboard\.yaml names no twin yet/);
    assert.match(result.stdout, /led_counter: twin: boards\/zedboard\.yaml names no twin yet/);

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
