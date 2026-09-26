import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { relative, resolve } from 'path';
import type { FactoryConfig } from '../config';
import { parseRequirement } from '../requirements/parser';
import { findRequirementFile, updateRequirementMetadata } from '../requirements/parser';
import {
  computeProbeSourceHash,
  fileSha256,
  locateProbe,
  readElfSourceMarker,
  type ProbeLocation,
} from '@aifactory/quality-gates';
import {
  compareProbeTraces,
  formatProbeTraceDiff,
  parseProbeTrace,
  TWIN_PHASES,
  type ProbeTrace,
  type ProbeTraceDiff,
  type Requirement,
  type TwinPhase,
} from '@aifactory/contracts';

// ============================================================
// HARDWARE-TWIN PROBE COMMANDS
//
// Every value that names a machine comes from the environment, which the CLI
// loads from the project's .env. Nothing here knows a host, a port or a path.
// ============================================================

export interface TwinRequirement {
  requirement: Requirement;
  requirementPath: string;
  phase: TwinPhase;
  probe: ProbeLocation;
  targetRoot: string;
}

export function loadTwinRequirement(requirementId: string, config: FactoryConfig): TwinRequirement {
  const requirement = parseRequirement(requirementId, config.paths.requirements);
  const lifecycle = requirement.lifecycle;
  if (!lifecycle || lifecycle.kind !== 'hardware-twin') {
    throw new Error(`${requirementId} is not a hardware-twin requirement (kind: ${lifecycle?.kind ?? 'none'}).`);
  }
  if (!lifecycle.probe) throw new Error(`${requirementId} names no probe in its metadata.`);
  const requirementPath = findRequirementFile(requirementId, resolve(config.paths.requirements));
  if (!requirementPath) throw new Error(`Requirement file not found: ${requirementId}`);
  const targetRoot = resolve(config.targetProject.root ?? '.');
  return {
    requirement,
    requirementPath,
    phase: lifecycle.twinPhase ?? 'probe',
    probe: locateProbe(targetRoot, lifecycle.probe),
    targetRoot,
  };
}

/** Phases only move forward; a probe change is a deliberate reset, not a drift. */
export function setTwinPhase(twin: TwinRequirement, phase: TwinPhase): void {
  const from = TWIN_PHASES.indexOf(twin.phase);
  const to = TWIN_PHASES.indexOf(phase);
  if (to < from) {
    throw new Error(`${twin.requirement.id} is in phase ${twin.phase}; use "factory probe phase" to go back to ${phase} deliberately.`);
  }
  writeTwinPhase(twin, phase);
}

export function writeTwinPhase(twin: TwinRequirement, phase: TwinPhase): void {
  const markdown = readFileSync(twin.requirementPath, 'utf8');
  writeFileSync(twin.requirementPath, updateRequirementMetadata(markdown, { twinPhase: phase }), 'utf8');
  twin.phase = phase;
}

// ------------------------------------------------------------
// environment
// ------------------------------------------------------------

function optional(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

function jsonCommand(name: string, env: NodeJS.ProcessEnv, substitutions: Record<string, string>): string[] | undefined {
  const raw = optional(name, env);
  if (!raw) return undefined;
  let argv: unknown;
  try { argv = JSON.parse(raw); } catch { throw new Error(`${name} must be a JSON array of command arguments.`); }
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((item) => typeof item !== 'string' || item === '')) {
    throw new Error(`${name} must be a non-empty JSON array of non-empty strings.`);
  }
  return (argv as string[]).map((item) =>
    item.replace(/\{(\w+)\}/g, (match, key: string) => substitutions[key] ?? match));
}

export function probeEnvironment(twin: TwinRequirement, sourceHash: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    PROBE_NAME: twin.probe.name,
    PROBE_DIR: twin.probe.dir,
    PROBE_ELF: twin.probe.elfPath,
    PROBE_SOURCE_HASH: sourceHash,
    PROBE_BUILD_DIR: twin.probe.buildDir,
    PROBE_TRACE_OUT: twin.probe.simulatorTracePath,
  };
}

