/**
 * Deterministic metadata fixture builders (Spike E). All privacy values are synthetic
 * ("SHOTEXA-FAKE-…", coordinates in the open ocean near 0°N 0°E).
 */
import { deflateSync } from "node:zlib";
import { PNG } from "pngjs";

// ---------------------------------------------------------------- bytes
export const ascii = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));
export const utf8 = (s: string) => Uint8Array.from(Buffer.from(s, "utf8"));
export const utf16le = (s: string) => Uint8Array.from(Buffer.from(s, "utf16le"));
export const cat = (...p: Uint8Array[]) => Uint8Array.from(Buffer.concat(p));
const be32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v >>> 0);
  return Uint8Array.from(b);
};
const le32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return Uint8Array.from(b);
};
const be16 = (v: number) => Uint8Array.from([(v >> 8) & 255, v & 255]);

// ---------------------------------------------------------------- synthetic values
export const FAKE = {
  make: "SHOTEXA-FAKE-MAKE",
  model: "SHOTEXA-FAKE-MODEL X1",
  software: "SHOTEXA-FAKE-SOFTWARE 1.0",
  artist: "SHOTEXA-FAKE-AUTHOR Jane Example",
  copyright: "SHOTEXA-FAKE-COPYRIGHT",
  description: "SHOTEXA-FAKE-DESCRIPTION private note",
  serial: "SHOTEXA-FAKE-SERIAL-0042",
  lens: "SHOTEXA-FAKE-LENS 4mm",
  owner: "SHOTEXA-FAKE-OWNER",
  comment: "SHOTEXA-FAKE-COMMENT meet at the fake office",
  date: "2001:02:03 04:05:06",
  city: "SHOTEXA-FAKE-CITY",
  host: "SHOTEXA-FAKE-HOST",
  uid: "SHOTEXA0FAKE0UNIQUE0ID0000000001",
  // Gulf of Guinea, open ocean: 0°7'24.44"N 0°34'55.55"E, 123.4 m (clearly fake)
  latSec: [44444, 100],
  lonSec: [55555, 100],
  alt: [1234, 10],
};
/** Strings/byte patterns that must never survive Privacy Clean. */
export const LEAK_MARKERS = ["SHOTEXA-FAKE", "SHOTEXA0FAKE", "S\0H\0O\0T\0E\0X\0A\0-\0F\0A\0K\0E"];

// ---------------------------------------------------------------- pixels
/** Asymmetric test picture: gradients, stripes ("text"), saturated corner markers, optional alpha. */
export function makePixels(w: number, h: number, opts: { alpha?: boolean; variant?: number } = {}): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  const v = opts.variant ?? 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = Math.round((x * 255) / w);
      let g = Math.round((y * 255) / h);
      let b = (x * 3 + y * 5 + v * 40) & 0xff;
      if (y % 24 > 16 && x > w * 0.3 && x < w * 0.9 && (x >> 3) % 5 !== 0) r = g = b = 30; // "text lines"
      if (x < w * 0.2 && y < h * 0.25) [r, g, b] = [255, 0, 0]; // top-left: pure red
      if (x > w * 0.8 && y < h * 0.25) [r, g, b] = [0, 255, 0]; // top-right: pure green
      if (x < w * 0.2 && y > h * 0.75) [r, g, b] = [0, 0, 255]; // bottom-left: pure blue
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = opts.alpha ? (Math.hypot(x - w / 2, y - h / 2) < h * 0.25 ? 0 : Math.round(80 + (175 * x) / w)) : 255;
    }
  return d;
}

export function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const png = new PNG({ width: w, height: h, colorType: 6 });
  png.data = Buffer.from(rgba);
  return Uint8Array.from(PNG.sync.write(png, { colorType: 6 }));
}

// ---------------------------------------------------------------- TIFF / EXIF writer
type Val = { t: 2; v: string } | { t: 3; v: number[] } | { t: 4; v: number[] } | { t: 5; v: [number, number][] } | { t: 7; v: Uint8Array } | { t: 1; v: number[] };
export type Ifd = Record<number, Val>;
export const A = (v: string): Val => ({ t: 2, v });
export const S = (...v: number[]): Val => ({ t: 3, v });
export const L = (...v: number[]): Val => ({ t: 4, v });
export const R = (...v: [number, number][]): Val => ({ t: 5, v });
export const U = (v: Uint8Array): Val => ({ t: 7, v });
export const B = (...v: number[]): Val => ({ t: 1, v });

