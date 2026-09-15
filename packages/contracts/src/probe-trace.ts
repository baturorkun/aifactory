import { z } from 'zod';

// ============================================================
// PROBE TRACE
//
// The text a probe firmware prints, on the real board and under Simics alike.
// Everything the hardware-twin workflow compares is this text.
//
// Version 1 could say one thing: a register holds a value. Parity then proved
// one thing: the model returns the board's reset values. Version 2 lets a
// probe act and observe, so a line can also say "I wrote this", "I waited for
// that and it came (or not)", "I wrote a pattern over memory and read it
// back". A model can only reproduce those lines by implementing the
// behaviour. A version-1 register line stays valid: READ is the default kind.
// ============================================================

export const PROBE_TRACE_VERSION = 1;

export const ProbeLineKindSchema = z.enum(['read', 'write', 'wait', 'mem']);
export type ProbeLineKind = z.infer<typeof ProbeLineKindSchema>;

const hex32 = z.number().int().nonnegative();

export const ProbeTraceLineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('read'),
    group: z.string().min(1),
    register: z.string().min(1),
    address: hex32,
    value: hex32,
    volatile: z.boolean(),
    raw: z.string(),
  }),
  z.object({
    kind: z.literal('write'),
    group: z.string().min(1),
    register: z.string().min(1),
    address: hex32,
    value: hex32,
    volatile: z.boolean(),
    raw: z.string(),
  }),
  z.object({
    kind: z.literal('wait'),
    group: z.string().min(1),
    register: z.string().min(1),
    address: hex32,
    mask: hex32,
    // A number: the masked value must equal it. 'nonzero': any masked bit set
    // satisfies the wait, which is how a "ready" word with undocumented bits
    // is waited for.
    expect: z.union([hex32, z.literal('nonzero')]),
    outcome: z.enum(['ok', 'timeout']),
    spins: z.number().int().nonnegative(),
    volatile: z.boolean(),
    raw: z.string(),
  }),
  z.object({
    kind: z.literal('mem'),
    address: hex32,
    length: hex32,
    pattern: z.number().int().min(0).max(255),
    outcome: z.enum(['ok', 'mismatch']),
    mismatchAt: hex32.optional(),
    got: hex32.optional(),
    volatile: z.boolean(),
    raw: z.string(),
  }),
]);
export type ProbeTraceLine = z.infer<typeof ProbeTraceLineSchema>;

/** What a probe exercised: only reads, or actions with observations. */
export const ProbeScopeSchema = z.enum(['reset-state', 'behaviour']);
export type ProbeScope = z.infer<typeof ProbeScopeSchema>;

export const ProbeTraceSchema = z.object({
  version: z.literal(PROBE_TRACE_VERSION),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  source: z.string().regex(/^[0-9a-f]{16}$/),
  lines: z.array(ProbeTraceLineSchema),
  scope: ProbeScopeSchema,
});
export type ProbeTrace = z.infer<typeof ProbeTraceSchema>;

const HEADER = /^PROBE v(\d+) name=([a-z0-9][a-z0-9-]*) source=([0-9a-f]{16})$/;
const FOOTER = /^PROBE_END lines=(\d+)$/;
const REG = '([A-Za-z0-9_]+)\\.([A-Za-z0-9_]+)\\s+@0x([0-9a-fA-F]{8})';
const READ = new RegExp(`^(?:READ\\s+)?${REG}\\s+=\\s+0x([0-9a-fA-F]{8})(\\s+volatile)?$`);
const WRITE = new RegExp(`^WRITE\\s+${REG}\\s+<=\\s+0x([0-9a-fA-F]{8})(\\s+volatile)?$`);
const WAIT = new RegExp(`^WAIT\\s+${REG}\\s+mask=0x([0-9a-fA-F]{8})\\s+expect=(0x[0-9a-fA-F]{8}|nonzero)\\s+->\\s+(ok|timeout)\\s+spins=(\\d+)(\\s+volatile)?$`);
const MEM = /^MEM\s+@0x([0-9a-fA-F]{8})\s+len=0x([0-9a-fA-F]{1,8})\s+pattern=([0-9a-fA-F]{2})\s+->\s+(ok|mismatch(?:\s+at=0x([0-9a-fA-F]{8})\s+got=0x([0-9a-fA-F]{8}))?)(\s+volatile)?$/;

export class ProbeTraceError extends Error {
  constructor(message: string, readonly line?: number) {
    super(line === undefined ? message : `line ${line}: ${message}`);
    this.name = 'ProbeTraceError';
  }
}

