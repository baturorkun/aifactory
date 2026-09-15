import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  compareProbeTraces,
  formatProbeTraceDiff,
  parseProbeTrace,
  ProbeTraceError,
} from '@aifactory/contracts';
import {
  boardParityGate,
  boardTraceGate,
  computeProbeSourceHash,
  locateProbe,
  probeBuildGate,
  runAllGates,
} from '@aifactory/quality-gates';
import { FactoryConfigSchema } from '../config';
import { parseRequirementMarkdown } from '../requirements/parser';
import { buildProbe, compareProbeRuns, loadTwinRequirement, runProbeOnBoard, runProbeOnSimics, setTwinPhase } from './probe';

// ------------------------------------------------------------
// trace contract
// ------------------------------------------------------------

const TRACE = [
  'boot noise from the serial line',
  'PROBE v1 name=mddr-config source=0123456789abcdef',
  'SYSREG.ESRAM_CR @0x40038000 = 0x00000000',
  'SYSREG.DEVICE_VERSION @0x4003814c = 0x0000f807',
  'MDDR.TEMP @0x40020f00 = 0x00000042 volatile',
  'PROBE_END lines=3',
  'anything after the footer',
].join('\r\n');

test('parseProbeTrace ignores noise around the trace and keeps the register order', () => {
  const trace = parseProbeTrace(TRACE);
  assert.equal(trace.name, 'mddr-config');
  assert.equal(trace.source, '0123456789abcdef');
  const reads = trace.lines.map((line) => (line.kind === 'read' ? line : undefined));
  assert.deepEqual(reads.map((line) => line?.register), ['ESRAM_CR', 'DEVICE_VERSION', 'TEMP']);
  assert.equal(reads[1]?.value, 0xf807);
  assert.equal(reads[2]?.volatile, true);
});