function valBytes(val: Val, le: boolean): Uint8Array {
  const out: number[] = [];
  const w16 = (n: number) => (le ? out.push(n & 255, (n >> 8) & 255) : out.push((n >> 8) & 255, n & 255));
  const w32 = (n: number) => (le ? out.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255) : out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255));
  if (val.t === 2) return cat(ascii(val.v), new Uint8Array([0]));
  if (val.t === 7) return val.v;
  if (val.t === 1) return Uint8Array.from(val.v);
  if (val.t === 3) val.v.forEach(w16);
  if (val.t === 4) val.v.forEach(w32);
  if (val.t === 5) val.v.forEach(([n, d]) => (w32(n), w32(d)));
  return Uint8Array.from(out);
}
const count = (val: Val, bytes: Uint8Array) => (val.t === 3 ? val.v.length : val.t === 4 ? val.v.length : val.t === 5 ? val.v.length : bytes.length);

/** Build a TIFF block: IFD0 (+Exif IFD, +GPS IFD) and optional IFD1 with a JPEG thumbnail. */
export function tiff(opts: { le?: boolean; ifd0: Ifd; exif?: Ifd; gps?: Ifd; thumbnail?: Uint8Array }): Uint8Array {
  const le = opts.le ?? true;
  const ifd0: Ifd = { ...opts.ifd0 };
  if (opts.exif) ifd0[0x8769] = L(0);
  if (opts.gps) ifd0[0x8825] = L(0);
  const ifd1: Ifd | undefined = opts.thumbnail ? { 0x0103: S(6), 0x0201: L(0), 0x0202: L(opts.thumbnail.length) } : undefined;
  const blocks: { ifd: Ifd; name: string }[] = [{ ifd: ifd0, name: "ifd0" }];
  if (opts.exif) blocks.push({ ifd: opts.exif, name: "exif" });
  if (opts.gps) blocks.push({ ifd: opts.gps, name: "gps" });
  if (ifd1) blocks.push({ ifd: ifd1, name: "ifd1" });
  const sizeOf = (ifd: Ifd) => {
    let data = 0;
    for (const val of Object.values(ifd)) {
      const n = valBytes(val, le).length;
      if (n > 4) data += n + (n & 1);
    }
    return 2 + Object.keys(ifd).length * 12 + 4 + data;
  };
  const offsets: Record<string, number> = {};
  let o = 8;
  for (const blk of blocks) {
    offsets[blk.name] = o;
    o += sizeOf(blk.ifd);
  }
  const thumbOffset = o;
  if (opts.exif) ifd0[0x8769] = L(offsets.exif);
  if (opts.gps) ifd0[0x8825] = L(offsets.gps);
  if (ifd1) ifd1[0x0201] = L(thumbOffset);
  const out: number[] = le ? [0x49, 0x49, 42, 0, 8, 0, 0, 0] : [0x4d, 0x4d, 0, 42, 0, 0, 0, 8];
  for (const blk of blocks) {
    const base = offsets[blk.name];
    const tags = Object.keys(blk.ifd).map(Number).sort((a, b) => a - b);
    let dataPos = base + 2 + tags.length * 12 + 4;
    const entries: number[] = [];
    const data: number[] = [];
    const p16 = (arr: number[], n: number) => (le ? arr.push(n & 255, (n >> 8) & 255) : arr.push((n >> 8) & 255, n & 255));
    const p32 = (arr: number[], n: number) => (le ? arr.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255) : arr.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255));
    p16(entries, tags.length);
    for (const tag of tags) {
      const val = blk.ifd[tag];
      const bytes = valBytes(val, le);
      p16(entries, tag);
      p16(entries, val.t);
      p32(entries, count(val, bytes));
      if (bytes.length <= 4) {
        const pad = [...bytes, 0, 0, 0, 0].slice(0, 4);
        entries.push(...pad);
      } else {
        p32(entries, dataPos);
        data.push(...bytes);
        if (bytes.length & 1) data.push(0);
        dataPos += bytes.length + (bytes.length & 1);
      }
    }
    p32(entries, blk.name === "ifd0" && ifd1 ? offsets.ifd1 : 0);
    out.push(...entries, ...data);
  }
  if (opts.thumbnail) out.push(...opts.thumbnail);
  return Uint8Array.from(out);
}

