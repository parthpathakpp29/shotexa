import { resolveStitchConfig, type StitchConfig, type StitchConfigOverrides } from "./config";
import { classifyConfidence, scoreConfidence } from "./confidence";
import { cropGray, proxySize, stdDev } from "./gray";
import type { TemplateMatcher } from "./matcher";
import { contentResidual, inkMismatch, median, overlapResidual } from "./residual";
import { detectStaticBands } from "./static-bands";
import {
  StitchError,
  type GrayImage,
  type StaticBands,
  type StitchAnalysis,
  type StitchImageSource,
  type TemplateCandidate,
} from "./types";

export interface AnalyseOptions {
  config?: StitchConfigOverrides;
  /** Cooperative cancellation, checked between stages. */
  signal?: { readonly aborted: boolean };
  onProgress?: (fraction: number, stage: string) => void;
}

/**
 * Smart Stitch analysis for exactly two vertically-scrolling screenshots (A above B).
 *
 * Pipeline (architecture §28):
 *   validate widths → greyscale proxies → static header/footer bands →
 *   for each band hypothesis:
 *     template matching (A bottom ↔ B top, several template heights, both directions) →
 *     vote/cluster candidate offsets → validate with overlap residual →
 *     map to full resolution + pixel-exact refinement + ink-mismatch seam check →
 *     confidence
 *   → keep the most confident hypothesis.
 */
export async function analyseStitch(
  a: StitchImageSource,
  b: StitchImageSource,
  matcher: TemplateMatcher,
  opts: AnalyseOptions = {},
): Promise<StitchAnalysis> {
  const cfg = resolveStitchConfig(opts.config);
  const timings: Record<string, number> = {};
  const t0 = performance.now();
  let tStage = t0;
  const mark = (name: string, progress: number) => {
    const now = performance.now();
    timings[name] = +(now - tStage).toFixed(1);
    tStage = now;
    if (opts.signal?.aborted) throw new StitchError("CANCELLED");
    opts.onProgress?.(progress, name);
  };

  // 1. Validate geometry.
  const minW = Math.min(a.width, b.width);
  if (Math.abs(a.width - b.width) / Math.max(a.width, b.width) > cfg.maxWidthMismatchRatio) {
    throw new StitchError("STITCH_WIDTH_MISMATCH");
  }

  // 2. Proxies (same scale for both, cropped to a common width).
  const scale = proxySize(minW, a.height, cfg.proxyMaxWidth).scale;
  const pwA = Math.round(a.width * scale);
  const pwB = Math.round(b.width * scale);
  const [fullProxyA, fullProxyB] = await Promise.all([
    a.getProxy(pwA, Math.round(a.height * scale)),
    b.getProxy(pwB, Math.round(b.height * scale)),
  ]);
  const pw = Math.min(pwA, pwB);
  const A = pwA === pw ? fullProxyA : cropGray(fullProxyA, 0, 0, pw, fullProxyA.height);
  const B = pwB === pw ? fullProxyB : cropGray(fullProxyB, 0, 0, pw, fullProxyB.height);
  mark("proxy", 0.2);

  // 3. Static bands (repeated chrome).
  if (Math.min(A.height, B.height) < cfg.minContentRowsProxy) throw new StitchError("STITCH_TOO_SMALL");
  const detected = detectStaticBands(A, B, cfg.staticBands);
  const toFull = (bands: StaticBands): StaticBands => ({
    top: Math.min(a.height, Math.ceil(bands.top / scale)),
    bottom: Math.min(a.height, Math.ceil(bands.bottom / scale)),
  });
  const proxyInfo = (bands: StaticBands, offsetY: number) => ({ scale, width: pw, heightA: A.height, heightB: B.height, offsetY, bands });
  mark("bands", 0.3);

  if (detected.identical) {
    timings.total = +(performance.now() - t0).toFixed(1);
    return noMatch(a.height, "STITCH_IDENTICAL_IMAGES", { bands: toFull(detected.tolerant), proxy: proxyInfo(detected.tolerant, 0), timings }, [], null);
  }

  // 4–8. Evaluate each static-band hypothesis; keep the most confident.
  const minH = Math.min(A.height, B.height);
  const hypotheses: { name: StitchAnalysis["bandHypothesis"]; bands: StaticBands }[] = [];
  const addHypothesis = (name: StitchAnalysis["bandHypothesis"], bands: StaticBands) => {
    if (minH - bands.top - bands.bottom < cfg.minContentRowsProxy) return;
    if (hypotheses.some((h) => h.bands.top === bands.top && h.bands.bottom === bands.bottom)) return;
    hypotheses.push({ name, bands });
  };
  addHypothesis("tolerant", detected.tolerant);
  if (cfg.tryAlternativeBandHypotheses || hypotheses.length === 0) {
    addHypothesis("strict", detected.strict);
    addHypothesis("none", { top: 0, bottom: 0 });
  }

  let best: StitchAnalysis | null = null;
  for (const [i, h] of hypotheses.entries()) {
    const r = await evaluateHypothesis(a, b, A, B, h.bands, toFull(h.bands), scale, minW, matcher, cfg);
    const result: StitchAnalysis = { ...r, bandHypothesis: h.name, proxy: proxyInfo(h.bands, r.proxyOffsetY), timings };
    if (!best || result.confidence > best.confidence) best = result;
    mark(`hypothesis:${h.name}`, 0.3 + (0.65 * (i + 1)) / hypotheses.length);
    if (cfg.hypothesisEarlyExit && best.confidence >= cfg.confidence.thresholds.high) break;
  }
  timings.total = +(performance.now() - t0).toFixed(1);
  return best!;
}

