import type { StitchConfig } from "./config";
import type { GrayImage, StaticBands } from "./types";

export interface DetectedBands {
  /** Strict: every band row is (nearly) pixel-identical. */
  strict: StaticBands;
  /**
   * Drift-tolerant: rows close to the image edge may contain small localised changes
   * (status-bar clock, battery, signal). Usually the correct chrome size on phones.
   */
  tolerant: StaticBands;
  identical: boolean;
}

/**
 * Detect rows that are identical at the *same* position in A and B — fixed chrome such
 * as status bars, sticky headers, chat input bars and bottom navigation (architecture §30).
 * These rows are excluded from overlap matching (otherwise they match trivially at
 * offset 0) and dictate where the seam may go.
 *
 * Band size is inherently ambiguous (a blank row of content also looks static), so this
 * returns candidate hypotheses; the analyser evaluates them and keeps the most confident.
 *
 * Works on proxies. Both images must share the same width.
 */
export function detectStaticBands(a: GrayImage, b: GrayImage, cfg: StitchConfig["staticBands"]): DetectedBands {
  const width = Math.min(a.width, b.width);
  const minH = Math.min(a.height, b.height);
  const maxBand = Math.floor(minH * cfg.maxBandFraction);
  const driftZone = Math.floor(minH * cfg.driftZoneFraction);
  const blocks = cfg.driftBlocks;
  const blockW = width / blocks;

  /** 0 = static, 1 = localised drift, 2 = changed. */
  const classify = (ya: number, yb: number): 0 | 1 | 2 => {
    let changed = 0;
    const changedBlocks = new Uint8Array(blocks);
    const ra = ya * a.width;
    const rb = yb * b.width;
    for (let x = 0; x < width; x++) {
      if (Math.abs(a.data[ra + x] - b.data[rb + x]) > cfg.pixelDiffThreshold) {
        changed++;
        changedBlocks[Math.min(blocks - 1, Math.floor(x / blockW))] = 1;
      }
    }
    if (changed < cfg.maxChangedFraction * width) return 0;
    const nBlocks = changedBlocks.reduce((s, v) => s + v, 0);
    return nBlocks <= cfg.maxDriftBlocks ? 1 : 2;
  };

  let identical = false;
  if (a.height === b.height) {
    let same = 0;
    for (let y = 0; y < minH; y++) if (classify(y, y) === 0) same++;
    identical = same / minH >= cfg.identicalFraction;
  }

  const scan = (rowAt: (i: number) => [number, number], tolerant: boolean) => {
    let lastStatic = -1;
    let gap = 0;
    for (let i = 0; i < maxBand; i++) {
      const [ya, yb] = rowAt(i);
      const c = classify(ya, yb);
      if (c === 0) {
        lastStatic = i;
        gap = 0;
      } else if (c === 1 && tolerant && i < driftZone) {
        gap = 0; // drift inside the edge zone neither ends nor terminates the band
      } else if (++gap > cfg.gapToleranceRows) {
        break;
      }
    }
    return lastStatic + 1;
  };

  const top = (i: number): [number, number] => [i, i];
  const bottom = (i: number): [number, number] => [a.height - 1 - i, b.height - 1 - i];
  return {
    strict: { top: scan(top, false), bottom: scan(bottom, false) },
    tolerant: { top: scan(top, true), bottom: scan(bottom, true) },
    identical,
  };
}
