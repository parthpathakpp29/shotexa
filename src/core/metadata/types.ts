/**
 * Metadata engine result model (Spike E). Structured, UI-facing: no raw parser internals.
 * `value` fields are for LOCAL display only and must never reach analytics or logs (§42).
 */
export type MetadataFormat = "jpeg" | "png" | "webp";

export type MetadataCategory =
  | "location"
  | "device"
  | "camera"
  | "author"
  | "software"
  | "timestamp"
  | "description"
  | "comment"
  | "identifier"
  | "xmp"
  | "exif"
  | "iptc"
  | "thumbnail"
  | "provenance"
  | "hidden-image"
  | "private-app"
  | "color-profile"
  | "orientation"
  | "rendering"
  | "structure"
  | "other";

/** One container-level element (JPEG segment / PNG chunk / WebP chunk) and what Privacy Clean does with it. */
export interface MetadataItem {
  /** Container element, e.g. "APP1 Exif", "PNG tEXt", "WebP EXIF". */
  container: string;
  category: MetadataCategory;
  label: string;
  bytes: number;
  action: "remove" | "preserve" | "rewrite";
  /** Short policy reason, e.g. "needed for colour-correct rendering". */
  reason: string;
  privacy: boolean;
}

/** A privacy-relevant fact found inside the metadata. */
export interface PrivacyFinding {
  category: MetadataCategory;
  /** Human label, e.g. "GPS latitude", "Camera model". */
  label: string;
  /** Where it was found, e.g. "EXIF GPS IFD", "XMP", "PNG tEXt Author". */
  source: string;
  /** Local-only display value (truncated). Never send anywhere. */
  value?: string;
}

export type MetadataWarningCode =
  | "ORIENTATION_KEPT"
  | "TRAILING_DATA"
  | "UNKNOWN_ELEMENT"
  | "DUPLICATE_METADATA"
  | "ANIMATED"
  | "EXTENDED_XMP"
  | "MALFORMED_METADATA_BLOCK"
  | "SECONDARY_IMAGE"
  | "SCAN_TRUNCATED"
  | "FLAG_MISMATCH";

export interface MetadataWarning {
  code: MetadataWarningCode;
  message: string;
}

export interface MetadataInspection {
  format: MetadataFormat;
  width: number;
  height: number;
  bytes: number;
  /** Categories present anywhere in the file (privacy and preserved). */
  categories: MetadataCategory[];
  privacyFindings: PrivacyFinding[];
  hasPrivacyMetadata: boolean;
  /** Elements Privacy Clean removes or rewrites. */
  removableMetadata: MetadataItem[];
  /** Elements Privacy Clean keeps (colour, transparency, format-critical…). */
  preservedMetadata: MetadataItem[];
  warnings: MetadataWarning[];
  /** EXIF orientation 1–8 when present. */
  orientation?: number;
  hasAlpha?: boolean;
  animated?: boolean;
  lossless?: boolean;
  colorProfile?: "icc" | "srgb" | "gamma-chrm" | "cicp" | "none";
}

export interface MetadataPolicy {
  /**
   * EXIF orientation when it is not 1:
   *  - "keep-minimal": replace the EXIF block with a minimal one holding ONLY Orientation
   *    (pixels untouched, display unchanged);
   *  - "remove": drop it (display rotates/flips back for oriented images).
   */
  orientation: "keep-minimal" | "remove";
  /** Keep ICC profiles (JPEG APP2 / PNG iCCP / WebP ICCP). */
  keepColorProfile: boolean;
  /** Remove bytes after the image end (JPEG after EOI, PNG after IEND, WebP after the RIFF). */
  removeTrailingData: boolean;
  /** Remove unrecognised ancillary / application elements. */
  removeUnknown: boolean;
}

export interface MetadataCleanResult {
  /** The cleaned file, or the ORIGINAL bytes when nothing needed removing (`changed === false`). */
  output: Uint8Array;
  changed: boolean;
  before: MetadataInspection;
  removed: MetadataItem[];
  rewritten: MetadataItem[];
  preserved: MetadataItem[];
}

export interface MetadataVerification {
  passed: boolean;
  /** Privacy categories present before and absent after. */
  removedCategories: MetadataCategory[];
  /** Privacy findings still present in the output (must be empty, except allowed orientation). */
  unexpectedRemainingPrivacyMetadata: string[];
  /** Preserved items that must still be present (ICC, colour chunks, alpha…). */
  preservedRequiredMetadata: string[];
  missingRequiredMetadata: string[];
  dimensionsMatch: boolean;
  /** Image payload bytes identical to the original's (container-only clean ⇒ identical pixels). */
  payloadIdentical?: boolean;
  /** Decoded pixels compared (browser decode), when requested. */
  pixelsMatch?: boolean;
  outputValid: boolean;
  problems: string[];
}
