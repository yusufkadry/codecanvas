/**
 * Minimal ZIP writer (method 0 / stored, UTF-8 names). No compression and no
 * dependency — generated projects are tiny and this keeps the bundle honest.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

class ByteWriter {
  parts: Uint8Array[] = [];
  length = 0;
  u16(v: number) {
    this.parts.push(new Uint8Array([v & 0xff, (v >> 8) & 0xff]));
    this.length += 2;
  }
  u32(v: number) {
    this.parts.push(new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]));
    this.length += 4;
  }
  bytes(b: Uint8Array) {
    this.parts.push(b);
    this.length += b.length;
  }
}

export function makeZip(files: Record<string, string>): Blob {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const w = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const [path, contents] of Object.entries(files)) {
    const name = enc.encode(path);
    const data = enc.encode(contents);
    const crc = crc32(data);
    const offset = w.length;
    w.u32(0x04034b50); // local file header
    w.u16(20); // version needed
    w.u16(0x0800); // utf-8 flag
    w.u16(0); // method: stored
    w.u16(time);
    w.u16(date);
    w.u32(crc);
    w.u32(data.length);
    w.u32(data.length);
    w.u16(name.length);
    w.u16(0); // extra len
    w.bytes(name);
    w.bytes(data);
    central.push({ name, crc, size: data.length, offset });
  }

  const cdStart = w.length;
  for (const e of central) {
    w.u32(0x02014b50); // central directory header
    w.u16(20); // version made by
    w.u16(20); // version needed
    w.u16(0x0800);
    w.u16(0); // method
    w.u16(time);
    w.u16(date);
    w.u32(e.crc);
    w.u32(e.size);
    w.u32(e.size);
    w.u16(e.name.length);
    w.u16(0); // extra
    w.u16(0); // comment
    w.u16(0); // disk
    w.u16(0); // internal attrs
    w.u32(0); // external attrs
    w.u32(e.offset);
    w.bytes(e.name);
  }
  const cdSize = w.length - cdStart;

  w.u32(0x06054b50); // end of central directory
  w.u16(0);
  w.u16(0);
  w.u16(central.length);
  w.u16(central.length);
  w.u32(cdSize);
  w.u32(cdStart);
  w.u16(0);

  return new Blob(w.parts as BlobPart[], { type: "application/zip" });
}

export function downloadZip(files: Record<string, string>, baseName: string): void {
  const safe = baseName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const blob = makeZip(files);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safe || "codecanvas-project"}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}