type HypothesisResult = Omit<StitchAnalysis, "bandHypothesis" | "timings" | "proxy"> & { proxyOffsetY: number };

const EMPTY_BREAKDOWN = { similarity: 0, uniqueness: 0, agreement: 0, residualContrast: 0, seamResidual: 0, caps: [] as string[] };

function noMatch(
  heightA: number,
  reason: StitchAnalysis["reason"],
  base: Pick<StitchAnalysis, "bands" | "proxy" | "timings">,
  candidates: TemplateCandidate[],
  detectedOffsetY: number | null,
): StitchAnalysis {
  return {
    ...base,
    // End-to-end fallback: nothing is lost, the user adjusts manually.
    offsetY: heightA,
    detectedOffsetY,
    overlap: 0,
    confidence: 0,
    confidenceClass: "low",
    status: "no-match",
    reason,
    breakdown: { ...EMPTY_BREAKDOWN, caps: [] },
    candidates,
    seamResidual: NaN,
    inkMismatch: NaN,
    bandHypothesis: "tolerant",
  };
}

async function evaluateHypothesis(
  a: StitchImageSource,
  b: StitchImageSource,
  A: GrayImage,
  B: GrayImage,
  bands: StaticBands,
  fullBands: StaticBands,
  scale: number,
  width: number,
  matcher: TemplateMatcher,
  cfg: StitchConfig,
): Promise<HypothesisResult> {
  const fallback = (candidates: TemplateCandidate[], proxyOffsetY: number, detectedOffsetY: number | null): HypothesisResult => ({
    offsetY: a.height,
    detectedOffsetY,
    overlap: 0,
    confidence: 0,
    confidenceClass: "low",
    status: "no-match",
    reason: "STITCH_NO_MATCH",
    breakdown: { ...EMPTY_BREAKDOWN, caps: [] },
    bands: fullBands,
    candidates,
    seamResidual: NaN,
    inkMismatch: NaN,
    proxyOffsetY,
  });

  // 4. Template matching.
  const candidates = matchTemplates(A, B, bands, matcher, cfg);

  // 5. Vote.
  const vote = voteOffsets(candidates, A.height, cfg.clusterToleranceRows);
  if (!vote) return fallback(candidates, 0, null);

  // 6. Proxy-level residual validation.
  let bestDy = vote.offset;
  let bestRes = Infinity;
  for (let d = vote.offset - 2; d <= vote.offset + 2; d++) {
    if (d < 1 || d > A.height) continue;
    const r = contentResidual(A, B, d, bands.top, bands.bottom);
    if (r.rows >= cfg.minOverlapRowsProxy && r.mad < bestRes) {
      bestRes = r.mad;
      bestDy = d;
    }
  }
  const baselineSamples: number[] = [];
  for (let d = 1; d <= A.height; d += cfg.residualBaselineStep) {
    if (Math.abs(d - bestDy) <= 3) continue;
    const r = contentResidual(A, B, d, bands.top, bands.bottom, 2);
    if (r.rows >= cfg.minOverlapRowsProxy) baselineSamples.push(r.mad);
  }
  const baseline = median(baselineSamples);

  // 7. Full-resolution mapping + refinement.
  const refined = await refineFullRes(a, b, A, bestDy, scale, bands, fullBands, width, cfg);

  // 8. Confidence.
  const { confidence, breakdown } = scoreConfidence(
    {
      similarity: vote.similarity,
      uniquenessGap: vote.uniquenessGap,
      agreement: vote.agreement,
      residual: Number.isFinite(bestRes) ? bestRes : Infinity,
      baselineResidual: Number.isFinite(baseline) ? baseline : 0,
      inkMismatch: refined.inkMismatch,
    },
    cfg.confidence,
    cfg.residualFloor,
  );
  const shared = { breakdown, confidence, seamResidual: refined.mad, inkMismatch: refined.inkMismatch };
  if (confidence < cfg.confidence.noMatchBelow || refined.offsetY >= a.height) {
    return { ...fallback(candidates, bestDy, refined.offsetY), ...shared };
  }
  return {
    ...shared,
    offsetY: refined.offsetY,
    detectedOffsetY: refined.offsetY,
    overlap: a.height - refined.offsetY,
    confidenceClass: classifyConfidence(confidence, cfg.confidence),
    status: "matched",
    bands: fullBands,
    candidates,
    proxyOffsetY: bestDy,
  };
}

