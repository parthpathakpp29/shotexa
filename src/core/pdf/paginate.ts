/**
 * Page-break planning: fixed cuts, visual Smart Pagination, and OCR-assisted Smart
 * Pagination. Manual breaks are anchors: automatic breaks are re-planned around them.
 */
import type { PaginationConfig } from "./config";
import type { RowSignals } from "./signals";
import type { BreakCandidate, BreakConfidence, OcrLineBox, PageBreak, PageSlice, PaginationMode } from "./types";

let seq = 0;
export const newBreakId = () => `b${++seq}`;

export interface ImagePaginationArgs {
  height: number;
  capacityPx: number;
  mode: PaginationMode;
  signals?: RowSignals;
  ocrLines?: OcrLineBox[];
  manualBreaks?: number[];
  overlapPx?: number;
  cfg: PaginationConfig;
}

/** Cost of cutting at proxy row `yp` (cut between rows yp−1 and yp). Lower is better. */
export function scoreCandidate(s: RowSignals, yp: number, idealP: number, windowP: number, cfg: PaginationConfig, ocr?: OcrLineBox[]): BreakCandidate {
  const lo = Math.max(0, yp - cfg.bandRows);
  const hi = Math.min(s.rows - 1, yp + cfg.bandRows - 1);
  let e = 0;
  let c = 0;
  for (let y = lo; y <= hi; y++) {
    e = Math.max(e, s.edges[y]);
    c = Math.max(c, s.content[y]);
  }
  const edgeDensity = Math.min(1, e / cfg.edgeNorm);
  const inkDensity = Math.min(1, c * 4);
  // Clearance inside a whitespace gap: distance to content above and below the cut.
  const up = yp > 0 ? s.clearUp[yp - 1] : 0;
  const down = yp < s.rows ? s.clearDown[yp] : 0;
  const clearance = Math.min(up, down) / s.scaleY;
  const whitespaceScore = Math.min(1, clearance / cfg.whitespaceTargetPx);
  // Separator: a clean boundary between two flat (stroke-free) rows with a colour change.
  let separatorScore = 0;
  for (let d = 0; d <= 1; d++) {
    const y = yp + d;
    if (y > 0 && y < s.rows && s.transition[y] >= cfg.separatorTransition && s.edges[y] <= cfg.strokeFreeEdges && s.edges[y - 1] <= cfg.strokeFreeEdges) separatorScore = 1;
  }
  const distanceFromIdeal = windowP > 0 ? Math.abs(yp - idealP) / windowP : 0;
  let textIntersectionPenalty = 0;
  if (ocr?.length) {
    const yo = yp / s.scaleY;
    const pad = cfg.ocrPadPx;
    if (ocr.some((l) => yo > l.y + pad && yo < l.y + l.h - pad)) textIntersectionPenalty = 1;
  }
  const w = cfg.weights;
  const totalScore =
    w.edgeDensity * edgeDensity + w.inkDensity * inkDensity - w.whitespace * whitespaceScore - w.separator * separatorScore + w.distance * distanceFromIdeal + w.ocrText * textIntersectionPenalty;
  return { y: yp, textIntersectionPenalty, edgeDensity, inkDensity, whitespaceScore, separatorScore, distanceFromIdeal, totalScore };
}

function describe(c: BreakCandidate): { confidence: BreakConfidence; reasons: string[] } {
  const reasons: string[] = [];
  if (c.textIntersectionPenalty > 0) reasons.push("intersects OCR text line");
  if (c.edgeDensity > 0.05) reasons.push(`cuts strokes/text (edge ${(c.edgeDensity * 100).toFixed(0)}%)`);
  else reasons.push("no text strokes at cut");
  if (c.whitespaceScore > 0) reasons.push(`whitespace clearance ≥ ${Math.round(c.whitespaceScore * 100)}% of target`);
  else if (c.inkDensity > 0) reasons.push("inside a coloured block (bubble/card/photo)");
  if (c.separatorScore > 0) reasons.push("on a separator/background boundary");
  let confidence: BreakConfidence;
  if (c.edgeDensity > 0.05 || c.textIntersectionPenalty > 0) confidence = "low";
  else if (c.whitespaceScore > 0 && c.inkDensity === 0) confidence = "high";
  else confidence = "medium";
  return { confidence, reasons };
}

