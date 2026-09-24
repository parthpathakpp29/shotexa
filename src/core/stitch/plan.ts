import type { ImageDims, StaticBands, StitchPlan } from "./types";

/**
 * Build the full-resolution composition plan for B placed at `offsetY` below A.
 *
 * Seam placement: the seam must lie below B's fixed header (A row `offsetY + bands.top`)
 * and above A's fixed footer (A row `a.height - bands.bottom`), so neither repeated
 * chrome appears mid-image. Inside that window the seam goes to the middle, which keeps
 * it away from both edges of the match. Output keeps A's header and B's footer.
 *
 * Pure: depends only on dimensions, so manual adjustments can re-plan instantly.
 */
export function planStitch(a: ImageDims, b: ImageDims, offsetY: number, bands: StaticBands): StitchPlan {
  const dy = Math.round(Math.min(Math.max(offsetY, 1), a.height));
  const lo = dy + bands.top;
  const hi = a.height - bands.bottom;
  let seam = Math.round((lo + hi) / 2);
  seam = Math.min(a.height, Math.max(dy, seam));

  const bStart = seam - dy;
  const bHeight = b.height - bStart;
  return {
    width: Math.max(a.width, b.width),
    height: seam + bHeight,
    offsetY: dy,
    seamY: seam,
    segments: [
      { source: "a", sy: 0, height: seam, dy: 0 },
      { source: "b", sy: bStart, height: bHeight, dy: seam },
    ],
  };
}

/** Allowed manual offset range (B must start inside or directly under A). */
export function offsetRange(a: ImageDims): { min: number; max: number } {
  return { min: 1, max: a.height };
}