function matchTemplates(
  A: GrayImage,
  B: GrayImage,
  bands: StaticBands,
  matcher: TemplateMatcher,
  cfg: StitchConfig,
): TemplateCandidate[] {
  const tc = cfg.templates;
  const pw = A.width;
  const mx = Math.max(1, Math.round(tc.marginFraction * pw));
  const aTop = bands.top;
  const aEnd = A.height - bands.bottom;
  const bTop = bands.top;
  const bEnd = B.height - bands.bottom;
  const cA = aEnd - aTop;
  const cB = bEnd - bTop;
  const minC = Math.min(cA, cB);
  const searchB = cropGray(B, 0, bTop, pw, cB);
  const searchA = cropGray(A, 0, aTop, pw, cA);
  const out: TemplateCandidate[] = [];

  for (const frac of tc.heightFractions) {
    const T = Math.min(minC - 1, Math.max(tc.minHeightRows, Math.round(frac * minC)));
    if (T < tc.minHeightRows) continue;
    const step = Math.max(1, Math.floor(T / 2));
    const maxSlide = tc.maxSlideFraction * minC;

    // A bottom → search in B (primary direction). Flat templates slide up to find texture.
    for (let y = aEnd - T, slid = 0; y >= aTop && slid <= maxSlide; y -= step, slid += step) {
      const tpl = cropGray(A, mx, y, pw - 2 * mx, T);
      const std = stdDev(tpl);
      if (std < tc.minStd) continue;
      const m = matcher.match(searchB, tpl, tc.suppressRows);
      out.push({
        direction: "a-bottom-in-b",
        templateHeight: T,
        templateY: y,
        offsetYProxy: y - (bTop + m.y),
        shiftX: m.x - mx,
        score: m.score,
        secondScore: m.secondScore,
        std,
      });
      break;
    }

    // B top → search in A (cross-check direction). Flat templates slide down.
    for (let y = bTop, slid = 0; y + T <= bEnd && slid <= maxSlide; y += step, slid += step) {
      const tpl = cropGray(B, mx, y, pw - 2 * mx, T);
      const std = stdDev(tpl);
      if (std < tc.minStd) continue;
      const m = matcher.match(searchA, tpl, tc.suppressRows);
      out.push({
        direction: "b-top-in-a",
        templateHeight: T,
        templateY: y,
        offsetYProxy: aTop + m.y - y,
        shiftX: m.x - mx,
        score: m.score,
        secondScore: m.secondScore,
        std,
      });
      break;
    }
  }
  return out;
}

function voteOffsets(candidates: TemplateCandidate[], heightA: number, tol: number) {
  const usable = candidates.filter((c) => c.score > 0 && c.offsetYProxy >= 1 && c.offsetYProxy <= heightA);
  if (usable.length === 0) return null;
  const total = candidates.filter((c) => c.score > 0).reduce((s, c) => s + c.score, 0);
  let best: { center: TemplateCandidate; weight: number; members: TemplateCandidate[] } | null = null;
  for (const c of usable) {
    const members = usable.filter((o) => Math.abs(o.offsetYProxy - c.offsetYProxy) <= tol);
    const weight = members.reduce((s, m) => s + m.score, 0);
    if (!best || weight > best.weight + 1e-9 || (Math.abs(weight - best.weight) < 1e-9 && c.score > best.center.score)) {
      best = { center: c, weight, members };
    }
  }
  if (!best) return null;
  const top = best.members.reduce((p, q) => (q.score > p.score ? q : p));
  // Penalise horizontal drift: scrolling screenshots should not move sideways.
  const drift = best.members.some((m) => Math.abs(m.shiftX) > 1);
  return {
    offset: top.offsetYProxy,
    similarity: top.score,
    uniquenessGap: Math.max(...best.members.map((m) => m.score - Math.max(0, m.secondScore))),
    agreement: (best.weight / total) * (drift ? 0.5 : 1),
  };
}

