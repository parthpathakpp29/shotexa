import type { Rect } from "./types";

/** Bounding box of pixels whose alpha is above the threshold, or null when all are transparent. */
export function alphaBounds(data: Uint8ClampedArray, width: number, height: number, threshold = 0): Rect | null {
  if (width < 1 || height < 1 || data.length < width * height * 4) return null;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < x0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