function runShell(command: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, label: string): void {
  console.log(`  ▸ ${label}: ${command}`);
  const result = spawnSync(command, { cwd, env, shell: true, stdio: 'inherit', timeout: timeoutMs });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} exited with ${result.status ?? 'a signal'}.`);
}

function runArgv(argv: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, label: string): void {
  console.log(`  ▸ ${label}: ${argv.join(' ')}`);
  const result = spawnSync(argv[0]!, argv.slice(1), { cwd, env, shell: false, stdio: 'inherit', timeout: timeoutMs });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} exited with ${result.status ?? 'a signal'}.`);
}

// ------------------------------------------------------------
// probe build
// ------------------------------------------------------------

export interface ProbeBuildResult {
  sourceHash: string;
  sourceHashShort: string;
  elfSha256: string;
  files: string[];
}

export function buildProbe(twin: TwinRequirement, config: FactoryConfig, env: NodeJS.ProcessEnv = process.env): ProbeBuildResult {
  const command = config.targetProject.commands.probeBuild;
  if (!command) throw new Error('targetProject.commands.probeBuild is not configured in factory.config.json.');
  const sources = computeProbeSourceHash(twin.probe);
  mkdirSync(twin.probe.buildDir, { recursive: true });
  runShell(command, twin.targetRoot, probeEnvironment(twin, sources.short, env),
    config.targetProject.commandTimeoutMs ?? 120_000, 'probe build');

  const rel = relative(twin.targetRoot, twin.probe.elfPath);
  if (!existsSync(twin.probe.elfPath)) {
    throw new Error(`The build command finished but ${rel} does not exist. It must place the ELF at $PROBE_ELF.`);
  }
  const embedded = readElfSourceMarker(twin.probe.elfPath);
  if (embedded !== sources.short && embedded !== sources.full) {
    throw new Error(`${rel} embeds source marker ${embedded ?? '(none)'}, expected ${sources.short}. The build must compile with PROBE_SOURCE_HASH.`);
  }
  return { sourceHash: sources.full, sourceHashShort: sources.short, elfSha256: fileSha256(twin.probe.elfPath), files: sources.files };
}

// ------------------------------------------------------------
// board run
// ------------------------------------------------------------

export interface BoardRunOptions {
  env?: NodeJS.ProcessEnv;
  /** Manual mode: how often to look for the trace file, in milliseconds. */
  pollMs?: number;
  /** Manual mode: give up after this long; undefined waits indefinitely. */
  waitMs?: number;
  log?: (line: string) => void;
}

export interface BoardRunResult {
  mode: 'automated' | 'manual';
  trace: ProbeTrace;
  boardTraceSha256: string;
}

function validateBoardTrace(twin: TwinRequirement, text: string): ProbeTrace {
  const trace = parseProbeTrace(text);
  const sources = computeProbeSourceHash(twin.probe);
  if (trace.name !== twin.probe.name) {
    throw new Error(`The trace names probe "${trace.name}", but this requirement's probe is "${twin.probe.name}".`);
  }
  if (trace.source !== sources.short) {
    throw new Error(`The trace was produced by sources hashing to ${trace.source}; the committed sources hash to ${sources.short}. Rebuild and reprogram the board with the committed probe.`);
  }
  return trace;
}

function captureCommand(env: NodeJS.ProcessEnv): string[] | undefined {
  const explicit = jsonCommand('BOARD_CAPTURE_COMMAND_JSON', env, {});
  if (explicit) return explicit;
  const port = optional('BOARD_SERIAL_PORT', env);
  if (!port) return undefined;
  const baud = optional('BOARD_SERIAL_BAUD', env) ?? '115200';
  if (process.platform === 'win32') {
    throw new Error('BOARD_SERIAL_PORT needs BOARD_CAPTURE_COMMAND_JSON on Windows; there is no built-in serial reader.');
  }
  const flag = process.platform === 'darwin' ? '-f' : '-F';
  return ['sh', '-c', `stty ${flag} "$0" ${baud} raw -echo && exec cat "$0"`, port];
}

