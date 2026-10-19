import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { bodyItems, documentXml, type BodyItem } from './docx';

// A coding standard, read from its Word document into rules and groups
// (RQ-0052). 5001-K-CSTD writes every rule as a caption paragraph,
// "Table 49 - C Rule 45 | C-045 | Safety | —", over a two-column table of
// Rule / Description / Rationale / Example / Notes; the rationale cites the
// source ("Refer to Ref. [2] Rule 10.3", Ref. [2] being MISRA C:2025). The
// import keeps every field, finds the cited rule, and tags each rule with the
// groups a project will choose from. The generated files are committed; the
// document stays where it is.

export const STANDARDS_DIRECTORY = resolve(__dirname, '../../../../standards');

export type Rule = {
  id: string;
  class: string;
  secondary: string | null;
  description: string;
  rationale: string;
  example: string | null;
  notes: string | null;
  /** The MISRA C rules the rationale cites, "10.3". */
  misra: string[];
  groups: string[];
};

export type Standard = {
  id: string;
  version: string;
  source: { path: string; sha256: string; bytes: number };
  /** What the import had to correct in the document, for its next revision. */
  warnings: string[];
  groups: Record<string, string[]>;
  counts: { rules: number; byGroup: Record<string, number>; withMisra: number };
  rules: Rule[];
};

export type GroupSpec = { name: string; ranges: string };

const RULE_ID = /^[A-Z]+-\d{3}$/;
const CAPTION = /\|\s*([A-Z]+-\d{3})\s*\|\s*([^|]*?)\s*(?:\|\s*(.*?)\s*)?$/;
const CITED = /\b(?:Rule|Dir(?:ective)?\.?)\s+(\d+\.\d+)/g;

function field(rows: string[][], name: string): string | null {
  const row = rows.find((cells) => cells[0]?.trim() === name);
  if (!row || row.length < 2) return null;
  // A cell may repeat its label as its first word ("Notes Character types…").
  const value = row.slice(1).join('\n').replace(new RegExp(`^${name}\\s*`), '').trim();
  return value || null;
}

const SEQUENCE = /\bRule\s+(\d+)\s*\|/;

export type ParsedRules = { rules: Rule[]; warnings: string[] };

// A caption's id can be wrong in the document: 5001-K-CSTD Rev.AA labels two
// assembly rules A-004 and six A-011, while its "Rule 148 … 164" sequence and
// its Rule-to-Objective matrix number them A-001 … A-017. When an id repeats
// within a prefix and the sequence numbers run without a gap, the sequence
// decides and the import says which rules it renumbered; otherwise the
// repeat is refused.
export function parseRules(items: BodyItem[]): ParsedRules {
  const rules: Rule[] = [];
  const sequences: (number | null)[] = [];
  for (let index = 0; index + 1 < items.length; index++) {
    const item = items[index];
    const next = items[index + 1];
    if (item.kind !== 'p' || next.kind !== 'tbl') continue;
    const caption = CAPTION.exec(item.text);
    if (!caption || !next.rows.some((cells) => cells[0]?.trim() === 'Description')) continue;
    const rationale = field(next.rows, 'Rationale') ?? '';
    const secondary = (caption[3] ?? '').replace(/^[—–-]$/, '').trim();
    rules.push({
      id: caption[1],
      class: caption[2].trim(),
      secondary: secondary || null,
      description: field(next.rows, 'Description') ?? '',
      rationale,
      example: field(next.rows, 'Example'),
      notes: field(next.rows, 'Notes'),
      misra: [...new Set([...rationale.matchAll(CITED)].map((match) => match[1]))],
      groups: [],
    });
    const sequence = SEQUENCE.exec(item.text);
    sequences.push(sequence ? Number(sequence[1]) : null);
  }
  const warnings: string[] = [];
  const prefixes = [...new Set(rules.map((rule) => rule.id.split('-')[0]))];
  for (const prefix of prefixes) {
    const indexes = rules.map((rule, index) => (rule.id.startsWith(`${prefix}-`) ? index : -1)).filter((index) => index >= 0);
    const ids = indexes.map((index) => rules[index].id);
    const repeated = [...new Set(ids.filter((id, position) => ids.indexOf(id) !== position))];
    if (repeated.length === 0) continue;
    const numbers = indexes.map((index) => sequences[index]);
    const consecutive = numbers.every((number, position) => number !== null && (position === 0 || number === (numbers[position - 1] as number) + 1));
    if (!consecutive) throw new Error(`The document repeats rule ${repeated.join(', ')}, and its rule sequence does not say which is which.`);
    const first = Number(rules[indexes[0]].id.split('-')[1]);
    indexes.forEach((index, position) => {
      const id = `${prefix}-${String(first + position).padStart(3, '0')}`;
      if (rules[index].id !== id) {
        warnings.push(`${id} is captioned ${rules[index].id} in the document (rule ${numbers[position]}): "${line(rules[index].description).slice(0, 60)}"`);
        rules[index].id = id;
      }
    });
  }
  const empty = rules.filter((rule) => !rule.description).map((rule) => rule.id);
  if (empty.length > 0) throw new Error(`Rule ${empty.join(', ')} has no description.`);
  return { rules, warnings };
}

