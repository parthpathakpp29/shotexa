/**
 * Bounded EXIF / TIFF reader for privacy classification (read-only).
 *
 * Walks IFD0 → Exif IFD → GPS IFD → Interop IFD and IFD1 (thumbnail). Limits: entries per IFD,
 * total IFDs, pointer depth, visited-offset set (no cycles), overflow-checked value sizes.
 * Values are only decoded for display when short; nothing is executed or allocated by size.
 */
import { checkRange, METADATA_LIMITS, safeText, u16be, u16le, u32be, u32le } from "./bytes";
import type { MetadataCategory, PrivacyFinding } from "./types";

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };

interface TagInfo {
  label: string;
  category: MetadataCategory;
  show?: "text" | "number" | "rational" | "gps" | "ucs2" | "comment" | "none";
}

const IFD0: Record<number, TagInfo> = {
  0x010e: { label: "Image description", category: "description", show: "text" },
  0x010f: { label: "Camera/device make", category: "device", show: "text" },
  0x0110: { label: "Camera/device model", category: "device", show: "text" },
  0x0131: { label: "Software", category: "software", show: "text" },
  0x000b: { label: "Processing software", category: "software", show: "text" },
  0x0132: { label: "Modification date/time", category: "timestamp", show: "text" },
  0x013b: { label: "Artist", category: "author", show: "text" },
  0x013c: { label: "Host computer", category: "device", show: "text" },
  0x8298: { label: "Copyright", category: "author", show: "text" },
  0x9c9b: { label: "Windows title", category: "description", show: "ucs2" },
  0x9c9c: { label: "Windows comment", category: "comment", show: "ucs2" },
  0x9c9d: { label: "Windows author", category: "author", show: "ucs2" },
  0x9c9e: { label: "Windows keywords", category: "description", show: "ucs2" },
  0x9c9f: { label: "Windows subject", category: "description", show: "ucs2" },
  0x4746: { label: "Rating", category: "other", show: "number" },
};

const EXIF_IFD: Record<number, TagInfo> = {
  0x9003: { label: "Original date/time", category: "timestamp", show: "text" },
  0x9004: { label: "Digitized date/time", category: "timestamp", show: "text" },
  0x9010: { label: "Time-zone offset", category: "timestamp", show: "text" },
  0x9011: { label: "Original time-zone offset", category: "timestamp", show: "text" },
  0x9012: { label: "Digitized time-zone offset", category: "timestamp", show: "text" },
  0x9290: { label: "Sub-second time", category: "timestamp", show: "text" },
  0x9291: { label: "Original sub-second time", category: "timestamp", show: "text" },
  0x9292: { label: "Digitized sub-second time", category: "timestamp", show: "text" },
  0x927c: { label: "Maker note (vendor data)", category: "camera", show: "none" },
  0x9286: { label: "User comment", category: "comment", show: "comment" },
  0xa420: { label: "Unique image ID", category: "identifier", show: "text" },
  0xa430: { label: "Camera owner name", category: "author", show: "text" },
  0xa431: { label: "Body serial number", category: "device", show: "text" },
  0xa433: { label: "Lens make", category: "camera", show: "text" },
  0xa434: { label: "Lens model", category: "camera", show: "text" },
  0xa435: { label: "Lens serial number", category: "device", show: "text" },
  0x829a: { label: "Exposure time", category: "camera", show: "rational" },
  0x829d: { label: "F-number", category: "camera", show: "rational" },
  0x8827: { label: "ISO", category: "camera", show: "number" },
  0x920a: { label: "Focal length", category: "camera", show: "rational" },
};

