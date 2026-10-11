/**
 * Changed-region intelligence — evidence only.
 *
 * Grouping gives bounding boxes. This module measures, for each box, how much structure each
 * side actually has (standard deviation and edge density of the composited greyscale) and
 * uses only that to say:
 *
 *   added    one side is effectively blank there and the other has content
 *   removed  the reverse
 *   moved    a removed box and an added box of a similar size correlate above a conservative
 *            threshold at a small offset — so the same thing is very likely in both, moved
 *   text     an OCR text change (when the user asked for one) falls inside the box
 *   visual   anything else. This is the honest default and it is used often on purpose.
 *
 * No semantic guesses: Shotexa never claims a button, a heading or a component changed,
 * because two bitmaps do not prove that.
 */
import type { Rect } from "@/core/image-transform/types";
import type { BBox } from "@/core/ocr/types";
import { correlate } from "./align";
import { changedRegions, compareStats, type ChangedRegion, type CompareBuffersResult, type RegionOptions } from "./difference";
import { MOVEMENT_MIN_SCORE } from "./presets";
import type { CompareMetric, ComparePlacement, CompareRegion, CompareTextDiff, CompareVisualAnalysis } from "./types";

/** Boxes flatter than this (greyscale standard deviation) count as "effectively blank". */
const FLAT_STD = 6;
/** The other side needs at least this much structure before "added"/"removed" is claimed. */
const STRUCTURED_STD = 10;
/** Gradient magnitude counted as an edge when measuring edge density. */
const EDGE_LEVEL = 24;
/** Movement is only looked for within this fraction of the analysis image. */
const MAX_MOVE_FRACTION = 0.35;
/** Sizes must agree within this fraction for two boxes to be a movement candidate. */
const MOVE_SIZE_TOLERANCE = 0.25;
/** Boxes smaller than this are too small to match reliably. */
const MIN_MOVE_AREA = 64;

export interface BoxStats {
  mean: number;
  std: number;
  /** Fraction of pixels on an edge, 0-1. */
  ink: number;
}

/** Mean, standard deviation and edge density of one greyscale box. */
export function boxStats(gray: Uint8Array, width: number, height: number, box: Rect): BoxStats {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.width));
  const y1 = Math.min(height, Math.ceil(box.y + box.height));
  const count = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (count === 0) return { mean: 0, std: 0, ink: 0 };
  let sum = 0;
  let sumSq = 0;
  let edges = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = gray[y * width + x];
      sum += v;
      sumSq += v * v;
      const right = x + 1 < x1 ? gray[y * width + x + 1] : v;
      const down = y + 1 < y1 ? gray[(y + 1) * width + x] : v;
      if (Math.abs(right - v) + Math.abs(down - v) > EDGE_LEVEL) edges++;
    }
  }
  const mean = sum / count;
  return { mean, std: Math.sqrt(Math.max(0, sumSq / count - mean * mean)), ink: edges / count };
}

/** Pull a greyscale patch out of a buffer, or null when it does not fit. */
function patch(gray: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number) {
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) return null;
  const data = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) data.set(gray.subarray((y + r) * width + x, (y + r) * width + x + w), r * w);
  return { width: w, height: h, data };
}

/** Classify one box from the structure each side has there. */
export function classifyBox(a: BoxStats, b: BoxStats): { kind: CompareRegion["kind"]; confidence: CompareRegion["confidence"] } {
  const aBlank = a.std < FLAT_STD && a.ink < 0.02;
  const bBlank = b.std < FLAT_STD && b.ink < 0.02;
  const aStructured = a.std >= STRUCTURED_STD || a.ink > 0.04;
  const bStructured = b.std >= STRUCTURED_STD || b.ink > 0.04;
  if (aBlank && bStructured && !bBlank) return { kind: "added", confidence: a.std < 3 && b.std >= 16 ? "high" : "medium" };
  if (bBlank && aStructured && !aBlank) return { kind: "removed", confidence: b.std < 3 && a.std >= 16 ? "high" : "medium" };
  return { kind: "visual", confidence: "high" };
}

