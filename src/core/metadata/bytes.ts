/**
 * Bounds-checked binary helpers. Typed arrays return `undefined` for out-of-range reads instead
 * of throwing, so every read in the metadata parsers goes through these helpers, which throw a
 * controlled METADATA_MALFORMED_CONTAINER instead. Nothing here allocates based on a length
 * read from the file: slices are views, and output buffers are sized from kept ranges.
 */
import { malformed, MetadataError } from "./errors";

export const METADATA_LIMITS = {
  /** Largest input processed at all (container cleaning never decodes pixels). */
  maxInputBytes: 512 * 1024 * 1024,
  /** Structural element counts (defend against pathological files / loops). */
  maxJpegSegments: 10_000,
  maxPngChunks: 200_000,
  maxWebpChunks: 100_000,
  /** JPEG fill bytes (0xFF padding) tolerated between two markers. */
  maxFillBytes: 1024,
  /** EXIF/TIFF walking. */
  maxIfds: 16,
  maxIfdEntries: 1_000,
  maxIfdDepth: 4,
  /** Largest metadata value decoded into a string (longer values are counted, not decoded). */
  maxTextDecodeBytes: 4 * 1024,
  /** XMP bytes scanned for privacy properties (the rest is still removed, just not scanned). */
  maxXmpScanBytes: 2 * 1024 * 1024,
  /** Findings kept per inspection (a file can repeat a tag 10,000 times). */
  maxFindings: 500,
} as const;

export function checkRange(len: number, offset: number, size: number, what: string): void {
  if (!Number.isInteger(offset) || !Number.isInteger(size) || offset < 0 || size < 0 || offset > len || size > len - offset) {
    throw malformed(`${what}: range ${offset}+${size} outside 0..${len}`);
  }
}

export function u8(b: Uint8Array, o: number, what = "u8"): number {
  checkRange(b.length, o, 1, what);
  return b[o];
}
export function u16be(b: Uint8Array, o: number, what = "u16"): number {
  checkRange(b.length, o, 2, what);
  return (b[o] << 8) | b[o + 1];
}
export function u16le(b: Uint8Array, o: number, what = "u16"): number {
  checkRange(b.length, o, 2, what);
  return b[o] | (b[o + 1] << 8);
}
export function u32be(b: Uint8Array, o: number, what = "u32"): number {
  checkRange(b.length, o, 4, what);
  return ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
}
export function u32le(b: Uint8Array, o: number, what = "u32"): number {
  checkRange(b.length, o, 4, what);
  return ((b[o + 3] << 24) >>> 0) + ((b[o + 2] << 16) | (b[o + 1] << 8) | b[o]);
}
export function u24le(b: Uint8Array, o: number, what = "u24"): number {
  checkRange(b.length, o, 3, what);
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

/** Bounds-checked subarray (a view, never a copy). */
export function view(b: Uint8Array, o: number, size: number, what = "view"): Uint8Array {
  checkRange(b.length, o, size, what);
  return b.subarray(o, o + size);
}

export function fourcc(b: Uint8Array, o: number, what = "fourcc"): string {
  checkRange(b.length, o, 4, what);
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}

export function startsWith(b: Uint8Array, o: number, sig: string | readonly number[]): boolean {
  const n = sig.length;
  if (o < 0 || o + n > b.length) return false;
  for (let i = 0; i < n; i++) if (b[o + i] !== (typeof sig === "string" ? sig.charCodeAt(i) : sig[i])) return false;
  return true;
}

/**
 * Safe, bounded text decode for display. Latin-1 or UTF-8; control characters are replaced,
 * never interpreted. Values longer than the limit are truncated with an ellipsis.
 */
export function safeText(b: Uint8Array, encoding: "latin1" | "utf-8" | "utf-16le" = "latin1", max: number = METADATA_LIMITS.maxTextDecodeBytes): string {
  const slice = b.subarray(0, Math.min(b.length, max));
  let s: string;
  if (encoding === "latin1") {
    s = "";
    for (let i = 0; i < slice.length; i++) s += String.fromCharCode(slice[i]);
  } else {
    s = new TextDecoder(encoding, { fatal: false }).decode(slice);
  }
  s = s.replace(/\0+$/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "·");
  return b.length > max ? `${s}…` : s;
}

/** Concatenate kept ranges into one output buffer (size = sum of parts, never a file-declared size). */
export function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

let CRC_TABLE: Uint32Array | null = null;
export function crc32(parts: Uint8Array[]): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function assertInputSize(n: number): void {
  if (n > METADATA_LIMITS.maxInputBytes) throw new MetadataError("METADATA_TOO_LARGE", `${n} bytes`);
}

export const writeU32be = (v: number) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
export const writeU32le = (v: number) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
export const writeU16be = (v: number) => new Uint8Array([(v >>> 8) & 255, v & 255]);
export const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
