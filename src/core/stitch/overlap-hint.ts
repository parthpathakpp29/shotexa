/**
 * Lightweight "do these screenshots overlap?" check for the homepage suggestion
 * (architecture §14/§39). Pure TS on tiny greyscale proxies (128 px wide); no OpenCV,
 * no full-resolution decode. It only decides whether to SUGGEST Smart Stitch — the real
 * alignment always comes from the validated engine (`analyseStitch`).
 *
 * Method (a reduced form of Spike A's pipeline):
 *  1. widths must match within 2% (same rule as the engine);
 *  2. find rows that stay put in both images (status bar, sticky header, input bar,
 *     cookie bar) — drift-tolerant at the edges — so fixed chrome can't fake an overlap;
 *  3. cut the lowest textured band of A's content and slide it over B's
 *     content, vertically only (scrolling screenshots don't drift sideways);
 *  4. score each position with zero-mean normalised cross-correlation (NCC, as Spike A's
 *     engine does). NCC tolerates the half-row phase blur that a non-integer proxy scale
 *     introduces; absolute differences do not;
 *  5. "likely" = a strong peak that clearly beats every position away from it.
 * If the images are near-identical at the SAME positions (duplicates, or periodic content
 * scrolled by exactly its period), the identity position is excluded and the search runs
 * without chrome bands.
 * Validated against the Spike A fixture pairs (src/tests/unit/workspace/overlap-hint.test.ts).
 */
import type { GrayImage } from "./types";

export interface OverlapHintResult {
  likely: boolean;
  /** Best NCC score (−1…1). */
  score: number;
  /** Best score minus the best score ≥ `peakWindow` rows away (ambiguity gap). */
  gap: number;
  reason: "match" | "width-mismatch" | "no-texture" | "no-match" | "too-small";
}

export const HINT = {
  width: 128,
  /** A row is "static" when at most this fraction of its pixels differ by > diffLevel… */
  bandFrac: 0.12,
  /** …or this fraction inside the top/bottom edge zone (clock/battery drift, Spike A). */
  edgeBandFrac: 0.4,
  edgeZone: 0.06,
  diffLevel: 12,
  templateFracs: [0.16, 0.08, 0.04],
  minTemplateRows: 5,
  minStd: 6,
  /** Peak must reach this NCC… */
  minScore: 0.9,
  /** …and beat everything outside ±peakWindow rows by this much (or be near-perfect). */
  minGap: 0.08,
  strongScore: 0.975,
  /** Even a near-perfect peak must not be tied with another position (repetitive content). */
  minStrongGap: 0.015,
  peakWindowFrac: 0.5,
};

const rowDiffFrac = (a: GrayImage, ya: number, b: GrayImage, yb: number) => {
  let n = 0;
  const w = Math.min(a.width, b.width);
  for (let x = 0; x < w; x++) if (Math.abs(a.data[ya * a.width + x] - b.data[yb * b.width + x]) > HINT.diffLevel) n++;
  return n / w;
};

/** Rows that stay put in both screenshots, from the top and from the bottom. */
export function staticBandsProxy(a: GrayImage, b: GrayImage): { top: number; bottom: number } {
  const h = Math.min(a.height, b.height);
  const edge = Math.ceil(h * HINT.edgeZone);
  const isStatic = (f: number, i: number) => f <= HINT.bandFrac || (i < edge && f <= HINT.edgeBandFrac);
  let top = 0;
  while (top < h && isStatic(rowDiffFrac(a, top, b, top), top)) top++;
  let bottom = 0;
  while (bottom < h - top && isStatic(rowDiffFrac(a, a.height - 1 - bottom, b, b.height - 1 - bottom), bottom)) bottom++;
  return { top, bottom };
}

/** 3-row vertical box blur: makes NCC robust to sub-row misalignment. */
function blurRows(g: GrayImage): Float32Array {
  const { width: w, height: h, data } = g;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) out[y * w + x] = (data[y0 * w + x] + data[y * w + x] + data[y1 * w + x]) / 3;
  }
  return out;
}

