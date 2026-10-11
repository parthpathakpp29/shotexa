/**
 * The difference engine — a measurement, not an interpretation. It reports WHERE pixels
 * differ and by how much; `analysis.ts` is what turns that into changed regions, and nothing
 * anywhere claims to know why a pixel changed.
 *
 * Both sides are rasterised into the same comparison space first, so a pixel outside one
 * screenshot's fitted area is compared against the shared background rather than against
 * undefined memory.
 *
 * Two metrics, both deterministic and both fixed formulas:
 *
 *   pixel      Largest absolute per-channel difference in 8-bit sRGB, against the colour
 *              tolerance. A second gate flags pixels whose BT.601 luminance differs by more
 *              than the luminance tolerance even when every channel is inside the colour
 *              tolerance (a luminance difference can never exceed the largest channel
 *              difference, so a luminance tolerance at or above the colour tolerance has no
 *              further effect).
 *
 *   perceptual CIE76 delta-E*ab: both colours are converted sRGB -> linear RGB -> CIE XYZ
 *              (D65) -> CIELAB, and the Euclidean distance between the two Lab values is
 *              compared with the tolerance. delta-E*ab of about 2.3 is the long-established
 *              just-noticeable difference. This reduces the anti-aliasing and gamma-related
 *              noise that a raw channel comparison reports, without any model and without
 *              anything learned from data. It is NOT "AI" and it is not a similarity score.
 *
 * Optional, all off by default so the first answer a user sees is the conservative one:
 *   - ignore anti-aliasing: a changed pixel whose colour simply moved to a neighbouring
 *     pixel in the other screenshot (sub-pixel shift) is dropped.
 *   - ignore near-identical colour: drop changes under the just-noticeable difference.
 *   - ignore transparent pixels / compare alpha / ignore one chosen colour.
 */
import type { Rect } from "@/core/image-transform/types";
import { DIFF_BASE, DIFF_GHOST, DIFF_HIGHLIGHT, DIFF_MIN_STRENGTH, JND_DELTA_E } from "./presets";
import type { CompareDiffSettings, CompareHeatmapSettings, CompareStats } from "./types";

export interface DifferenceStats {
  changedPixels: number;
  totalPixels: number;
  changedPercent: number;
  unchangedPercent: number;
}

export interface ChangedRegion {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
  percent: number;
}

export interface DifferenceAnalysis extends DifferenceStats {
  width: number;
  height: number;
  regions: ChangedRegion[];
  regionsTruncated: boolean;
}

export interface RegionOptions {
  minRegionSize: number;
  mergeDistance: number;
  ignoreTiny: boolean;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Turns a measured changed-pixel count into display-safe, deterministic percentages. */
export function differenceStats(changedPixels: number, totalPixels: number, comparedPixels?: number): DifferenceStats {
  const total = Math.max(0, Math.round(totalPixels));
  const compared = Math.min(total, Math.max(0, Math.round(comparedPixels ?? total)));
  const changed = Math.min(compared, Math.max(0, Math.round(changedPixels)));
  const changedPercent = compared === 0 ? 0 : (changed / compared) * 100;
  return { changedPixels: changed, totalPixels: total, changedPercent, unchangedPercent: 100 - changedPercent };
}

/** The same numbers plus what was left out, for the comparison summary and the report. */
export function compareStats(changed: number, compared: number, total: number, ignored: number): CompareStats {
  const base = differenceStats(changed, total, compared);
  return {
    changedPixels: base.changedPixels,
    comparedPixels: Math.min(Math.max(0, Math.round(compared)), Math.max(0, Math.round(total))),
    totalPixels: base.totalPixels,
    ignoredPixels: Math.max(0, Math.round(ignored)),
    changedPercent: base.changedPercent,
    unchangedPercent: base.unchangedPercent,
  };
}

/* ------------------------------------------------------------------ colour */

export const luma = (r: number, g: number, b: number) => (r * 299 + g * 587 + b * 114) / 1000;

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const LAB_EPS = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
const labF = (t: number) => (t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116);

/** sRGB (0-255, integers) to CIELAB with the D65 white point. */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = SRGB_TO_LINEAR[r | 0];
  const gl = SRGB_TO_LINEAR[g | 0];
  const bl = SRGB_TO_LINEAR[b | 0];
  // sRGB D65 matrix, normalised by the D65 white point.
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference between two sRGB colours. */
export function deltaE76(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const [l1, a1, bb1] = rgbToLab(r1, g1, b1);
  const [l2, a2, bb2] = rgbToLab(r2, g2, b2);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (bb1 - bb2) ** 2);
}

