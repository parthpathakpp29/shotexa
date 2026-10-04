/**
 * Split Long Screenshot — logical model. Only small values live in the workspace store: the
 * mode, the equal-split parameters and the custom lines, all in SOURCE image pixels. Pieces
 * are rendered from the original file at export time and never stored as pixels.
 */
import type { PageBreak } from "@/core/pdf/types";

export type SplitMode = "equal" | "custom";
/** Equal splitting: by a number of sections, or every N pixels. */
export type EqualBy = "count" | "height";

/**
 * A custom split line. It is the PDF page-break shape, so Split reuses the page-break
 * editing model (clamp between neighbours, add, move, remove, validate) unchanged.
 */
export type SplitLine = PageBreak;

export interface SplitSettings {
  mode: SplitMode;
  by: EqualBy;
  /** Requested number of sections (equal / count). */
  count: number;
  /** Requested section height in source px (equal / height). */
  height: number;
  /** Custom split lines, sorted by y, in source px. */
  lines: SplitLine[];
  /** Rows intentionally repeated at the start of every piece after the first. */
  overlap?: number;
  /** Local filename pattern. `{n}` is replaced with the zero-padded piece number. */
  namingTemplate?: string;
}

/** One output image: source rows [y0, y1) at full width. */
export interface SplitPiece {
  index: number;
  y0: number;
  y1: number;
}

export interface SplitExportPiece {
  blob: Blob;
  width: number;
  height: number;
}

export interface SplitExportResult {
  pieces: SplitExportPiece[];
  strategy: "single-canvas" | "tiled-png";
  ms: number;
}

export type SplitErrorCode = "SPLIT_NOTHING_TO_SPLIT" | "SPLIT_INVALID";

export class SplitError extends Error {
  constructor(
    readonly code: SplitErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "SplitError";
  }
}
