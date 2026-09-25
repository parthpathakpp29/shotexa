/**
 * WebP (RIFF) container: strict chunk walk, classification, byte-preserving rebuild.
 *
 *   "RIFF" size "WEBP" · VP8 | VP8L | (VP8X · [ICCP] · [ANIM · ANMF…] · [ALPH] · VP8/VP8L · [EXIF] · [XMP ])
 *
 * EXIF / "XMP " chunks are removed, the VP8X flags are updated to match, and the RIFF size is
 * recomputed. Image chunks (VP8, VP8L, ALPH, ANIM, ANMF) are copied byte-for-byte; animated files
 * are supported at container level (frames are never touched).
 */
import { ascii, checkRange, concat, fourcc, METADATA_LIMITS, startsWith, u24le, u32le, writeU32le } from "./bytes";
import { malformed } from "./errors";
import { minimalOrientationTiff, readExif } from "./exif";
import { item, type ClassifiedElement, type FormatAnalysis } from "./policy";
import type { MetadataPolicy, MetadataWarning, PrivacyFinding } from "./types";
import { scanXmp } from "./xmp";

interface Chunk {
  id: string;
  start: number;
  end: number;
  dataStart: number;
  size: number;
}

const FLAG = { icc: 0x20, alpha: 0x10, exif: 0x08, xmp: 0x04, anim: 0x02 };

export function walkWebp(b: Uint8Array): { chunks: Chunk[]; riffEnd: number } {
  if (!startsWith(b, 0, "RIFF") || !startsWith(b, 8, "WEBP")) throw malformed("no RIFF/WEBP header");
  const riffSize = u32le(b, 4, "riff size");
  if (riffSize < 4 || riffSize % 2) throw malformed("bad RIFF size");
  const riffEnd = riffSize + 8;
  if (riffEnd > b.length) throw malformed("truncated: RIFF size exceeds file");
  const chunks: Chunk[] = [];
  let o = 12;
  while (o < riffEnd) {
    if (chunks.length > METADATA_LIMITS.maxWebpChunks) throw malformed("too many chunks");
    const id = fourcc(b, o, "chunk id");
    if (!/^[\x20-\x7e]{4}$/.test(id)) throw malformed(`invalid chunk id at ${o}`);
    const size = u32le(b, o + 4, "chunk size");
    const padded = size + (size & 1);
    if (padded > riffEnd - (o + 8)) throw malformed(`chunk ${id} exceeds RIFF`);
    checkRange(b.length, o + 8, padded, `chunk ${id}`);
    chunks.push({ id, start: o, end: o + 8 + padded, dataStart: o + 8, size });
    o += 8 + padded;
  }
  if (!chunks.length) throw malformed("no chunks");
  return { chunks, riffEnd };
}

