/**
 * Split planning — pure functions from settings to horizontal pieces, in source pixels.
 *
 * Every plan is a list of increasing cut rows; pieces are the half-open ranges between them:
 * [0, c1), [c1, c2), …, [cn, height). So by construction every source row belongs to exactly
 * one piece, in order — nothing missing, nothing duplicated, no seams.
 *
 * Custom lines reuse the PDF page-break editing model (`core/pdf/breaks`): clamped between
 * their neighbours, never reordered by a drag, never closer than MIN_SLICE_PX.
 */
import { addBreak, moveBreak, removeBreak, sortBreaks, validateBreaks, type BreakLimits } from "@/core/pdf/breaks";
import type { Size } from "@/core/image-transform/types";
import type { SplitLine, SplitPiece, SplitSettings } from "./types";

/** Smallest piece Split will produce: nothing thinner is a useful image, and it rules out accidental slivers. */
export const MIN_SLICE_PX = 24;
/** Most pieces one split can produce (keeps export time, memory and downloads bounded). */
export const MAX_PIECES = 100;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const splitLimits = (height: number): BreakLimits => ({ height, minGapPx: MIN_SLICE_PX });

/** Most pieces an image of this height can be split into. */
export const maxPieces = (height: number) => Math.max(1, Math.min(MAX_PIECES, Math.floor(height / MIN_SLICE_PX)));

/** Too short to split into two pieces of at least MIN_SLICE_PX. */
export const canSplit = (height: number) => maxPieces(height) >= 2;

/** Section count, clamped so every piece is at least MIN_SLICE_PX tall. */
export const clampCount = (count: number, height: number) => clamp(Math.round(Number.isFinite(count) ? count : 2), Math.min(2, maxPieces(height)), maxPieces(height));

/** Allowed target heights: at most MAX_PIECES pieces, and always at least two pieces. */
export function heightBounds(height: number): { min: number; max: number } {
  const min = Math.max(MIN_SLICE_PX, Math.ceil(height / MAX_PIECES));
  return { min, max: Math.max(min, height - MIN_SLICE_PX) };
}

export const clampHeight = (h: number, height: number) => {
  const b = heightBounds(height);
  return clamp(Math.round(Number.isFinite(h) ? h : b.max), b.min, b.max);
};

/** A phone-screen-shaped default target height (16:9 portrait of the image width). */
export const defaultTargetHeight = (source: Size) => clampHeight(Math.round((source.width * 16) / 9), source.height);

export function defaultSplit(source: Size): SplitSettings {
  return { mode: "equal", by: "count", count: 2, height: defaultTargetHeight(source), lines: [] };
}

/** `count` near-equal pieces: cut i at round(i · H / n). Heights differ by at most 1 px. */
export function equalCountCuts(height: number, count: number): number[] {
  if (!canSplit(height)) return [];
  const n = clampCount(count, height);
  return Array.from({ length: n - 1 }, (_, i) => Math.round(((i + 1) * height) / n));
}

/** A cut every `h` rows; the last piece takes the remainder, or joins the previous one if it would be a sliver. */
export function equalHeightCuts(height: number, h: number): number[] {
  if (!canSplit(height)) return [];
  const step = clampHeight(h, height);
  const cuts: number[] = [];
  for (let y = step; y < height; y += step) cuts.push(y);
  if (cuts.length && height - cuts[cuts.length - 1] < MIN_SLICE_PX) cuts.pop();
  return cuts;
}

/** The cut rows the current settings produce, strictly increasing and inside (0, height). */
export function cutsFor(s: SplitSettings, height: number): number[] {
  if (s.mode === "equal") return s.by === "count" ? equalCountCuts(height, s.count) : equalHeightCuts(height, s.height);
  return sortBreaks(s.lines).map((l) => l.y);
}

/** Pieces between consecutive cuts: [0, c1), [c1, c2), …, [cn, height). */
export function piecesFor(cuts: number[], height: number): SplitPiece[] {
  const edges = [0, ...cuts, height];
  return edges.slice(1).map((y1, index) => ({ index, y0: edges[index], y1 }));
}

