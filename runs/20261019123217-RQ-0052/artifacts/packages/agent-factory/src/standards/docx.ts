import { readFileSync } from 'fs';
import { inflateRawSync } from 'zlib';

// A coding standard arrives as a Word document (RQ-0052). A .docx is a zip
// whose word/document.xml holds the body; Node has no zip reader, and the one
// entry needed is small, so this reads the central directory itself.

export function zipEntry(archive: Buffer, name: string): Buffer {
  const eocd = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a zip archive.');
  const entries = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('The zip central directory is damaged.');
    const method = archive.readUInt16LE(offset + 10);
    const compressed = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const entryName = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (entryName !== name) continue;
    const start = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const data = archive.subarray(start, start + compressed);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    throw new Error(`Zip entry ${name} uses compression method ${method}, which is not supported.`);
  }
  throw new Error(`The zip archive has no ${name}: not a Word document.`);
}

export function documentXml(path: string): string {
  return zipEntry(readFileSync(path), 'word/document.xml').toString('utf8');
}

// The body as a reader sees it: paragraphs and tables, in order. A table's
// cells hold their paragraphs joined by newlines, so a code example keeps its
// lines. A table inside a cell flattens into that cell.
export type BodyItem = { kind: 'p'; text: string } | { kind: 'tbl'; rows: string[][] };

const TAG = /<(\/?)(w:p|w:tbl|w:tr|w:tc|w:t|w:tab|w:br|w:cr)(?=[\s/>])([^>]*?)(\/?)>/g;

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function bodyItems(xml: string): BodyItem[] {
  const items: BodyItem[] = [];
  const tables: { rows: string[][]; row: string[]; cell: string[] }[] = [];
  let paragraph: string[] | null = null;
  let match: RegExpExecArray | null;
  TAG.lastIndex = 0;
  const closeParagraph = () => {
    const text = (paragraph ?? []).join('').trim();
    paragraph = null;
    const table = tables[tables.length - 1];
    if (table) table.cell.push(text);
    else items.push({ kind: 'p', text });
  };
  while ((match = TAG.exec(xml)) !== null) {
    const [, closing, tag, , selfClosing] = match;
    if (tag === 'w:t') {
      if (closing) continue;
      const end = xml.indexOf('</w:t>', TAG.lastIndex);
      if (end < 0) break;
      paragraph?.push(decode(xml.slice(TAG.lastIndex, end)));
      TAG.lastIndex = end + 6;
      continue;
    }
    if (tag === 'w:tab') { paragraph?.push('\t'); continue; }
    if (tag === 'w:br' || tag === 'w:cr') { paragraph?.push('\n'); continue; }
    if (tag === 'w:p') {
      if (!closing) paragraph = [];
      if (closing || selfClosing) closeParagraph();
      continue;
    }
    if (tag === 'w:tbl') {
      if (!closing) { tables.push({ rows: [], row: [], cell: [] }); continue; }
      const table = tables.pop();
      if (!table) continue;
      const parent = tables[tables.length - 1];
      if (parent) parent.cell.push(table.rows.map((row) => row.join(' | ')).join('\n'));
      else items.push({ kind: 'tbl', rows: table.rows });
      continue;
    }
    const table = tables[tables.length - 1];
    if (!table) continue;
    if (tag === 'w:tr') {
      if (!closing) table.row = [];
      else table.rows.push(table.row);
      continue;
    }
    if (tag === 'w:tc') {
      if (!closing) table.cell = [];
      else table.row.push(table.cell.join('\n').trim());
    }
  }
  return items;
}