/** The full privacy EXIF used by most fixtures. */
export function privacyExif(o: { le?: boolean; orientation?: number; thumbnail?: Uint8Array } = {}): Uint8Array {
  const ifd0: Ifd = {
    0x010e: A(FAKE.description),
    0x010f: A(FAKE.make),
    0x0110: A(FAKE.model),
    0x0131: A(FAKE.software),
    0x0132: A(FAKE.date),
    0x013b: A(FAKE.artist),
    0x013c: A(FAKE.host),
    0x8298: A(FAKE.copyright),
    0x9c9d: U(utf16le(`${FAKE.artist}\0`)),
  };
  if (o.orientation) ifd0[0x0112] = S(o.orientation);
  return tiff({
    le: o.le,
    ifd0,
    exif: {
      0x9003: A(FAKE.date),
      0x9004: A(FAKE.date),
      0x9010: A("+01:00"),
      0x9286: U(cat(ascii("ASCII\0\0\0"), ascii(FAKE.comment))),
      0xa420: A(FAKE.uid),
      0xa430: A(FAKE.owner),
      0xa431: A(FAKE.serial),
      0xa434: A(FAKE.lens),
      0x927c: U(cat(ascii("SHOTEXA-FAKE-MAKERNOTE"), new Uint8Array(32))),
    },
    gps: {
      0x0000: B(2, 3, 0, 0),
      0x0001: A("N"),
      0x0002: R([0, 1], [7, 1], FAKE.latSec as [number, number]),
      0x0003: A("E"),
      0x0004: R([0, 1], [34, 1], FAKE.lonSec as [number, number]),
      0x0005: B(0),
      0x0006: R(FAKE.alt as [number, number]),
      0x001d: A("2001:02:03"),
    },
    thumbnail: o.thumbnail,
  });
}

export const orientationOnlyExif = (orientation: number, le = true) => tiff({ le, ifd0: { 0x0112: S(orientation), 0x010f: A(FAKE.make) } });

// ---------------------------------------------------------------- XMP / IPTC
export function xmpPacket(extra = ""): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"
 xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
 xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:tiff="http://ns.adobe.com/tiff/1.0/"
 xmp:CreatorTool="${FAKE.software}" xmp:CreateDate="2001-02-03T04:05:06" photoshop:City="${FAKE.city}"
 exif:GPSLatitude="0,7.4074N" exif:GPSLongitude="0,34.9259E" tiff:Model="${FAKE.model}"
 xmpMM:DocumentID="xmp.did:SHOTEXA-FAKE-DOCID">
<dc:creator><rdf:Seq><rdf:li>${FAKE.artist}</rdf:li></rdf:Seq></dc:creator>
<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${FAKE.description}</rdf:li></rdf:Alt></dc:description>${extra}
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
}

export function iptcApp13(): Uint8Array {
  const ds = (n: number, v: string) => cat(new Uint8Array([0x1c, 2, n]), be16(utf8(v).length), utf8(v));
  const iptc = cat(ds(80, FAKE.artist), ds(90, FAKE.city), ds(101, "SHOTEXA-FAKE-COUNTRY"), ds(120, FAKE.description), ds(55, "20010203"));
  const res = cat(ascii("8BIM"), be16(0x0404), new Uint8Array([0, 0]), be32(iptc.length), iptc, iptc.length % 2 ? new Uint8Array([0]) : new Uint8Array());
  return cat(ascii("Photoshop 3.0\0"), res);
}

// ---------------------------------------------------------------- ICC v2 (matrix/TRC)
const s15 = (v: number) => be32(Math.round(v * 65536) | 0);
type XY = [number, number];
/** RGB→XYZ(D50) colorants for primaries with a D65 white, Bradford-adapted (like real display profiles). */
function colorants(r: XY, g: XY, b: XY, w: XY = [0.3127, 0.329]) {
  const xyz = ([x, y]: XY) => [x / y, 1, (1 - x - y) / y];
  const P = [xyz(r), xyz(g), xyz(b)];
  const M = [0, 1, 2].map((i) => P.map((p) => p[i]));
  const W = xyz(w);
  const inv = invert(M);
  const S = [0, 1, 2].map((i) => inv[i][0] * W[0] + inv[i][1] * W[1] + inv[i][2] * W[2]);
  const rgb2xyz = M.map((row) => row.map((v, j) => v * S[j]));
  const brad = [
    [0.8951, 0.2664, -0.1614],
    [-0.7502, 1.7135, 0.0367],
    [0.0389, -0.0685, 1.0296],
  ];
  const D50 = [0.9642, 1, 0.8249];
  const cs = brad.map((row) => row[0] * W[0] + row[1] * W[1] + row[2] * W[2]);
  const cd = brad.map((row) => row[0] * D50[0] + row[1] * D50[1] + row[2] * D50[2]);
  const bi = invert(brad);
  const scale = [0, 1, 2].map((i) => cd[i] / cs[i]);
  // Bradford chromatic adaptation D65 → D50: B⁻¹ · diag(cone ratio) · B · (RGB→XYZ)
  const full = mul(mul(bi, brad.map((row, i) => row.map((v) => v * scale[i]))), rgb2xyz);
  return [0, 1, 2].map((j) => [full[0][j], full[1][j], full[2][j]]);
}
function mul(a: number[][], b: number[][]) {
  return a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
}
function invert(m: number[][]) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