/**
 * Pair "removed" boxes with "added" boxes that correlate strongly at a small offset.
 * Deliberately conservative: when the match is not convincing the two regions are left
 * reported separately, which is the truthful answer.
 */
export function detectMovement(regions: CompareRegion[], grayA: Uint8Array, grayB: Uint8Array, width: number, height: number): void {
  const removed = regions.filter((region) => region.kind === "removed");
  const added = regions.filter((region) => region.kind === "added");
  if (!removed.length || !added.length) return;
  const maxMove = Math.max(8, Math.round(Math.min(width, height) * MAX_MOVE_FRACTION));
  const used = new Set<number>();
  for (const target of added) {
    if (target.width * target.height < MIN_MOVE_AREA) continue;
    let best: { source: CompareRegion; score: number } | null = null;
    for (const source of removed) {
      if (used.has(source.id)) continue;
      if (source.width * source.height < MIN_MOVE_AREA) continue;
      const sizeOk =
        Math.abs(source.width - target.width) <= MOVE_SIZE_TOLERANCE * Math.max(source.width, target.width) &&
        Math.abs(source.height - target.height) <= MOVE_SIZE_TOLERANCE * Math.max(source.height, target.height);
      if (!sizeOk) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      if (Math.abs(dx) > maxMove || Math.abs(dy) > maxMove) continue;
      if (dx === 0 && dy === 0) continue;
      const w = Math.min(source.width, target.width);
      const h = Math.min(source.height, target.height);
      const from = patch(grayA, width, height, source.x, source.y, w, h);
      const to = patch(grayB, width, height, target.x, target.y, w, h);
      if (!from || !to) continue;
      const score = correlate(from, to);
      if (score >= MOVEMENT_MIN_SCORE && (!best || score > best.score)) best = { source, score };
    }
    if (!best) continue;
    used.add(best.source.id);
    const dx = target.x - best.source.x;
    const dy = target.y - best.source.y;
    target.kind = "moved";
    target.confidence = best.score >= 0.97 ? "high" : "medium";
    target.movedBy = { dx, dy, score: Math.round(best.score * 1000) / 1000 };
    target.pairedWith = best.source.id;
    best.source.kind = "moved";
    best.source.confidence = target.confidence;
    best.source.movedBy = { dx: -dx, dy: -dy, score: target.movedBy.score };
    best.source.pairedWith = target.id;
  }
}

/** Analysis-space box to one screenshot's own pixels, through that side's placement. */
export function analysisBoxToSource(box: Rect, placement: ComparePlacement, analysisScale: number): BBox | null {
  const canvas = {
    x: box.x * analysisScale,
    y: box.y * analysisScale,
    width: box.width * analysisScale,
    height: box.height * analysisScale,
  };
  const dest = placement.dest;
  const x0 = Math.max(canvas.x, dest.x);
  const y0 = Math.max(canvas.y, dest.y);
  const x1 = Math.min(canvas.x + canvas.width, dest.x + dest.width);
  const y1 = Math.min(canvas.y + canvas.height, dest.y + dest.height);
  if (x1 <= x0 || y1 <= y0 || dest.width <= 0 || dest.height <= 0) return null;
  const zx = placement.source.width / dest.width;
  const zy = placement.source.height / dest.height;
  return {
    x: Math.round(placement.source.x + (x0 - dest.x) * zx),
    y: Math.round(placement.source.y + (y0 - dest.y) * zy),
    w: Math.max(1, Math.round((x1 - x0) * zx)),
    h: Math.max(1, Math.round((y1 - y0) * zy)),
  };
}