test('parseProbeTrace rejects what a truncated or malformed capture looks like', () => {
  assert.throws(() => parseProbeTrace('nothing here'), /no "PROBE v1/);
  assert.throws(
    () => parseProbeTrace('PROBE v1 name=x source=0123456789abcdef\nSYSREG.A @0x40038000 = 0x0\n'),
    (error: unknown) => error instanceof ProbeTraceError && /line 2/.test(error.message),
  );
  assert.throws(
    () => parseProbeTrace('PROBE v1 name=x source=0123456789abcdef\nSYSREG.A @0x40038000 = 0x00000001\n'),
    /footer/,
  );
  assert.throws(
    () => parseProbeTrace('PROBE v1 name=x source=0123456789abcdef\nSYSREG.A @0x40038000 = 0x00000001\nPROBE_END lines=2\n'),
    /footer says 2/,
  );
});

test('compareProbeTraces reports value differences and honours volatile', () => {
  const board = parseProbeTrace(TRACE);
  const same = parseProbeTrace(TRACE.replace('0x00000042 volatile', '0x00000099 volatile'));
  assert.equal(compareProbeTraces(board, same).equal, true);

  const different = parseProbeTrace(TRACE.replace('0x0000f807', '0x0000f808'));
  const diff = compareProbeTraces(board, different);
  assert.equal(diff.equal, false);
  assert.equal(diff.differences.length, 1);
  assert.equal(diff.differences[0]!.kind, 'value');
  assert.match(formatProbeTraceDiff(diff), /#2 value[\s\S]*board : SYSREG.DEVICE_VERSION[\s\S]*simics: SYSREG.DEVICE_VERSION/);

  const shorter = parseProbeTrace(TRACE.replace('MDDR.TEMP @0x40020f00 = 0x00000042 volatile\r\n', '').replace('lines=3', 'lines=2'));
  const missing = compareProbeTraces(board, shorter);
  assert.equal(missing.differences[0]!.kind, 'line');
  assert.match(formatProbeTraceDiff(missing), /simics: \(missing\)/);
});

// ------------------------------------------------------------
// fixtures
// ------------------------------------------------------------

function probeProject(): { root: string; probeDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-probe-'));
  const probeDir = join(root, 'probes', 'mddr-config');
  mkdirSync(probeDir, { recursive: true });
  writeFileSync(join(probeDir, 'main.c'), 'int main(void) { return 0; }\n');
  writeFileSync(join(probeDir, 'probe.json'), '{"name":"mddr-config"}\n');
  mkdirSync(join(root, 'runs'), { recursive: true });
  return { root, probeDir };
}

function fakeElf(path: string, hash: string): void {
  writeFileSync(path, Buffer.concat([Buffer.from('\x7fELF junk '), Buffer.from(`PROBE_SOURCE=${hash}`), Buffer.from(' more junk')]));
}

function traceFor(hash: string, value = '0x00000000'): string {
  return `PROBE v1 name=mddr-config source=${hash}\nSYSREG.ESRAM_CR @0x40038000 = ${value}\nPROBE_END lines=1\n`;
}

test('the source hash ignores the ELF, the trace, the run budget and build output', () => {
  const { root, probeDir } = probeProject();
  try {
    const location = locateProbe(root, 'mddr-config');
    const before = computeProbeSourceHash(location);
    assert.deepEqual(before.files, ['main.c', 'probe.json']);
    assert.match(before.short, /^[0-9a-f]{16}$/);

    fakeElf(location.elfPath, before.short);
    writeFileSync(location.boardTracePath, traceFor(before.short));
    mkdirSync(join(probeDir, 'build'));
    writeFileSync(join(probeDir, 'build', 'x.o'), 'obj');
    writeFileSync(join(probeDir, 'run.json'), '{ "simulatedCycles": 400000000 }\n');
    assert.equal(computeProbeSourceHash(location).full, before.full);

    writeFileSync(join(probeDir, 'main.c'), 'int main(void) { return 1; }\n');
    assert.notEqual(computeProbeSourceHash(location).full, before.full);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('probeBuild and boardTrace gates tie the ELF and the trace to the committed sources', () => {
  const { root } = probeProject();
  try {
    const location = locateProbe(root, 'mddr-config');
    assert.equal(probeBuildGate(location).status, 'failed');
    const hash = computeProbeSourceHash(location).short;

    fakeElf(location.elfPath, 'ffffffffffffffff');
    assert.match(probeBuildGate(location).output, /built from other sources/);
    fakeElf(location.elfPath, hash);
    assert.equal(probeBuildGate(location).status, 'passed');

    assert.match(boardTraceGate(location).output, /missing/);
    writeFileSync(location.boardTracePath, traceFor('ffffffffffffffff'));
    assert.match(boardTraceGate(location).output, /board must run it again/);
    writeFileSync(location.boardTracePath, traceFor(hash).replace('name=mddr-config', 'name=other'));
    assert.match(boardTraceGate(location).output, /produced by probe "other"/);
    writeFileSync(location.boardTracePath, traceFor(hash));
    assert.equal(boardTraceGate(location).status, 'passed');

    assert.match(boardParityGate(location).output, /simics-run/);
    mkdirSync(location.buildDir, { recursive: true });
    writeFileSync(location.simicsTracePath, traceFor(hash, '0x00000001'));
    const parity = boardParityGate(location);
    assert.equal(parity.status, 'failed');
    assert.match(parity.output, /#1 value/);
    writeFileSync(location.simicsTracePath, traceFor(hash));
    assert.equal(boardParityGate(location).status, 'passed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runAllGates selects gates by twin phase', async () => {
  const { root } = probeProject();
  try {
    const location = locateProbe(root, 'mddr-config');
    const runDir = join(root, 'runs', 'r1');
    mkdirSync(runDir, { recursive: true });
    const hash = computeProbeSourceHash(location).short;
    fakeElf(location.elfPath, hash);

    const probePhase = await runAllGates(runDir, root, {
      targetRoot: root, commands: { build: 'exit 1' }, twin: { phase: 'probe', probe: location },
    });
    assert.equal(probePhase.probeBuild, 'passed');
    assert.equal(probePhase.build, 'skipped', 'the model gates do not run before the model exists');
    assert.equal(probePhase.boardTrace, undefined);

    writeFileSync(location.boardTracePath, traceFor(hash));
    mkdirSync(location.buildDir, { recursive: true });
    writeFileSync(location.simicsTracePath, traceFor(hash));
    const parityPhase = await runAllGates(runDir, root, {
      targetRoot: root, commands: { build: 'true' }, twin: { phase: 'parity', probe: location },
    });
    assert.equal(parityPhase.build, 'passed');
    assert.equal(parityPhase.boardTrace, 'passed');
    assert.equal(parityPhase.boardParity, 'passed');

    const standard = await runAllGates(runDir, root, { targetRoot: root, commands: {} });
    assert.equal(standard.probeBuild, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------
// probe commands
// ------------------------------------------------------------

function twinProject(): { root: string; config: ReturnType<typeof FactoryConfigSchema.parse>; hash: string } {
  const { root } = probeProject();
  mkdirSync(join(root, 'requirements'));
  writeFileSync(join(root, 'requirements', 'RQ-0009-mddr.md'), [
    '---',
    'id: RQ-0009',
    'status: ready',
    'executionMode: handoff',
    'createdByName: "t"',
    'createdByEmail: "t@t"',
    'createdAt: "2026-09-11T00:00:00.000Z"',
    'branch: "factory/RQ-0009"',
    'createdFromCommit: "abc"',
    'kind: hardware-twin',
    'twinPhase: probe',
    'probe: mddr-config',
    '---',
    '# RQ-0009 - mddr',
    '',
    'Probe the MDDR block.',
    '',
    '## Acceptance Criteria',
    '',
    '- parity',
    '',
  ].join('\n'));
  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock' },
    paths: { requirements: join(root, 'requirements'), runs: join(root, 'runs'), handoffs: join(root, 'handoffs') },
    targetProject: {
      root,
      commands: {
        // The build "compiles" by writing the marker; the simics run "captures" by copying the board trace.
        probeBuild: 'printf "ELF PROBE_SOURCE=%s" "$PROBE_SOURCE_HASH" > "$PROBE_ELF"',
        probeSimicsRun: 'mkdir -p "$PROBE_BUILD_DIR" && printf "PROBE v1 name=%s source=%s\\nSYSREG.ESRAM_CR @0x40038000 = 0x00000000\\nPROBE_END lines=1\\n" "$PROBE_NAME" "$PROBE_SOURCE_HASH" > "$PROBE_TRACE_OUT"',
      },
    },
  });
  const hash = computeProbeSourceHash(locateProbe(root, 'mddr-config')).short;
  return { root, config, hash };
}

function phaseOf(root: string): string | undefined {
  return parseRequirementMarkdown('RQ-0009', readFileSync(join(root, 'requirements', 'RQ-0009-mddr.md'), 'utf8')).lifecycle?.twinPhase;
}

test('loadTwinRequirement refuses a standard requirement', () => {
  const { root, config } = twinProject();
  try {
    writeFileSync(join(root, 'requirements', 'RQ-0009-mddr.md'),
      readFileSync(join(root, 'requirements', 'RQ-0009-mddr.md'), 'utf8').replace('kind: hardware-twin\n', ''));
    assert.throws(() => loadTwinRequirement('RQ-0009', config), /not a hardware-twin requirement/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('probe build embeds the source hash and moves the phase forward only', () => {
  const { root, config, hash } = twinProject();
  try {
    const twin = loadTwinRequirement('RQ-0009', config);
    const built = buildProbe(twin, config);
    assert.equal(built.sourceHashShort, hash);
    assert.equal(probeBuildGate(twin.probe).status, 'passed');

    setTwinPhase(twin, 'board');
    assert.equal(phaseOf(root), 'board');
    assert.throws(() => setTwinPhase(twin, 'probe'), /deliberately/);

    const bad = FactoryConfigSchema.parse({ ...config, targetProject: { ...config.targetProject, commands: { probeBuild: 'true' } } });
    writeFileSync(join(root, 'probes', 'mddr-config', 'main.c'), 'changed\n');
    assert.throws(() => buildProbe(loadTwinRequirement('RQ-0009', bad), bad), /embeds source marker/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('manual board-run waits for a trace file and accepts only one from these sources', async () => {
  const { root, config, hash } = twinProject();
  try {
    const twin = loadTwinRequirement('RQ-0009', config);
    buildProbe(twin, config);
    const env = { PATH: process.env.PATH };
    const log: string[] = [];

    await assert.rejects(
      runProbeOnBoard(twin, { env, pollMs: 10, waitMs: 60, log: (line) => log.push(line) }),
      /did not appear/,
    );
    assert.ok(log.some((line) => /Manual board run/.test(line)));
    assert.ok(log.some((line) => line.includes(`source=${hash}`)), 'the expected header is printed for the person doing the capture');

    writeFileSync(twin.probe.boardTracePath, traceFor('ffffffffffffffff'));
    await assert.rejects(
      runProbeOnBoard(twin, { env, pollMs: 10, waitMs: 60, log: (line) => log.push(line) }),
      /hashing to ffffffffffffffff/,
    );

    setTimeout(() => writeFileSync(twin.probe.boardTracePath, `noise\r\n${traceFor(hash).replace(/\n/g, '\r\n')}`), 30);
    const result = await runProbeOnBoard(twin, { env, pollMs: 10, waitMs: 2000, log: (line) => log.push(line) });
    assert.equal(result.mode, 'manual');
    assert.equal(result.trace.lines.length, 1);
    assert.equal(readFileSync(twin.probe.boardTracePath, 'utf8'), traceFor(hash), 'the committed trace is normalised');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('automated board-run programs the board after capture starts and records the trace', async () => {
  const { root, config, hash } = twinProject();
  try {
    const twin = loadTwinRequirement('RQ-0009', config);
    buildProbe(twin, config);
    const marker = join(root, 'programmed');
    const env = {
      PATH: process.env.PATH,
      BOARD_PROGRAM_COMMAND_JSON: JSON.stringify(['sh', '-c', `test -f "$0" && echo "{elf}" > "${marker}"`, twin.probe.elfPath]),
      BOARD_CAPTURE_COMMAND_JSON: JSON.stringify(['sh', '-c', `printf '%s' "$PROBE_BUILD_DIR" > "${join(root, 'seen-env')}"; while [ ! -f "${marker}" ]; do sleep 0.05; done; printf '${traceFor(hash).replace(/\n/g, '\\r\\n')}'`]),
      BOARD_CAPTURE_TIMEOUT_MS: '5000',
    };
    const result = await runProbeOnBoard(twin, { env, log: () => {} });
    assert.equal(result.mode, 'automated');
    assert.equal(readFileSync(marker, 'utf8').trim(), twin.probe.elfPath, '{elf} was substituted');
    assert.equal(readFileSync(join(root, 'seen-env')).toString().trim(), twin.probe.buildDir, 'the capture command sees PROBE_BUILD_DIR');
    assert.equal(readFileSync(twin.probe.boardTracePath, 'utf8'), traceFor(hash));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('simics-run captures a trace and compare reports parity', () => {
  const { root, config, hash } = twinProject();
  try {
    const twin = loadTwinRequirement('RQ-0009', config);
    buildProbe(twin, config);
    writeFileSync(twin.probe.boardTracePath, traceFor(hash));
    const run = runProbeOnSimics(twin, config);
    assert.equal(run.trace.source, hash);
    assert.equal(compareProbeRuns(twin).diff.equal, true);

    writeFileSync(twin.probe.boardTracePath, traceFor(hash, '0x00000001'));
    const { diff, text } = compareProbeRuns(twin);
    assert.equal(diff.equal, false);
    assert.match(text, /board : SYSREG.ESRAM_CR @0x40038000 = 0x00000001/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing machine value is an error naming it, never a default', () => {
  const { root, config } = twinProject();
  try {
    const twin = loadTwinRequirement('RQ-0009', config);
    const noBuild = FactoryConfigSchema.parse({ ...config, targetProject: { ...config.targetProject, commands: {} } });
    assert.throws(() => buildProbe(twin, noBuild), /probeBuild is not configured/);
    assert.throws(() => runProbeOnSimics(twin, noBuild), /probeSimicsRun is not configured/);
    // The orchestrator itself carries no host, port or path.
    const source = readFileSync(join(__dirname, 'probe.ts'), 'utf8');
    assert.doesNotMatch(source, /\d+\.\d+\.\d+\.\d+|Administrator|C:\\\\|\/dev\/tty\.usb/);
    execSync('true');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------
// trace contract v2: actions and observations
// ------------------------------------------------------------

const TRACE_V2 = [
  'PROBE v1 name=ddr-init source=0123456789abcdef',
  'READ  MDDR.DDRC_SR @0x400208e4 = 0x00000000',
  'MDDR.MODE_CR @0x40020818 = 0x00000000',
  'WRITE MDDR.DYN_SOFT_RESET_CR @0x40020800 <= 0x00000001',
  'WAIT  MDDR.DDRC_SR @0x400208e4 mask=0x00000001 expect=0x00000001 -> ok spins=1842 volatile',
  'MEM   @0xa0000000 len=0x1000 pattern=a5 -> ok',
  'PROBE_END lines=5',
].join('\n');

test('a version-2 trace parses every step kind and a keyword-less line is a read', () => {
  const trace = parseProbeTrace(TRACE_V2);
  assert.deepEqual(trace.lines.map((l) => l.kind), ['read', 'read', 'write', 'wait', 'mem']);
  assert.equal(trace.scope, 'behaviour');
  const wait = trace.lines[3];
  assert.equal(wait.kind, 'wait');
  if (wait.kind === 'wait') {
    assert.equal(wait.outcome, 'ok');
    assert.equal(wait.spins, 1842);
    assert.equal(wait.volatile, true);
    assert.equal(wait.mask, 1);
  }
  const mem = trace.lines[4];
  if (mem.kind === 'mem') {
    assert.equal(mem.length, 0x1000);
    assert.equal(mem.pattern, 0xa5);
    assert.equal(mem.outcome, 'ok');
  }
  // Version 1 traces are unchanged: reads only, reset-state scope.
  assert.equal(parseProbeTrace(TRACE).scope, 'reset-state');
  assert.throws(() => parseProbeTrace(TRACE_V2.replace('-> ok spins=1842', '-> maybe spins=1842')),
    (e: unknown) => e instanceof ProbeTraceError && /line 5/.test(e.message));
});

test('parity compares outcomes for waits and memory tests, ignores volatile spin counts, and reports the scope', () => {
  const board = parseProbeTrace(TRACE_V2);
  const sameOutcome = parseProbeTrace(TRACE_V2.replace('spins=1842', 'spins=3'));
  assert.equal(compareProbeTraces(board, sameOutcome).equal, true, 'spin count is volatile');

  const timedOut = parseProbeTrace(TRACE_V2.replace('-> ok spins=1842', '-> timeout spins=100000'));
  const diff = compareProbeTraces(board, timedOut);
  assert.equal(diff.equal, false);
  assert.equal(diff.differences[0]!.kind, 'outcome');
  assert.equal(diff.scope, 'behaviour');
  assert.match(formatProbeTraceDiff(diff), /^scope: behaviour/);
  assert.match(formatProbeTraceDiff(diff), /#4 outcome/);

  const mismatch = parseProbeTrace(TRACE_V2.replace('pattern=a5 -> ok', 'pattern=a5 -> mismatch at=0xa0000010 got=0xffffffff'));
  assert.equal(compareProbeTraces(board, mismatch).differences[0]!.kind, 'outcome');

  const otherWrite = parseProbeTrace(TRACE_V2.replace('<= 0x00000001', '<= 0x00000003'));
  assert.equal(compareProbeTraces(board, otherWrite).differences[0]!.kind, 'value', 'a different action is a different probe');

  assert.match(formatProbeTraceDiff(compareProbeTraces(parseProbeTrace(TRACE), parseProbeTrace(TRACE))), /reset state only/);
});

test('the boardTrace gate refuses a manifest whose scope the trace does not bear out, and reports what was exercised', () => {
  const { root } = probeProject();
  try {
    const location = locateProbe(root, 'mddr-config');
    // The manifest is a probe source: it goes into the hash, so it is written
    // before the image and the trace that carry that hash.
    const claim = (scope: string) => {
      writeFileSync(join(location.dir, 'probe.json'), JSON.stringify({ name: 'mddr-config', scope }));
      const hash = computeProbeSourceHash(location).short;
      fakeElf(location.elfPath, hash);
      writeFileSync(location.boardTracePath, traceFor(hash));
    };
    // A reads-only trace with a manifest that claims behaviour.
    claim('behaviour');
    const refused = boardTraceGate(locateProbe(root, 'mddr-config'));
    assert.equal(refused.status, 'failed');
    assert.match(refused.output, /says scope "behaviour" but the trace shows "reset-state"/);

    claim('reset-state');
    const honest = boardTraceGate(locateProbe(root, 'mddr-config'));
    assert.equal(honest.status, 'passed');
    assert.match(honest.output, /scope reset-state \(1 read; no behaviour exercised\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a wait may expect any masked bit rather than a value', () => {
  const text = TRACE_V2.replace('expect=0x00000001 -> ok', 'expect=nonzero -> ok');
  const trace = parseProbeTrace(text);
  const wait = trace.lines[3];
  assert.equal(wait.kind, 'wait');
  if (wait.kind === 'wait') assert.equal(wait.expect, 'nonzero');
  // Same step on both sides agrees; a value expectation is a different step.
  assert.equal(compareProbeTraces(trace, parseProbeTrace(text.replace('spins=1842', 'spins=9'))).equal, true);
  assert.equal(compareProbeTraces(trace, parseProbeTrace(TRACE_V2)).differences[0]!.kind, 'line');
});

test('a failed programming command is reported, not an unhandled rejection from the capture', async () => {
  const { root, config } = twinProject();
  try {
    const twin = loadTwinRequirement('RQ-0009', config);
    buildProbe(twin, config);
    const env = {
      PATH: process.env.PATH,
      BOARD_PROGRAM_COMMAND_JSON: JSON.stringify(['sh', '-c', 'exit 7']),
      // A capture that ends at once without a trace, as a dead port does.
      BOARD_CAPTURE_COMMAND_JSON: JSON.stringify(['sh', '-c', 'exit 1']),
      BOARD_CAPTURE_TIMEOUT_MS: '5000',
      BOARD_CAPTURE_SETTLE_MS: '50',
    };
    await assert.rejects(runProbeOnBoard(twin, { env, log: () => {} }), /programming board exited with 7/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a memory test may report that the bus refused the access', () => {
  const text = TRACE_V2.replace('pattern=a5 -> ok', 'pattern=a5 -> fault at=0xa0000000');
  const trace = parseProbeTrace(text);
  const mem = trace.lines[4];
  assert.equal(mem.kind, 'mem');
  if (mem.kind === 'mem') { assert.equal(mem.outcome, 'fault'); assert.equal(mem.mismatchAt, 0xa0000000); }
  assert.equal(compareProbeTraces(trace, parseProbeTrace(text)).equal, true);
  assert.equal(compareProbeTraces(trace, parseProbeTrace(TRACE_V2)).differences[0]!.kind, 'outcome');
});

test('a memory test after a timed-out wait is recorded as skipped, and compares as such', () => {
  const text = TRACE_V2.replace('-> ok spins=1842', '-> timeout spins=2000000').replace('pattern=a5 -> ok', 'pattern=a5 -> skipped');
  const trace = parseProbeTrace(text);
  const mem = trace.lines[4];
  if (mem.kind === 'mem') assert.equal(mem.outcome, 'skipped');
  assert.equal(compareProbeTraces(trace, parseProbeTrace(text)).equal, true);
  const diff = compareProbeTraces(parseProbeTrace(TRACE_V2), trace);
  assert.deepEqual(diff.differences.map((d) => d.kind), ['outcome', 'outcome']);
});

test('a capture that delivers a large trace in one burst is read to its footer', async () => {
  const { root, config, hash } = twinProject();
  try {
    const twin = loadTwinRequirement('RQ-0009', config);
    buildProbe(twin, config);
    // 300 lines handed over at once at exit, the way a wrapper that returns a
    // finished job's text does.
    const lines = Array.from({ length: 300 }, (_, i) => `SYSREG.R${i} @0x${(0x40038000 + 4 * i).toString(16).padStart(8, '0')} = 0x00000000`);
    const big = [`PROBE v1 name=mddr-config source=${hash}`, ...lines, `PROBE_END lines=${lines.length}`].join('\r\n') + '\r\n';
    writeFileSync(join(root, 'big.txt'), big);
    const env = {
      PATH: process.env.PATH,
      BOARD_PROGRAM_COMMAND_JSON: JSON.stringify(['sh', '-c', 'true']),
      BOARD_CAPTURE_COMMAND_JSON: JSON.stringify(['sh', '-c', `sleep 0.3; cat "${join(root, 'big.txt')}"`]),
      BOARD_CAPTURE_TIMEOUT_MS: '5000',
      BOARD_CAPTURE_SETTLE_MS: '50',
    };
    const result = await runProbeOnBoard(twin, { env, log: () => {} });
    assert.equal(result.trace.lines.length, 300);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