export function iccProfile(name: string, primaries: "p3" | "srgb", gamma = 2.2): Uint8Array {
  const prim: [XY, XY, XY] = primaries === "p3" ? [[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]] : [[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]];
  const [rc, gc, bc] = colorants(...prim);
  const xyzTag = (v: number[]) => cat(ascii("XYZ "), new Uint8Array(4), s15(v[0]), s15(v[1]), s15(v[2]));
  const desc = cat(ascii("desc"), new Uint8Array(4), be32(name.length + 1), ascii(name), new Uint8Array(1), new Uint8Array(4 + 4 + 2 + 1 + 67));
  const cprt = cat(ascii("text"), new Uint8Array(4), ascii("No copyright, synthetic test profile\0"));
  const curv = cat(ascii("curv"), new Uint8Array(4), be32(1), be16(Math.round(gamma * 256)), new Uint8Array(2));
  const tags: [string, Uint8Array][] = [
    ["desc", desc],
    ["cprt", cprt],
    ["wtpt", xyzTag([0.9642, 1, 0.8249])],
    ["rXYZ", xyzTag(rc)],
    ["gXYZ", xyzTag(gc)],
    ["bXYZ", xyzTag(bc)],
    ["rTRC", curv],
  ];
  const pad4 = (u: Uint8Array) => (u.length % 4 ? cat(u, new Uint8Array(4 - (u.length % 4))) : u);
  let off = 128 + 4 + (tags.length + 2) * 12;
  const table: Uint8Array[] = [];
  const data: Uint8Array[] = [];
  let curvOff = 0;
  for (const [sig, d] of tags) {
    table.push(cat(ascii(sig), be32(off), be32(d.length)));
    if (sig === "rTRC") curvOff = off;
    data.push(pad4(d));
    off += pad4(d).length;
  }
  table.push(cat(ascii("gTRC"), be32(curvOff), be32(curv.length)), cat(ascii("bTRC"), be32(curvOff), be32(curv.length)));
  const body = cat(be32(tags.length + 2), ...table, ...data);
  const size = 128 + body.length;
  const header = cat(
    be32(size),
    new Uint8Array(4),
    be32(0x02100000),
    ascii("mntr"),
    ascii("RGB "),
    ascii("XYZ "),
    Uint8Array.from([0x07, 0xd1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0]),
    ascii("acsp"),
    new Uint8Array(4 + 4 + 4 + 4 + 8 + 4),
    s15(0.9642),
    s15(1),
    s15(0.8249),
    new Uint8Array(4 + 16 + 28),
  );
  return cat(header, body);
}

// ---------------------------------------------------------------- JPEG
export const seg = (marker: number, payload: Uint8Array) => cat(new Uint8Array([0xff, marker]), be16(payload.length + 2), payload);
export const exifApp1 = (t: Uint8Array) => seg(0xe1, cat(ascii("Exif\0\0"), t));
export const xmpApp1 = (x: string) => seg(0xe1, cat(ascii("http://ns.adobe.com/xap/1.0/\0"), utf8(x)));
export const iccApp2 = (p: Uint8Array) => seg(0xe2, cat(ascii("ICC_PROFILE\0"), new Uint8Array([1, 1]), p));

/** Insert segments after SOI and any JFIF APP0; optionally append trailing bytes after EOI. */
export function jpegWith(base: Uint8Array, segments: Uint8Array[], trailing?: Uint8Array): Uint8Array {
  let o = 2;
  if (base[2] === 0xff && base[3] === 0xe0) o = 4 + ((base[4] << 8) | base[5]);
  return cat(base.subarray(0, o), ...segments, base.subarray(o), trailing ?? new Uint8Array());
}