export function analyseWebp(b: Uint8Array, policy: MetadataPolicy): FormatAnalysis {
  const { chunks, riffEnd } = walkWebp(b);
  const first = chunks[0];
  const elements: ClassifiedElement[] = [];
  const payload: Uint8Array[] = [];
  const warnings: MetadataWarning[] = [];
  let width = 0;
  let height = 0;
  let flags = 0;
  let orientation: number | undefined;
  let hasIcc = false;
  let lossless = false;
  let hasAlphaChunk = false;
  let exifSeen = 0;
  const vp8x = first.id === "VP8X" ? first : null;

  if (vp8x) {
    if (vp8x.size < 10) throw malformed("VP8X too short");
    flags = b[vp8x.dataStart];
    width = 1 + u24le(b, vp8x.dataStart + 4);
    height = 1 + u24le(b, vp8x.dataStart + 7);
  } else if (first.id === "VP8 ") {
    if (first.size < 10 || !startsWith(b, first.dataStart + 3, [0x9d, 0x01, 0x2a])) throw malformed("bad VP8 frame header");
    width = (b[first.dataStart + 6] | (b[first.dataStart + 7] << 8)) & 0x3fff;
    height = (b[first.dataStart + 8] | (b[first.dataStart + 9] << 8)) & 0x3fff;
  } else if (first.id === "VP8L") {
    if (first.size < 5 || b[first.dataStart] !== 0x2f) throw malformed("bad VP8L header");
    const v = u32le(b, first.dataStart + 1);
    width = (v & 0x3fff) + 1;
    height = ((v >>> 14) & 0x3fff) + 1;
    lossless = true;
  } else throw malformed(`unexpected first chunk ${first.id}`);
  if (!width || !height) throw malformed("zero dimension");
  if (!chunks.some((c) => c.id === "VP8 " || c.id === "VP8L" || c.id === "ANMF")) throw malformed("no image data");

  for (const c of chunks) {
    const data = b.subarray(c.dataStart, c.dataStart + c.size);
    const size = c.end - c.start;
    const add = (el: Omit<ClassifiedElement, "start" | "end">) => elements.push({ ...el, start: c.start, end: c.end });
    switch (c.id) {
      case "VP8X":
        add({ item: item("WebP VP8X", "structure", "Extended header", size, "preserve", "kept; EXIF/XMP/ICC flags updated to match the remaining chunks", false), findings: [] });
        payload.push(b.subarray(c.dataStart + 4, c.dataStart + 10)); // canvas size (flags change, size must not)
        continue;
      case "VP8 ":
      case "VP8L":
      case "ALPH":
      case "ANIM":
      case "ANMF":
        if (c.id === "VP8L") lossless = true;
        if (c.id === "ALPH") hasAlphaChunk = true;
        add({ item: item(`WebP ${c.id.trim()}`, "structure", "Image data", size, "preserve", "image data", false), findings: [] });
        payload.push(b.subarray(c.start, c.end));
        continue;
      case "ICCP":
        hasIcc = true;
        add({ item: item("WebP ICCP", "color-profile", "ICC colour profile", size, policy.keepColorProfile ? "preserve" : "remove", "needed for colour-correct rendering", false), findings: [] });
        continue;
      case "EXIF": {
        exifSeen++;
        // Some writers prefix the TIFF data with "Exif\0\0".
        const tiff = startsWith(data, 0, "Exif\0\0") ? data.subarray(6) : data;
        const r = readExif(tiff, "WebP EXIF");
        if (r.malformed) warnings.push({ code: "MALFORMED_METADATA_BLOCK", message: "EXIF chunk is malformed (removed)" });
        const onlyOrientation = !r.malformed && r.tagCount === 1 && r.orientation !== undefined && !r.thumbnail;
        if (exifSeen === 1 && r.orientation !== undefined) orientation = r.orientation;
        const findings: PrivacyFinding[] = onlyOrientation ? [] : [{ category: "exif", label: `EXIF block (${size} bytes)`, source: "WebP EXIF" }, ...r.findings];
        if (!onlyOrientation && r.orientation !== undefined) findings.push({ category: "orientation", label: "Orientation", source: "WebP EXIF", value: String(r.orientation) });
        const keep = policy.orientation === "keep-minimal" && exifSeen === 1 && r.orientation !== undefined && r.orientation >= 2 && r.orientation <= 8 && !!vp8x;
        if (onlyOrientation && keep) {
          add({ item: item("WebP EXIF", "orientation", "Orientation-only EXIF", size, "preserve", "no private data", false), findings: [] });
        } else if (keep) {
          const t = minimalOrientationTiff(r.orientation!);
          add({ item: item("WebP EXIF", "exif", "EXIF (reduced to Orientation only)", size, "rewrite", "private tags removed; orientation kept", true), findings, replacement: concat([ascii("EXIF"), writeU32le(t.length), t]) });
          warnings.push({ code: "ORIENTATION_KEPT", message: `EXIF orientation ${r.orientation} kept (minimal EXIF)` });
        } else {
          add({ item: item("WebP EXIF", "exif", "EXIF", size, "remove", "location, device, time, software, author", true), findings });
        }
        continue;
      }
      case "XMP ":
        add({ item: item("WebP XMP", "xmp", "XMP", size, "remove", "creator, tool, history, location, IDs", true), findings: scanXmp(data, "WebP XMP") });
        continue;
      default:
        warnings.push({ code: "UNKNOWN_ELEMENT", message: `Unrecognised chunk ${c.id}` });
        add({ item: item(`WebP ${c.id}`, "private-app", `Unrecognised chunk ${c.id}`, size, policy.removeUnknown ? "remove" : "preserve", "not needed to render; may hold private app data", true), findings: [{ category: "private-app", label: `Application chunk ${c.id}`, source: "WebP" }] });
    }
  }
  const animated = !!(flags & FLAG.anim) || chunks.some((c) => c.id === "ANMF");
  if (animated) warnings.push({ code: "ANIMATED", message: "Animated WebP: frames copied unchanged" });
  if (vp8x && !!(flags & FLAG.icc) !== hasIcc) warnings.push({ code: "FLAG_MISMATCH", message: "VP8X ICC flag does not match chunks" });
  if (riffEnd < b.length) {
    warnings.push({ code: "TRAILING_DATA", message: `${b.length - riffEnd} bytes after the RIFF container` });
    elements.push({ start: riffEnd, end: b.length, item: item("after RIFF", "other", "Trailing data", b.length - riffEnd, policy.removeTrailingData ? "remove" : "preserve", "data after the image end is invisible but downloadable", true), findings: [{ category: "other", label: `Data after end of image (${b.length - riffEnd} bytes)`, source: "after RIFF" }] });
  }

  return {
    format: "webp",
    width,
    height,
    elements,
    warnings,
    orientation,
    hasAlpha: !!(flags & FLAG.alpha) || hasAlphaChunk || (lossless && !vp8x && alphaHint(b, first)),
    animated,
    lossless,
    colorProfile: hasIcc ? "icc" : "none",
    payload,
    build() {
      const kept = elements.filter((e) => e.start < riffEnd && e.item.action !== "remove");
      const keptIds = new Set(kept.map((e) => e.item.container));
      const has = (id: "ICCP" | "EXIF" | "XMP") => keptIds.has(`WebP ${id}`);
      const parts: Uint8Array[] = [];
      for (const e of kept) {
        if (vp8x && e.start === vp8x.start) {
          const d = b.slice(e.start, e.end); // small (18 bytes): copy to edit the flags
          let f = d[8] & ~(FLAG.exif | FLAG.xmp | FLAG.icc);
          if (has("ICCP")) f |= FLAG.icc;
          if (has("EXIF")) f |= FLAG.exif;
          if (has("XMP")) f |= FLAG.xmp;
          d[8] = f;
          parts.push(d);
        } else if (e.item.action === "rewrite" && e.replacement) parts.push(e.replacement);
        else parts.push(b.subarray(e.start, e.end));
      }
      let body = 4;
      for (const p of parts) body += p.length;
      const trailing = elements.find((e) => e.start === riffEnd && e.item.action === "preserve");
      return concat([ascii("RIFF"), writeU32le(body), ascii("WEBP"), ...parts, ...(trailing ? [b.subarray(riffEnd)] : [])]);
    },
  };
}

/** VP8L header alpha_is_used bit (simple lossless files have no VP8X). */
function alphaHint(b: Uint8Array, first: Chunk): boolean {
  const v = u32le(b, first.dataStart + 1);
  return ((v >>> 28) & 1) === 1;
}
