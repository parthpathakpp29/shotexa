/**
 * Compare Screenshots — logical model. The store keeps two asset ids and a handful of numbers;
 * the compared pixels are produced from the ORIGINAL files at export time and never stored.
 */
import type { Rect, Size } from "@/core/image-transform/types";
import type { FileId } from "@/core/runtime/types";

export type CompareMode = "side-by-side" | "slider" | "overlay" | "difference";
/** How each screenshot is fitted into the shared comparison cell. */
export type CompareFit = "contain" | "cover" | "actual";
export type CompareAlign = "center" | "top" | "bottom" | "left" | "right";

export interface CompareSettings {
  /** Before. */
  a: FileId | null;
  /** After. */
  b: FileId | null;
  mode: CompareMode;
  fit: CompareFit;
  align: CompareAlign;
  /** Slider position, 0–100 % of the canvas width. Stored logically, never in preview pixels. */
  divider: number;
  /** Overlay opacity of B, 0–1. */
  opacity: number;
  /** Difference sensitivity: channel differences at or below this count as unchanged (0–120). */
  threshold: number;
  /** Side-by-side gap, as a percentage of the cell's short side. */
  gap: number;
  labels: boolean;
  background: string;
}

/** Where one screenshot is drawn, and which part of it is used. */
export interface ComparePlacement {
  /** Destination rectangle, in canvas pixels. */
  dest: Rect;
  /** Source rectangle, in that image's own pixels (a crop only when the fit is "cover"). */
  source: Rect;
  /** `dest.width / source.width` — 1 when drawn at native size. */
  zoom: number;
}

export interface CompareLayout {
  canvas: Size;
  /** The shared comparison space both screenshots are fitted into. */
  cell: Size;
  /** The cell's position in the canvas for each side (the same rect except side by side). */
  cellA: Rect;
  cellB: Rect;
  a: ComparePlacement;
  b: ComparePlacement;
  mode: CompareMode;
  /** Divider x in canvas pixels (slider mode). */
  divider: number;
  opacity: number;
  threshold: number;
  background: string;
  labels: { a: string; b: string } | null;
}

export type CompareErrorCode = "COMPARE_NEEDS_TWO" | "COMPARE_TOO_LARGE" | "COMPARE_INVALID";

export class CompareError extends Error {
  constructor(
    readonly code: CompareErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "CompareError";
  }
}
