/**
 * Smart PDF pagination — PROVISIONAL tuning values (architecture §37–38).
 * Every weight/threshold lives here; values are set from the Spike D benchmark
 * (docs/spikes/SPIKE_D_SMART_PDF.md) and must be re-tuned on real screenshots.
 */
export interface PaginationConfig {
  /** Analysis proxy: width cap; vertical resolution never below `minScaleY` (row precision). */
  proxyMaxWidth: number;
  minScaleY: number;

  /** A pixel is "content" if it differs from the page background by more than this (0–255). */
  contentThreshold: number;
  /** A horizontal neighbour difference above this counts as a glyph/edge stroke (0–255). */
  edgeThreshold: number;
  /**
   * A row is "stroke-free" (usable gap) if at most this fraction of its pixels are strong
   * horizontal edges. Allows a few block borders (bubble/card sides), rejects text rows.
   */
  strokeFreeEdges: number;
  /** Mean row-to-row change (0–1) that marks a separator/background boundary. */
  separatorTransition: number;

  /** Search window as a fraction of page capacity: up (shorter page) and down (page shrinks to fit). */
  windowUp: number;
  windowDown: number;
  /** Never create a page shorter than this fraction of capacity (except the last). */
  minPageFraction: number;

  weights: {
    /** Cutting through glyph strokes (text). */
    edgeDensity: number;
    /** Cutting through non-background content (bubbles, cards, photos). */
    inkDensity: number;
    /** Reward: clearance to the nearest content inside a whitespace gap. */
    whitespace: number;
    /** Reward: cutting exactly on a separator / background boundary. */
    separator: number;
    /** Penalty per window-width of distance from the ideal break. */
    distance: number;
    /** Cutting through a known OCR text line. */
    ocrText: number;
  };
  /** Whitespace clearance (original px) that earns the full whitespace reward. */
  whitespaceTargetPx: number;
  /** Stroke fraction that counts as "full" edge density. */
  edgeNorm: number;
  /** Rows either side of the cut included in the stroke/content check (proxy rows). */
  bandRows: number;

  confidence: {
    /** Clearance (original px) for a whitespace cut to be "high". */
    highClearancePx: number;
    /** Low-confidence cut must beat the ideal break's cost by this much to be moved at all. */
    minImprovement: number;
  };
  /** OCR line boxes are padded by this (px) before the intersection test. */
  ocrPadPx: number;
}

export const DEFAULT_PAGINATION_CONFIG: PaginationConfig = {
  proxyMaxWidth: 360,
  minScaleY: 0.5,
  contentThreshold: 18,
  edgeThreshold: 40,
  strokeFreeEdges: 0.012,
  separatorTransition: 0.015,
  windowUp: 0.1,
  windowDown: 0,
  minPageFraction: 0.6,
  // Spike D grid search: broad plateau (105/243 combos tie for best); this is a mid-plateau point.
  weights: { edgeDensity: 2, inkDensity: 0.5, whitespace: 1.5, separator: 1.5, distance: 0.6, ocrText: 6 },
  whitespaceTargetPx: 18,
  edgeNorm: 0.03,
  bandRows: 1,
  confidence: { highClearancePx: 6, minImprovement: 0.25 },
  ocrPadPx: 2,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type PaginationConfigOverrides = DeepPartial<PaginationConfig>;

export function resolvePaginationConfig(o?: PaginationConfigOverrides): PaginationConfig {
  const c = DEFAULT_PAGINATION_CONFIG;
  return { ...c, ...o, weights: { ...c.weights, ...o?.weights }, confidence: { ...c.confidence, ...o?.confidence } } as PaginationConfig;
}
