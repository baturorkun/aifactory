import { readFileSync } from "fs";

export function parseGlyphs(path: string): number[] {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer);
  const count = view.getUint16(4);
  const table = view.getUint32(8);
  const glyphs = new Array(count);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(bytes[table + i]);
  }
  return out;
}

export function parseChecked(data: ArrayBuffer): Uint8Array {
  const view = new DataView(data);
  const offset = view.getUint32(0);
  const length = view.getUint32(4);
  if (offset + length > data.byteLength) {
    throw new Error("bad table");
  }
  return new Uint8Array(data).subarray(offset, offset + length);
}

export function sliceRecord(buf: Buffer): Buffer {
  const len = buf.readUInt16LE(2);
  return buf.slice(4, 4 + len);
}
