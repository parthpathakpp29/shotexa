/**
 * Smart Stitch — PROVISIONAL tuning values.
 *
 * Every number here is experimental (architecture §29). They were chosen during
 * Spike A and must be re-tuned against the Shotexa screenshot benchmark
 * (`npm run bench:stitch`), not treated as permanent constants.
 */
export interface StitchConfig {
  /** Proxy width cap. Analysis runs on greyscale proxies no wider than this. */
  proxyMaxWidth: number;
  /** Reject pairs whose widths differ by more than this ratio. */
  maxWidthMismatchRatio: number;
  /** Minimum proxy content height (rows) required to attempt matching. */
  minContentRowsProxy: number;

  staticBands: {
    /** Per-pixel grey difference above which a pixel counts as "changed". */
    pixelDiffThreshold: number;
    /** A row is static when fewer than this fraction of its pixels changed. */
    maxChangedFraction: number;
    /** Max fraction of image height a header/footer band may occupy. */
    maxBandFraction: number;
    /** Non-static rows tolerated inside a band. */
    gapToleranceRows: number;
    /** Edge zone (fraction of height) where localised drift (clock/battery) is tolerated. */
    driftZoneFraction: number;
    /** Rows are split into this many blocks to decide whether changes are localised. */
    driftBlocks: number;
    /** A row whose changes touch at most this many blocks is "localised drift". */
    maxDriftBlocks: number;
    /** If this fraction of rows is static at the same position, images are identical. */
    identicalFraction: number;
  };

  templates: {
    /** Template heights as fractions of the content height. Small ones catch small overlaps. */
    heightFractions: number[];
    minHeightRows: number;
    /** Horizontal margin (fraction of width) cropped from templates to detect x drift. */
    marginFraction: number;
    /** Templates flatter than this std (grey levels) are skipped or slid to a textured area. */
    minStd: number;
    /** How far (fraction of content height) a flat template may slide to find texture. */
    maxSlideFraction: number;
    /** Peaks within ±this many proxy rows of the best peak are ignored for the 2nd-best score. */
    suppressRows: number;
  };

  /** Candidates within this many proxy rows vote for the same offset. */
  clusterToleranceRows: number;
  /** Minimum overlap (proxy rows) for the residual to be meaningful. */
  minOverlapRowsProxy: number;
  /** Baseline residual is sampled every N proxy rows. */
  residualBaselineStep: number;
  /** Residual below this (grey levels) counts as "flat" to avoid dividing by ~0. */
  residualFloor: number;

  refine: {
    /** Full-res band height used for pixel-exact refinement. */
    bandRows: number;
    /** Extra search radius (full-res px) beyond one proxy pixel. */
    extraRadius: number;
    /** Column stride when computing full-res residuals. */
    columnStride: number;
    /** Horizontal gradient (grey levels) that marks a pixel as text/edge "ink". */
    inkThreshold: number;
    /** Ink pixels differing by more than this are mismatches. */
    inkDiffThreshold: number;
  };

  /**
   * Also evaluate the strict-band and no-band hypotheses. Periodic layouts (zebra tables,
   * list rows) can make real content look like fixed chrome when the scroll is a multiple
   * of the period; each extra hypothesis costs one more matching pass.
   */
  tryAlternativeBandHypotheses: boolean;
  /** Skip remaining hypotheses once one reaches the `high` threshold. */
  hypothesisEarlyExit: boolean;

  confidence: {
    weights: {
      similarity: number;
      uniqueness: number;
      agreement: number;
      residualContrast: number;
      seamResidual: number;
    };
    /** Similarity gap (best − second best) that counts as fully unique. */
    uniquenessScale: number;
    /** Full-res ink-mismatch fraction at which the seam score reaches 0. */
    inkMismatchScale: number;
    /** Above this ink-mismatch fraction, confidence is capped at `lowCap`. */
    maxInkMismatch: number;
    /** Below this best-template similarity, confidence is capped at `lowCap`. */
    minSimilarity: number;
    /** Below this residual contrast, confidence is capped at `lowCap`. */
    minResidualContrast: number;
    /** Must stay below `noMatchBelow`: a capped result always becomes "no-match". */
    lowCap: number;
    thresholds: { high: number; medium: number };
    /** Below this, report `no-match` and fall back to end-to-end placement. */
    noMatchBelow: number;
  };
}

export const DEFAULT_STITCH_CONFIG: StitchConfig = {
  proxyMaxWidth: 360,
  maxWidthMismatchRatio: 0.02,
  minContentRowsProxy: 24,

  staticBands: {
    pixelDiffThreshold: 24,
    maxChangedFraction: 0.08,
    maxBandFraction: 0.3,
    gapToleranceRows: 2,
    driftZoneFraction: 0.06,
    driftBlocks: 16,
    maxDriftBlocks: 5,
    identicalFraction: 0.995,
  },

  templates: {
    heightFractions: [0.06, 0.12, 0.24],
    minHeightRows: 10,
    marginFraction: 0.02,
    minStd: 6,
    maxSlideFraction: 0.35,
    suppressRows: 4,
  },

  clusterToleranceRows: 1.5,
  minOverlapRowsProxy: 6,
  residualBaselineStep: 4,
  residualFloor: 2,

  refine: {
    bandRows: 192,
    extraRadius: 2,
    columnStride: 2,
    inkThreshold: 40,
    inkDiffThreshold: 48,
  },

  tryAlternativeBandHypotheses: true,
  hypothesisEarlyExit: true,

  confidence: {
    weights: {
      similarity: 0.2,
      uniqueness: 0.2,
      agreement: 0.2,
      residualContrast: 0.25,
      seamResidual: 0.15,
    },
    uniquenessScale: 0.15,
    inkMismatchScale: 0.2,
    maxInkMismatch: 0.1,
    minSimilarity: 0.6,
    minResidualContrast: 0.35,
    lowCap: 0.25,
    thresholds: { high: 0.8, medium: 0.55 },
    noMatchBelow: 0.3,
  },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export type StitchConfigOverrides = DeepPartial<StitchConfig>;

export function resolveStitchConfig(overrides?: StitchConfigOverrides): StitchConfig {
  return mergeDeep(DEFAULT_STITCH_CONFIG, overrides ?? {}) as StitchConfig;
}

function mergeDeep(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = mergeDeep((base as Record<string, unknown>)[k], v);
  }
  return out;
}
