/**
 * Compare Screenshots — logical model. The store keeps two asset ids and a handful of numbers;
 * the compared pixels are produced from the ORIGINAL files at export time and never stored.
 *
 * V2.0F (Compare Pro) adds automatic alignment, a documented perceptual metric, ignore
 * regions, changed-region classification and movement detection. Everything in
 * `CompareSettings` stays small, serialisable and undoable: measured results (alignment
 * estimates, region lists, OCR text changes) live in the CompareAnalysisRegistry instead.
 */
import type { Rect, Size } from "@/core/image-transform/types";
import type { BBox } from "@/core/ocr/types";
import type { FileId } from "@/core/runtime/types";

export type CompareMode = "side-by-side" | "slider" | "overlay" | "difference" | "heatmap";
/** How each screenshot is fitted into the shared comparison cell. */
export type CompareFit = "contain" | "cover" | "actual";
export type CompareAlign = "center" | "top" | "bottom" | "left" | "right" | "top-left";

/**
 * Automatic alignment of B onto A, before anything is compared.
 *   off              — placement only (the V1 behaviour).
 *   translate        — integer x/y offset.
 *   translate-scale  — offset plus one uniform scale factor (never a non-uniform stretch).
 *   auto             — try translation and translation+scale, keep whichever measured better.
 * No perspective warping: it cannot be measured reliably from two screenshots.
 */
export type CompareAlignMode = "off" | "translate" | "translate-scale" | "auto";

/**
 * Which difference is measured.
 *   pixel      — per-channel RGB difference plus an optional luminance gate.
 *   perceptual — CIE76 delta-E*ab in CIELAB (sRGB / D65). See `core/compare/difference.ts`.
 * Neither mode interprets the picture, and neither uses a model of any kind.
 */
export type CompareMetric = "pixel" | "perceptual";

export type ComparePresetId = "visual-qa" | "pixel-perfect" | "design-review" | "text-review" | "loose";

/** A rectangle excluded from the comparison, normalised (0-1) to the shared comparison cell. */
export interface CompareIgnoreRegion {
  id: string;
  /** Optional user label, e.g. "Timestamp". */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Temporarily disabled regions are kept but not applied. */
  enabled: boolean;
}

export interface CompareAlignSettings {
  mode: CompareAlignMode;
  /** Manual nudge, in cell pixels, added on top of any measured offset. */
  dx: number;
  dy: number;
  /** Manual scale multiplier applied on top of any measured scale (1 = none). */
  scale: number;
}

export interface CompareDiffSettings {
  metric: CompareMetric;
  /**
   * Pixel metric: a pixel is also changed when the luminance difference exceeds this, even
   * when every channel is inside the colour tolerance. Values at or above the colour
   * tolerance have no additional effect (a luminance difference never exceeds the largest
   * channel difference), which is why the default matches it exactly.
   */
  luminanceTolerance: number;
  /** Perceptual metric: delta-E*ab at or below this counts as unchanged. 2.3 is the classic JND. */
  deltaE: number;
  /** Drop changed pixels whose colour simply moved to a neighbouring pixel (sub-pixel shift). */
  ignoreAntialiasing: boolean;
  /** Drop changed pixels whose CIE76 delta-E*ab is under the just-noticeable difference. */
  ignoreNearIdenticalColour: boolean;
  /** Pixels transparent in either screenshot are left out of the comparison entirely. */
  ignoreTransparent: boolean;
  /** Count an alpha difference as a change (otherwise both sides are composited first). */
  compareAlpha: boolean;
  /** Ignore one colour (and anything within tolerance of it) wherever it appears. */
  ignoreColour: string | null;
  ignoreColourTolerance: number;
}

export interface CompareHeatmapSettings {
  /** Colour strength multiplier, 25-200 %. */
  intensity: number;
  /** Normalised change strength (0-100 %) a pixel needs before it is coloured at all. */
  threshold: number;
  /** Paint only the changed pixels; unchanged pixels keep the screenshot's own greys. */
  changedOnly: boolean;
  /** How far unchanged areas are dimmed, 0-100 %. */
  dimUnchanged: number;
  /** Draw the colour scale legend into the image, so the export explains itself. */
  legend: boolean;
}

