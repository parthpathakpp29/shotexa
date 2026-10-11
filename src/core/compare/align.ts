/**
 * Automatic alignment — deterministic, measured, and never a guess dressed up as a fact.
 *
 * Both screenshots are already fitted into the same comparison cell, so registration is a
 * same-size problem: take a central patch of "after", find where it best matches "before",
 * and report the offset. A uniform scale is found by trying a small set of candidate scales
 * and keeping the one that correlated best. Nothing else is attempted — in particular no
 * perspective warp, because two screenshots do not contain enough evidence for one.
 *
 * Similarity is zero-mean normalised cross-correlation (the same measure Smart Stitch uses),
 * through the shared `TemplateMatcher` contract. The default implementation here is plain
 * TypeScript: alignment runs on a coarse-to-fine pyramid whose search windows are at most a
 * few hundred pixels wide, so a match costs milliseconds and loading the OpenCV runtime
 * (hundreds of MiB) would cost far more than it saves. An OpenCV matcher can still be
 * injected — `createOpenCvMatcher` satisfies the same interface — and when it is, the
 * algorithm and the numbers it produces are unchanged.
 *
 * Results are cached by the caller: nothing here re-runs while a slider moves.
 */
import { cropGray, downscaleGray, stdDev } from "@/core/stitch/gray";
import type { MatchResult, TemplateMatcher } from "@/core/stitch/matcher";
import type { GrayImage } from "@/core/stitch/types";
import { ALIGN_MIN_SCORE, ALIGN_SCALE_RANGE } from "./presets";
import type { CompareAlignEstimate, CompareAlignMode } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Smallest analysis width that can carry a meaningful template. */
const MIN_ANALYSIS_WIDTH = 24;
/** Template size as a fraction of the analysis image. */
const TEMPLATE_FRACTION = 0.55;
/** Largest offset searched at the coarsest level, as a fraction of the image. */
const DEFAULT_MAX_SHIFT = 0.12;
/** Refinement radius (pixels) at each finer pyramid level. */
const REFINE_RADIUS = 3;
/** A template flatter than this carries no alignable structure. */
const MIN_TEMPLATE_STD = 4;

const COARSE_SCALES = [0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06];
const REFINE_STEP = 0.005;

/**
 * Zero-mean normalised cross-correlation of two equally sized patches, -1 to 1.
 * Returns 0 when either patch is flat (no structure to correlate).
 */
export function correlate(a: GrayImage, b: GrayImage): number {
  const n = Math.min(a.data.length, b.data.length);
  if (n === 0 || a.width !== b.width) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a.data[i];
    sb += b.data[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a.data[i] - ma;
    const db = b.data[i] - mb;
    num += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom > 1e-6 ? num / denom : 0;
}

/**
 * Plain-TypeScript template matcher: exhaustive zero-mean NCC over every position the
 * template can take inside `search`. Integral images make the per-position statistics O(1);
 * only the dot product is proportional to the template size.
 */
export function createNccMatcher(): TemplateMatcher {
  return {
    name: "shotexa:ncc",
    match(search: GrayImage, template: GrayImage, suppressRows: number): MatchResult {
      const sw = search.width;
      const sh = search.height;
      const tw = template.width;
      const th = template.height;
      if (tw > sw || th > sh || tw < 1 || th < 1) return { x: 0, y: 0, score: -1, secondScore: -1 };
      const n = tw * th;
      let ts = 0;
      let ts2 = 0;
      for (let i = 0; i < n; i++) {
        const v = template.data[i];
        ts += v;
        ts2 += v * v;
      }
      const tVar = ts2 - (ts * ts) / n;
      if (tVar <= 1e-6) return { x: 0, y: 0, score: -1, secondScore: -1 };
      const tNorm = Math.sqrt(tVar);

      // Integral images of the search window (one extra row/column of zeros).
      const stride = sw + 1;
      const sum = new Float64Array(stride * (sh + 1));
      const sumSq = new Float64Array(stride * (sh + 1));
      for (let y = 0; y < sh; y++) {
        let rowSum = 0;
        let rowSq = 0;
        for (let x = 0; x < sw; x++) {
          const v = search.data[y * sw + x];
          rowSum += v;
          rowSq += v * v;
          sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + rowSum;
          sumSq[(y + 1) * stride + x + 1] = sumSq[y * stride + x + 1] + rowSq;
        }
      }
      const box = (table: Float64Array, x: number, y: number) =>
        table[(y + th) * stride + x + tw] - table[y * stride + x + tw] - table[(y + th) * stride + x] + table[y * stride + x];

      const rows = sh - th + 1;
      const cols = sw - tw + 1;
      const rowMax = new Float64Array(rows).fill(-1);
      let best = -Infinity;
      let bx = 0;
      let by = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const ss = box(sum, x, y);
          const sVar = box(sumSq, x, y) - (ss * ss) / n;
          if (sVar <= 1e-6) continue;
          let dot = 0;
          for (let r = 0; r < th; r++) {
            const sRow = (y + r) * sw + x;
            const tRow = r * tw;
            for (let c = 0; c < tw; c++) dot += search.data[sRow + c] * template.data[tRow + c];
          }
          const score = (dot - (ss * ts) / n) / (Math.sqrt(sVar) * tNorm);
          if (score > rowMax[y]) rowMax[y] = score;
          if (score > best) {
            best = score;
            bx = x;
            by = y;
          }
        }
      }
      let second = -1;
      for (let y = 0; y < rows; y++) if (Math.abs(y - by) > suppressRows && rowMax[y] > second) second = rowMax[y];
      return { x: bx, y: by, score: Number.isFinite(best) ? best : -1, secondScore: second };
    },
  };
}

