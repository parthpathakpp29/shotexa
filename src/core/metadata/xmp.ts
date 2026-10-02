/**
 * XMP and IPTC privacy scanning — data only.
 *
 * XMP is NOT parsed as XML (no entities, no DTD, no external references, nothing executed): the
 * first `maxXmpScanBytes` are decoded as UTF-8 and matched against known privacy-relevant
 * property names, in element or attribute form. The whole packet is removed regardless of what
 * the scan finds; the scan only drives the "what was found" report.
 */
import { METADATA_LIMITS, safeText, startsWith, u16be, u32be } from "./bytes";
import type { MetadataCategory, PrivacyFinding } from "./types";

const XMP_PROPS: { re: RegExp; label: string; category: MetadataCategory }[] = [
  { re: /exif:GPSLatitude\b/, label: "GPS latitude", category: "location" },
  { re: /exif:GPSLongitude\b/, label: "GPS longitude", category: "location" },
  { re: /exif:GPSAltitude\b/, label: "GPS altitude", category: "location" },
  { re: /photoshop:(City|State|Country)\b|Iptc4xmpCore:(Location|CountryCode)\b|Iptc4xmpExt:LocationShown\b/, label: "Place name", category: "location" },
  { re: /dc:creator\b/, label: "Creator", category: "author" },
  { re: /dc:rights\b|xmpRights:/, label: "Rights / copyright", category: "author" },
  { re: /photoshop:(AuthorsPosition|Credit|CaptionWriter)\b/, label: "Author details", category: "author" },
  { re: /xmp:CreatorTool\b/, label: "Creator tool", category: "software" },
  { re: /xmpMM:History\b|stEvt:softwareAgent\b/, label: "Editing history", category: "software" },
  { re: /xmp:(CreateDate|ModifyDate|MetadataDate)\b|exif:DateTimeOriginal\b|photoshop:DateCreated\b/, label: "Dates", category: "timestamp" },
  { re: /tiff:(Make|Model)\b|exifEX:(BodySerialNumber|LensModel|LensSerialNumber)\b|aux:(SerialNumber|Lens)\b/, label: "Device / camera", category: "device" },
  { re: /dc:(description|title|subject)\b|photoshop:Headline\b/, label: "Description / keywords", category: "description" },
  { re: /xmpMM:(DocumentID|InstanceID|OriginalDocumentID)\b|photoshop:DocumentAncestors\b/, label: "Document identifiers", category: "identifier" },
  { re: /xmpGImg:image\b|xapGImg:image\b/, label: "XMP thumbnail", category: "thumbnail" },
  { re: /crs:|photoshop:History\b/, label: "Editing settings", category: "software" },
  { re: /tiff:Orientation\b/, label: "Orientation", category: "orientation" },
];

export function scanXmp(packet: Uint8Array, source: string): PrivacyFinding[] {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(packet.subarray(0, METADATA_LIMITS.maxXmpScanBytes));
  const out: PrivacyFinding[] = [{ category: "xmp", label: `XMP packet (${packet.length} bytes)`, source }];
  for (const p of XMP_PROPS) {
    const m = p.re.exec(text);
    if (m) out.push({ category: p.category, label: p.label, source, value: xmpValue(text, m.index) });
  }
  return out;
}

/** Best-effort short value after a match (attribute `="…"` or element `>…<`), display only. */
function xmpValue(text: string, at: number): string | undefined {
  const window = text.slice(at, at + 200);
  const m = /^[\w:]+\s*=\s*"([^"]{0,80})"|^[\w:]+[^>]*>\s*([^<]{1,80})</.exec(window);
  const v = (m?.[1] ?? m?.[2])?.trim();
  return v ? v.replace(/[\u0000-\u001f]/g, "·") : undefined;
}

export const XMP_SIG = "http://ns.adobe.com/xap/1.0/\0";
export const XMP_EXT_SIG = "http://ns.adobe.com/xmp/extension/\0";

const IPTC_DATASETS: Record<number, { label: string; category: MetadataCategory }> = {
  5: { label: "Object name", category: "description" },
  25: { label: "Keywords", category: "description" },
  55: { label: "Date created", category: "timestamp" },
  60: { label: "Time created", category: "timestamp" },
  65: { label: "Originating program", category: "software" },
  80: { label: "By-line (author)", category: "author" },
  85: { label: "By-line title", category: "author" },
  90: { label: "City", category: "location" },
  92: { label: "Sub-location", category: "location" },
  95: { label: "Province/state", category: "location" },
  101: { label: "Country", category: "location" },
  110: { label: "Credit", category: "author" },
  116: { label: "Copyright notice", category: "author" },
  118: { label: "Contact", category: "author" },
  120: { label: "Caption", category: "description" },
  122: { label: "Caption writer", category: "author" },
};

/**
 * Photoshop Image Resource Blocks (JPEG APP13 "Photoshop 3.0\0"): lists IPTC datasets (0x0404)
 * and a Photoshop thumbnail (0x0409/0x040C). Bounded walk; stops at the first malformed block.
 */
export function scanPhotoshopIrb(data: Uint8Array, source: string): PrivacyFinding[] {
  const out: PrivacyFinding[] = [{ category: "iptc", label: `Photoshop/IPTC block (${data.length} bytes)`, source }];
  let o = 0;
  for (let guard = 0; guard < 10_000 && o + 12 <= data.length; guard++) {
    if (!startsWith(data, o, "8BIM")) break;
    const id = u16be(data, o + 4);
    const nameLen = data[o + 6];
    let p = o + 6 + 1 + nameLen;
    if (p % 2) p++;
    if (p + 4 > data.length) break;
    const size = u32be(data, p);
    const start = p + 4;
    if (size > data.length - start) break;
    if (id === 0x0404) scanIptc(data.subarray(start, start + size), source, out);
    if (id === 0x0409 || id === 0x040c) out.push({ category: "thumbnail", label: "Photoshop thumbnail", source });
    o = start + size + (size % 2);
  }
  return out;
}

function scanIptc(d: Uint8Array, source: string, out: PrivacyFinding[]) {
  let o = 0;
  for (let guard = 0; guard < 10_000 && o + 5 <= d.length; guard++) {
    if (d[o] !== 0x1c) break;
    const rec = d[o + 1];
    const ds = d[o + 2];
    const len = u16be(d, o + 3);
    if (len & 0x8000) break; // extended length: not needed for classification
    const start = o + 5;
    if (len > d.length - start) break;
    const info = rec === 2 ? IPTC_DATASETS[ds] : undefined;
    if (info && out.length < METADATA_LIMITS.maxFindings) out.push({ category: info.category, label: `IPTC ${info.label}`, source, value: safeText(d.subarray(start, start + len), "utf-8", 80) });
    o = start + len;
  }
}