// "C-001..C-107,A-*,C-120": ranges of one prefix, a whole prefix, single ids.
export function expandRanges(spec: string, ids: string[]): string[] {
  const chosen = new Set<string>();
  for (const part of spec.split(',').map((piece) => piece.trim()).filter(Boolean)) {
    const whole = /^([A-Z]+)-\*$/.exec(part);
    const range = /^([A-Z]+)-(\d{3})\.\.([A-Z]+)-(\d{3})$/.exec(part);
    if (whole) {
      const matching = ids.filter((id) => id.startsWith(`${whole[1]}-`));
      if (matching.length === 0) throw new Error(`${part}: the document has no ${whole[1]}- rules.`);
      matching.forEach((id) => chosen.add(id));
    } else if (range) {
      if (range[1] !== range[3]) throw new Error(`${part}: a range stays within one prefix.`);
      const from = Number(range[2]);
      const to = Number(range[4]);
      if (to < from) throw new Error(`${part}: the range runs backwards.`);
      for (let number = from; number <= to; number++) {
        const id = `${range[1]}-${String(number).padStart(3, '0')}`;
        if (!ids.includes(id)) throw new Error(`${part}: the document has no ${id}.`);
        chosen.add(id);
      }
    } else if (RULE_ID.test(part)) {
      if (!ids.includes(part)) throw new Error(`${part}: the document has no such rule.`);
      chosen.add(part);
    } else {
      throw new Error(`${part}: not a rule id, a range (C-001..C-107) or a prefix (A-*).`);
    }
  }
  return ids.filter((id) => chosen.has(id));
}

export function assignGroups(rules: Rule[], groups: GroupSpec[]): Record<string, string[]> {
  if (groups.length === 0) throw new Error('At least one --group <name>=<ranges> is needed.');
  const ids = rules.map((rule) => rule.id);
  const byName: Record<string, string[]> = {};
  for (const group of groups) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(group.name)) throw new Error(`Group "${group.name}": a name is lowercase letters, digits and dashes.`);
    if (byName[group.name]) throw new Error(`Group "${group.name}" is given twice.`);
    byName[group.name] = expandRanges(group.ranges, ids);
  }
  for (const rule of rules) rule.groups = Object.keys(byName).filter((name) => byName[name].includes(rule.id));
  const ungrouped = rules.filter((rule) => rule.groups.length === 0).map((rule) => rule.id);
  if (ungrouped.length > 0) throw new Error(`Rule ${ungrouped.join(', ')} is in no group; every rule belongs to at least one.`);
  return byName;
}

