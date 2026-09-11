import { z } from 'zod';

// ============================================================
// PROBE TRACE
//
// The text a probe firmware prints, on the real board and under Simics alike.
// Everything the hardware-twin workflow compares is this text, so the format
// is deliberately small: a header naming the probe and the sources it was
// built from, one line per register read, and a footer with the line count so
// a truncated capture is detected rather than compared.
// ============================================================

export const PROBE_TRACE_VERSION = 1;

export const ProbeTraceLineSchema = z.object({
  group: z.string().min(1),
  register: z.string().min(1),
  address: z.number().int().nonnegative(),
  value: z.number().int().nonnegative(),
  volatile: z.boolean(),
  raw: z.string(),
});
export type ProbeTraceLine = z.infer<typeof ProbeTraceLineSchema>;

export const ProbeTraceSchema = z.object({
  version: z.literal(PROBE_TRACE_VERSION),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  source: z.string().regex(/^[0-9a-f]{16}$/),
  lines: z.array(ProbeTraceLineSchema),
});
export type ProbeTrace = z.infer<typeof ProbeTraceSchema>;

const HEADER = /^PROBE v(\d+) name=([a-z0-9][a-z0-9-]*) source=([0-9a-f]{16})$/;
const REGISTER = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s+@0x([0-9a-fA-F]{8})\s+=\s+0x([0-9a-fA-F]{8})(\s+volatile)?$/;
const FOOTER = /^PROBE_END lines=(\d+)$/;

export class ProbeTraceError extends Error {
  constructor(message: string, readonly line?: number) {
    super(line === undefined ? message : `line ${line}: ${message}`);
    this.name = 'ProbeTraceError';
  }
}

/**
 * Parses a captured trace. Anything before the header is boot noise from the
 * serial line and is ignored; anything after the footer is ignored the same
 * way. Between the two, every non-empty line must be a register line.
 */
export function parseProbeTrace(text: string): ProbeTrace {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trimEnd());
  const headerIndex = lines.findIndex((line) => HEADER.test(line));
  if (headerIndex < 0) {
    throw new ProbeTraceError('no "PROBE v1 name=<slug> source=<hash>" header was found');
  }
  const [, version, name, source] = lines[headerIndex]!.match(HEADER)!;
  if (Number(version) !== PROBE_TRACE_VERSION) {
    throw new ProbeTraceError(`trace version ${version} is not supported`, headerIndex + 1);
  }

  const parsed: ProbeTraceLine[] = [];
  let footerCount: number | undefined;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() === '') continue;
    const footer = line.match(FOOTER);
    if (footer) {
      footerCount = Number(footer[1]);
      break;
    }
    const register = line.match(REGISTER);
    if (!register) {
      throw new ProbeTraceError(`not a register line: ${JSON.stringify(line)}`, index + 1);
    }
    parsed.push({
      group: register[1]!,
      register: register[2]!,
      address: parseInt(register[3]!, 16),
      value: parseInt(register[4]!, 16),
      volatile: register[5] !== undefined,
      raw: line,
    });
  }
  if (footerCount === undefined) {
    throw new ProbeTraceError('no "PROBE_END lines=<count>" footer was found; the capture is incomplete');
  }
  if (footerCount !== parsed.length) {
    throw new ProbeTraceError(
      `footer says ${footerCount} line(s) but ${parsed.length} register line(s) were read`,
    );
  }
  return ProbeTraceSchema.parse({ version: PROBE_TRACE_VERSION, name: name!, source: source!, lines: parsed });
}

export type ProbeTraceDifference =
  | { kind: 'header'; field: 'name' | 'source'; board: string; simics: string }
  | { kind: 'line'; index: number; board?: string; simics?: string }
  | { kind: 'value'; index: number; board: string; simics: string };

export interface ProbeTraceDiff {
  equal: boolean;
  compared: number;
  differences: ProbeTraceDifference[];
}

function key(line: ProbeTraceLine): string {
  return `${line.group}.${line.register}@0x${line.address.toString(16).padStart(8, '0')}`;
}

/**
 * Compares the board's trace with the simulator's. Register lines must appear
 * in the same order with the same names and addresses; a value must match
 * unless either side marks the line volatile, in which case only its presence
 * is checked.
 */
export function compareProbeTraces(board: ProbeTrace, simics: ProbeTrace): ProbeTraceDiff {
  const differences: ProbeTraceDifference[] = [];
  if (board.name !== simics.name) {
    differences.push({ kind: 'header', field: 'name', board: board.name, simics: simics.name });
  }
  if (board.source !== simics.source) {
    differences.push({ kind: 'header', field: 'source', board: board.source, simics: simics.source });
  }
  const count = Math.max(board.lines.length, simics.lines.length);
  for (let index = 0; index < count; index += 1) {
    const left = board.lines[index];
    const right = simics.lines[index];
    if (!left || !right || key(left) !== key(right)) {
      differences.push({ kind: 'line', index, board: left?.raw, simics: right?.raw });
      continue;
    }
    if (left.volatile || right.volatile) continue;
    if (left.value !== right.value) {
      differences.push({ kind: 'value', index, board: left.raw, simics: right.raw });
    }
  }
  return { equal: differences.length === 0, compared: count, differences };
}

export function formatProbeTraceDiff(diff: ProbeTraceDiff): string {
  if (diff.equal) return `${diff.compared} register line(s) identical`;
  const out: string[] = [];
  for (const difference of diff.differences) {
    if (difference.kind === 'header') {
      out.push(`header ${difference.field}: board=${difference.board} simics=${difference.simics}`);
    } else {
      out.push(`#${difference.index + 1} ${difference.kind}`);
      out.push(`  board : ${difference.board ?? '(missing)'}`);
      out.push(`  simics: ${difference.simics ?? '(missing)'}`);
    }
  }
  return out.join('\n');
}