function captureSerial(argv: string[], timeoutMs: number, log: (line: string) => void, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], env });
    let buffer = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error); else resolvePromise(buffer);
    };
    const timer = setTimeout(() => finish(new Error(`No PROBE_END within BOARD_CAPTURE_TIMEOUT_MS (${timeoutMs} ms). Captured so far:\n${buffer}`)), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('latin1');
      if (/^PROBE_END lines=\d+\s*$/m.test(buffer)) finish();
    });
    child.stderr.on('data', (chunk: Buffer) => log(chunk.toString('utf8').trimEnd()));
    child.on('error', (error) => finish(error));
    // 'close', not 'exit': a capture that hands over its whole text at once
    // can exit before that text has been read, and 'exit' would then report
    // a missing footer that is in fact on its way.
    child.on('close', (code) => {
      if (!settled) finish(new Error(`The capture command exited with ${code} before PROBE_END was seen.`));
    });
  });
}

export async function runProbeOnBoard(twin: TwinRequirement, options: BoardRunOptions = {}): Promise<BoardRunResult> {
  const env = options.env ?? process.env;
  const log = options.log ?? ((line: string) => console.log(line));
  if (!existsSync(twin.probe.elfPath)) {
    throw new Error(`${relative(twin.targetRoot, twin.probe.elfPath)} does not exist. Run "factory probe build" first.`);
  }
  const sources = computeProbeSourceHash(twin.probe);
  const embedded = readElfSourceMarker(twin.probe.elfPath);
  if (embedded !== sources.short && embedded !== sources.full) {
    throw new Error(`The ELF was built from other sources (${embedded ?? 'no marker'} vs ${sources.short}). Rebuild before running the board.`);
  }

  const program = jsonCommand('BOARD_PROGRAM_COMMAND_JSON', env, { elf: twin.probe.elfPath, name: twin.probe.name });
  const capture = captureCommand(env);
  // The programming and capture commands see the same PROBE_* variables the
  // build and simulator commands do, so a capture wrapper can keep its raw text
  // beside the probe's build output.
  const commandEnv = probeEnvironment(twin, sources.short, env);
  const rel = relative(twin.targetRoot, twin.probe.boardTracePath);

  if (program && capture) {
    const timeoutMs = Number(optional('BOARD_CAPTURE_TIMEOUT_MS', env) ?? '30000');
    log(`  ▸ capturing: ${capture.join(' ')}`);
    const captured = captureSerial(capture, timeoutMs, log, commandEnv);
    // The capture may fail while programming is still running; until it is
    // awaited below its rejection must not be an unhandled one that kills the
    // process before the programming error can be reported.
    captured.catch(() => undefined);
    // Capture starts first so nothing the board prints right after programming
    // is lost. A capture that runs on another machine needs time to open the
    // port, hence the configurable settle.
    const settleMs = Number(optional('BOARD_CAPTURE_SETTLE_MS', env) ?? '500');
    await new Promise((r) => setTimeout(r, settleMs));
    try {
      runArgv(program, twin.targetRoot, commandEnv, timeoutMs, 'programming board');
      const reset = jsonCommand('BOARD_RESET_COMMAND_JSON', env, { elf: twin.probe.elfPath, name: twin.probe.name });
      if (reset) runArgv(reset, twin.targetRoot, commandEnv, timeoutMs, 'resetting board');
    } catch (error) {
      // Programming failed: the capture is pointless now and must not be left
      // holding the port until its own timeout.
      await captured.catch(() => undefined);
      throw error;
    }
    const text = await captured;
    const trace = validateBoardTrace(twin, text);
    writeFileSync(twin.probe.boardTracePath, normalizeTraceText(text), 'utf8');
    return { mode: 'automated', trace, boardTraceSha256: fileSha256(twin.probe.boardTracePath) };
  }

  // Manual mode: the person programs the board and drops the capture in place.
  log('');
  log('  Manual board run: BOARD_PROGRAM_COMMAND_JSON or BOARD_SERIAL_PORT is not set.');
  log(`    1. Program the board with ${relative(twin.targetRoot, twin.probe.elfPath)}`);
  log(`    2. Capture its serial output (expected header: PROBE v1 name=${twin.probe.name} source=${sources.short})`);
  log(`    3. Save the capture as ${rel}`);
  log('');
  const pollMs = options.pollMs ?? 2000;
  const deadline = options.waitMs === undefined ? undefined : Date.now() + options.waitMs;
  let lastError: string | undefined;
  for (;;) {
    if (existsSync(twin.probe.boardTracePath)) {
      const text = readFileSync(twin.probe.boardTracePath, 'utf8');
      try {
        const trace = validateBoardTrace(twin, text);
        writeFileSync(twin.probe.boardTracePath, normalizeTraceText(text), 'utf8');
        return { mode: 'manual', trace, boardTraceSha256: fileSha256(twin.probe.boardTracePath) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message !== lastError) {
          log(`  ✗ ${rel}: ${message}`);
          lastError = message;
        }
      }
    }
    if (deadline !== undefined && Date.now() >= deadline) {
      throw new Error(lastError ? `${rel} was not accepted: ${lastError}` : `${rel} did not appear.`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

function normalizeTraceText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trimEnd());
  const start = lines.findIndex((line) => /^PROBE v\d+ /.test(line));
  const end = lines.findIndex((line) => /^PROBE_END lines=\d+$/.test(line));
  return lines.slice(start, end + 1).join('\n') + '\n';
}

// ------------------------------------------------------------
// simulator run and compare
// ------------------------------------------------------------

export interface SimulatorRunResult {
  trace: ProbeTrace;
  simulatorTraceSha256: string;
}

export function runProbeOnSimulator(twin: TwinRequirement, config: FactoryConfig, env: NodeJS.ProcessEnv = process.env): SimulatorRunResult {
  const command = config.targetProject.commands.probeSimulatorRun ?? config.targetProject.commands.probeSimicsRun;
  if (!command) throw new Error('targetProject.commands.probeSimulatorRun is not configured in factory.config.json.');
  if (!existsSync(twin.probe.elfPath)) {
    throw new Error(`${relative(twin.targetRoot, twin.probe.elfPath)} does not exist. Run "factory probe build" first.`);
  }
  const sources = computeProbeSourceHash(twin.probe);
  mkdirSync(twin.probe.buildDir, { recursive: true });
  runShell(command, twin.targetRoot, probeEnvironment(twin, sources.short, env),
    config.targetProject.commandTimeoutMs ?? 120_000, 'probe sim-run');
  const rel = relative(twin.targetRoot, twin.probe.simulatorTracePath);
  if (!existsSync(twin.probe.simulatorTracePath)) {
    throw new Error(`The command finished but ${rel} does not exist. It must write the captured trace to $PROBE_TRACE_OUT.`);
  }
  const text = readFileSync(twin.probe.simulatorTracePath, 'utf8');
  const trace = parseProbeTrace(text);
  if (trace.name !== twin.probe.name || trace.source !== sources.short) {
    throw new Error(`${rel} came from probe ${trace.name}/${trace.source}, expected ${twin.probe.name}/${sources.short}.`);
  }
  writeFileSync(twin.probe.simulatorTracePath, normalizeTraceText(text), 'utf8');
  return { trace, simulatorTraceSha256: fileSha256(twin.probe.simulatorTracePath) };
}

export function compareProbeRuns(twin: TwinRequirement, simulator?: string): { diff: ProbeTraceDiff; text: string } {
  const boardRel = relative(twin.targetRoot, twin.probe.boardTracePath);
  const simRel = relative(twin.targetRoot, twin.probe.simulatorTracePath);
  if (!existsSync(twin.probe.boardTracePath)) throw new Error(`${boardRel} is missing. Run "factory probe board-run" first.`);
  if (!existsSync(twin.probe.simulatorTracePath)) throw new Error(`${simRel} is missing. Run "factory probe sim-run" first.`);
  const board = parseProbeTrace(readFileSync(twin.probe.boardTracePath, 'utf8'));
  const sim = parseProbeTrace(readFileSync(twin.probe.simulatorTracePath, 'utf8'));
  const diff = compareProbeTraces(board, sim);
  // Provenance: record which simulator produced the trace this parity result
  // is about, beside the trace it compared. A later reader (or a profile
  // extractor) can tell a Renode parity from a Simics one without guessing.
  if (simulator) {
    writeFileSync(resolve(twin.probe.buildDir, 'parity.json'), `${JSON.stringify({
      simulator,
      probe: twin.probe.name,
      equal: diff.equal,
      boardTraceSha256: fileSha256(twin.probe.boardTracePath),
      simulatorTraceSha256: fileSha256(twin.probe.simulatorTracePath),
      comparedAt: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8');
  }
  return { diff, text: formatProbeTraceDiff(diff) };
}