/** One screenshot's own pixels back to analysis space (used to place OCR text boxes). */
export function sourceBoxToAnalysis(box: BBox, placement: ComparePlacement, analysisScale: number): Rect | null {
  const dest = placement.dest;
  if (placement.source.width <= 0 || placement.source.height <= 0) return null;
  const zx = dest.width / placement.source.width;
  const zy = dest.height / placement.source.height;
  const x = (dest.x + (box.x - placement.source.x) * zx) / analysisScale;
  const y = (dest.y + (box.y - placement.source.y) * zy) / analysisScale;
  const width = (box.w * zx) / analysisScale;
  const height = (box.h * zy) / analysisScale;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export interface AnalyseOptions extends RegionOptions {
  width: number;
  height: number;
  /** Cell pixels per analysis pixel. */
  analysisScale: number;
  metric: CompareMetric;
  detectMovement: boolean;
  /** Placements, so each region can report where it falls in each screenshot. */
  placements?: { a: ComparePlacement; b: ComparePlacement };
}

/**
 * Turn a measured comparison into the region list the UI, the summary and the report share.
 * `result.mask` is consumed (grouping walks it), so pass a copy if you still need it.
 */
export function analyseComparison(result: CompareBuffersResult, options: AnalyseOptions): CompareVisualAnalysis {
  const { width, height } = options;
  const grouped = changedRegions(result.mask, width, height, {
    minRegionSize: options.minRegionSize,
    mergeDistance: options.mergeDistance,
    ignoreTiny: options.ignoreTiny,
  });
  const stats = compareStats(result.changed, result.compared, width * height, result.ignored);
  const divisor = Math.max(1, stats.comparedPixels);
  const regions: CompareRegion[] = grouped.regions.map((raw: ChangedRegion) => {
    const box = { x: raw.x, y: raw.y, width: raw.width, height: raw.height };
    const a = boxStats(result.grayA, width, height, box);
    const b = boxStats(result.grayB, width, height, box);
    const { kind, confidence } = classifyBox(a, b);
    return {
      id: raw.id,
      x: raw.x,
      y: raw.y,
      width: raw.width,
      height: raw.height,
      pixels: raw.pixels,
      percent: (raw.pixels / divisor) * 100,
      kind,
      confidence,
      sourceA: options.placements ? analysisBoxToSource(box, options.placements.a, options.analysisScale) : null,
      sourceB: options.placements ? analysisBoxToSource(box, options.placements.b, options.analysisScale) : null,
    };
  });
  if (options.detectMovement) detectMovement(regions, result.grayA, result.grayB, width, height);
  return {
    ...stats,
    width,
    height,
    regions,
    regionsTruncated: grouped.truncated,
    metric: options.metric,
    analysisScale: options.analysisScale,
  };
}

/**
 * Fold an OCR text diff into an existing region list: a region that contains a text change
 * becomes "Text changed" unless stronger structural evidence already named it.
 */
export function applyTextChanges(
  analysis: CompareVisualAnalysis,
  textDiff: CompareTextDiff,
  placements: { a: ComparePlacement; b: ComparePlacement },
): CompareVisualAnalysis {
  const boxes = textDiff.changes.flatMap((change) => [
    ...change.regionsA.map((box) => ({ id: change.id, rect: sourceBoxToAnalysis(box, placements.a, analysis.analysisScale) })),
    ...change.regionsB.map((box) => ({ id: change.id, rect: sourceBoxToAnalysis(box, placements.b, analysis.analysisScale) })),
  ]);
  const regions = analysis.regions.map((region) => {
    const rect = { x: region.x, y: region.y, width: region.width, height: region.height };
    const ids = [...new Set(boxes.filter((entry) => entry.rect && overlaps(rect, entry.rect)).map((entry) => entry.id))];
    if (!ids.length) return region;
    return {
      ...region,
      kind: region.kind === "visual" ? ("text" as const) : region.kind,
      textChangeIds: ids,
    };
  });
  return { ...analysis, regions };
}

/**
 * Short factual label for a region, safe to show anywhere. `analysisScale` converts a
 * measured movement back into comparison pixels so the number means something to the reader.
 */
export function regionLabel(region: CompareRegion, analysisScale = 1): string {
  if (region.kind === "text") return "Text changed";
  if (region.kind === "added") return "Added region";
  if (region.kind === "removed") return "Removed region";
  if (region.kind === "moved") {
    const dx = (region.movedBy?.dx ?? 0) * analysisScale;
    const dy = (region.movedBy?.dy ?? 0) * analysisScale;
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const amount = Math.max(1, Math.round(Math.abs(vertical ? dy : dx)));
    const direction = vertical ? (dy > 0 ? "down" : "up") : dx > 0 ? "right" : "left";
    return `Moved about ${amount} px ${direction}`;
  }
  return "Visual change";
}