// ---------------------------------------------------------------- PNG
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const t = ascii(type);
  let c = 0xffffffff;
  for (const byte of cat(t, data)) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return cat(be32(data.length), t, data, be32((c ^ 0xffffffff) >>> 0));
}
export const tEXt = (k: string, v: string) => pngChunk("tEXt", cat(ascii(k), new Uint8Array([0]), ascii(v)));
export const zTXt = (k: string, v: string) => pngChunk("zTXt", cat(ascii(k), new Uint8Array([0, 0]), deflateSync(Buffer.from(v, "latin1"))));
export const iTXt = (k: string, v: string) => pngChunk("iTXt", cat(ascii(k), new Uint8Array([0, 0, 0]), new Uint8Array([0]), new Uint8Array([0]), utf8(v)));
export const iCCP = (name: string, p: Uint8Array) => pngChunk("iCCP", cat(ascii(name), new Uint8Array([0, 0]), deflateSync(Buffer.from(p))));

/** Split a PNG into chunks and re-emit with extra chunks before the first IDAT / before IEND. */
export function pngWith(base: Uint8Array, beforeIdat: Uint8Array[], beforeIend: Uint8Array[] = [], trailing?: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [base.subarray(0, 8)];
  let o = 8;
  let insertedIdat = false;
  while (o < base.length) {
    const len = Buffer.from(base.subarray(o, o + 4)).readUInt32BE();
    const type = String.fromCharCode(...base.subarray(o + 4, o + 8));
    const end = o + 12 + len;
    if (type === "IDAT" && !insertedIdat) {
      parts.push(...beforeIdat);
      insertedIdat = true;
    }
    if (type === "IEND") parts.push(...beforeIend);
    parts.push(base.subarray(o, end));
    o = end;
  }
  if (trailing) parts.push(trailing);
  return cat(...parts);
}

/** Extract the concatenated IDAT payload (zlib stream) of a PNG. */
export function idatOf(png: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [];
  let o = 8;
  while (o < png.length) {
    const len = Buffer.from(png.subarray(o, o + 4)).readUInt32BE();
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    if (type === "IDAT") out.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  return cat(...out);
}

// ---------------------------------------------------------------- WebP
export function riffChunk(id: string, data: Uint8Array): Uint8Array {
  return cat(ascii(id), le32(data.length), data, data.length & 1 ? new Uint8Array([0]) : new Uint8Array());
}
/** Chunks of a WebP file (id → data) in order. */
export function webpChunks(file: Uint8Array): { id: string; data: Uint8Array }[] {
  const out: { id: string; data: Uint8Array }[] = [];
  let o = 12;
  while (o + 8 <= file.length) {
    const id = String.fromCharCode(...file.subarray(o, o + 4));
    const size = Buffer.from(file.subarray(o + 4, o + 8)).readUInt32LE();
    out.push({ id, data: file.subarray(o + 8, o + 8 + size) });
    o += 8 + size + (size & 1);
  }
  return out;
}
const u24 = (v: number) => Uint8Array.from([v & 255, (v >> 8) & 255, (v >> 16) & 255]);
export function vp8x(w: number, h: number, flags: number) {
  return riffChunk("VP8X", cat(new Uint8Array([flags, 0, 0, 0]), u24(w - 1), u24(h - 1)));
}
export const riff = (...chunks: Uint8Array[]) => {
  const body = cat(ascii("WEBP"), ...chunks);
  return cat(ascii("RIFF"), le32(body.length), body);
};
export const WEBP_FLAG = { icc: 0x20, alpha: 0x10, exif: 0x08, xmp: 0x04, anim: 0x02 };
/** Animated WebP from single-frame image chunk lists (each frame: [ALPH?, VP8/VP8L]). */
export function animatedWebp(w: number, h: number, frames: Uint8Array[][], extra: Uint8Array[], flags: number): Uint8Array {
  const anim = riffChunk("ANIM", cat(le32(0xffffffff), be16(0)));
  const anmf = frames.map((f) => riffChunk("ANMF", cat(u24(0), u24(0), u24(w - 1), u24(h - 1), u24(500), new Uint8Array([0]), ...f)));
  return riff(vp8x(w, h, flags | WEBP_FLAG.anim), anim, ...anmf, ...extra);
}