export function parseHexColour(value: string | null | undefined): readonly [number, number, number] | null {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
}

/* ------------------------------------------------------- the pixel compare */

export interface CompareBuffersOptions {
  width: number;
  height: number;
  /** Colour tolerance for the pixel metric (0-255). */
  threshold: number;
  diff: CompareDiffSettings;
  /** The shared background both sides are composited over when alpha is not compared. */
  background: readonly [number, number, number];
  /** Rectangles excluded from the comparison, in these buffers' pixels. */
  ignore?: readonly Rect[];
  palette?: "difference" | "heatmap";
  heatmap?: CompareHeatmapSettings;
}

export interface CompareBuffersResult {
  changed: number;
  /** Pixels actually compared: everything except ignored and skipped pixels. */
  compared: number;
  /** Pixels inside an ignore region. */
  ignored: number;
  /** 1 where the pixel is changed. */
  mask: Uint8Array;
  /** Normalised change strength, 0-255, for the heatmap and for region weighting. */
  strength: Uint8Array;
  /** Composited greyscale of each side — region classification and movement run on these. */
  grayA: Uint8Array;
  grayB: Uint8Array;
}

const DEFAULT_HEATMAP: CompareHeatmapSettings = { intensity: 100, threshold: 0, changedOnly: false, dimUnchanged: 100, legend: true };
/** Alpha at or above this counts as opaque. */
const OPAQUE = 250;
/** delta-E treated as "completely different" when normalising perceptual strength. */
const DELTA_E_FULL = 40;

/**
 * Compare two rasterised RGBA buffers and write the visual difference into `out`.
 * Every buffer is the same length (width * height * 4).
 */
