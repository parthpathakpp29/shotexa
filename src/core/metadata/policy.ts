/**
 * Privacy Clean policy (Spike E). Defaults are the production recommendation; every decision is
 * backed by a measurement in docs/spikes/SPIKE_E_METADATA_PRIVACY.md.
 */
import type { MetadataCategory, MetadataFormat, MetadataInspection, MetadataItem, MetadataPolicy, MetadataWarning, PrivacyFinding } from "./types";

export const DEFAULT_METADATA_POLICY: MetadataPolicy = {
  // Browsers apply EXIF orientation to JPEG; dropping it would rotate/flip correctly displayed
  // photos. Keeping a minimal Orientation-only EXIF preserves display with no private data.
  orientation: "keep-minimal",
  keepColorProfile: true,
  removeTrailingData: true,
  removeUnknown: true,
};

export function resolveMetadataPolicy(p?: Partial<MetadataPolicy>): MetadataPolicy {
  return { ...DEFAULT_METADATA_POLICY, ...p };
}

/** One container element after classification (internal to the engine). */
export interface ClassifiedElement {
  item: MetadataItem;
  findings: PrivacyFinding[];
  /** Byte range in the input. */
  start: number;
  end: number;
  /** Replacement bytes when `item.action === "rewrite"`. */
  replacement?: Uint8Array;
}

/** What a format module hands back to the engine. */
export interface FormatAnalysis {
  format: MetadataFormat;
  width: number;
  height: number;
  elements: ClassifiedElement[];
  warnings: MetadataWarning[];
  orientation?: number;
  hasAlpha?: boolean;
  animated?: boolean;
  lossless?: boolean;
  colorProfile?: MetadataInspection["colorProfile"];
  /** Views of the bytes that carry the image itself (compared byte-for-byte in verification). */
  payload: Uint8Array[];
  /** Rebuild the container applying every element's action. */
  build(): Uint8Array;
}

export const item = (container: string, category: MetadataCategory, label: string, bytes: number, action: MetadataItem["action"], reason: string, privacy: boolean): MetadataItem => ({
  container,
  category,
  label,
  bytes,
  action,
  reason,
  privacy,
});

/**
 * Documented default policy table (rendered into the report). "Conditional" = depends on
 * content or policy switch.
 */
export const POLICY_TABLE: { type: string; decision: "Remove" | "Preserve" | "Conditional"; reason: string }[] = [
  { type: "EXIF (JPEG APP1, PNG eXIf, WebP EXIF): GPS, device, serials, timestamps, software, author, comments, maker notes", decision: "Remove", reason: "Location/identity/device data" },
  { type: "EXIF Orientation (2–8)", decision: "Conditional", reason: "Kept as a minimal Orientation-only EXIF so oriented photos don't turn sideways (JPEG; browsers apply it)" },
  { type: "EXIF embedded thumbnail (IFD1), JFIF/JFXX thumbnails, Photoshop thumbnails, XMP thumbnails", decision: "Remove", reason: "Can show uncropped/unredacted original content" },
  { type: "XMP (standard + extended)", decision: "Remove", reason: "Creator, tool, history, GPS, document IDs" },
  { type: "IPTC / Photoshop IRB (APP13)", decision: "Remove", reason: "By-line, city, caption, contact" },
  { type: "JPEG COM comments, PNG tEXt/zTXt/iTXt", decision: "Remove", reason: "Free text: author, software, comments, timestamps" },
  { type: "PNG tIME", decision: "Remove", reason: "Last-modification timestamp" },
  { type: "MPF secondary images, data after EOI/IEND/RIFF end", decision: "Remove", reason: "Hidden images / appended data (e.g. motion photos, gain maps, other files)" },
  { type: "C2PA / JUMBF (APP11), PNG dSIG", decision: "Remove", reason: "Provenance manifests can identify people/devices; signatures are invalid after any edit anyway" },
  { type: "Unrecognised APPn / ancillary PNG / WebP chunks (e.g. Apple iDOT)", decision: "Remove", reason: "Not needed to render; may hold private app data; iDOT offsets break when chunks move" },
  { type: "ICC profile (APP2 ICC_PROFILE, iCCP, ICCP)", decision: "Preserve", reason: "Colour-correct rendering (wide-gamut images change colour without it)" },
  { type: "PNG sRGB, gAMA, cHRM, cICP, mDCv, cLLi, sBIT", decision: "Preserve", reason: "Colour/transfer interpretation" },
  { type: "PNG tRNS, bKGD, PLTE, pHYs, hIST, sPLT, oFFs/pCAL/sCAL/sTER", decision: "Preserve", reason: "Transparency, palette, physical size; registered, not private" },
  { type: "JFIF APP0 (without thumbnail), Adobe APP14", decision: "Preserve", reason: "Colour transform / density needed by decoders" },
  { type: "Image data: JPEG DQT/DHT/SOF/SOS/scan, PNG IHDR/IDAT/IEND, WebP VP8/VP8L/ALPH/VP8X", decision: "Preserve", reason: "The image itself — copied byte-for-byte" },
  { type: "Animation: APNG acTL/fcTL/fdAT, WebP ANIM/ANMF", decision: "Preserve", reason: "Copied unchanged; metadata around it is still removed" },
];