/** Choose one break around `ideal` (original px) within [minY, maxY]. */
export function chooseBreak(s: RowSignals, ideal: number, minY: number, maxY: number, cfg: PaginationConfig, ocr?: OcrLineBox[]): PageBreak & { candidate: BreakCandidate } {
  const toP = (y: number) => Math.round(y * s.scaleY);
  const idealP = Math.min(s.rows - 1, toP(ideal));
  const loP = Math.max(1, toP(minY));
  const hiP = Math.min(s.rows - 1, toP(maxY));
  const windowP = Math.max(1, Math.max(idealP - loP, hiP - idealP));
  let best = scoreCandidate(s, idealP, idealP, windowP, cfg, ocr);
  const atIdeal = best;
  for (let y = loP; y <= hiP; y++) {
    const c = scoreCandidate(s, y, idealP, windowP, cfg, ocr);
    if (c.totalScore < best.totalScore - 1e-9 || (Math.abs(c.totalScore - best.totalScore) < 1e-9 && Math.abs(y - idealP) < Math.abs(best.y - idealP))) best = c;
  }
  let d = describe(best);
  // Low confidence: don't move far for a marginal gain — keep the ideal cut and ask for review.
  if (d.confidence === "low" && atIdeal.totalScore - best.totalScore < cfg.confidence.minImprovement) {
    best = atIdeal;
    d = describe(best);
    d.reasons.unshift("no safe boundary nearby: kept ideal cut");
  }
  const y = Math.min(maxY, Math.max(minY, Math.round(best.y / s.scaleY)));
  return { id: newBreakId(), y, idealY: ideal, source: "automatic", confidence: d.confidence, reasons: d.reasons, needsReview: d.confidence === "low", candidate: best };
}

/**
 * Plan the breaks for one image. Pages hold at most `capacityPx` rows (plus `windowDown`
 * shrink allowance); manual breaks are kept and automatic ones re-planned around them.
 */
export function paginateImage(a: ImagePaginationArgs): PageBreak[] {
  const { height, capacityPx, cfg } = a;
  if (!Number.isFinite(capacityPx) || height <= capacityPx) {
    return (a.manualBreaks ?? []).filter((y) => y > 0 && y < height).sort((p, q) => p - q).map((y) => ({ id: newBreakId(), y, source: "manual" as const }));
  }
  const manual = [...new Set(a.manualBreaks ?? [])].filter((y) => y > 0 && y < height).sort((p, q) => p - q);
  const overlap = a.overlapPx ?? 0;
  const out: PageBreak[] = [];
  let start = 0;
  let pageIndex = 0;
  const maxPage = capacityPx * (1 + cfg.windowDown);
  for (let guard = 0; guard < 10_000; guard++) {
    const top = pageIndex === 0 ? start : start - overlap; // page content starts `overlap` above the cut
    const ideal = top + capacityPx;
    if (height - top <= capacityPx) break;
    const nextManual = manual.find((y) => y > start);
    if (nextManual !== undefined && nextManual <= top + maxPage) {
      out.push({ id: newBreakId(), y: nextManual, idealY: ideal, source: "manual" });
      start = nextManual;
      pageIndex++;
      continue;
    }
    const minY = Math.max(start + 1, top + Math.max(capacityPx * cfg.minPageFraction, capacityPx * (1 - cfg.windowUp)));
    const maxY = Math.min(height - 1, top + capacityPx * (1 + cfg.windowDown), nextManual !== undefined ? nextManual - 1 : Infinity);
    let br: PageBreak;
    if (a.mode === "fixed" || !a.signals) {
      br = { id: newBreakId(), y: Math.min(ideal, height - 1), idealY: ideal, source: "automatic", confidence: undefined, reasons: ["fixed cut"] };
    } else {
      const { candidate, ...b } = chooseBreak(a.signals, ideal, minY, maxY, cfg, a.mode === "ocr" ? a.ocrLines : undefined);
      void candidate;
      br = b;
    }
    if (br.y <= start) br.y = Math.min(height - 1, start + capacityPx); // safety: always progress
    out.push(br);
    start = br.y;
    pageIndex++;
  }
  return out;
}

/** Page slices for one image from its breaks (sorted), including overlap and fit scaling. */
export function slicesFor(imageIndex: number, height: number, capacityPx: number, breaks: PageBreak[], overlapPx = 0): PageSlice[] {
  const ys = [0, ...breaks.map((b) => b.y).sort((p, q) => p - q), height];
  const out: PageSlice[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = i === 0 ? 0 : Math.max(0, ys[i] - overlapPx);
    const y1 = ys[i + 1];
    if (y1 <= y0) continue;
    out.push({ imageIndex, y0, y1, fitScale: Number.isFinite(capacityPx) ? Math.min(1, capacityPx / (y1 - y0)) : 1 });
  }
  return out;
}
