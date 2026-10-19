// A coding standard imported from its Word document, and a project that
// follows some of its groups (RQ-0052).

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { readCodingStandard } from './coding-standard';
import { createTargetProject } from './scaffold';
import { bodyItems, zipEntry } from './standards/docx';
import { assignGroups, expandRanges, importStandard, loadStandard, parseRules, selectRules } from './standards/import';

const temp = () => mkdtempSync(join(tmpdir(), 'aifactory-standard-'));

// A zip with one deflated entry, as Word writes it.
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
const rule = (id: string, cls: string, secondary: string, description: string, rationale: string, example?: string) =>
  p(`Table 9 - C Rule 1 | ${id} | ${cls} | ${secondary}`) +
  `<w:tbl><w:tblPr/>${row(p('Rule'), p('1'))}${row(p('Description'), p(description))}${row(p('Rationale'), p(rationale))}` +
  (example ? row(p('Example'), p(example.split('\n')[0]) + p(example.split('\n')[1])) : '') +
  `${row(p('Notes'), p('Notes ' + 'Keep it.'))}</w:tbl>`;

const DOCUMENT = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${p('Rules')}` +
  rule('C-001', 'Safety', '—', 'No undefined behaviour &amp; no &lt;trouble&gt;.', 'Refer to Ref. [2] Rule 1.3') +
  rule('C-002', 'Maintainability', 'Readability', 'No dead code.', 'Refer to Ref. [1] and Ref. [2] Rule 2.2', 'int x = 1;\nreturn x;') +
  rule('C-003', 'Style and Convention', '—', 'Tabs shall not be used.', 'Bytecraft convention.') +
  rule('A-001', 'Safety', '—', 'No direct write to PC.', 'Refer to Ref. [5]') +
  `<w:tbl>${row(p('Rule ID'), p('Objective'))}${row(p('C-001'), p('A-5'))}</w:tbl></w:body></w:document>`;

test('the document body comes back as paragraphs and tables, entities decoded, cell lines kept', () => {
  const items = bodyItems(DOCUMENT);
  assert.equal(items[0].kind, 'p');
  assert.equal(items[1].kind, 'p');
  assert.equal((items[1] as { text: string }).text, 'Table 9 - C Rule 1 | C-001 | Safety | —');
  const table = items[2];
  assert.equal(table.kind, 'tbl');
  assert.deepEqual((table as { rows: string[][] }).rows[1], ['Description', 'No undefined behaviour & no <trouble>.']);
  const example = (items[4] as { rows: string[][] }).rows.find((cells) => cells[0] === 'Example');
  assert.equal(example?.[1], 'int x = 1;\nreturn x;');
  assert.equal(zipEntry(zip('word/document.xml', DOCUMENT), 'word/document.xml').toString('utf8'), DOCUMENT);
  assert.throws(() => zipEntry(zip('word/other.xml', 'x'), 'word/document.xml'), /not a Word document/);
});

test('rules are read with their class, cited MISRA rule, example and notes; the objective matrix is not a rule', () => {
  const { rules, warnings } = parseRules(bodyItems(DOCUMENT));
  assert.deepEqual(rules.map((r) => r.id), ['C-001', 'C-002', 'C-003', 'A-001']);
  assert.deepEqual(warnings, []);
  assert.deepEqual(rules[0].misra, ['1.3']);
  assert.equal(rules[0].secondary, null);
  assert.equal(rules[1].secondary, 'Readability');
  assert.equal(rules[1].example, 'int x = 1;\nreturn x;');
  assert.equal(rules[1].notes, 'Keep it.');
  assert.deepEqual(rules[2].misra, []);
  assert.throws(() => parseRules(bodyItems(DOCUMENT + DOCUMENT)), /repeats rule C-001, C-002, C-003, and its rule sequence/);
});

test('a caption id the document repeats is renumbered from the rule sequence, and said so', () => {
  // As 5001-K-CSTD Rev.AA: the sequence runs 148, 149, 150 while the captions say A-001, A-002, A-002.
  const assembly = (sequence: number, id: string, description: string) =>
    p(`Table ${sequence} - Rule ${sequence} | ${id} | Safety | —`) +
    `<w:tbl>${row(p('Rule'), p(String(sequence)))}${row(p('Description'), p(description))}${row(p('Rationale'), p('Ref. [5]'))}</w:tbl>`;
  const xml = `<w:document xmlns:w="w"><w:body>${assembly(148, 'A-001', 'One dialect.')}${assembly(149, 'A-002', 'State declared.')}${assembly(150, 'A-002', 'No tabs.')}</w:body></w:document>`;
  const { rules, warnings } = parseRules(bodyItems(xml));
  assert.deepEqual(rules.map((r) => r.id), ['A-001', 'A-002', 'A-003']);
  assert.deepEqual(warnings, ['A-003 is captioned A-002 in the document (rule 150): "No tabs."']);
});

test('groups are ranges, prefixes and ids over the document, and every rule needs one', () => {
  const ids = ['C-001', 'C-002', 'C-003', 'A-001'];
  assert.deepEqual(expandRanges('C-001..C-002,A-*', ids), ['C-001', 'C-002', 'A-001']);
  assert.deepEqual(expandRanges('C-003', ids), ['C-003']);
  assert.throws(() => expandRanges('C-001..C-009', ids), /has no C-004/);
  assert.throws(() => expandRanges('B-*', ids), /no B- rules/);
  assert.throws(() => expandRanges('C-002..C-001', ids), /backwards/);
  const { rules } = parseRules(bodyItems(DOCUMENT));
  assert.throws(() => assignGroups(rules, [{ name: 'misra', ranges: 'C-001..C-002' }]), /C-003, A-001 is in no group/);
  const groups = assignGroups(rules, [{ name: 'misra', ranges: 'C-001..C-002' }, { name: 'do178c', ranges: 'C-002' }, { name: 'bytecraft', ranges: 'C-003' }, { name: 'arm-m3', ranges: 'A-*' }]);
  assert.deepEqual(groups.misra, ['C-001', 'C-002']);
  assert.deepEqual(rules[1].groups, ['misra', 'do178c']);
});

test('import writes rules.json, a rules.md per group and the index, the same twice; a project takes its groups', () => {
  const root = temp();
  try {
    const document = join(root, 'STD.docx');
    writeFileSync(document, zip('word/document.xml', DOCUMENT));
    const standards = join(root, 'standards');
    const groups = [{ name: 'misra', ranges: 'C-001..C-002' }, { name: 'do178c', ranges: 'C-002' }, { name: 'bytecraft', ranges: 'C-003' }, { name: 'arm-m3', ranges: 'A-*' }];
    const first = importStandard({ document, id: 'std', version: 'Rev.AA', groups, outDir: join(standards, 'std') });
    assert.deepEqual(first.files, ['rules.json', 'misra.rules.md', 'do178c.rules.md', 'bytecraft.rules.md', 'arm-m3.rules.md', 'index.md']);
    assert.deepEqual(first.standard.counts, { rules: 4, byGroup: { misra: 2, do178c: 1, bytecraft: 1, 'arm-m3': 1 }, withMisra: 2 });
    const misra = readFileSync(join(standards, 'std', 'misra.rules.md'), 'utf8');
    assert.match(misra, /^# std Rev\.AA — group misra \(2 rules\)/);
    assert.match(misra, /## C-002 \| Maintainability \| misra, do178c\n\n\*\*Secondary class:\*\* Readability\n\n\*\*Description:\*\* No dead code\.\n\n\*\*Rationale:\*\* .*\n\n\*\*MISRA:\*\* 2\.2\n\n\*\*Example:\*\*\n\n```c\nint x = 1;\nreturn x;\n```\n\n\*\*Notes:\*\* Keep it\./);
    const before = readFileSync(join(standards, 'std', 'rules.json'), 'utf8');
    importStandard({ document, id: 'std', version: 'Rev.AA', groups, outDir: join(standards, 'std') });
    assert.equal(readFileSync(join(standards, 'std', 'rules.json'), 'utf8'), before, 'a second import is identical');
    assert.throws(() => importStandard({ document, id: 'std', version: 'Rev.AA', groups: [], outDir: join(standards, 'std') }), /At least one --group/);

    const loaded = loadStandard('std', standards);
    assert.deepEqual(selectRules(loaded, ['misra', 'do178c']).map((r) => r.id), ['C-001', 'C-002'], 'C-002 counted once');
    assert.throws(() => loadStandard('other', standards), /No standard "other".*Imported: std/);
    assert.throws(() => selectRules(loaded, ['misra', 'cert']), /no group cert; it has: misra, do178c, bytecraft, arm-m3/);

    // A C project with two of the four groups.
    const { projectRoot } = createTargetProject('fw', { dir: root, template: 'c', standard: 'std', groups: ['misra', 'bytecraft'], standardsPath: standards });
    assert.deepEqual(readCodingStandard(projectRoot), { id: 'std', version: 'Rev.AA', groups: ['misra', 'bytecraft'], profile: 'default', rules: 3 });
    const index = readFileSync(join(projectRoot, 'coding-standard', 'index.md'), 'utf8');
    assert.match(index, /groups misra, bytecraft, 3 rules/);
    assert.doesNotMatch(index, /A-001/);
    assert.ok(existsSync(join(projectRoot, 'coding-standard', 'waivers.yaml')));
    const config = JSON.parse(readFileSync(join(projectRoot, 'factory.config.json'), 'utf8'));
    assert.deepEqual(config.rag.grounding.excludePaths, ['requirements/**', 'handoffs/**', 'runs/**', 'std/do178c.rules.md', 'std/arm-m3.rules.md']);
    assert.ok(config.targetProject.allowedPaths.includes('coding-standard'));
    assert.match(readFileSync(join(projectRoot, '.env'), 'utf8'), /^RAG_SOURCE_IDS=coding-standards$/m);
    const agents = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agents, /## Coding Standard\n\n- This project follows the coding standard std Rev\.AA, groups misra, bytecraft, profile default \(3 rules\)/);
    assert.match(agents, /waivers\.yaml/);

    assert.throws(() => createTargetProject('fw2', { dir: root, template: 'c', groups: ['misra'], standardsPath: standards }), /add --standard/);
    assert.throws(() => createTargetProject('fw3', { dir: root, template: 'c', standard: 'std', groups: ['cert'], standardsPath: standards }), /no group cert/);
    assert.throws(() => createTargetProject('fw4', { dir: root, template: 'python', standard: 'std', standardsPath: standards }), /--standard applies to --template c or embedded/);
    assert.throws(() => createTargetProject('fw5', { dir: root, template: 'c', standard: 'std', profile: 'strict', standardsPath: standards }), /Profile "strict"/);
    const dalA = createTargetProject('fw6', { dir: root, template: 'c', standard: 'std', profile: 'dal-a', standardsPath: standards });
    assert.equal(readCodingStandard(dalA.projectRoot)?.rules, 4, 'all groups when none is named');
    assert.match(readFileSync(join(dalA.projectRoot, 'AGENTS.md'), 'utf8'), /under profile dal-a every rule is mandatory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