const GPS_IFD: Record<number, TagInfo> = {
  0x0001: { label: "GPS latitude ref", category: "location", show: "text" },
  0x0002: { label: "GPS latitude", category: "location", show: "gps" },
  0x0003: { label: "GPS longitude ref", category: "location", show: "text" },
  0x0004: { label: "GPS longitude", category: "location", show: "gps" },
  0x0005: { label: "GPS altitude ref", category: "location", show: "number" },
  0x0006: { label: "GPS altitude", category: "location", show: "rational" },
  0x0007: { label: "GPS time stamp", category: "timestamp", show: "gps" },
  0x0011: { label: "GPS image direction", category: "location", show: "rational" },
  0x0012: { label: "GPS map datum", category: "location", show: "text" },
  0x001b: { label: "GPS processing method", category: "location", show: "none" },
  0x001d: { label: "GPS date stamp", category: "timestamp", show: "text" },
};

export interface ExifThumbnail {
  /** Offset/length relative to the TIFF header start. */
  offset: number;
  length: number;
  /** Starts with a JPEG SOI marker. */
  isJpeg: boolean;
}

export interface ExifReport {
  littleEndian: boolean;
  orientation?: number;
  findings: PrivacyFinding[];
  tagCount: number;
  hasGps: boolean;
  thumbnail: ExifThumbnail | null;
  malformed: string | null;
}

/** Parse a TIFF-structured EXIF block (the bytes after "Exif\0\0", or a PNG eXIf / WebP EXIF payload). */
export function readExif(tiff: Uint8Array, source: string): ExifReport {
  const report: ExifReport = { littleEndian: true, findings: [], tagCount: 0, hasGps: false, thumbnail: null, malformed: null };
  try {
    walk(tiff, source, report);
  } catch (e) {
    // A malformed EXIF block is still EXIF: it is reported (and removed by Privacy Clean); the
    // container itself stays valid, so this is not fatal.
    report.malformed = String((e as Error)?.message ?? e);
  }
  return report;
}

function walk(t: Uint8Array, source: string, r: ExifReport) {
  if (t.length < 8) throw new Error("TIFF header too short");
  const le = t[0] === 0x49 && t[1] === 0x49;
  const be = t[0] === 0x4d && t[1] === 0x4d;
  if (!le && !be) throw new Error("bad TIFF byte order");
  r.littleEndian = le;
  const r16 = (o: number) => (le ? u16le(t, o, "tiff") : u16be(t, o, "tiff"));
  const r32 = (o: number) => (le ? u32le(t, o, "tiff") : u32be(t, o, "tiff"));
  if (r16(2) !== 42) throw new Error("bad TIFF magic");

  const visited = new Set<number>();
  let ifdCount = 0;
  const push = (f: PrivacyFinding) => {
    if (r.findings.length < METADATA_LIMITS.maxFindings) r.findings.push(f);
  };

  const readIfd = (offset: number, kind: "ifd0" | "exif" | "gps" | "interop" | "ifd1", depth: number): number => {
    if (depth > METADATA_LIMITS.maxIfdDepth) throw new Error("IFD depth limit");
    if (visited.has(offset)) throw new Error("IFD cycle");
    if (++ifdCount > METADATA_LIMITS.maxIfds) throw new Error("IFD count limit");
    visited.add(offset);
    const n = r16(offset);
    if (n > METADATA_LIMITS.maxIfdEntries) throw new Error("IFD entry limit");
    checkRange(t.length, offset + 2, n * 12 + 4, "IFD entries");
    const table = kind === "gps" ? GPS_IFD : kind === "exif" ? EXIF_IFD : kind === "ifd0" || kind === "ifd1" ? IFD0 : {};
    let thumbOffset = -1;
    let thumbLength = -1;
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      const tag = r16(e);
      const type = r16(e + 2);
      const count = r32(e + 4);
      r.tagCount++;
      const unit = TYPE_SIZE[type];
      if (!unit) continue; // unknown type: skip value, keep walking
      const size = unit * count; // count ≤ 2^32, unit ≤ 8 → exact in float64
      const valueOffset = size <= 4 ? e + 8 : r32(e + 8);
      const inBounds = valueOffset >= 0 && size <= t.length && valueOffset <= t.length - size;
      const value = () => (inBounds ? t.subarray(valueOffset, valueOffset + size) : null);

      if ((kind === "ifd0" || kind === "ifd1") && tag === 0x0112 && type === 3 && count >= 1) {
        if (kind === "ifd0") r.orientation = r16(e + 8);
        continue;
      }
      if (tag === 0x8769 || tag === 0x8825 || tag === 0xa005) {
        const sub = r32(e + 8);
        const subKind = tag === 0x8769 ? "exif" : tag === 0x8825 ? "gps" : "interop";
        if (subKind === "gps") r.hasGps = true;
        if (sub > 0 && sub < t.length) readIfd(sub, subKind, depth + 1);
        continue;
      }
      if (kind === "ifd1" && (tag === 0x0201 || tag === 0x0111)) thumbOffset = r32(e + 8);
      if (kind === "ifd1" && (tag === 0x0202 || tag === 0x0117)) thumbLength = r32(e + 8);

      const info = table[tag];
      if (!info) {
        if (kind === "gps") push({ category: "location", label: `GPS tag 0x${tag.toString(16)}`, source: `${source} GPS IFD` });
        continue;
      }
      push({ category: info.category, label: info.label, source: `${source} ${kind === "ifd0" ? "IFD0" : kind === "exif" ? "Exif IFD" : kind === "gps" ? "GPS IFD" : kind.toUpperCase()}`, value: display(info, type, count, value(), le) });
    }
    if (kind === "ifd1" && thumbOffset >= 0 && thumbLength > 0) {
      const ok = thumbLength <= t.length && thumbOffset <= t.length - thumbLength;
      r.thumbnail = { offset: thumbOffset, length: thumbLength, isJpeg: ok && t[thumbOffset] === 0xff && t[thumbOffset + 1] === 0xd8 };
      push({ category: "thumbnail", label: `Embedded thumbnail (${thumbLength} bytes)`, source: `${source} IFD1` });
    }
    return r32(offset + 2 + n * 12);
  };

  const next = readIfd(r32(4), "ifd0", 0);
  if (next > 0 && next < t.length) readIfd(next, "ifd1", 0);
}

