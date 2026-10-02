/**
 * PNG container: strict chunk walk (length ≤ 2^31−1, type letters, CRC), classification,
 * byte-preserving rebuild. Kept chunks are copied with their original CRC; only a rewritten
 * (orientation-only) eXIf gets a freshly computed CRC.
 *
 * NOT "remove every ancillary chunk": colour (iCCP/sRGB/gAMA/cHRM/cICP…), transparency (tRNS),
 * palette and animation chunks are preserved.
 */
import { ascii, checkRange, concat, crc32, fourcc, METADATA_LIMITS, safeText, startsWith, u32be, writeU32be } from "./bytes";
import { malformed, MetadataError } from "./errors";
import { minimalOrientationTiff, readExif } from "./exif";
import { item, type ClassifiedElement, type FormatAnalysis } from "./policy";
import type { MetadataCategory, MetadataPolicy, MetadataWarning, PrivacyFinding } from "./types";
import { scanXmp } from "./xmp";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Image data: compared byte-for-byte in verification. */
const PAYLOAD = new Set(["IHDR", "PLTE", "IDAT", "IEND", "acTL", "fcTL", "fdAT"]);
const PRESERVE: Record<string, { category: MetadataCategory; label: string; reason: string }> = {
  tRNS: { category: "rendering", label: "Transparency (tRNS)", reason: "alpha / transparent colour" },
  gAMA: { category: "color-profile", label: "Gamma (gAMA)", reason: "colour/transfer interpretation" },
  cHRM: { category: "color-profile", label: "Chromaticities (cHRM)", reason: "colour interpretation" },
  sRGB: { category: "color-profile", label: "sRGB intent (sRGB)", reason: "colour interpretation" },
  iCCP: { category: "color-profile", label: "ICC profile (iCCP)", reason: "colour-correct rendering" },
  cICP: { category: "color-profile", label: "Coding-independent code points (cICP)", reason: "HDR/wide-gamut colour" },
  mDCv: { category: "color-profile", label: "Mastering display (mDCv)", reason: "HDR rendering" },
  cLLi: { category: "color-profile", label: "Content light level (cLLi)", reason: "HDR rendering" },
  sBIT: { category: "rendering", label: "Significant bits (sBIT)", reason: "sample precision" },
  bKGD: { category: "rendering", label: "Background colour (bKGD)", reason: "rendering hint" },
  pHYs: { category: "rendering", label: "Physical size (pHYs)", reason: "print size / DPI, not private" },
  hIST: { category: "rendering", label: "Palette histogram (hIST)", reason: "palette data" },
  sPLT: { category: "rendering", label: "Suggested palette (sPLT)", reason: "palette data" },
  oFFs: { category: "rendering", label: "Image offset (oFFs)", reason: "registered, not private" },
  pCAL: { category: "rendering", label: "Pixel calibration (pCAL)", reason: "registered, not private" },
  sCAL: { category: "rendering", label: "Physical scale (sCAL)", reason: "registered, not private" },
  sTER: { category: "rendering", label: "Stereo layout (sTER)", reason: "registered, not private" },
};

const TEXT_KEYWORDS: [RegExp, MetadataCategory, string][] = [
  [/^(Author|Artist)$/i, "author", "Author"],
  [/^Copyright$/i, "author", "Copyright"],
  [/^Software$/i, "software", "Software"],
  [/^(Creation Time|date:.*|create-date|modify-date)$/i, "timestamp", "Date/time"],
  [/^Source$/i, "device", "Source device"],
  [/^(Comment|Disclaimer|Warning)$/i, "comment", "Comment"],
  [/^(Title|Description)$/i, "description", "Description"],
  [/^XML:com\.adobe\.xmp$/i, "xmp", "XMP"],
  [/^Raw profile type (exif|APP1)$/i, "exif", "EXIF (text-encoded)"],
  [/^Raw profile type (iptc|8bim)$/i, "iptc", "IPTC (text-encoded)"],
  [/^Raw profile type xmp$/i, "xmp", "XMP (text-encoded)"],
  [/^exif:/i, "exif", "EXIF property"],
];

interface Chunk {
  type: string;
  start: number;
  end: number;
  dataStart: number;
  length: number;
}