/**
 * Resample `src` by a uniform scale about its centre, keeping the same dimensions.
 * Bilinear, with edge clamping — the alignment template is central, so the clamped border
 * never contributes to a match.
 */
export function scaleGrayAboutCentre(src: GrayImage, scale: number): GrayImage {
  if (Math.abs(scale - 1) < 1e-6) return src;
  const { width, height } = src;
  const out = new Uint8Array(width * height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    const sy = clamp((y - cy) / scale + cy, 0, height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = clamp((x - cx) / scale + cx, 0, width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = sx - x0;
      const top = src.data[y0 * width + x0] * (1 - fx) + src.data[y0 * width + x1] * fx;
      const bottom = src.data[y1 * width + x0] * (1 - fx) + src.data[y1 * width + x1] * fx;
      out[y * width + x] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return { width, height, data: out };
}

interface Translation {
  dx: number;
  dy: number;
  score: number;
}

/** Central template bounds for one analysis level. */
function templateBox(width: number, height: number) {
  const tw = Math.max(8, Math.round(width * TEMPLATE_FRACTION));
  const th = Math.max(8, Math.round(height * TEMPLATE_FRACTION));
  return { x: Math.floor((width - tw) / 2), y: Math.floor((height - th) / 2), width: Math.min(tw, width), height: Math.min(th, height) };
}

/**
 * One translation estimate at a single level: cut the template out of `moving`, search for it
 * in `fixed` inside a window centred on `(guessDx, guessDy)` with the given radius.
 */
function translateAt(fixed: GrayImage, moving: GrayImage, matcher: TemplateMatcher, radius: number, guessDx: number, guessDy: number): Translation | null {
  const box = templateBox(moving.width, moving.height);
  if (box.width < 8 || box.height < 8) return null;
  const template = cropGray(moving, box.x, box.y, box.width, box.height);
  if (stdDev(template) < MIN_TEMPLATE_STD) return null;
  const wantX = box.x + guessDx;
  const wantY = box.y + guessDy;
  const x0 = Math.max(0, Math.min(fixed.width - box.width, Math.round(wantX - radius)));
  const y0 = Math.max(0, Math.min(fixed.height - box.height, Math.round(wantY - radius)));
  const x1 = Math.max(x0 + box.width, Math.min(fixed.width, Math.round(wantX + radius) + box.width));
  const y1 = Math.max(y0 + box.height, Math.min(fixed.height, Math.round(wantY + radius) + box.height));
  const search = cropGray(fixed, x0, y0, x1 - x0, y1 - y0);
  if (search.width < box.width || search.height < box.height) return null;
  const result = matcher.match(search, template, Math.max(1, Math.round(box.height / 4)));
  if (result.score < -0.999) return null;
  return { dx: x0 + result.x - box.x, dy: y0 + result.y - box.y, score: result.score };
}

/** Pyramid widths from coarse to the analysis width. */
function pyramid(width: number): number[] {
  const levels: number[] = [];
  for (let w = width; w >= Math.max(MIN_ANALYSIS_WIDTH, 48); w = Math.round(w / 2)) levels.unshift(w);
  if (levels.length === 0) levels.push(width);
  return levels;
}

function levelOf(image: GrayImage, width: number): GrayImage {
  if (width >= image.width) return image;
  const height = Math.max(1, Math.round((image.height * width) / image.width));
  return downscaleGray(image, width, height);
}

/** Coarse-to-fine translation search between two same-size analysis images. */
function translation(fixed: GrayImage, moving: GrayImage, matcher: TemplateMatcher, maxShift: number): Translation | null {
  const levels = pyramid(fixed.width);
  let current: Translation | null = null;
  for (let index = 0; index < levels.length; index++) {
    const width = levels[index];
    const f = levelOf(fixed, width);
    const m = levelOf(moving, width);
    if (f.width !== m.width || f.height !== m.height) return null;
    const ratio = width / levels[Math.max(0, index - 1)];
    const radius = index === 0 ? Math.max(2, Math.round(width * maxShift)) : REFINE_RADIUS;
    const guessX = current ? current.dx * ratio : 0;
    const guessY = current ? current.dy * ratio : 0;
    const next = translateAt(f, m, matcher, radius, guessX, guessY);
    if (!next) return current && index > 0 ? { ...current, dx: current.dx * ratio, dy: current.dy * ratio } : null;
    current = next;
  }
  return current;
}

export interface AlignOptions {
  mode: CompareAlignMode;
  /** Cell pixels per analysis pixel, so the estimate comes back in cell pixels. */
  analysisScale?: number;
  matcher?: TemplateMatcher;
  /** Largest offset searched at the coarsest level, as a fraction of the image (0.02-0.4). */
  maxShift?: number;
  signal?: { readonly aborted: boolean };
}

const OFF: CompareAlignEstimate = { status: "off", dx: 0, dy: 0, scale: 1, score: 0, confidence: "high", method: "off", analysisScale: 1 };

const failed = (reason: CompareAlignEstimate["reason"], method: CompareAlignMode, analysisScale: number): CompareAlignEstimate => ({
  status: "failed",
  dx: 0,
  dy: 0,
  scale: 1,
  score: 0,
  confidence: "low",
  method,
  analysisScale,
  reason,
});

const confidenceOf = (score: number) => (score >= 0.9 ? "high" : score >= 0.75 ? "medium" : "low");

/**
 * Measure how to put `b` on top of `a`. Both images must be the same size (both are the
 * comparison cell rasterised at analysis resolution). Failure is reported, never hidden: the
 * caller keeps comparing without alignment.
 */
export function alignGray(a: GrayImage, b: GrayImage, options: AlignOptions): CompareAlignEstimate {
  const analysisScale = options.analysisScale ?? 1;
  if (options.mode === "off") return { ...OFF, analysisScale };
  const matcher = options.matcher ?? createNccMatcher();
  const maxShift = clamp(options.maxShift ?? DEFAULT_MAX_SHIFT, 0.02, 0.4);
  if (a.width !== b.width || a.height !== b.height) return failed("too-small", options.mode, analysisScale);
  if (a.width < MIN_ANALYSIS_WIDTH || a.height < MIN_ANALYSIS_WIDTH) return failed("too-small", options.mode, analysisScale);
  if (stdDev(a) < MIN_TEMPLATE_STD || stdDev(b) < MIN_TEMPLATE_STD) return failed("no-texture", options.mode, analysisScale);
  if (options.signal?.aborted) return failed("cancelled", options.mode, analysisScale);

  const plain = translation(a, b, matcher, maxShift);
  const withScale = options.mode === "translate" ? null : searchScale(a, b, matcher, maxShift, options.signal);
  if (options.signal?.aborted) return failed("cancelled", options.mode, analysisScale);

  // "auto" keeps whichever correlated better; a scale is only worth reporting when it helps.
  let best: { dx: number; dy: number; scale: number; score: number; method: CompareAlignMode } | null = null;
  if (options.mode === "translate") {
    if (plain) best = { ...plain, scale: 1, method: "translate" };
  } else if (options.mode === "translate-scale") {
    if (withScale) best = { ...withScale, method: "translate-scale" };
    else if (plain) best = { ...plain, scale: 1, method: "translate" };
  } else {
    const plainScore = plain?.score ?? -1;
    const scaleScore = withScale?.score ?? -1;
    if (withScale && scaleScore > plainScore + 0.01) best = { ...withScale, method: "translate-scale" };
    else if (plain) best = { ...plain, scale: 1, method: "translate" };
    else if (withScale) best = { ...withScale, method: "translate-scale" };
  }
  if (!best) return failed("no-texture", options.mode, analysisScale);
  if (best.score < ALIGN_MIN_SCORE) return failed("low-score", options.mode, analysisScale);

  const dx = best.dx * analysisScale;
  const dy = best.dy * analysisScale;
  const identity = Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(best.scale - 1) < 0.002;
  return {
    status: identity ? "identity" : "aligned",
    dx: Math.round(dx * 100) / 100,
    dy: Math.round(dy * 100) / 100,
    scale: Math.round(best.scale * 10000) / 10000,
    score: Math.round(best.score * 1000) / 1000,
    confidence: confidenceOf(best.score),
    method: best.method,
    analysisScale,
  };
}

/**
 * Candidate-scale search. The scale itself is chosen at the coarsest level (cheap), then the
 * winning scale is re-measured at full analysis resolution so the offset is accurate.
 */
function searchScale(a: GrayImage, b: GrayImage, matcher: TemplateMatcher, maxShift: number, signal?: { readonly aborted: boolean }): (Translation & { scale: number }) | null {
  const coarseWidth = pyramid(a.width)[0];
  const coarseA = levelOf(a, coarseWidth);
  const coarseB = levelOf(b, coarseWidth);
  const centreX = (coarseWidth - 1) / 2;
  const centreY = (coarseA.height - 1) / 2;

  const measure = (scale: number) => {
    const scaled = scaleGrayAboutCentre(coarseB, scale);
    const found = translateAt(coarseA, scaled, matcher, Math.max(2, Math.round(coarseWidth * maxShift)), 0, 0);
    return found ? { scale, score: found.score, dx: centreX * (1 - scale) + found.dx, dy: centreY * (1 - scale) + found.dy } : null;
  };

  let best: { scale: number; score: number; dx: number; dy: number } | null = null;
  for (const scale of COARSE_SCALES) {
    if (signal?.aborted) return null;
    const found = measure(scale);
    if (found && (!best || found.score > best.score)) best = found;
  }
  if (!best) return null;
  for (let delta = -0.015; delta <= 0.0151; delta += REFINE_STEP) {
    if (signal?.aborted) return null;
    const scale = clamp(Math.round((best.scale + delta) * 1000) / 1000, ALIGN_SCALE_RANGE.min, ALIGN_SCALE_RANGE.max);
    if (Math.abs(scale - best.scale) < 1e-6) continue;
    const found = measure(scale);
    if (found && found.score > best.score) best = found;
  }

  // Re-measure the offset for the winning scale at full analysis resolution.
  const scaled = scaleGrayAboutCentre(b, best.scale);
  const fullCentreX = (a.width - 1) / 2;
  const fullCentreY = (a.height - 1) / 2;
  const refined = translation(a, scaled, matcher, maxShift);
  if (!refined) return { dx: best.dx * (a.width / coarseWidth), dy: best.dy * (a.width / coarseWidth), score: best.score, scale: best.scale };
  return {
    dx: fullCentreX * (1 - best.scale) + refined.dx,
    dy: fullCentreY * (1 - best.scale) + refined.dy,
    score: refined.score,
    scale: best.scale,
  };
}

/** Human-readable, factual alignment line: "X +14 px · Y -6 px · Scale 99.4%". */
export function alignmentSummary(estimate: CompareAlignEstimate): string {
  if (estimate.status === "off") return "Alignment off";
  if (estimate.status === "failed") return "Alignment could not be measured";
  const sign = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(Math.round(v))}`;
  const parts = [`X ${sign(estimate.dx)} px`, `Y ${sign(estimate.dy)} px`];
  if (Math.abs(estimate.scale - 1) >= 0.0005) parts.push(`Scale ${(estimate.scale * 100).toFixed(1)}%`);
  return estimate.status === "identity" ? "Already aligned" : parts.join(" · ");
}