function ncc(a: Float32Array, aw: number, ay: number, b: Float32Array, bw: number, by: number, rows: number, w: number): number {
  let sa = 0;
  let sb = 0;
  const n = rows * w;
  for (let r = 0; r < rows; r++)
    for (let x = 0; x < w; x++) {
      sa += a[(ay + r) * aw + x];
      sb += b[(by + r) * bw + x];
    }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let r = 0; r < rows; r++)
    for (let x = 0; x < w; x++) {
      const va = a[(ay + r) * aw + x] - ma;
      const vb = b[(by + r) * bw + x] - mb;
      num += va * vb;
      da += va * va;
      db += vb * vb;
    }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

export function likelyOverlap(a: GrayImage, b: GrayImage): OverlapHintResult {
  const none = (reason: OverlapHintResult["reason"], score = 0, gap = 0): OverlapHintResult => ({ likely: false, score, gap, reason });
  if (Math.abs(a.width - b.width) > 0.02 * Math.max(a.width, b.width)) return none("width-mismatch");
  let bands = staticBandsProxy(a, b);
  // Near-identical at the same positions: duplicates or periodic content scrolled by its
  // period. Search without bands and never accept the identity position.
  const sameAsIdentity = bands.top + bands.bottom >= Math.min(a.height, b.height) * 0.9;
  if (sameAsIdentity) bands = { top: 0, bottom: 0 };
  const A = blurRows(a);
  const B = blurRows(b);
  // Several template sizes, like Spike A (small overlaps only fit small templates).
  let best: OverlapHintResult = none("too-small");
  for (const frac of HINT.templateFracs) {
    const r = matchTemplate(A, a, B, b, bands, frac, sameAsIdentity);
    if (r.likely) return r;
    if (r.score > best.score || best.reason === "too-small") best = r;
  }
  return best;
}

function matchTemplate(A: Float32Array, a: GrayImage, B: Float32Array, b: GrayImage, bands: { top: number; bottom: number }, frac: number, sameAsIdentity: boolean): OverlapHintResult {
  const none = (reason: OverlapHintResult["reason"], score = 0, gap = 0): OverlapHintResult => ({ likely: false, score, gap, reason });
  const w = Math.min(a.width, b.width);
  const aTop = bands.top;
  const aBottom = a.height - bands.bottom;
  const bTop = bands.top;
  const bBottom = b.height - bands.bottom;
  const contentA = aBottom - aTop;
  const th = Math.max(HINT.minTemplateRows, Math.round(contentA * frac));
  if (contentA < th * 2 || bBottom - bTop < th + 2) return none("too-small");

  // Lowest sufficiently textured band of A's content: the bottom of A is what B most likely
  // shows again (Spike A cuts templates from A's bottom too). Flat bands correlate with anything.
  let tY = -1;
  let bestStd = 0;
  for (let y = aBottom - th; y >= aTop + Math.floor(contentA / 2) - th; y -= Math.max(1, Math.floor(th / 3))) {
    let s = 0;
    let q = 0;
    for (let r = 0; r < th; r++)
      for (let x = 0; x < w; x++) {
        const v = A[(y + r) * a.width + x];
        s += v;
        q += v * v;
      }
    const n = th * w;
    const std = Math.sqrt(Math.max(0, q / n - (s / n) ** 2));
    if (std > bestStd) {
      bestStd = std;
      tY = y;
    }
    if (std >= HINT.minStd * 2) break;
  }
  if (tY < 0 || bestStd < HINT.minStd) return none("no-texture");

  const scores: { y: number; s: number }[] = [];
  for (let y = bTop; y + th <= bBottom; y++) {
    if (sameAsIdentity && Math.abs(y - tY) <= 1) continue; // the trivial "same place" match
    scores.push({ y, s: ncc(A, a.width, tY, B, b.width, y, th, w) });
  }
  if (!scores.length) return none("too-small");
  const best = scores.reduce((m, x) => (x.s > m.s ? x : m));
  const window = Math.max(2, Math.round(th * HINT.peakWindowFrac));
  const second = scores.reduce((m, x) => (Math.abs(x.y - best.y) > window && x.s > m ? x.s : m), -1);
  const gap = best.s - second;
  const likely = (best.s >= HINT.strongScore && gap >= HINT.minStrongGap) || (best.s >= HINT.minScore && gap >= HINT.minGap);
  return { likely, score: best.s, gap, reason: likely ? "match" : "no-match" };
}
