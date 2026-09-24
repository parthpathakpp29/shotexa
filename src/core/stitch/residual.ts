import type { GrayImage } from "./types";

/**
 * Mean absolute grey difference between A rows [y0, y1) and B rows [y0 - dy, y1 - dy).
 * Returns NaN when the range is empty. `stride` subsamples columns.
 */
export function overlapResidual(
  a: GrayImage,
  b: GrayImage,
  dy: number,
  y0: number,
  y1: number,
  stride = 1,
): number {
  const width = Math.min(a.width, b.width);
  const start = Math.max(y0, dy);
  const end = Math.min(y1, dy + b.height, a.height);
  if (end <= start) return NaN;
  let sum = 0;
  let n = 0;
  for (let y = start; y < end; y++) {
    const ra = y * a.width;
    const rb = (y - dy) * b.width;
    for (let x = 0; x < width; x += stride) {
      sum += Math.abs(a.data[ra + x] - b.data[rb + x]);
      n++;
    }
  }
  return sum / n;
}

/**
 * Fraction of "ink" pixels (text/edges: strong horizontal gradient in A or B) whose grey
 * values disagree by more than `diffThreshold`. A true scrolling overlap is near 0 even on
 * mostly-white pages, where plain MAD is dominated by background. Wrong-but-periodic
 * offsets (tables, repeated list rows) keep the layout but not the text, so they score high.
 * Same row mapping as `overlapResidual`. NaN when no ink.
 */
export function inkMismatch(
  a: GrayImage,
  b: GrayImage,
  dy: number,
  y0: number,
  y1: number,
  inkThreshold: number,
  diffThreshold: number,
): number {
  const width = Math.min(a.width, b.width);
  const start = Math.max(y0, dy);
  const end = Math.min(y1, dy + b.height, a.height);
  let ink = 0;
  let bad = 0;
  for (let y = start; y < end; y++) {
    const ra = y * a.width;
    const rb = (y - dy) * b.width;
    for (let x = 1; x < width; x++) {
      const va = a.data[ra + x];
      const vb = b.data[rb + x];
      if (Math.abs(va - a.data[ra + x - 1]) > inkThreshold || Math.abs(vb - b.data[rb + x - 1]) > inkThreshold) {
        ink++;
        if (Math.abs(va - vb) > diffThreshold) bad++;
      }
    }
  }
  return ink === 0 ? NaN : bad / ink;
}

/**
 * Content-overlap residual in proxy space: only compares rows that are content in both
 * images (excludes static header/footer bands).
 */
export function contentResidual(
  a: GrayImage,
  b: GrayImage,
  dy: number,
  top: number,
  bottom: number,
  stride = 1,
): { mad: number; rows: number } {
  const y0 = Math.max(top, dy + top);
  const y1 = Math.min(a.height - bottom, dy + b.height - bottom);
  const rows = y1 - y0;
  if (rows <= 0) return { mad: NaN, rows: 0 };
  return { mad: overlapResidual(a, b, dy, y0, y1, stride), rows };
}

export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (v.length === 0) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
