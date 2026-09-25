/**
 * Multi-screenshot stitch plan (Phase 1 production integration).
 *
 * The validated engine analyses and plans ONE pair (A above B). A chain of N screenshots is
 * planned by applying the unchanged pair planner (`planStitch`) to each adjacent pair and
 * placing image i+1 at `top(i) + offset(i)`. Each pair's seam is kept exactly as the pair
 * planner chose it; segments are then clipped so every output row comes from exactly one
 * source. For N = 2 the result is identical to `planStitch` (unit-tested).
 *
 * Output uses the tiled-compose plan shape (numeric sources) so export can pick the
 * single-canvas or tiled/streamed strategy from Spike B.
 */
import type { ComposePlan } from "@/core/image/tiled-compose";
import { planStitch } from "./plan";
import type { ImageDims, StaticBands } from "./types";

export interface ChainJoin {
  offsetY: number;
  bands: StaticBands;
}

export interface ChainPlan extends ComposePlan {
  /** Global y of each screenshot's row 0. */
  tops: number[];
  /** Global y of each join's seam (length N−1). */
  seams: number[];
}

export function planStitchChain(dims: ImageDims[], joins: ChainJoin[]): ChainPlan {
  if (dims.length === 0) return { width: 0, height: 0, segments: [], tops: [], seams: [] };
  if (joins.length !== dims.length - 1) throw new RangeError("joins must be N-1");
  const tops = [0];
  const seams: number[] = [];
  for (let i = 0; i < joins.length; i++) {
    const p = planStitch(dims[i], dims[i + 1], joins[i].offsetY, joins[i].bands);
    tops.push(tops[i] + p.offsetY);
    seams.push(tops[i] + p.seamY);
  }
  const segments: ComposePlan["segments"] = [];
  let start = 0;
  for (let i = 0; i < dims.length; i++) {
    const bottom = tops[i] + dims[i].height;
    // A later seam can't precede an earlier one (tiny screenshots / extreme manual offsets):
    // clamp into [start, bottom] so rows stay contiguous and each comes from one source.
    const end = i < seams.length ? Math.min(bottom, Math.max(start, seams[i])) : bottom;
    if (i < seams.length) seams[i] = end;
    if (end > start) segments.push({ source: i, sy: start - tops[i], height: end - start, dy: start });
    start = Math.max(start, end);
    if (i + 1 < dims.length && start < tops[i + 1]) start = tops[i + 1]; // never read above a screenshot's row 0
  }
  const height = segments.length ? Math.max(...segments.map((s) => s.dy + s.height)) : 0;
  return { width: Math.max(...dims.map((d) => d.width)), height, segments, tops, seams };
}
