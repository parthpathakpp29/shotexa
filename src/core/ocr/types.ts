/**
 * OCR — engine-neutral types (architecture §32–34).
 *
 * Coordinates: every bbox in an OcrResult is in ORIGINAL screenshot pixels (top-left
 * origin), regardless of any preprocessing (upscaling) or strip/tile offsets applied
 * before recognition. `transform` on OcrInput describes how to get back there.
 */

export type OcrLanguage = "eng" | "hin";

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrWord {
  text: string;
  bbox: BBox;
  /** 0–1. */
  confidence: number;
}

export interface OcrLine {
  text: string;
  bbox: BBox;
  confidence: number;
  /** Baseline endpoints in original pixels, when the engine provides them. */
  baseline?: { x0: number; y0: number; x1: number; y1: number };
  words: OcrWord[];
}

export interface OcrParagraph {
  bbox: BBox;
  confidence: number;
  lines: OcrLine[];
}

export interface OcrBlock {
  bbox: BBox;
  confidence: number;
  /** Engine block type (e.g. Tesseract "FLOWING_TEXT"), informational. */
  kind?: string;
  paragraphs: OcrParagraph[];
}

export interface OcrResult {
  /** Engine text rebuilt from lines in the chosen reading order (never edited). */
  rawText: string;
  /** Starts as cleaned rawText; the only field the user edits. Layout stays untouched. */
  editedText: string;
  language: string;
  /** Mean word confidence 0–1. */
  confidence?: number;
  blocks: OcrBlock[];
  durationMs: number;
  image: { width: number; height: number };
  readingOrder: ReadingOrder;
  /** Preprocessing steps that produced the recognised image. */
  preprocessing: string[];
  /** Detected skew/rotation the engine corrected for (radians), if any. */
  rotateRadians?: number;
  engine: { name: string; version: string };
}

/**
 * Maps recognised-image pixels to original pixels:
 *   original = recognised / scale + offset
 */
export interface OcrTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface OcrInput {
  /** Encoded image (PNG/JPEG/WebP bytes or Blob) that the engine recognises. */
  image: Blob | Uint8Array;
  /** Size of the ORIGINAL screenshot the result must be expressed in. */
  original: { width: number; height: number };
  transform?: OcrTransform;
  preprocessing?: string[];
}

/**
 * - "engine": Tesseract block order (column-aware).
 * - "top-down": visual rows, left→right.
 * - "auto": engine order + short same-row fragments (values, cells, line numbers) re-attached
 *   to their row (Spike C default candidate).
 */
export type ReadingOrder = "engine" | "top-down" | "auto";

export type PageSegmentation = "auto" | "single-column" | "single-block" | "sparse";

export interface OcrInitOptions {
  languages: OcrLanguage[];
}

export interface OcrOptions {
  languages?: OcrLanguage[];
  segmentation?: PageSegmentation;
  readingOrder?: ReadingOrder;
  /** Rebuild leading indentation from word x positions (code screenshots). */
  preserveIndentation?: boolean;
  /** Let the engine detect and correct small skew. */
  autoRotate?: boolean;
  signal?: AbortSignal;
  onProgress?: (fraction: number, stage: string) => void;
}

export interface OcrEngine {
  readonly name: string;
  initialise(options?: OcrInitOptions): Promise<void>;
  recognise(input: OcrInput, options?: OcrOptions): Promise<OcrResult>;
  terminate(): Promise<void>;
}
