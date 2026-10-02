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

/**
 * Write the difference of `a` and `b` into `out` (all RGBA, same length).
 * Returns how many pixels were over the threshold.
 */
export function differencePixels(a: Uint8ClampedArray, b: Uint8ClampedArray, out: Uint8ClampedArray, threshold: number): number {
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
    if (d <= limit) {
      out[i] = base0;
      out[i + 1] = base1;
      out[i + 2] = base2;
    } else {
      changed++;
      const strength = DIFF_MIN_STRENGTH + (1 - DIFF_MIN_STRENGTH) * Math.min(1, (d - limit) / span);
      out[i] = base0 + (DIFF_HIGHLIGHT[0] - base0) * strength;
      out[i + 1] = base1 + (DIFF_HIGHLIGHT[1] - base1) * strength;
      out[i + 2] = base2 + (DIFF_HIGHLIGHT[2] - base2) * strength;
    }
    out[i + 3] = 255;
  }
  return changed;
}

/** True when this pixel is tinted as changed (used by the tests and the on-screen count). */
export const isHighlighted = (rgb: readonly number[]) => rgb[0] > rgb[2] + 40 && rgb[0] > 90;
