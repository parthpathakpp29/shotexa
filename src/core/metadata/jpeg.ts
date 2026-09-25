/**
 * JPEG container: strict segment walk, classification, byte-preserving rebuild.
 *
 *   SOI · (APPn | COM | DQT | DHT | SOFn | DRI | SOS scan …)* · EOI · [trailing]
 *
 * Every kept segment and all entropy-coded scan data are copied byte-for-byte, so decoded pixels
 * cannot change. Truncated files (no EOI, segment past the end) fail closed.
 */
import { checkRange, concat, METADATA_LIMITS, safeText, startsWith, u16be, writeU16be, ascii } from "./bytes";
import { malformed } from "./errors";
import { minimalOrientationTiff, readExif } from "./exif";
import { item, type ClassifiedElement, type FormatAnalysis } from "./policy";
import type { MetadataPolicy, MetadataWarning, PrivacyFinding } from "./types";
import { scanPhotoshopIrb, scanXmp, XMP_EXT_SIG, XMP_SIG } from "./xmp";

interface Segment {
  marker: number;
  start: number;
  end: number;
  /** Payload (after the 2-byte length) — empty for standalone markers. */
  dataStart: number;
  dataEnd: number;
}

const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

export function walkJpeg(b: Uint8Array): { segments: Segment[]; eoi: number; warnings: MetadataWarning[] } {
  if (!startsWith(b, 0, [0xff, 0xd8])) throw malformed("no SOI");
  const n = b.length;
  const segments: Segment[] = [];
  const warnings: MetadataWarning[] = [];
  let o = 2;
  for (;;) {
    if (segments.length > METADATA_LIMITS.maxJpegSegments) throw malformed("too many segments");
    if (o >= n) throw malformed("truncated: no EOI");
    if (b[o] !== 0xff) throw malformed(`expected marker at ${o}`);
    let fill = 0;
    while (o + 1 < n && b[o + 1] === 0xff) {
      o++;
      if (++fill > METADATA_LIMITS.maxFillBytes) throw malformed("fill-byte run");
    }
    if (o + 1 >= n) throw malformed("truncated marker");
    const m = b[o + 1];
    if (m === 0xd9) return { segments, eoi: o, warnings };
    if (m === 0x00 || m === 0xd8) throw malformed(`invalid marker 0x${m.toString(16)} at ${o}`);
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      segments.push({ marker: m, start: o, end: o + 2, dataStart: o + 2, dataEnd: o + 2 });
      o += 2;
      continue;
    }
    const len = u16be(b, o + 2, "segment length");
    if (len < 2) throw malformed("segment length < 2");
    checkRange(n, o + 2, len, "segment");
    const seg: Segment = { marker: m, start: o, end: o + 2 + len, dataStart: o + 4, dataEnd: o + 2 + len };
    if (m === 0xda) {
      // Entropy-coded data runs to the next marker that is not a stuffed 0x00 or RSTn.
      let p = seg.end;
      for (;;) {
        const i = b.indexOf(0xff, p);
        if (i < 0 || i + 1 >= n) throw malformed("truncated: scan data runs to end of file");
        const nb = b[i + 1];
        if (nb === 0x00 || (nb >= 0xd0 && nb <= 0xd7)) {
          p = i + 2;
          continue;
        }
        seg.end = i;
        break;
      }
    }
    segments.push(seg);
    o = seg.end;
  }
}

