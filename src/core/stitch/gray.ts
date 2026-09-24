import type { GrayImage } from "./types";

/** BT.601-ish integer luma. Input is RGBA (alpha ignored — screenshots are opaque). */
export function rgbaToGray(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return { width, height, data };
}

/** Area-average downscale (box filter). Only for shrinking. */
export function downscaleGray(src: GrayImage, width: number, height: number): GrayImage {
  const out = new Uint8Array(width * height);
  const sx = src.width / width;
  const sy = src.height / height;
  const colStart = new Int32Array(width + 1);
  for (let x = 0; x <= width; x++) colStart[x] = Math.min(src.width, Math.round(x * sx));
  const acc = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    const y0 = Math.round(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.round((y + 1) * sy)));
    acc.fill(0);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * src.width;
      for (let x = 0; x < width; x++) {
        let s = 0;
        const c1 = Math.max(colStart[x] + 1, colStart[x + 1]);
        for (let xx = colStart[x]; xx < c1; xx++) s += src.data[row + xx];
        acc[x] += s / (c1 - colStart[x]);
      }
    }
    const rows = y1 - y0;
    for (let x = 0; x < width; x++) out[y * width + x] = Math.round(acc[x] / rows);
  }
  return { width, height, data: out };
}

/** Copy of rows [y, y+h) and columns [x, x+w). */
export function cropGray(src: GrayImage, x: number, y: number, w: number, h: number): GrayImage {
  const data = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    const s = (y + r) * src.width + x;
    data.set(src.data.subarray(s, s + w), r * w);
  }
  return { width: w, height: h, data };
}

export function stdDev(img: GrayImage): number {
  const n = img.data.length;
  if (n === 0) return 0;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const v = img.data[i];
    s += v;
    s2 += v * v;
  }
  const mean = s / n;
  return Math.sqrt(Math.max(0, s2 / n - mean * mean));
}

/** Proxy size for an image of the given width/height under a width cap. */
export function proxySize(width: number, height: number, maxWidth: number) {
  const scale = Math.min(1, maxWidth / width);
  return {
    scale,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
