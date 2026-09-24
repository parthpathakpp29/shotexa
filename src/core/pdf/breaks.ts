/**
 * Page-break editing model (architecture §38). Pure functions over an ImagePlan, so the
 * UI (drag, arrow keys, add, delete, snap, reset) never touches pagination internals.
 * Manual breaks are anchors; automatic breaks are re-planned around them with
 * `paginateImage(..., manualBreaks)`.
 */
import type { PageBreak } from "./types";

export interface BreakLimits {
  height: number;
  /** Smallest allowed page (px) between two breaks. */
  minGapPx: number;
}

export type BreakValidationError = "OUT_OF_RANGE" | "TOO_CLOSE" | "UNSORTED";

export function sortBreaks(breaks: PageBreak[]): PageBreak[] {
  return [...breaks].sort((a, b) => a.y - b.y);
}

/** Clamp a proposed y between its neighbours (keeping `minGapPx`) and inside the image. */
export function clampBreak(breaks: PageBreak[], id: string, y: number, lim: BreakLimits): number {
  const s = sortBreaks(breaks);
  const i = s.findIndex((b) => b.id === id);
  const prev = i > 0 ? s[i - 1].y : 0;
  const next = i >= 0 && i < s.length - 1 ? s[i + 1].y : lim.height;
  return Math.round(Math.min(next - lim.minGapPx, Math.max(prev + lim.minGapPx, y)));
}

/** Move a break; it becomes manual. */
export function moveBreak(breaks: PageBreak[], id: string, y: number, lim: BreakLimits): PageBreak[] {
  const ny = clampBreak(breaks, id, y, lim);
  return sortBreaks(breaks.map((b) => (b.id === id ? { ...b, y: ny, source: "manual" as const, needsReview: false } : b)));
}

/** Add a manual break; rejected (unchanged list) if it would be too close to another. */
export function addBreak(breaks: PageBreak[], y: number, lim: BreakLimits, id: string): PageBreak[] {
  const yy = Math.round(y);
  if (yy < lim.minGapPx || yy > lim.height - lim.minGapPx) return breaks;
  if (breaks.some((b) => Math.abs(b.y - yy) < lim.minGapPx)) return breaks;
  return sortBreaks([...breaks, { id, y: yy, source: "manual" }]);
}

export function removeBreak(breaks: PageBreak[], id: string): PageBreak[] {
  return breaks.filter((b) => b.id !== id);
}

export function manualYs(breaks: PageBreak[]): number[] {
  return breaks.filter((b) => b.source === "manual").map((b) => b.y);
}

/** Nearest suggested safe y within `snapPx` of `y`, else `y` unchanged. */
export function snapTo(y: number, safe: number[], snapPx: number): number {
  let best = y;
  let d = snapPx + 1;
  for (const s of safe) {
    const dd = Math.abs(s - y);
    if (dd <= snapPx && dd < d) {
      d = dd;
      best = s;
    }
  }
  return best;
}

export function validateBreaks(breaks: PageBreak[], lim: BreakLimits): BreakValidationError[] {
  const errs = new Set<BreakValidationError>();
  for (let i = 0; i < breaks.length; i++) {
    const y = breaks[i].y;
    if (!(y > 0 && y < lim.height)) errs.add("OUT_OF_RANGE");
    if (i > 0 && breaks[i].y < breaks[i - 1].y) errs.add("UNSORTED");
    if (i > 0 && Math.abs(breaks[i].y - breaks[i - 1].y) < lim.minGapPx) errs.add("TOO_CLOSE");
  }
  return [...errs];
}