export function compareBuffers(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  out: Uint8ClampedArray,
  options: CompareBuffersOptions,
): CompareBuffersResult {
  const { width, height } = options;
  const pixels = width * height;
  const d = options.diff;
  const limit = Math.max(0, Math.min(255, Math.round(options.threshold)));
  const lumLimit = Math.max(0, Math.min(255, Math.round(d.luminanceTolerance)));
  const deltaELimit = Math.max(0, d.deltaE);
  const bg = options.background;
  const heat = options.heatmap ?? DEFAULT_HEATMAP;
  const palette = options.palette ?? "difference";
  const ignoreColour = parseHexColour(d.ignoreColour);
  const ignoreColourLimit = Math.max(0, Math.round(d.ignoreColourTolerance));

  const mask = new Uint8Array(pixels);
  const strength = new Uint8Array(pixels);
  const grayA = new Uint8Array(pixels);
  const grayB = new Uint8Array(pixels);
  const skipped = new Uint8Array(pixels);

  let ignored = 0;
  if (options.ignore?.length) {
    for (const rect of options.ignore) {
      const x0 = Math.max(0, Math.floor(rect.x));
      const y0 = Math.max(0, Math.floor(rect.y));
      const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
      const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = y * width + x;
          if (skipped[p] === 2) continue;
          skipped[p] = 2;
          ignored++;
        }
      }
    }
  }

  // Composite one pixel over the background (or keep its own colour when alpha is compared).
  const composite = (buffer: Uint8ClampedArray, index: number, outRgb: number[]) => {
    const alpha = buffer[index + 3] / 255;
    if (alpha >= 1) {
      outRgb[0] = buffer[index];
      outRgb[1] = buffer[index + 1];
      outRgb[2] = buffer[index + 2];
      return;
    }
    outRgb[0] = buffer[index] * alpha + bg[0] * (1 - alpha);
    outRgb[1] = buffer[index + 1] * alpha + bg[1] * (1 - alpha);
    outRgb[2] = buffer[index + 2] * alpha + bg[2] * (1 - alpha);
  };

  const ca = [0, 0, 0];
  const cb = [0, 0, 0];
  let changed = 0;
  let compared = 0;

  for (let p = 0; p < pixels; p++) {
    const i = p * 4;
    composite(a, i, ca);
    composite(b, i, cb);
    grayA[p] = luma(ca[0], ca[1], ca[2]);
    grayB[p] = luma(cb[0], cb[1], cb[2]);
    if (skipped[p] === 2) continue;

    if (d.ignoreTransparent && (a[i + 3] < OPAQUE || b[i + 3] < OPAQUE)) {
      skipped[p] = 1;
      continue;
    }
    if (ignoreColour) {
      const nearA = Math.max(Math.abs(ca[0] - ignoreColour[0]), Math.abs(ca[1] - ignoreColour[1]), Math.abs(ca[2] - ignoreColour[2])) <= ignoreColourLimit;
      const nearB = Math.max(Math.abs(cb[0] - ignoreColour[0]), Math.abs(cb[1] - ignoreColour[1]), Math.abs(cb[2] - ignoreColour[2])) <= ignoreColourLimit;
      if (nearA || nearB) {
        skipped[p] = 1;
        continue;
      }
    }
    compared++;

    const channel = Math.max(Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1]), Math.abs(ca[2] - cb[2]));
    let isChanged: boolean;
    let normalised: number;
    if (d.metric === "perceptual") {
      const dE = deltaE76(Math.round(ca[0]), Math.round(ca[1]), Math.round(ca[2]), Math.round(cb[0]), Math.round(cb[1]), Math.round(cb[2]));
      isChanged = dE > deltaELimit;
      normalised = clamp01((dE - deltaELimit) / Math.max(1, DELTA_E_FULL - deltaELimit));
    } else {
      const lumDiff = Math.abs(grayA[p] - grayB[p]);
      isChanged = channel > limit || lumDiff > lumLimit;
      normalised = clamp01((Math.max(channel, lumDiff) - limit) / Math.max(1, 255 - limit));
    }
    if (d.compareAlpha && Math.abs(a[i + 3] - b[i + 3]) > limit) {
      isChanged = true;
      normalised = Math.max(normalised, clamp01((Math.abs(a[i + 3] - b[i + 3]) - limit) / Math.max(1, 255 - limit)));
    }
    if (isChanged && d.ignoreNearIdenticalColour && d.metric !== "perceptual") {
      const dE = deltaE76(Math.round(ca[0]), Math.round(ca[1]), Math.round(ca[2]), Math.round(cb[0]), Math.round(cb[1]), Math.round(cb[2]));
      if (dE <= JND_DELTA_E) isChanged = false;
    }
    if (isChanged) {
      mask[p] = 1;
      strength[p] = Math.round(DIFF_MIN_STRENGTH * 255 + (1 - DIFF_MIN_STRENGTH) * 255 * normalised);
      changed++;
    }
  }

  if (d.ignoreAntialiasing && changed > 0) {
    changed -= dropAntialiasing(a, b, mask, strength, width, height, Math.max(limit, 8), composite);
  }

  // Finally paint the picture the user sees. Preview and export run exactly this code.
  const dim = clamp01(heat.dimUnchanged / 100);
  const heatThreshold = clamp01(heat.threshold / 100);
  const intensity = clamp01(heat.intensity / 100 / 2) * 2;
  for (let p = 0; p < pixels; p++) {
    const i = p * 4;
    const grey = grayA[p];
    const ghost = grey * DIFF_GHOST;
    const base0 = DIFF_BASE[0] + ghost;
    const base1 = DIFF_BASE[1] + ghost;
    const base2 = DIFF_BASE[2] + ghost;
    const normalised = mask[p] ? clamp01((strength[p] / 255 - DIFF_MIN_STRENGTH) / (1 - DIFF_MIN_STRENGTH)) : 0;
    if (!mask[p] || (palette === "heatmap" && normalised < heatThreshold)) {
      if (palette === "heatmap" && heat.changedOnly) {
        // Keep the screenshot's own greys, dimmed, so the hot areas stand out in context.
        const keep = grey * (1 - 0.75 * dim) + 255 * 0.02;
        out[i] = keep;
        out[i + 1] = keep;
        out[i + 2] = keep;
      } else {
        out[i] = base0 * (0.35 + 0.65 * (1 - dim) + dim * 0.65);
        out[i + 1] = base1 * (0.35 + 0.65 * (1 - dim) + dim * 0.65);
        out[i + 2] = base2 * (0.35 + 0.65 * (1 - dim) + dim * 0.65);
      }
      if (skipped[p] === 2) {
        // Ignored areas read as deliberately excluded, not as "unchanged".
        out[i] = out[i] * 0.6 + 70 * 0.4;
        out[i + 1] = out[i + 1] * 0.6 + 80 * 0.4;
        out[i + 2] = out[i + 2] * 0.6 + 110 * 0.4;
      }
      out[i + 3] = 255;
      continue;
    }
    const level = clamp01(DIFF_MIN_STRENGTH + (1 - DIFF_MIN_STRENGTH) * normalised);
    if (palette === "heatmap") {
      const [r, g, blue] = heatColor(clamp01(level * intensity));
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = blue;
    } else {
      out[i] = base0 + (DIFF_HIGHLIGHT[0] - base0) * level;
      out[i + 1] = base1 + (DIFF_HIGHLIGHT[1] - base1) * level;
      out[i + 2] = base2 + (DIFF_HIGHLIGHT[2] - base2) * level;
    }
    out[i + 3] = 255;
  }

  return { changed, compared, ignored, mask, strength, grayA, grayB };
}