async function refineFullRes(
  a: StitchImageSource,
  b: StitchImageSource,
  A: GrayImage,
  dyProxy: number,
  scale: number,
  bands: StaticBands,
  fullBands: StaticBands,
  width: number,
  cfg: StitchConfig,
): Promise<{ offsetY: number; mad: number; inkMismatch: number }> {
  const dF = Math.round(dyProxy / scale);
  const radius = scale >= 1 ? 0 : Math.ceil(1 / scale) + cfg.refine.extraRadius;
  const preferred = scale >= 1 ? undefined : pickTexturedRow(A, dyProxy, bands, scale, cfg);
  const band = await measureBand(a, b, dF, radius, fullBands, width, cfg, preferred);
  if (!band) return { offsetY: dF, mad: NaN, inkMismatch: NaN };
  let best = dF;
  let bestMad = Infinity;
  for (const [d, mad] of band.mads) {
    if (mad < bestMad - 1e-9 || (Math.abs(mad - bestMad) < 1e-9 && Math.abs(d - dF) < Math.abs(best - dF))) {
      bestMad = mad;
      best = d;
    }
  }
  return { offsetY: best, mad: Number.isFinite(bestMad) ? bestMad : NaN, inkMismatch: band.inkAt(best) };
}

/** Choose the most textured proxy window inside the content overlap (full-res row returned). */
function pickTexturedRow(A: GrayImage, dy: number, bands: StaticBands, scale: number, cfg: StitchConfig): number | undefined {
  const y0 = Math.max(bands.top, dy + bands.top);
  const y1 = A.height - bands.bottom;
  const win = Math.max(2, Math.round(cfg.refine.bandRows * scale));
  if (y1 - y0 <= win) return undefined;
  const energy = new Float64Array(A.height);
  for (let y = y0 + 1; y < y1; y++) {
    let e = 0;
    for (let x = 0; x < A.width; x++) e += Math.abs(A.data[y * A.width + x] - A.data[(y - 1) * A.width + x]);
    energy[y] = e;
  }
  let sum = 0;
  for (let y = y0; y < y0 + win; y++) sum += energy[y];
  let best = sum;
  let bestY = y0;
  for (let y = y0 + 1; y + win <= y1; y++) {
    sum += energy[y + win - 1] - energy[y - 1];
    if (sum > best) {
      best = sum;
      bestY = y;
    }
  }
  return Math.round(bestY / scale);
}

/**
 * Fetch one full-res band of A and the matching (radius-padded) band of B, then measure
 * MAD for every candidate offset in [dF − radius, dF + radius]. Only these two strips are
 * ever decoded at full resolution.
 */
async function measureBand(
  a: StitchImageSource,
  b: StitchImageSource,
  dF: number,
  radius: number,
  fullBands: StaticBands,
  width: number,
  cfg: StitchConfig,
  preferredY?: number,
): Promise<{ mads: Map<number, number>; inkAt: (d: number) => number } | null> {
  // Content overlap in A coordinates, shrunk so every candidate offset stays in range.
  const lo = Math.max(fullBands.top, dF + radius + fullBands.top);
  const hi = Math.min(a.height - fullBands.bottom, dF - radius + b.height - fullBands.bottom);
  if (hi - lo < 4) return null;
  const bandH = Math.min(cfg.refine.bandRows, hi - lo);
  const bandY = Math.min(hi - bandH, Math.max(lo, preferredY ?? Math.round((lo + hi - bandH) / 2)));

  const bOrigin = bandY - dF - radius;
  const bH = bandH + 2 * radius;
  const [stripA, stripB] = await Promise.all([a.getRows(bandY, bandH, width), b.getRows(bOrigin, bH, width)]);
  // Strip-A row i ↔ strip-B row i − local, where local = d + bOrigin − bandY (≤ 0).
  const local = (d: number) => d + bOrigin - bandY;
  const mads = new Map<number, number>();
  for (let d = dF - radius; d <= dF + radius; d++) {
    mads.set(d, overlapResidual(stripA, stripB, local(d), 0, bandH, cfg.refine.columnStride));
  }
  return {
    mads,
    inkAt: (d) => inkMismatch(stripA, stripB, local(d), 0, bandH, cfg.refine.inkThreshold, cfg.refine.inkDiffThreshold),
  };
}
