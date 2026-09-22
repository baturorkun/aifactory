import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import {
  compareProbeTraces,
  formatProbeTraceDiff,
  parseProbeTrace,
  type ProbeScope,
  type ProbeTrace,
} from '@aifactory/contracts';
import type { GateReport } from './index';

// ============================================================
// PROBE LAYOUT
//
// probes/<name>/            committed probe sources, the ELF that ran on the
//                           board, and the board's trace
// build/probes/<name>/      the simulator's trace and other run output
// ============================================================

export const PROBES_DIR = 'probes';
export const PROBE_BUILD_DIR = join('build', 'probes');
export const BOARD_TRACE_FILE = 'board-trace.txt';
// How long the simulator is allowed to run the probe. Not part of what ran on
// the board, so not part of the source hash: a probe that spins to a timeout
// needs a bigger budget than one that prints and stops, and raising it must
// not invalidate the trace.
export const PROBE_RUN_FILE = 'run.json';
export const SIMULATOR_TRACE_FILE = 'simulator-trace.txt';

/**
 * The string a probe build embeds in the image. The build gate looks for it in
 * the ELF bytes, so whether the image came from the committed sources can be
 * checked without reproducing the build.
 */
export const PROBE_SOURCE_MARKER = 'PROBE_SOURCE=';

export interface ProbeLocation {
  name: string;
  targetRoot: string;
  dir: string;
  elfPath: string;
  boardTracePath: string;
  buildDir: string;
  simulatorTracePath: string;
}

export function locateProbe(targetRoot: string, name: string): ProbeLocation {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`Probe name must be a lowercase slug: ${name}`);
  }
  const root = resolve(targetRoot);
  const dir = join(root, PROBES_DIR, name);
  const buildDir = join(root, PROBE_BUILD_DIR, name);
  return {
    name,
    targetRoot: root,
    dir,
    elfPath: join(dir, `${name}.elf`),
    boardTracePath: join(dir, BOARD_TRACE_FILE),
    buildDir,
    simulatorTracePath: join(buildDir, SIMULATOR_TRACE_FILE),
  };
}

// ============================================================
// SOURCE HASH
// ============================================================

export interface ProbeSourceHash {
  full: string;
  short: string;
  files: string[];
}