export function walkPng(b: Uint8Array): { chunks: Chunk[]; iendEnd: number } {
  if (!startsWith(b, 0, PNG_SIG)) throw malformed("no PNG signature");
  const chunks: Chunk[] = [];
  let o = 8;
  for (;;) {
    if (chunks.length > METADATA_LIMITS.maxPngChunks) throw malformed("too many chunks");
    const length = u32be(b, o, "chunk length");
    if (length > 0x7fffffff) throw malformed("chunk length > 2^31-1");
    const type = fourcc(b, o + 4, "chunk type");
    if (!/^[A-Za-z]{4}$/.test(type)) throw malformed(`invalid chunk type at ${o}`);
    checkRange(b.length, o + 8, length + 4, `chunk ${type}`);
    const dataStart = o + 8;
    const crc = u32be(b, dataStart + length, "crc");
    if (crc32([b.subarray(o + 4, dataStart + length)]) !== crc) throw malformed(`CRC mismatch in ${type}`);
    if (chunks.length === 0 && (type !== "IHDR" || length !== 13)) throw malformed("first chunk is not IHDR");
    if (type === "IHDR" && chunks.length > 0) throw malformed("duplicate IHDR");
    const c = { type, start: o, end: dataStart + length + 4, dataStart, length };
    chunks.push(c);
    o = c.end;
    if (type === "IEND") return { chunks, iendEnd: o };
    if (o >= b.length) throw malformed("truncated: no IEND");
  }
}

export function analysePng(b: Uint8Array, policy: MetadataPolicy): FormatAnalysis {
  const { chunks, iendEnd } = walkPng(b);
  const ihdr = chunks[0];
  const width = u32be(b, ihdr.dataStart);
  const height = u32be(b, ihdr.dataStart + 4);
  const colorType = b[ihdr.dataStart + 9];
  if (!width || !height) throw malformed("zero IHDR dimension");
  if (!chunks.some((c) => c.type === "IDAT")) throw malformed("no IDAT");
  const elements: ClassifiedElement[] = [];
  const payload: Uint8Array[] = [];
  const warnings: MetadataWarning[] = [];
  let orientation: number | undefined;
  let hasTrns = false;
  let animated = false;
  let colorProfile: FormatAnalysis["colorProfile"] = "none";
  let exifSeen = 0;
  let idatSeen = false;

  for (const c of chunks) {
    const data = b.subarray(c.dataStart, c.dataStart + c.length);
    const size = c.end - c.start;
    const add = (el: Omit<ClassifiedElement, "start" | "end">) => elements.push({ ...el, start: c.start, end: c.end });
    if (c.type === "IDAT") idatSeen = true;
    if (PAYLOAD.has(c.type)) {
      if (c.type === "acTL") animated = true;
      add({ item: item(c.type, "structure", "Image data", size, "preserve", "image data", false), findings: [] });
      payload.push(b.subarray(c.start, c.end));
      continue;
    }
    const keep = PRESERVE[c.type];
    if (keep) {
      if (c.type === "tRNS") hasTrns = true;
      if (c.type === "iCCP") colorProfile = "icc";
      else if (c.type === "sRGB" && colorProfile === "none") colorProfile = "srgb";
      else if (c.type === "cICP") colorProfile = "cicp";
      else if ((c.type === "gAMA" || c.type === "cHRM") && colorProfile === "none") colorProfile = "gamma-chrm";
      const action = keep.category === "color-profile" && !policy.keepColorProfile ? "remove" : "preserve";
      add({ item: item(`PNG ${c.type}`, keep.category, keep.label, size, action, keep.reason, false), findings: [] });
      continue;
    }
    if (c.type === "tEXt" || c.type === "zTXt" || c.type === "iTXt") {
      add(textChunk(c.type, data, size));
      continue;
    }
    if (c.type === "eXIf") {
      exifSeen++;
      const r = readExif(data, "PNG eXIf");
      if (r.malformed) warnings.push({ code: "MALFORMED_METADATA_BLOCK", message: "eXIf block is malformed (removed)" });
      const onlyOrientation = !r.malformed && r.tagCount === 1 && r.orientation !== undefined && !r.thumbnail;
      if (exifSeen === 1 && r.orientation !== undefined) orientation = r.orientation;
      const findings: PrivacyFinding[] = onlyOrientation ? [] : [{ category: "exif", label: `EXIF block (${size} bytes)`, source: "PNG eXIf" }, ...r.findings];
      if (!onlyOrientation && r.orientation !== undefined) findings.push({ category: "orientation", label: "Orientation", source: "PNG eXIf", value: String(r.orientation) });
      const keepOrientation = policy.orientation === "keep-minimal" && exifSeen === 1 && r.orientation !== undefined && r.orientation >= 2 && r.orientation <= 8 && !idatSeen;
      if (onlyOrientation && keepOrientation) {
        add({ item: item("PNG eXIf", "orientation", "Orientation-only EXIF", size, "preserve", "keeps display orientation; no private data", false), findings: [] });
      } else if (keepOrientation) {
        const tiff = minimalOrientationTiff(r.orientation!);
        const typeBytes = ascii("eXIf");
        add({ item: item("PNG eXIf", "exif", "EXIF (reduced to Orientation only)", size, "rewrite", "private tags removed; orientation kept", true), findings, replacement: concat([writeU32be(tiff.length), typeBytes, tiff, writeU32be(crc32([typeBytes, tiff]))]) });
        warnings.push({ code: "ORIENTATION_KEPT", message: `EXIF orientation ${r.orientation} kept (minimal eXIf)` });
      } else {
        add({ item: item("PNG eXIf", "exif", "EXIF", size, "remove", "location, device, time, software, author", true), findings });
      }
      continue;
    }
    if (c.type === "tIME") {
      add({ item: item("PNG tIME", "timestamp", "Last-modified time", size, "remove", "timestamp", true), findings: [{ category: "timestamp", label: "Last-modified time", source: "PNG tIME", value: timeValue(data) }] });
      continue;
    }
    if (c.type === "dSIG") {
      add({ item: item("PNG dSIG", "provenance", "Digital signature", size, "remove", "invalid after any edit; may identify the signer", true), findings: [{ category: "provenance", label: "Digital signature", source: "PNG dSIG" }] });
      continue;
    }
    const critical = c.type.charCodeAt(0) < 97; // uppercase first letter = critical
    if (critical) throw new MetadataError("METADATA_UNSUPPORTED_FORMAT", `unknown critical chunk ${c.type}`);
    warnings.push({ code: "UNKNOWN_ELEMENT", message: `Unrecognised chunk ${c.type}` });
    add({
      item: item(`PNG ${c.type}`, "private-app", c.type === "iDOT" ? "Apple decoding hints (iDOT)" : `Unrecognised chunk ${c.type}`, size, policy.removeUnknown ? "remove" : "preserve", c.type === "iDOT" ? "holds file offsets that become wrong once other chunks are removed" : "not needed to render; may hold private app data", true),
      findings: [{ category: "private-app", label: `Application chunk ${c.type}`, source: "PNG" }],
    });
  }
  if (exifSeen > 1) warnings.push({ code: "DUPLICATE_METADATA", message: `${exifSeen} eXIf chunks` });
  if (animated) warnings.push({ code: "ANIMATED", message: "Animated PNG: frames copied unchanged" });

  if (iendEnd < b.length) {
    const t = b.subarray(iendEnd);
    warnings.push({ code: "TRAILING_DATA", message: `${t.length} bytes after IEND` });
    elements.push({ start: iendEnd, end: b.length, item: item("after IEND", "other", "Trailing data", t.length, policy.removeTrailingData ? "remove" : "preserve", "data after the image end is invisible but downloadable", true), findings: [{ category: "other", label: `Data after end of image (${t.length} bytes)`, source: "after IEND" }] });
  }

  return {
    format: "png",
    width,
    height,
    elements,
    warnings,
    orientation,
    hasAlpha: colorType === 4 || colorType === 6 || hasTrns,
    animated,
    lossless: true,
    colorProfile,
    payload,
    build() {
      const parts: Uint8Array[] = [b.subarray(0, 8)];
      for (const e of elements) {
        if (e.item.action === "preserve") parts.push(b.subarray(e.start, e.end));
        else if (e.item.action === "rewrite" && e.replacement) parts.push(e.replacement);
      }
      return concat(parts);
    },
  };
}