export interface CompareSettings {
  /** Before. */
  a: FileId | null;
  /** After. */
  b: FileId | null;
  mode: CompareMode;
  fit: CompareFit;
  align: CompareAlign;
  /** Slider position, 0-100 % of the canvas width. Stored logically, never in preview pixels. */
  divider: number;
  /** Overlay opacity of B, 0-1. */
  opacity: number;
  /** Colour tolerance: channel differences at or below this count as unchanged (0-120). */
  threshold: number;
  /** Small connected components below this pixel count are omitted from the region list. */
  minRegionSize: number;
  /** Nearby region boxes are merged when their edges are within this preview-pixel distance. */
  mergeDistance: number;
  ignoreTiny: boolean;
  /** Preview-only A/B alternation. Still exports keep the selected comparison mode. */
  flicker: boolean;
  flickerSpeed: 250 | 500 | 1000;
  /** Side-by-side gap, as a percentage of the cell's short side. */
  gap: number;
  labels: boolean;
  background: string;
  /** V2.0F additions. */
  alignment: CompareAlignSettings;
  diff: CompareDiffSettings;
  heatmap: CompareHeatmapSettings;
  ignoreRegions: CompareIgnoreRegion[];
  /** Last applied preset, for display only — the real state is the controls above. */
  preset: ComparePresetId | null;
  /** Look for regions that moved rather than being independently removed and added. */
  detectMovement: boolean;
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

/** The alignment actually applied: cell-A position = scale * cell-B position + (dx, dy). */
export interface CompareAppliedAlignment {
  mode: CompareAlignMode;
  dx: number;
  dy: number;
  scale: number;
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
  minRegionSize: number;
  mergeDistance: number;
  ignoreTiny: boolean;
  background: string;
  labels: { a: string; b: string } | null;
  /** The transform applied to B's placement (already folded into `b`). */
  alignment: CompareAppliedAlignment;
  diff: CompareDiffSettings;
  heatmap: CompareHeatmapSettings;
  /** Enabled ignore regions, in canvas pixels. */
  ignoreRegions: Rect[];
  detectMovement: boolean;
}

/** How an alignment estimate turned out. Reported as measured — never as a guarantee. */
export type CompareAlignStatus = "off" | "identity" | "aligned" | "failed";

export interface CompareAlignEstimate {
  status: CompareAlignStatus;
  /** Measured transform in CELL pixels: cell-A position = scale * cell-B position + (dx, dy). */
  dx: number;
  dy: number;
  scale: number;
  /** Normalised cross-correlation of the best match, -1 to 1. */
  score: number;
  confidence: "high" | "medium" | "low";
  /** What was actually run, e.g. "translate" or "translate-scale". */
  method: CompareAlignMode;
  /** Analysis resolution the match ran at (cell pixels per analysis pixel). */
  analysisScale: number;
  /** Controlled reason when `status === "failed"`. */
  reason?: "no-texture" | "low-score" | "too-small" | "cancelled";
}

export type CompareRegionKind = "visual" | "text" | "added" | "removed" | "moved";

export interface CompareRegion {
  id: number;
  /** Bounding box in ANALYSIS pixels (the resolution the comparison ran at). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Changed pixels inside the box. */
  pixels: number;
  /** Percentage of the compared area. */
  percent: number;
  kind: CompareRegionKind;
  /** How well the evidence supports `kind`. "visual" is the honest fallback. */
  confidence: "high" | "medium" | "low";
  /** Where the box falls in each screenshot's own pixels, when it overlaps that screenshot. */
  sourceA: BBox | null;
  sourceB: BBox | null;
  /** Measured displacement when `kind === "moved"`, in analysis pixels. */
  movedBy?: { dx: number; dy: number; score: number };
  /** The other half of a detected move (the region it came from). */
  pairedWith?: number;
  /** Text changes mapped into this region, when a text diff has run. */
  textChangeIds?: string[];
}

export interface CompareStats {
  changedPixels: number;
  /** Pixels actually compared (total minus ignored and skipped-transparent pixels). */
  comparedPixels: number;
  totalPixels: number;
  ignoredPixels: number;
  changedPercent: number;
  unchangedPercent: number;
}

export interface CompareVisualAnalysis extends CompareStats {
  /** Analysis resolution. */
  width: number;
  height: number;
  regions: CompareRegion[];
  regionsTruncated: boolean;
  metric: CompareMetric;
  /** Cell pixels per analysis pixel, so boxes can be mapped back to the screenshots. */
  analysisScale: number;
}

export type CompareTextChangeKind = "added" | "removed" | "changed";

export interface CompareTextChange {
  id: string;
  kind: CompareTextChangeKind;
  /** The text as OCR read it in A (absent for an addition). */
  before?: string;
  /** The text as OCR read it in B (absent for a removal). */
  after?: string;
  /** Word-level detail for a changed line. */
  removedWords?: string[];
  addedWords?: string[];
  /** Line boxes in each screenshot's own pixels. */
  regionsA: BBox[];
  regionsB: BBox[];
  /** Mean OCR word confidence over the lines involved, 0-1. */
  confidence: number;
}

export interface CompareTextDiff {
  changes: CompareTextChange[];
  added: number;
  removed: number;
  changed: number;
  /** Lines OCR read identically on both sides. */
  unchangedLines: number;
  languageA: string;
  languageB: string;
  confidenceA?: number;
  confidenceB?: number;
  durationMs: number;
}

export type CompareErrorCode =
  | "COMPARE_NEEDS_TWO"
  | "COMPARE_TOO_LARGE"
  | "COMPARE_INVALID"
  | "COMPARE_ALIGN_FAILED"
  | "COMPARE_TEXT_FAILED"
  | "COMPARE_REPORT_FAILED"
  | "COMPARE_CANCELLED";

export class CompareError extends Error {
  constructor(
    readonly code: CompareErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "CompareError";
  }
}