function isProbeSource(location: ProbeLocation, relativePath: string): boolean {
  const normalized = relativePath.split(sep).join('/');
  if (normalized === `${location.name}.elf`) return false;
  if (normalized === BOARD_TRACE_FILE) return false;
  if (normalized === PROBE_RUN_FILE) return false;
  if (normalized.startsWith('build/')) return false;
  return true;
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

/**
 * Hashes the committed probe sources: every file in the probe directory
 * except the ELF, the board trace and build output. The digest covers each
 * relative path and the SHA-256 of its content, so the same sources give the
 * same hash on every host. The first 16 hex digits are what the firmware
 * prints in its trace header.
 */
export function computeProbeSourceHash(location: ProbeLocation): ProbeSourceHash {
  if (!existsSync(location.dir) || !statSync(location.dir).isDirectory()) {
    throw new Error(`Probe directory does not exist: ${location.dir}`);
  }
  const files = walk(location.dir).filter((file) => isProbeSource(location, file));
  if (files.length === 0) {
    throw new Error(`Probe directory has no sources: ${location.dir}`);
  }
  const digest = createHash('sha256');
  for (const file of files) {
    const content = createHash('sha256').update(readFileSync(join(location.dir, file))).digest('hex');
    digest.update(`${file}\n${content}\n`);
  }
  const full = digest.digest('hex');
  return { full, short: full.slice(0, 16), files };
}

export function readElfSourceMarker(elfPath: string): string | undefined {
  const bytes = readFileSync(elfPath);
  const index = bytes.indexOf(PROBE_SOURCE_MARKER, 0, 'latin1');
  if (index < 0) return undefined;
  const start = index + PROBE_SOURCE_MARKER.length;
  let end = start;
  while (end < bytes.length && /[0-9a-f]/.test(String.fromCharCode(bytes[end]!))) end += 1;
  return bytes.subarray(start, end).toString('latin1');
}

export function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// ============================================================
// GATES
// ============================================================

function report(gate: GateReport['gate'], start: number, ok: boolean, output: string): GateReport {
  return { gate, status: ok ? 'passed' : 'failed', output, durationMs: Date.now() - start };
}

/** The ELF beside the sources must exist and carry the hash of those sources. */
export function probeBuildGate(location: ProbeLocation): GateReport {
  const start = Date.now();
  const rel = relative(location.targetRoot, location.elfPath);
  if (!existsSync(location.elfPath)) {
    return report('probeBuild', start, false, `Probe image is missing: ${rel}. Run "factory probe build" first.`);
  }
  let sources: ProbeSourceHash;
  try {
    sources = computeProbeSourceHash(location);
  } catch (error) {
    return report('probeBuild', start, false, error instanceof Error ? error.message : String(error));
  }
  const embedded = readElfSourceMarker(location.elfPath);
  if (!embedded) {
    return report('probeBuild', start, false, `${rel} does not embed a ${PROBE_SOURCE_MARKER}<hash> marker; the build did not receive PROBE_SOURCE_HASH.`);
  }
  if (embedded !== sources.short && embedded !== sources.full) {
    return report('probeBuild', start, false,
      `${rel} was built from other sources: it embeds ${embedded}, the committed sources hash to ${sources.short}. Rebuild the probe or commit the sources it was built from.`);
  }
  return report('probeBuild', start, true, `${rel} embeds source hash ${sources.short} over ${sources.files.length} file(s)`);
}

function readTrace(path: string, what: string): { trace?: ProbeTrace; error?: string } {
  if (!existsSync(path)) return { error: `${what} is missing: ${path}` };
  try {
    return { trace: parseProbeTrace(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { error: `${what} is not a valid probe trace: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** The committed board trace must come from this probe, built from these sources. */
export function boardTraceGate(location: ProbeLocation): GateReport {
  const start = Date.now();
  const rel = relative(location.targetRoot, location.boardTracePath);
  const { trace, error } = readTrace(location.boardTracePath, `Board trace ${rel}`);
  if (!trace) return report('boardTrace', start, false, error!);
  if (trace.name !== location.name) {
    return report('boardTrace', start, false, `${rel} was produced by probe "${trace.name}", not "${location.name}".`);
  }
  let sources: ProbeSourceHash;
  try {
    sources = computeProbeSourceHash(location);
  } catch (err) {
    return report('boardTrace', start, false, err instanceof Error ? err.message : String(err));
  }
  if (trace.source !== sources.short) {
    return report('boardTrace', start, false,
      `${rel} was recorded from sources hashing to ${trace.source}; the committed sources hash to ${sources.short}. The probe changed after the board ran it, so the board must run it again.`);
  }
  // The manifest may say what the probe exercises; the trace is what it did.
  // A claim the trace does not bear out is refused, in either direction, so
  // "behaviour" in a profile always means a WAIT or MEM the board answered.
  const claimed = readManifestScope(location);
  if (claimed && claimed !== trace.scope) {
    return report('boardTrace', start, false,
      `probe.json says scope "${claimed}" but the trace shows "${trace.scope}": ${describeScope(trace)}.`);
  }
  return report('boardTrace', start, true,
    `${rel}: ${trace.lines.length} line(s) from source ${trace.source}; scope ${trace.scope} (${describeScope(trace)})`);
}

export function readManifestScope(location: ProbeLocation): ProbeScope | undefined {
  const path = join(location.dir, 'probe.json');
  if (!existsSync(path)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { scope?: unknown };
    return manifest.scope === 'behaviour' || manifest.scope === 'reset-state' ? manifest.scope : undefined;
  } catch {
    return undefined;
  }
}

export function describeScope(trace: ProbeTrace): string {
  const count = (kind: string) => trace.lines.filter((line) => line.kind === kind).length;
  const parts = [`${count('read')} read`];
  if (count('write')) parts.push(`${count('write')} write`);
  if (count('wait')) parts.push(`${count('wait')} wait`);
  if (count('mem')) parts.push(`${count('mem')} mem`);
  return trace.scope === 'reset-state' ? `${parts.join(', ')}; no behaviour exercised` : parts.join(', ');
}

/** The simulator's trace must equal the board's, line for line. */
export function boardParityGate(location: ProbeLocation): GateReport {
  const start = Date.now();
  const board = readTrace(location.boardTracePath, `Board trace ${relative(location.targetRoot, location.boardTracePath)}`);
  if (!board.trace) return report('boardParity', start, false, board.error!);
  const sim = readTrace(location.simulatorTracePath, `Simulator trace ${relative(location.targetRoot, location.simulatorTracePath)}`);
  if (!sim.trace) {
    return report('boardParity', start, false, `${sim.error} Run "factory probe sim-run" first.`);
  }
  const diff = compareProbeTraces(board.trace, sim.trace);
  return report('boardParity', start, diff.equal, formatProbeTraceDiff(diff));
}
