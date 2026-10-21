// The codingStandard gate (RQ-0053): scripts/coding-standard.mjs over a C
// project that follows a standard, the compile database the embedded sw
// stage rewrites, and the CI job.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { createTargetProject } from './scaffold';
import { importStandard } from './standards/import';

const temp = () => mkdtempSync(join(tmpdir(), 'aifactory-gate-'));
const cppcheck = spawnSync('cppcheck', ['--version'], { encoding: 'utf8' }).status === 0;

// A zip with one deflated entry, as Word writes it (as in standards.test.ts).
function zip(name: string, content: string): Buffer {
  const data = Buffer.from(content, 'utf8');
  const packed = deflateRawSync(data);
  const nameBytes = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + packed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12); end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBytes, packed, central, nameBytes, end]);
}

const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const row = (...cells: string[]) => `<w:tr>${cells.map((cell) => `<w:tc>${cell}</w:tc>`).join('')}</w:tr>`;
const rule = (id: string, cls: string, description: string, rationale: string) =>
  p(`Table 1 - C Rule 1 | ${id} | ${cls} | —`) +
  `<w:tbl>${row(p('Rule'), p('1'))}${row(p('Description'), p(description))}${row(p('Rationale'), p(rationale))}</w:tbl>`;

// Four rules of the four kinds: two cppcheck (MISRA 21.6, 17.7), two lexical (tabs, hex case), one manual.
const DOCUMENT = `<w:document xmlns:w="w"><w:body>` +
  rule('C-084', 'Safety', 'The value returned by a function having non-void return type shall be used.', 'Refer to Ref. [2] Rule 17.7') +
  rule('C-109', 'Safety', 'Standard Library functions shall not be used.', 'Refer to Ref. [2] Rule 21.6') +
  rule('C-110', 'Readability', 'File names shall be chosen as descriptive and meaningful.', 'Bytecraft.') +
  rule('C-123', 'Style and Convention', 'Hexadecimal constants shall be represented using uppercase letters.', 'Bytecraft.') +
  rule('C-128', 'Readability', 'Tabs shall not be used.', 'Bytecraft.') +
  `</w:body></w:document>`;

// The test standard's groups, all named: nothing is in force unless named (RQ-0071).
const ALL_GROUPS = ['misra', 'bytecraft'];

function standardsDir(root: string): string {
  const document = join(root, 'STD.docx');
  writeFileSync(document, zip('word/document.xml', DOCUMENT));
  const standards = join(root, 'standards');
  const outDir = join(standards, 'std');
  // checks.json names the lexical checks before the import stamps them.
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'checks.json'), JSON.stringify({ lexical: { 'C-123': 'hex-uppercase', 'C-128': 'no-tabs' } }));
  importStandard({ document, id: 'std', version: 'Rev.AA', groups: [{ name: 'misra', ranges: 'C-084,C-109' }, { name: 'bytecraft', ranges: 'C-110,C-123,C-128' }], outDir });
  return standards;
}

