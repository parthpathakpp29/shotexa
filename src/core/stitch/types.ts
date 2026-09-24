/**
 * Smart Stitch — shared types.
 *
 * Coordinate conventions (used everywhere in this module):
 * - `offsetY` ("dy") is the vertical position of screenshot B's row 0 expressed in
 *   screenshot A's full-resolution coordinate space. B row `y` corresponds to A row `y + dy`.
 * - `overlap` = `a.height - offsetY` — the number of A rows that B's frame also covers.
 * - "proxy" values live in the downscaled greyscale analysis space; everything returned
 *   to callers is in full-resolution pixels unless the field name says `proxy`.
 */

/** Single-channel 8-bit image. Row-major, `data.length === width * height`. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/**
 * Abstraction over "an image we can analyse" so the same algorithm runs in a browser
 * worker (ImageBitmap + OffscreenCanvas) and in Node tests (decoded RGBA buffers).
 * Implementations must never hold more than the requested region decoded in JS memory.
 */
export interface StitchImageSource {
  readonly width: number;
  readonly height: number;
  /** Greyscale proxy of the whole image at the given size. */
  getProxy(width: number, height: number): Promise<GrayImage>;
  /** Full-resolution greyscale rows [y, y + height), columns [0, width). */
  getRows(y: number, height: number, width: number): Promise<GrayImage>;
}

export type ConfidenceClass = "high" | "medium" | "low";

/** Controlled error codes (never raw third-party strings). */
export type StitchErrorCode =
  | "STITCH_WIDTH_MISMATCH"
  | "STITCH_TOO_SMALL"
  | "STITCH_NO_MATCH"
  | "STITCH_IDENTICAL_IMAGES"
  | "VISION_ENGINE_LOAD_FAILED"
  | "DECODE_FAILED"
  | "UNSUPPORTED_FORMAT"
  | "CANCELLED"
  | "INTERNAL";

export class StitchError extends Error {
  constructor(
    readonly code: StitchErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "StitchError";
  }
}

/** Rows identical at the same position in both screenshots (status bar, sticky header, input bar…). */
export interface StaticBands {
  top: number;
  bottom: number;
}

export interface TemplateCandidate {
  direction: "a-bottom-in-b" | "b-top-in-a";
  /** Template height in proxy rows. */
  templateHeight: number;
  /** Row where the template was cut (in its own image, proxy space). */
  templateY: number;
  /** Candidate offset in proxy rows. */
  offsetYProxy: number;
  /** Horizontal drift detected (proxy px). Expected ~0 for scrolling screenshots. */
  shiftX: number;
  score: number;
  /** Best score outside the suppression window around the peak (ambiguity signal). */
  secondScore: number;
  /** Template standard deviation (texture). */
  std: number;
}

export interface ConfidenceBreakdown {
  similarity: number;
  uniqueness: number;
  agreement: number;
  residualContrast: number;
  seamResidual: number;
  /** Caps that were applied, e.g. "low-similarity". */
  caps: string[];
}

export interface StitchAnalysis {
  /** Best offset in full-resolution px. When `status === "no-match"` this is an end-to-end fallback. */
  offsetY: number;
  /** Raw best-guess offset from matching, even when confidence was too low to use it. */
  detectedOffsetY: number | null;
  overlap: number;
  confidence: number;
  confidenceClass: ConfidenceClass;
  status: "matched" | "no-match";
  /** Reason code when `no-match`. */
  reason?: StitchErrorCode;
  breakdown: ConfidenceBreakdown;
  /** Full-resolution static bands used for seam placement. */
  bands: StaticBands;
  proxy: {
    scale: number;
    width: number;
    heightA: number;
    heightB: number;
    offsetY: number;
    bands: StaticBands;
  };
  candidates: TemplateCandidate[];
  /** Mean absolute grey difference over the refined full-res band (0–255). */
  seamResidual: number;
  /** Fraction of text/edge pixels that disagree in the refined full-res band (0–1). */
  inkMismatch: number;
  /** Which static-band hypothesis won. */
  bandHypothesis: "tolerant" | "strict" | "none";
  timings: Record<string, number>;
}

export interface ImageDims {
  width: number;
  height: number;
}

/** A rectangle copied from a source image into the output. Full-resolution px. */
export interface ComposeSegment {
  source: "a" | "b";
  sy: number;
  height: number;
  dy: number;
}

export interface StitchPlan {
  width: number;
  height: number;
  offsetY: number;
  seamY: number;
  segments: ComposeSegment[];
}