function parseLine(line: string, lineNumber: number): ProbeTraceLine {
  const h = (s: string) => parseInt(s, 16);
  let m = line.match(READ);
  if (m) return { kind: 'read', group: m[1]!, register: m[2]!, address: h(m[3]!), value: h(m[4]!), volatile: m[5] !== undefined, raw: line };
  m = line.match(WRITE);
  if (m) return { kind: 'write', group: m[1]!, register: m[2]!, address: h(m[3]!), value: h(m[4]!), volatile: m[5] !== undefined, raw: line };
  m = line.match(WAIT);
  if (m) {
    return {
      kind: 'wait', group: m[1]!, register: m[2]!, address: h(m[3]!), mask: h(m[4]!),
      expect: m[5] === 'nonzero' ? 'nonzero' : h(m[5]!.slice(2)),
      outcome: m[6] as 'ok' | 'timeout', spins: Number(m[7]), volatile: m[8] !== undefined, raw: line,
    };
  }
  m = line.match(MEM);
  if (m) {
    const mismatch = m[4]!.startsWith('mismatch');
    return {
      kind: 'mem', address: h(m[1]!), length: h(m[2]!), pattern: h(m[3]!),
      outcome: mismatch ? 'mismatch' : 'ok',
      mismatchAt: m[5] !== undefined ? h(m[5]) : undefined,
      got: m[6] !== undefined ? h(m[6]) : undefined,
      volatile: m[7] !== undefined, raw: line,
    };
  }
  throw new ProbeTraceError(`not a READ, WRITE, WAIT or MEM line: ${JSON.stringify(line)}`, lineNumber);
}

/** A probe that only reads exercises reset state; anything else is behaviour. */
export function scopeOf(lines: readonly ProbeTraceLine[]): ProbeScope {
  return lines.some((line) => line.kind !== 'read') ? 'behaviour' : 'reset-state';
}

/**
 * Parses a captured trace. Anything before the header is boot noise from the
 * serial line and is ignored; anything after the footer is ignored the same
 * way. Between the two, every non-empty line must be a trace line.
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
    parsed.push(parseLine(line, index + 1));
  }
  if (footerCount === undefined) {
    throw new ProbeTraceError('no "PROBE_END lines=<count>" footer was found; the capture is incomplete');
  }
  if (footerCount !== parsed.length) {
    throw new ProbeTraceError(
      `footer says ${footerCount} line(s) but ${parsed.length} trace line(s) were read`,
    );
  }
  return ProbeTraceSchema.parse({
    version: PROBE_TRACE_VERSION, name: name!, source: source!, lines: parsed, scope: scopeOf(parsed),
  });
}

export type ProbeTraceDifference =
  | { kind: 'header'; field: 'name' | 'source'; board: string; simics: string }
  | { kind: 'line'; index: number; board?: string; simics?: string }
  | { kind: 'value'; index: number; board: string; simics: string }
  | { kind: 'outcome'; index: number; board: string; simics: string };

export interface ProbeTraceDiff {
  equal: boolean;
  compared: number;
  scope: ProbeScope;
  differences: ProbeTraceDifference[];
}

// What identifies a line: its kind and the location it acts on. Two lines
// with the same key are the same step; whether the step agreed is a separate
// question.
function key(line: ProbeTraceLine): string {
  const at = `0x${line.address.toString(16).padStart(8, '0')}`;
  switch (line.kind) {
    case 'read': return `read ${line.group}.${line.register}@${at}`;
    case 'write': return `write ${line.group}.${line.register}@${at}`;
    case 'wait': return `wait ${line.group}.${line.register}@${at} mask=${line.mask} expect=${line.expect}`;
    case 'mem': return `mem @${at} len=${line.length} pattern=${line.pattern}`;
  }
}

// What a step must agree on. A read or a write agrees on its value, unless
// volatile, when only its presence counts: a status word that legitimately
// varies. A wait always agrees on whether the condition came, and on the spin
// count only when not volatile: how long a simulator takes is not the
// question, whether it gets there is. A memory test always agrees on whether
// the pattern came back.
function agrees(left: ProbeTraceLine, right: ProbeTraceLine): boolean {
  const volatile = left.volatile || right.volatile;
  switch (left.kind) {
    case 'read':
    case 'write':
      return volatile || left.value === (right as typeof left).value;
    case 'wait': {
      const other = right as typeof left;
      return left.outcome === other.outcome && (volatile || left.spins === other.spins);
    }
    case 'mem':
      return left.outcome === (right as typeof left).outcome;
  }
}

/**
 * Compares the board's trace with the simulator's. Steps must appear in the
 * same order at the same places; each must agree on its observation unless
 * either side marks it volatile.
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
    if (agrees(left, right)) continue;
    differences.push({
      kind: left.kind === 'wait' || left.kind === 'mem' ? 'outcome' : 'value',
      index, board: left.raw, simics: right.raw,
    });
  }
  return { equal: differences.length === 0, compared: count, scope: board.scope, differences };
}

export function formatProbeTraceDiff(diff: ProbeTraceDiff): string {
  const scope = diff.scope === 'behaviour' ? 'behaviour' : 'reset state only';
  if (diff.equal) return `${diff.compared} line(s) identical (scope: ${scope})`;
  const out: string[] = [`scope: ${scope}`];
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