function runStandard(projectRoot: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', ['scripts/coding-standard.mjs'], { cwd: projectRoot, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('import stamps each rule with its check, and the index says which are manual', () => {
  const root = temp();
  try {
    const standards = standardsDir(root);
    const rules = JSON.parse(readFileSync(join(standards, 'std', 'rules.json'), 'utf8'));
    assert.deepEqual(rules.counts.byCheck, { cppcheck: 2, lexical: 2, manual: 1 });
    assert.deepEqual(rules.rules.find((r: { id: string }) => r.id === 'C-109').check, { tool: 'cppcheck', id: 'misra-c2012-21.6' });
    assert.deepEqual(rules.rules.find((r: { id: string }) => r.id === 'C-128').check, { tool: 'lexical', id: 'no-tabs' });
    assert.deepEqual(rules.rules.find((r: { id: string }) => r.id === 'C-110').check, { tool: 'manual' });
    const index = readFileSync(join(standards, 'std', 'index.md'), 'utf8');
    assert.match(index, /- C-110 — Readability — bytecraft — manual review — File names/);
    assert.match(index, /- C-128 — Readability — bytecraft — lexical — Tabs/);
    assert.match(index, /- C-084 — Safety — misra — cppcheck — The value returned/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a C project with a standard gets the gate command, the script and the CI job; an embedded one its stage', () => {
  const root = temp();
  try {
    const standards = standardsDir(root);
    const { projectRoot } = createTargetProject('fw', { dir: root, template: 'c', standard: 'std', groups: ALL_GROUPS, standardsPath: standards });
    const config = JSON.parse(readFileSync(join(projectRoot, 'factory.config.json'), 'utf8'));
    assert.equal(config.targetProject.commands.codingStandard, 'pnpm standard');
    assert.equal(JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).scripts.standard, 'node scripts/coding-standard.mjs');
    assert.ok(existsSync(join(projectRoot, 'scripts', 'coding-standard.mjs')));
    const ci = readFileSync(join(projectRoot, '.gitlab-ci.yml'), 'utf8');
    assert.match(ci, /\ncoding_standard:\n {2}stage: test\n {2}image: "\$C_BUILD_IMAGE"/);
    assert.match(ci, /- job: c_build\n {6}artifacts: true/);
    // RQ-0076: no exists rule; the script says first whether there is anything to check.
    assert.doesNotMatch(ci.slice(ci.indexOf('\ncoding_standard:')), /exists:/);
    assert.match(ci, /- code=0; node scripts\/coding-standard\.mjs --in-force \|\| code=\$\?; if \[ "\$code" -eq 10 \]; then exit 0; elif \[ "\$code" -ne 0 \]; then exit "\$code"; fi\n {4}- if ! command -v cppcheck/);
    assert.match(ci, /apt-get install -y --no-install-recommends cppcheck/);

    const plain = createTargetProject('plain', { dir: root, template: 'c', standardsPath: standards });
    const plainConfig = JSON.parse(readFileSync(join(plain.projectRoot, 'factory.config.json'), 'utf8'));
    // RQ-0076: the gate and the job are there with no standard; the check says there is nothing to check.
    assert.equal(plainConfig.targetProject.commands.codingStandard, 'pnpm standard');
    assert.match(readFileSync(join(plain.projectRoot, '.gitlab-ci.yml'), 'utf8'), /coding_standard:/);
    const none = spawnSync(process.execPath, [join(plain.projectRoot, 'scripts', 'coding-standard.mjs'), '--in-force'], { cwd: plain.projectRoot, encoding: 'utf8' });
    assert.equal(none.status, 10, none.stderr);
    assert.match(none.stdout, /no coding standard chosen/);
    const plainRun = spawnSync(process.execPath, [join(plain.projectRoot, 'scripts', 'coding-standard.mjs')], { cwd: plain.projectRoot, encoding: 'utf8' });
    assert.equal(plainRun.status, 0, 'the gate passes with nothing to check');
    const chosen = spawnSync(process.execPath, [join(projectRoot, 'scripts', 'coding-standard.mjs'), '--in-force'], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(chosen.status, 0);
    // A standard named by hand, its rules never made: the check stops, it does not pass silently.
    writeFileSync(join(plain.projectRoot, 'factory.config.json'), JSON.stringify({ ...plainConfig, codingStandard: { id: 'std', version: 'Rev.AA', groups: ['misra'], profile: 'default', enforce: true } }));
    const forgotten = spawnSync(process.execPath, [join(plain.projectRoot, 'scripts', 'coding-standard.mjs')], { cwd: plain.projectRoot, encoding: 'utf8' });
    assert.equal(forgotten.status, 2);
    assert.match(forgotten.stderr + forgotten.stdout, /coding-standard\/rules\.json is missing for std: run pnpm factory -- standard use/);

    const embedded = createTargetProject('fpga', { dir: root, template: 'embedded', standard: 'std', groups: ALL_GROUPS, standardsPath: standards });
    const embeddedCi = readFileSync(join(embedded.projectRoot, '.gitlab-ci.yml'), 'utf8');
    assert.match(embeddedCi, /stages:\n(?:.*\n)*? {2}- build\n {2}- standard\n {2}- twin/);
    assert.match(embeddedCi, /\ncoding_standard:\n {2}stage: standard\n {2}image: "\$AIFACTORY_RUNNER_IMAGE"/);
    assert.match(embeddedCi, /- job: embedded_build\n {6}artifacts: true/);
    assert.equal(JSON.parse(readFileSync(join(embedded.projectRoot, 'package.json'), 'utf8')).scripts.standard, 'node scripts/coding-standard.mjs');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the check reports the violations by rule, honours waivers, and refuses an unreviewed waiver under dal-a', { skip: !cppcheck && 'cppcheck is not installed' }, () => {
  const root = temp();
  try {
    const standards = standardsDir(root);
    const { projectRoot } = createTargetProject('fw', { dir: root, template: 'c', standard: 'std', groups: ['misra', 'bytecraft'], standardsPath: standards });
    // A source with one finding per rule kind, and the database CMake would have written.
    writeFileSync(join(projectRoot, 'src', 'main.c'), [
      '#include <stdio.h>',
      'int main(void)',
      '{',
      '\tint mask = 0xff;', // C-128 (tab), C-123 (lowercase hex)
      '    printf("%d\\n", mask);', // C-109 (stdio), C-084 (return value unused)
      '    return 0;',
      '}',
      '',
    ].join('\n'));
    mkdirSync(join(projectRoot, 'build'), { recursive: true });
    writeFileSync(join(projectRoot, 'build', 'compile_commands.json'), JSON.stringify([
      { directory: projectRoot, file: join(projectRoot, 'src', 'main.c'), arguments: ['cc', '-Iinclude', '-c', 'src/main.c'] },
    ]));

    let run = runStandard(projectRoot);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const report = JSON.parse(readFileSync(join(projectRoot, 'out', 'coding-standard', 'report.json'), 'utf8'));
    const byRule = Object.fromEntries(report.findings.map((f: { rule: string; file: string; line: number; tool: string }) => [f.rule, f]));
    assert.deepEqual(Object.keys(byRule).sort(), ['C-084', 'C-109', 'C-123', 'C-128']);
    assert.equal(byRule['C-128'].line, 4);
    assert.equal(byRule['C-123'].line, 4);
    assert.equal(byRule['C-109'].line, 5);
    assert.equal(byRule['C-109'].file, 'src/main.c');
    assert.equal(byRule['C-109'].tool, 'cppcheck');
    assert.equal(byRule['C-128'].tool, 'lexical');
    assert.deepEqual(report.checked.manual, ['C-110']);
    assert.equal(report.counts.rules, 5);
    assert.equal(report.counts.byCppcheck + report.counts.byLexical + report.counts.manual, 5);
    assert.match(readFileSync(join(projectRoot, 'out', 'coding-standard', 'report.md'), 'utf8'), /\*\*FAILED\*\* — 4 violation\(s\)/);

    // Every finding waived: passes under the default profile.
    const waiver = (rule: string, line: number, id: string, reviewed: boolean) => [
      `  - rule_id: ${rule}`, '    file: src/main.c', `    line: ${line}`, '    rationale: demo program, accepted', `    waiver_id: ${id}`,
      ...(reviewed ? ['    reviewer: Batur Orkun', '    review_date: 2026-10-19', '    validity: 2027-12-31'] : []),
    ];
    writeFileSync(join(projectRoot, 'coding-standard', 'waivers.yaml'), [
      'schema: 1', 'waivers:', ...waiver('C-084', 5, 'W-1', true), ...waiver('C-109', 5, 'W-2', false), ...waiver('C-123', 4, 'W-3', true), ...waiver('C-128', 4, 'W-4', true), '',
    ].join('\n'));
    run = runStandard(projectRoot);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /CODING STANDARD: passed — 0 violation\(s\), 4 waived/);

    // Report only (RQ-0074): the same violations reported, the check passes.
    const reportConfigPath = join(projectRoot, 'factory.config.json');
    const reportConfig = JSON.parse(readFileSync(reportConfigPath, 'utf8'));
    writeFileSync(join(projectRoot, 'coding-standard', 'waivers.yaml'), 'schema: 1\nwaivers: []\n');
    writeFileSync(reportConfigPath, JSON.stringify({ ...reportConfig, codingStandard: { ...reportConfig.codingStandard, enforce: false } }));
    run = runStandard(projectRoot);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /CODING STANDARD: reported — 4 violation\(s\), 0 waived/);
    assert.match(readFileSync(join(projectRoot, 'out', 'coding-standard', 'report.md'), 'utf8'), /\*\*REPORTED \(not enforced: enforce is false in factory\.config\.json\)\*\* — 4 violation\(s\)/);
    writeFileSync(reportConfigPath, JSON.stringify(reportConfig));
    writeFileSync(join(projectRoot, 'coding-standard', 'waivers.yaml'), [
      'schema: 1', 'waivers:', ...waiver('C-084', 5, 'W-1', true), ...waiver('C-109', 5, 'W-2', false), ...waiver('C-123', 4, 'W-3', true), ...waiver('C-128', 4, 'W-4', true), '',
    ].join('\n'));

    // Under dal-a the unreviewed waiver W-2 is refused.
    // The choice is factory.config.json's codingStandard (RQ-0071).
    const configPath = join(projectRoot, 'factory.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.ok(!existsSync(join(projectRoot, 'coding-standard', 'standard.json')), 'no standard.json any more');
    writeFileSync(configPath, JSON.stringify({ ...config, codingStandard: { ...config.codingStandard, profile: 'dal-a' } }));
    run = runStandard(projectRoot);
    assert.equal(run.status, 1);
    assert.match(run.stdout, /waiver W-2: missing reviewer, review_date, validity/);

    // A finding for a MISRA rule not in force is left out: only the bytecraft group.
    writeFileSync(configPath, JSON.stringify({ ...config, codingStandard: { ...config.codingStandard, groups: ['bytecraft'] } }));
    // The config changed by hand, the rules not made again: refused, not checked against the old set (RQ-0071).
    run = runStandard(projectRoot);
    assert.equal(run.status, 2);
    assert.match(run.stderr + run.stdout, /rules\.json was made for std Rev\.AA bytecraft,misra, factory\.config\.json chooses std Rev\.AA bytecraft: run pnpm factory -- standard use/);
    // As standard use makes them: the bytecraft group's rules only.
    const rules = JSON.parse(readFileSync(join(projectRoot, 'coding-standard', 'rules.json'), 'utf8'));
    writeFileSync(join(projectRoot, 'coding-standard', 'rules.json'), JSON.stringify({ ...rules, groups: { bytecraft: rules.groups.bytecraft }, rules: rules.rules.filter((r: { groups: string[] }) => r.groups.includes('bytecraft')) }));
    run = runStandard(projectRoot);
    const narrowed = JSON.parse(readFileSync(join(projectRoot, 'out', 'coding-standard', 'report.json'), 'utf8'));
    assert.deepEqual(narrowed.findings.map((f: { rule: string }) => f.rule).sort(), ['C-123', 'C-128']);
    assert.ok(narrowed.notInForce['21.6'] >= 1, 'cppcheck saw 21.6 but it is not in force');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a finding outside the project\'s own sources (a BSP header under out/) is counted apart, not as a violation', async () => {
  const script = await import(pathToFileURL(join(__dirname, '..', 'templates', 'embedded', 'scripts', 'coding-standard.mjs')).href) as {
    evaluate: (input: { rules: unknown[]; profile: string; cppcheck: { findings: unknown[] }; sources: string[]; root: string; waivers: { waivers: unknown[]; required_fields: null } }) => { findings: { rule: string; file: string }[]; external: Record<string, number>; counts: { violations: number } };
  };
  const rules = [{ id: 'C-006', description: 'No unused macro definitions.', misra: ['2.5'], check: { tool: 'cppcheck', id: 'misra-c2012-2.5' } }];
  const result = script.evaluate({
    rules,
    profile: 'default',
    cppcheck: { findings: [
      { id: 'misra-c2012-2.5', file: 'out/hello_ps/artifacts/sw/bsp-include/xparameters.h', line: 374 },
      { id: 'misra-c2012-2.5', file: 'designs/hello_ps/sw/src/main.c', line: 3 },
    ] },
    sources: ['designs/hello_ps/sw/src/main.c'],
    root: '/nowhere',
    waivers: { waivers: [], required_fields: null },
  });
  assert.deepEqual(result.findings.map((f) => f.file), ['designs/hello_ps/sw/src/main.c']);
  assert.deepEqual(result.external, { 'out/hello_ps/artifacts/sw/bsp-include/xparameters.h': 1 });
  assert.equal(result.counts.violations, 1);
});

test('the embedded sw stage rewrites the Vitis compile database to the project files and the pulled BSP headers', async () => {
  const root = temp();
  try {
    const { projectRoot } = createTargetProject('fpga', { dir: root, template: 'embedded' });
    const flow = await import(pathToFileURL(join(projectRoot, 'scripts', 'flow.mjs')).href) as {
      rewriteCompileDatabase: (entries: unknown[], design: string, projectRoot: string) => { directory: string; file: string; arguments: string[] }[];
    };
    const vitis = [{
      directory: 'C:/ab/fpga-ci/out/hello_ps/vitis/hello_ps_app/build',
      file: 'C:\\ab\\fpga-ci\\out\\hello_ps\\vitis\\hello_ps_app\\src\\main.c',
      command: 'C:\\Xilinx\\gcc.exe -IC:/ab/fpga-ci/out/hello_ps/vitis/hello_ps_app/src -isystem C:/Xilinx/include -DSDT -mcpu=cortex-a9 -mfpu=vfpv3 -mfloat-abi=hard -MMD -MP -specs=C:/x/Xilinx.spec -IC:/ab/x/include -Wall -Wextra -O0 -g3 -U__clang__ -o main.c.obj -c C:\\ab\\fpga-ci\\out\\hello_ps\\vitis\\hello_ps_app\\src\\main.c',
    }, {
      directory: 'C:/ab/fpga-ci/out/hello_ps/vitis/hello_ps_app/build',
      file: 'C:\\ab\\fpga-ci\\out\\hello_ps\\vitis\\hello_ps_app\\src\\other.c', // not in the project: left out
      command: 'gcc -c other.c',
    }];
    const entries = flow.rewriteCompileDatabase(vitis, 'hello_ps', projectRoot);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].directory, projectRoot);
    assert.equal(entries[0].file, 'designs/hello_ps/sw/src/main.c');
    assert.deepEqual(entries[0].arguments, ['cc', '-DSDT', '-mcpu=cortex-a9', '-mfpu=vfpv3', '-mfloat-abi=hard', '-Wall', '-Wextra', '-U__clang__', '-Idesigns/hello_ps/sw/src', '-Iout/hello_ps/artifacts/sw/bsp-include', '-c', 'designs/hello_ps/sw/src/main.c']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// RQ-0085: a report-only standard on a machine without cppcheck (a
// developer's, which is for code) is not run there and fails nothing; CI, and
// an enforced standard, still stop on it.
test('without cppcheck a report-only standard is not run here; CI and an enforced standard still stop', () => {
  const root = temp();
  try {
    const standards = standardsDir(root);
    const { projectRoot } = createTargetProject('fw', { dir: root, template: 'c', standard: 'std', groups: ALL_GROUPS, standardsPath: standards });
    mkdirSync(join(projectRoot, 'build'), { recursive: true });
    writeFileSync(join(projectRoot, 'build', 'compile_commands.json'), JSON.stringify([
      { directory: projectRoot, file: join(projectRoot, 'src', 'main.c'), arguments: ['cc', '-c', 'src/main.c'] },
    ]));
    // A PATH with node alone: no cppcheck, wherever this machine keeps one.
    const bin = join(root, 'bin');
    mkdirSync(bin);
    symlinkSync(process.execPath, join(bin, 'node'));
    const run = (env: Record<string, string> = {}) => spawnSync(process.execPath, ['scripts/coding-standard.mjs'], {
      cwd: projectRoot, encoding: 'utf8', env: { PATH: bin, ...env },
    });
    const configPath = join(projectRoot, 'factory.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));

    let result = run();
    assert.equal(result.status, 2, 'enforced: stops');
    assert.match(result.stderr, /cppcheck is not installed .*CI's coding_standard job installs it/);

    writeFileSync(configPath, JSON.stringify({ ...config, codingStandard: { ...config.codingStandard, enforce: false } }));
    result = run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /CODING STANDARD: not run here — cppcheck is not installed on this machine; the standard is report only/);
    const report = JSON.parse(readFileSync(join(projectRoot, 'out', 'coding-standard', 'report.json'), 'utf8'));
    assert.equal(report.status, 'not-run');
    assert.match(readFileSync(join(projectRoot, 'out', 'coding-standard', 'report.md'), 'utf8'), /\*\*NOT RUN HERE\*\*/);

    result = run({ CI: 'true' });
    assert.equal(result.status, 2, 'in CI the report-only check still needs cppcheck');
    assert.match(result.stderr, /cppcheck is not installed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