export function analyseJpeg(b: Uint8Array, policy: MetadataPolicy): FormatAnalysis {
  const { segments, eoi, warnings } = walkJpeg(b);
  const elements: ClassifiedElement[] = [];
  const payload: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let orientation: number | undefined;
  let exifCount = 0;
  let hasIcc = false;
  let minimalInserted = false;

  const add = (s: Segment, el: Omit<ClassifiedElement, "start" | "end">) => elements.push({ ...el, start: s.start, end: s.end });

  for (const s of segments) {
    const m = s.marker;
    const data = b.subarray(s.dataStart, s.dataEnd);
    const size = s.end - s.start;
    if (isSof(m)) {
      height = u16be(b, s.dataStart + 1, "SOF");
      width = u16be(b, s.dataStart + 3, "SOF");
    }
    if (m >= 0xe0 && m <= 0xef) {
      const app = `APP${m - 0xe0}`;
      if (m === 0xe0 && startsWith(data, 0, "JFIF\0")) {
        const tw = data[12] ?? 0;
        const th = data[13] ?? 0;
        if (tw * th > 0) {
          const rewritten = concat([b.subarray(s.start, s.start + 2), writeU16be(16), data.subarray(0, 12), new Uint8Array([0, 0])]);
          add(s, { item: item(`${app} JFIF`, "thumbnail", "JFIF header thumbnail", size, "rewrite", "thumbnail removed, density kept", true), findings: [{ category: "thumbnail", label: `JFIF thumbnail ${tw}×${th}`, source: "JFIF" }], replacement: rewritten });
        } else {
          add(s, { item: item(`${app} JFIF`, "rendering", "JFIF header", size, "preserve", "density/format header used by decoders", false), findings: [] });
        }
        continue;
      }
      if (m === 0xe0 && startsWith(data, 0, "JFXX\0")) {
        add(s, { item: item(`${app} JFXX`, "thumbnail", "JFIF extension thumbnail", size, "remove", "thumbnail can show the original image", true), findings: [{ category: "thumbnail", label: "JFXX thumbnail", source: "JFXX" }] });
        continue;
      }
      if (m === 0xe1 && startsWith(data, 0, "Exif\0\0")) {
        exifCount++;
        const r = readExif(data.subarray(6), "EXIF");
        if (r.malformed) warnings.push({ code: "MALFORMED_METADATA_BLOCK", message: "EXIF block is malformed (removed)" });
        const onlyOrientation = !r.malformed && r.tagCount === 1 && r.orientation !== undefined && !r.thumbnail;
        if (exifCount === 1 && r.orientation !== undefined) orientation = r.orientation;
        const findings: PrivacyFinding[] = onlyOrientation ? [] : [{ category: "exif", label: `EXIF block (${size} bytes)`, source: "APP1" }, ...r.findings];
        if (!onlyOrientation && r.orientation !== undefined) findings.push({ category: "orientation", label: "Orientation", source: "EXIF IFD0", value: String(r.orientation) });
        const keep = policy.orientation === "keep-minimal" && exifCount === 1 && r.orientation !== undefined && r.orientation >= 2 && r.orientation <= 8;
        if (onlyOrientation && keep) {
          add(s, { item: item(`${app} Exif`, "orientation", "Orientation-only EXIF", size, "preserve", "keeps correct display orientation; no private data", false), findings: [] });
        } else if (keep && !minimalInserted) {
          minimalInserted = true;
          const tiff = minimalOrientationTiff(r.orientation!);
          const payloadBytes = concat([ascii("Exif\0\0"), tiff]);
          add(s, { item: item(`${app} Exif`, "exif", "EXIF (reduced to Orientation only)", size, "rewrite", "private tags/thumbnail removed; orientation kept so the image doesn't rotate", true), findings, replacement: concat([new Uint8Array([0xff, 0xe1]), writeU16be(payloadBytes.length + 2), payloadBytes]) });
          warnings.push({ code: "ORIENTATION_KEPT", message: `EXIF orientation ${r.orientation} kept (minimal EXIF)` });
        } else {
          add(s, { item: item(`${app} Exif`, "exif", "EXIF", size, "remove", "location, device, time, software, author, thumbnail", true), findings });
        }
        continue;
      }
      if (m === 0xe1 && startsWith(data, 0, XMP_SIG)) {
        add(s, { item: item(`${app} XMP`, "xmp", "XMP", size, "remove", "creator, tool, history, location, IDs", true), findings: scanXmp(data.subarray(XMP_SIG.length), "XMP") });
        continue;
      }
      if (m === 0xe1 && startsWith(data, 0, XMP_EXT_SIG)) {
        warnings.push({ code: "EXTENDED_XMP", message: "Extended XMP present (removed)" });
        add(s, { item: item(`${app} XMP extension`, "xmp", "Extended XMP", size, "remove", "continuation of the XMP packet", true), findings: [{ category: "xmp", label: "Extended XMP", source: "APP1" }] });
        continue;
      }
      if (m === 0xe2 && startsWith(data, 0, "ICC_PROFILE\0")) {
        hasIcc = true;
        const keep = policy.keepColorProfile;
        add(s, { item: item(`${app} ICC`, "color-profile", "ICC colour profile", size, keep ? "preserve" : "remove", "needed for colour-correct rendering", false), findings: [] });
        continue;
      }
      if (m === 0xe2 && startsWith(data, 0, "MPF\0")) {
        warnings.push({ code: "SECONDARY_IMAGE", message: "Multi-Picture Format: secondary images removed" });
        add(s, { item: item(`${app} MPF`, "hidden-image", "Multi-Picture index", size, "remove", "points at extra images appended after the main image", true), findings: [{ category: "hidden-image", label: "Multi-Picture Format (extra images)", source: "APP2" }] });
        continue;
      }
      if (m === 0xed && startsWith(data, 0, "Photoshop 3.0\0")) {
        add(s, { item: item(`${app} Photoshop`, "iptc", "IPTC / Photoshop", size, "remove", "author, city, caption, thumbnails", true), findings: scanPhotoshopIrb(data.subarray(14), "IPTC") });
        continue;
      }
      if (m === 0xee && startsWith(data, 0, "Adobe")) {
        add(s, { item: item(`${app} Adobe`, "rendering", "Adobe colour transform", size, "preserve", "decoders need it to pick YCbCr/RGB/CMYK", false), findings: [] });
        continue;
      }
      if (m === 0xeb && (startsWith(data, 0, "JP") || startsWith(data, 0, "JU"))) {
        add(s, { item: item(`${app} JUMBF`, "provenance", "JUMBF / C2PA content credentials", size, "remove", "provenance manifests can identify people/devices", true), findings: [{ category: "provenance", label: "Content credentials (JUMBF/C2PA)", source: app }] });
        continue;
      }
      const tag = safeText(data.subarray(0, Math.min(data.length, 24)), "latin1", 24).split("·")[0];
      add(s, {
        item: item(`${app}${tag ? ` ${tag}` : ""}`, "private-app", "Application data", size, policy.removeUnknown ? "remove" : "preserve", "unrecognised application data; not needed to render", true),
        findings: [{ category: "private-app", label: `Application data ${app}${tag ? ` (${tag})` : ""}`, source: app }],
      });
      continue;
    }
    if (m === 0xfe) {
      add(s, { item: item("COM", "comment", "JPEG comment", size, "remove", "free text", true), findings: [{ category: "comment", label: "Comment", source: "COM", value: safeText(data, "latin1", 120) }] });
      continue;
    }
    // Everything else is image data: tables, frame, scans, restart intervals.
    add(s, { item: item(`0x${m.toString(16).toUpperCase()}`, "structure", "Image data", size, "preserve", "image data", false), findings: [] });
    payload.push(b.subarray(s.start, s.end));
  }
  if (exifCount > 1) warnings.push({ code: "DUPLICATE_METADATA", message: `${exifCount} EXIF blocks` });
  if (!width || !height) throw malformed("no frame header (SOF)");
  if (!segments.some((s) => s.marker === 0xda)) throw malformed("no scan (SOS)");

  const trailingStart = eoi + 2;
  if (trailingStart < b.length) {
    const t = b.subarray(trailingStart);
    const isImage = t[0] === 0xff && t[1] === 0xd8;
    warnings.push({ code: isImage ? "SECONDARY_IMAGE" : "TRAILING_DATA", message: `${t.length} bytes after the end of the image` });
    elements.push({
      start: trailingStart,
      end: b.length,
      item: item("after EOI", isImage ? "hidden-image" : "other", isImage ? "Appended image" : "Trailing data", t.length, policy.removeTrailingData ? "remove" : "preserve", "data after the image end is invisible but downloadable", true),
      findings: [{ category: isImage ? "hidden-image" : "other", label: isImage ? "Image appended after the main image" : `Data after end of image (${t.length} bytes)`, source: "after EOI" }],
    });
  }

  return {
    format: "jpeg",
    width,
    height,
    elements,
    warnings,
    orientation,
    hasAlpha: false,
    lossless: false,
    colorProfile: hasIcc ? "icc" : "none",
    payload,
    build() {
      const parts: Uint8Array[] = [b.subarray(0, 2)];
      for (const e of elements) {
        if (e.start >= trailingStart) continue;
        if (e.item.action === "preserve") parts.push(b.subarray(e.start, e.end));
        else if (e.item.action === "rewrite" && e.replacement) parts.push(e.replacement);
      }
      parts.push(b.subarray(eoi, eoi + 2));
      const trailing = elements.find((e) => e.start === trailingStart);
      if (trailing && trailing.item.action === "preserve") parts.push(b.subarray(trailingStart));
      return concat(parts);
    },
  };
}