function textChunk(type: string, data: Uint8Array, size: number): Omit<ClassifiedElement, "start" | "end"> {
  const nul = data.indexOf(0);
  const keyword = safeText(data.subarray(0, nul < 0 ? Math.min(data.length, 79) : Math.min(nul, 79)), "latin1", 79);
  const match = TEXT_KEYWORDS.find(([re]) => re.test(keyword));
  const category: MetadataCategory = match?.[1] ?? "description";
  const label = match?.[2] ?? `Text "${keyword}"`;
  let value: string | undefined;
  let findings: PrivacyFinding[] = [];
  if (type === "tEXt" && nul >= 0) value = safeText(data.subarray(nul + 1), "latin1", 120);
  if (type === "iTXt" && nul >= 0 && data[nul + 1] === 0) {
    // keyword\0 compFlag compMethod lang\0 translated\0 text — uncompressed only (never inflate).
    const lang = data.indexOf(0, nul + 3);
    const tr = lang < 0 ? -1 : data.indexOf(0, lang + 1);
    if (tr >= 0) {
      const text = data.subarray(tr + 1);
      if (category === "xmp") findings = scanXmp(text, `PNG iTXt ${keyword}`);
      else value = safeText(text, "utf-8", 120);
    }
  }
  if (!findings.length) findings = [{ category, label, source: `PNG ${type} ${keyword}`, value: type === "zTXt" ? "(compressed)" : value }];
  return { item: item(`PNG ${type}`, category, label, size, "remove", "free text: author, software, comments, dates", true), findings };
}

function timeValue(d: Uint8Array): string | undefined {
  if (d.length !== 7) return undefined;
  const y = (d[0] << 8) | d[1];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(d[2])}-${p(d[3])} ${p(d[4])}:${p(d[5])}:${p(d[6])}`;
}