/**
 * Anti-aliasing / sub-pixel guard. A changed pixel is dropped when the colour it has in
 * "before" also appears next to it in "after", AND the colour it has in "after" also appears
 * next to it in "before" — i.e. the colour moved by less than a pixel instead of changing.
 * Returns how many pixels were dropped.
 */
function dropAntialiasing(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  mask: Uint8Array,
  strength: Uint8Array,
  width: number,
  height: number,
  tolerance: number,
  composite: (buffer: Uint8ClampedArray, index: number, out: number[]) => void,
): number {
  const ca = [0, 0, 0];
  const cb = [0, 0, 0];
  const n = [0, 0, 0];
  const drop: number[] = [];
  const near = (x: number[], y: number[]) => Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2])) <= tolerance;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!mask[p]) continue;
      composite(a, p * 4, ca);
      composite(b, p * 4, cb);
      let beforeFoundInAfter = false;
      let afterFoundInBefore = false;
      for (let dy = -1; dy <= 1 && !(beforeFoundInAfter && afterFoundInBefore); dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = (ny * width + nx) * 4;
          if (!beforeFoundInAfter) {
            composite(b, q, n);
            if (near(ca, n)) beforeFoundInAfter = true;
          }
          if (!afterFoundInBefore) {
            composite(a, q, n);
            if (near(cb, n)) afterFoundInBefore = true;
          }
        }
      }
      if (beforeFoundInAfter && afterFoundInBefore) drop.push(p);
    }
  }
  for (const p of drop) {
    mask[p] = 0;
    strength[p] = 0;
  }
  return drop.length;
}

