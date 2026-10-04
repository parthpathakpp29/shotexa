/**
 * Pixel difference — a plain per-channel comparison, not an interpretation. It reports WHERE
 * pixels differ, never what changed or by how far anything moved.
 *
 * Both sides are rasterised into the same comparison space first, on the same background, so a
 * pixel outside one screenshot's fitted area is compared against that background rather than
 * against undefined memory. Unchanged areas keep a faint ghost of "before" so the highlights
 * can be located; anything over the threshold is tinted, more strongly the larger the change.
 */
import { DIFF_BASE, DIFF_GHOST, DIFF_HIGHLIGHT, DIFF_MIN_STRENGTH } from "./presets";

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

/** Turns a measured changed-pixel count into display-safe, deterministic percentages. */
export function differenceStats(changedPixels: number, totalPixels: number): DifferenceStats {
  const total = Math.max(0, Math.round(totalPixels));
  const changed = Math.min(total, Math.max(0, Math.round(changedPixels)));
  const changedPercent = total === 0 ? 0 : (changed / total) * 100;
  return { changedPixels: changed, totalPixels: total, changedPercent, unchangedPercent: 100 - changedPercent };
}

/**
 * Write the difference of `a` and `b` into `out` (all RGBA, same length).
 * Returns how many pixels were over the threshold.
 */
export function differencePixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  out: Uint8ClampedArray,
  threshold: number,
  mask?: Uint8Array,
  palette: "difference" | "heatmap" = "difference",
): number {
  const limit = Math.max(0, Math.min(255, Math.round(threshold)));
  const span = Math.max(1, 255 - limit);
  let changed = 0;
  for (let i = 0; i < out.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    // A faint grey ghost of "before", so highlights can be placed in the picture.
    const grey = (a[i] * 299 + a[i + 1] * 587 + a[i + 2] * 114) / 1000;
    const ghost = grey * DIFF_GHOST;
    const base0 = DIFF_BASE[0] + ghost;
    const base1 = DIFF_BASE[1] + ghost;
    const base2 = DIFF_BASE[2] + ghost;
    const changedPixel = d > limit;
    if (mask) mask[i / 4] = changedPixel ? 1 : 0;
    if (!changedPixel) {
      out[i] = base0;
      out[i + 1] = base1;
      out[i + 2] = base2;
    } else {
      changed++;
      const strength = DIFF_MIN_STRENGTH + (1 - DIFF_MIN_STRENGTH) * Math.min(1, (d - limit) / span);
      if (palette === "heatmap") {
        const [r, g, blue] = heatColor(strength);
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = blue;
      } else {
        out[i] = base0 + (DIFF_HIGHLIGHT[0] - base0) * strength;
        out[i + 1] = base1 + (DIFF_HIGHLIGHT[1] - base1) * strength;
        out[i + 2] = base2 + (DIFF_HIGHLIGHT[2] - base2) * strength;
      }
    }
    out[i + 3] = 255;
  }
  return changed;
}

function heatColor(value: number): readonly [number, number, number] {
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
