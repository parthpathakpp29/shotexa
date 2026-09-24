/**
 * Smart Screenshot-to-PDF — engine-neutral types (architecture §37–38).
 * All y positions are ORIGINAL image pixels unless named `...Proxy`.
 */

export type PaperSize = "a4" | "letter" | "fit";

export interface PageSetup {
  paper: PaperSize;
  orientation: "portrait";
  /** Margin on every side, in PDF points (1/72 in). */
  marginPt: number;
  /** Optional visual overlap between consecutive pages of one image (px). */
  overlapPx?: number;
}

export type PaginationMode = "fixed" | "visual" | "ocr";

export type BreakConfidence = "high" | "medium" | "low";

export interface PageBreak {
  id: string;
  /** Cut position: page ends at y (exclusive), next page starts at y. */
  y: number;
  source: "automatic" | "manual";
  /** Mathematically ideal position for this break (automatic breaks). */
  idealY?: number;
  confidence?: BreakConfidence;
  /** Human-readable reasons, e.g. "whitespace gap 24 px", "cuts text (least bad)". */
  reasons?: string[];
  /** Automatic break that should be reviewed by the user. */
  needsReview?: boolean;
}

/** One PDF page = a horizontal slice of one source image. */
export interface PageSlice {
  imageIndex: number;
  y0: number;
  y1: number;
  /** Extra downscale applied when a (manual/shrink) slice is taller than the page capacity. */
  fitScale: number;
}

export interface ImagePlan {
  imageIndex: number;
  width: number;
  height: number;
  /** Page capacity in image px for this image's width and the page setup. */
  capacityPx: number;
  breaks: PageBreak[];
}

export interface PaginationPlan {
  setup: PageSetup;
  mode: PaginationMode;
  images: ImagePlan[];
  pages: PageSlice[];
  /** Analysis time (ms), for diagnostics. */
  analysisMs: number;
}

export interface BreakCandidate {
  y: number;
  textIntersectionPenalty: number;
  edgeDensity: number;
  inkDensity: number;
  whitespaceScore: number;
  separatorScore: number;
  distanceFromIdeal: number;
  totalScore: number;
}

/** OCR line boxes in original image px (from Spike C results, when already available). */
export interface OcrLineBox {
  y: number;
  h: number;
}

export interface PaginationImageInput {
  /** Encoded source (browser) — never modified. */
  image?: Blob;
  width: number;
  height: number;
  ocrLines?: OcrLineBox[];
  /** Manual breaks to keep (re-planning after edits). */
  manualBreaks?: number[];
}

export interface PaginationInput {
  images: PaginationImageInput[];
  setup: PageSetup;
  mode: PaginationMode;
}

export interface PdfCreateInput {
  images: Blob[];
  plan: PaginationPlan;
  /** Page image encoding. JPEG is embedded as-is by pdf-lib; PNG is re-parsed in JS. */
  imageFormat: "jpeg" | "png";
  jpegQuality?: number;
  title?: string;
}

export interface PdfEngine {
  analysePagination(input: PaginationInput, opts?: { signal?: AbortSignal; onProgress?: (p: number, stage: string) => void }): Promise<PaginationPlan>;
  createPdf(input: PdfCreateInput, opts?: { signal?: AbortSignal; onProgress?: (p: number, stage: string) => void }): Promise<Blob>;
}