function display(info: TagInfo, type: number, count: number, v: Uint8Array | null, le: boolean): string | undefined {
  if (!v || info.show === "none") return undefined;
  const r32 = (o: number) => (le ? u32le(v, o) : u32be(v, o));
  const r16 = (o: number) => (le ? u16le(v, o) : u16be(v, o));
  try {
    switch (info.show) {
      case "text":
        return type === 2 || type === 7 || type === 1 ? safeText(v, "latin1", 128) : undefined;
      case "ucs2":
        return safeText(v, "utf-16le", 256);
      case "comment":
        // 8-byte character-code prefix ("ASCII\0\0\0", "UNICODE\0", …) then text.
        return v.length > 8 ? safeText(v.subarray(8), v[0] === 0x55 ? "utf-16le" : "latin1", 128) : undefined;
      case "number":
        return type === 3 ? String(r16(0)) : type === 4 ? String(r32(0)) : type === 1 ? String(v[0]) : undefined;
      case "rational":
        return type === 5 && v.length >= 8 ? fmt(r32(0), r32(4)) : undefined;
      case "gps":
        if (type !== 5 || count < 3 || v.length < 24) return undefined;
        return [0, 8, 16].map((o) => fmt(r32(o), r32(o + 4))).join(" ");
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const fmt = (n: number, d: number) => (d === 0 ? "?" : String(Math.round((n / d) * 10000) / 10000));

/**
 * Minimal EXIF holding ONLY IFD0 Orientation (little-endian TIFF). Used when Privacy Clean keeps
 * orientation: 26 bytes, no timestamps/device/thumbnail.
 */
export function minimalOrientationTiff(orientation: number): Uint8Array {
  const b = new Uint8Array(26);
  b.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]); // "II", 42, IFD0 at 8
  b.set([1, 0], 8); // 1 entry
  b.set([0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation & 0xff, 0, 0, 0], 10); // Orientation SHORT ×1
  // next IFD offset = 0 (bytes 22..25)
  return b;
}