/**
 * Write the difference of `a` and `b` into `out` (all RGBA, same length).
 * Returns how many pixels were over the threshold. Kept for the simple callers and the
 * unit tests: `compareBuffers` is the full engine.
 */
export function differencePixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  out: Uint8ClampedArray,
  threshold: number,
  mask?: Uint8Array,
  palette: "difference" | "heatmap" = "difference",
): number {
  const pixels = Math.floor(out.length / 4);
  const result = compareBuffers(a, b, out, {
    width: pixels,
    height: 1,
    threshold,
    diff: {
      metric: "pixel",
      luminanceTolerance: Math.max(0, Math.min(255, Math.round(threshold))),
      deltaE: JND_DELTA_E,
      ignoreAntialiasing: false,
      ignoreNearIdenticalColour: false,
      ignoreTransparent: false,
      compareAlpha: false,
      ignoreColour: null,
      ignoreColourTolerance: 0,
    },
    background: DIFF_BASE,
    palette,
  });
  if (mask) mask.set(result.mask.subarray(0, Math.min(mask.length, result.mask.length)));
  return result.changed;
}

export function heatColor(value: number): readonly [number, number, number] {
  const t = Math.max(0, Math.min(1, value));
  if (t < 0.33) {
    const k = t / 0.33;
    return [0, Math.round(90 + 165 * k), Math.round(255 - 40 * k)];
  }
  if (t < 0.66) {
    const k = (t - 0.33) / 0.33;
    return [Math.round(255 * k), 255, Math.round(215 * (1 - k))];
  }
  const k = (t - 0.66) / 0.34;
  return [255, Math.round(255 * (1 - k)), 0];
}

/** Deterministic 4-connected region grouping over the preview-resolution change mask. */
export function changedRegions(mask: Uint8Array, width: number, height: number, options: RegionOptions): { regions: ChangedRegion[]; truncated: boolean } {
  if (width < 1 || height < 1 || mask.length !== width * height) return { regions: [], truncated: false };
  const minimum = Math.max(options.ignoreTiny ? 4 : 1, Math.round(options.minRegionSize));
  const queue = new Int32Array(mask.length);
  const raw: Omit<ChangedRegion, "id" | "percent">[] = [];
  let truncated = false;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    mask[start] = 0;
    let pixels = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      pixels++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      const neighbours = [index - 1, index + 1, index - width, index + width];
      for (let n = 0; n < 4; n++) {
        const next = neighbours[n];
        if (next < 0 || next >= mask.length || !mask[next]) continue;
        if ((n === 0 && x === 0) || (n === 1 && x === width - 1)) continue;
        mask[next] = 0;
        queue[tail++] = next;
      }
    }
    if (pixels < minimum) continue;
    if (raw.length >= 1000) {
      truncated = true;
      continue;
    }
    raw.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, pixels });
  }

  const distance = Math.max(0, Math.round(options.mergeDistance));
  const merged = raw.slice();
  if (distance > 0) {
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; ) {
        const a = merged[i];
        const b = merged[j];
        const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
        const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
        if (gapX > distance || gapY > distance) {
          j++;
          continue;
        }
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const right = Math.max(a.x + a.width, b.x + b.width);
        const bottom = Math.max(a.y + a.height, b.y + b.height);
        merged[i] = { x, y, width: right - x, height: bottom - y, pixels: a.pixels + b.pixels };
        merged.splice(j, 1);
      }
    }
  }

  merged.sort((a, b) => b.pixels - a.pixels || a.y - b.y || a.x - b.x);
  return {
    regions: merged.map((region, index) => ({ ...region, id: index + 1, percent: (region.pixels / mask.length) * 100 })),
    truncated,
  };
}

/** True when this pixel is tinted as changed (used by the tests and the on-screen count). */
export const isHighlighted = (rgb: readonly number[]) => rgb[0] > rgb[2] + 40 && rgb[0] > 90;