function line(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function renderGroupMarkdown(standard: Pick<Standard, 'id' | 'version'>, name: string, rules: Rule[]): string {
  const out = [`# ${standard.id} ${standard.version} — group ${name} (${rules.length} rules)`, ''];
  for (const rule of rules) {
    out.push(`## ${rule.id} | ${rule.class} | ${rule.groups.join(', ')}`, '');
    if (rule.secondary) out.push(`**Secondary class:** ${rule.secondary}`, '');
    out.push(`**Description:** ${line(rule.description)}`, '');
    if (rule.rationale) out.push(`**Rationale:** ${line(rule.rationale)}`, '');
    if (rule.misra.length > 0) out.push(`**MISRA:** ${rule.misra.join(', ')}`, '');
    if (rule.example) out.push('**Example:**', '', '```c', rule.example.replace(/\s+$/, ''), '```', '');
    if (rule.notes) out.push(`**Notes:** ${line(rule.notes)}`, '');
  }
  return out.join('\n');
}

export function renderIndex(standard: Pick<Standard, 'id' | 'version'>, rules: Rule[], groups?: string[]): string {
  const heading = groups ? `groups ${groups.join(', ')}` : 'all rules';
  return [
    `# ${standard.id} ${standard.version} — rule index (${heading}, ${rules.length} rules)`,
    '',
    ...rules.map((rule) => `- ${rule.id} — ${rule.class} — ${rule.groups.join(', ')} — ${line(rule.description)}`),
    '',
  ].join('\n');
}

export type ImportOptions = { document: string; id: string; version: string; groups: GroupSpec[]; outDir?: string };

export function importStandard(options: ImportOptions): { standard: Standard; outDir: string; files: string[] } {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.id)) throw new Error(`Standard id "${options.id}": lowercase letters, digits and dashes.`);
  if (!options.version.trim()) throw new Error('--revision names the document revision, e.g. Rev.AA.');
  const document = resolve(options.document);
  if (!existsSync(document)) throw new Error(`No such document: ${document}`);
  const { rules, warnings } = parseRules(bodyItems(documentXml(document)));
  if (rules.length === 0) throw new Error('No rule table found: a rule is a caption "… | C-001 | Class | …" over a table with a Description row.');
  const groups = assignGroups(rules, options.groups);
  const bytes = readFileSync(document);
  const standard: Standard = {
    id: options.id,
    version: options.version.trim(),
    source: { path: document, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length },
    warnings,
    groups,
    counts: {
      rules: rules.length,
      byGroup: Object.fromEntries(Object.entries(groups).map(([name, ids]) => [name, ids.length])),
      withMisra: rules.filter((rule) => rule.misra.length > 0).length,
    },
    rules,
  };
  const outDir = resolve(options.outDir ?? join(STANDARDS_DIRECTORY, options.id));
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const write = (name: string, content: string) => {
    writeFileSync(join(outDir, name), content, 'utf8');
    files.push(name);
  };
  write('rules.json', JSON.stringify(standard, null, 2) + '\n');
  for (const name of Object.keys(groups)) {
    write(`${name}.rules.md`, renderGroupMarkdown(standard, name, rules.filter((rule) => rule.groups.includes(name))));
  }
  write('index.md', renderIndex(standard, rules));
  return { standard, outDir, files };
}

export function listStandards(root = STANDARDS_DIRECTORY): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory() && existsSync(join(root, name, 'rules.json'))).sort();
}

export function loadStandard(id: string, root = STANDARDS_DIRECTORY): Standard {
  const path = join(root, id, 'rules.json');
  if (!existsSync(path)) {
    const known = listStandards(root);
    throw new Error(`No standard "${id}" under ${root}.${known.length ? ` Imported: ${known.join(', ')}.` : ' Import one with: factory standard import <document.docx> --id <id> --revision <rev> --group <name>=<ranges> …'}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Standard;
}

// The rules of the chosen groups, once each, in document order.
export function selectRules(standard: Standard, groups: string[]): Rule[] {
  const unknown = groups.filter((name) => !standard.groups[name]);
  if (unknown.length > 0) throw new Error(`Standard ${standard.id} has no group ${unknown.join(', ')}; it has: ${Object.keys(standard.groups).join(', ')}.`);
  return standard.rules.filter((rule) => rule.groups.some((name) => groups.includes(name)));
}
