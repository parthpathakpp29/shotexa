/**
 * Row signals for pagination, computed ONCE per image from a small greyscale proxy
 * (width ≤ 360, vertical scale ≥ 0.5 so row precision stays ≤ 2 px).
 */
import type { PaginationConfig } from "./config";

export interface GrayProxy {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
  /** Proxy rows per original pixel (≤ 1). */
  scaleY: number;
}

export interface RowSignals {
  rows: number;
  scaleY: number;
  background: number;
  /** Fraction of pixels differing from the page background (bubbles, cards, photos, text). */
  content: Float32Array;
  /** Fraction of pixels with a strong horizontal gradient (glyph strokes, icons). */
  edges: Float32Array;
  /** Mean |row − previous row| / 255 (separators, background boundaries). */
  transition: Float32Array;
  /** Stroke-free run length (proxy rows) ending at / starting from each row; 0 on text rows. */
  clearUp: Int32Array;
  clearDown: Int32Array;
}

export function proxyScale(width: number, cfg: Pick<PaginationConfig, "proxyMaxWidth" | "minScaleY">) {
  const sx = Math.min(1, cfg.proxyMaxWidth / width);
  return { scaleX: sx, scaleY: Math.max(sx, cfg.minScaleY) };
}

export function computeRowSignals(g: GrayProxy, cfg: PaginationConfig): RowSignals {
  const { width: w, height: h, data } = g;
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  let background = 0;
  for (let v = 1; v < 256; v++) if (hist[v] > hist[background]) background = v;

  const content = new Float32Array(h);
  const edges = new Float32Array(h);
  const transition = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    let c = 0;
    let e = 0;
    let t = 0;
    for (let x = 0; x < w; x++) {
      const v = data[r + x];
      if (Math.abs(v - background) > cfg.contentThreshold) c++;
      if (x > 0 && Math.abs(v - data[r + x - 1]) > cfg.edgeThreshold) e++;
      if (y > 0) t += Math.abs(v - data[r - w + x]);
    }
    content[y] = c / w;
    edges[y] = e / w;
    transition[y] = y > 0 ? t / w / 255 : 0;
  }

  // Gaps are measured in stroke-free rows, whatever the background (page, bubble, card),
  // so gaps between rows INSIDE a card or bubble are usable; `content` penalises the block.
  const white = (y: number) => edges[y] <= cfg.strokeFreeEdges;
  const clearUp = new Int32Array(h);
  const clearDown = new Int32Array(h);
  for (let y = 0, run = 0; y < h; y++) {
    run = white(y) ? run + 1 : 0;
    clearUp[y] = run;
  }
  for (let y = h - 1, run = 0; y >= 0; y--) {
    run = white(y) ? run + 1 : 0;
    clearDown[y] = run;
  }
  return { rows: h, scaleY: g.scaleY, background, content, edges, transition, clearUp, clearDown };
}

/**
 * Greyscale area-average proxy built from full-width source bands (`readBand` returns RGBA rows
 * [s0, s1) copied 1:1). Engine-independent: no canvas resampling filter is involved, so
 * Chromium, Firefox and WebKit produce identical signals — and identical to the Node benchmark
 * (`downscaleGray(rgbaToGray(...))`). Memory: one band, never the whole decoded image as RGBA.
 */
export async function bandedAreaProxy(
  width: number,
  height: number,
  pw: number,
  ph: number,
  readBand: (s0: number, s1: number) => Promise<Uint8Array | Uint8ClampedArray> | Uint8Array | Uint8ClampedArray,
  opts: { bandProxyRows?: number; yieldBetweenBands?: () => Promise<void> } = {},
): Promise<Uint8Array> {
  const out = new Uint8Array(pw * ph);
  const sx = width / pw;
  const sy = height / ph;
  const colStart = new Int32Array(pw + 1);
  for (let x = 0; x <= pw; x++) colStart[x] = Math.min(width, Math.round(x * sx));
  const rowStart = (y: number) => Math.round(y * sy);
  const rowEnd = (y: number) => Math.max(rowStart(y) + 1, Math.min(height, Math.round((y + 1) * sy)));
  const acc = new Float64Array(pw);
  const band = opts.bandProxyRows ?? 256;
  for (let py0 = 0; py0 < ph; py0 += band) {
    const py1 = Math.min(ph, py0 + band);
    const s0 = rowStart(py0);
    const s1 = rowEnd(py1 - 1);
    const rgba = await readBand(s0, s1);
    for (let y = py0; y < py1; y++) {
      const y0 = rowStart(y);
      const y1 = rowEnd(y);
      acc.fill(0);
      for (let yy = y0; yy < y1; yy++) {
        const row = (yy - s0) * width * 4;
        for (let x = 0; x < pw; x++) {
          let s = 0;
          const c1 = Math.max(colStart[x] + 1, colStart[x + 1]);
          for (let xx = colStart[x]; xx < c1; xx++) {
            const p = row + xx * 4;
            s += (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
          }
          acc[x] += s / (c1 - colStart[x]);
        }
      }
      const rows = y1 - y0;
      for (let x = 0; x < pw; x++) out[y * pw + x] = Math.round(acc[x] / rows);
    }
    if (opts.yieldBetweenBands && py1 < ph) await opts.yieldBetweenBands();
  }
  return out;
}