export const planSplit = (s: SplitSettings, source: Size): SplitPiece[] => piecesFor(cutsFor(s, source.height), source.height);

export type SplitIssue = "OUT_OF_RANGE" | "TOO_CLOSE" | "UNSORTED" | "NOTHING_TO_SPLIT" | "TOO_MANY";

/** Everything that would make an export wrong; an empty list means the pieces are safe to render. */
export function validatePieces(pieces: SplitPiece[], height: number): SplitIssue[] {
  const issues = new Set<SplitIssue>();
  if (pieces.length < 2) issues.add("NOTHING_TO_SPLIT");
  if (pieces.length > MAX_PIECES) issues.add("TOO_MANY");
  let expected = 0;
  for (const p of pieces) {
    if (p.y0 !== expected || !Number.isInteger(p.y0) || !Number.isInteger(p.y1)) issues.add("UNSORTED");
    if (p.y1 - p.y0 < MIN_SLICE_PX) issues.add("TOO_CLOSE");
    if (p.y0 < 0 || p.y1 > height) issues.add("OUT_OF_RANGE");
    expected = p.y1;
  }
  if (pieces.length && expected !== height) issues.add("OUT_OF_RANGE");
  return [...issues];
}

// ——— Custom lines ———

const toLines = (cuts: number[], newId: () => string): SplitLine[] => cuts.map((y) => ({ id: newId(), y, source: "manual" }));

/**
 * Custom settings to edit. From equal mode, the lines start where the equal split put them,
 * so "adjust one of the equal cuts" is a single step.
 */
export function asCustom(s: SplitSettings, height: number, newId: () => string): SplitSettings {
  if (s.mode === "custom") return s;
  return { ...s, mode: "custom", lines: toLines(cutsFor(s, height), newId) };
}

/** Switch to custom mode, keeping earlier custom lines if there are any. */
export function withMode(s: SplitSettings, mode: SplitSettings["mode"], height: number, newId: () => string): SplitSettings {
  if (mode === s.mode) return s;
  if (mode === "equal") return { ...s, mode };
  return s.lines.length ? { ...s, mode } : asCustom(s, height, newId);
}

/** Add a line at `y`; unchanged if it would make a piece thinner than MIN_SLICE_PX. */
export function addLine(s: SplitSettings, y: number, height: number, newId: () => string): SplitSettings {
  const c = asCustom(s, height, newId);
  if (c.lines.length + 1 >= MAX_PIECES) return s;
  const lines = addBreak(c.lines, y, splitLimits(height), newId());
  return lines === c.lines ? s : { ...c, lines };
}

/** A new line through the middle of the tallest piece — the keyboard / touch "Add split" action. */
export function addLineInTallest(s: SplitSettings, height: number, newId: () => string): SplitSettings {
  const pieces = piecesFor(cutsFor(s, height), height);
  const tallest = pieces.reduce((a, b) => (b.y1 - b.y0 > a.y1 - a.y0 ? b : a), pieces[0]);
  return addLine(s, Math.round((tallest.y0 + tallest.y1) / 2), height, newId);
}

/** Move a line; it stays between its neighbours (≥ MIN_SLICE_PX from each) and inside the image. */
export function moveLine(s: SplitSettings, id: string, y: number, height: number): SplitSettings {
  if (s.mode !== "custom" || !s.lines.some((l) => l.id === id)) return s;
  return { ...s, lines: moveBreak(s.lines, id, y, splitLimits(height)) };
}

export function removeLine(s: SplitSettings, id: string): SplitSettings {
  if (s.mode !== "custom") return s;
  return { ...s, lines: removeBreak(s.lines, id) };
}

export const linesValid = (lines: SplitLine[], height: number) => validateBreaks(sortBreaks(lines), splitLimits(height)).length === 0;

/** `shotexa-split-01.png` … — zero-padded so the files sort in order. */
export function pieceName(index: number, total: number, ext: string): string {
  const width = Math.max(2, String(total).length);
  return `shotexa-split-${String(index + 1).padStart(width, "0")}.${ext}`;
}
