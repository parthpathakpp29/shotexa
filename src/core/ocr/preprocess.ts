/**
 * OCR-only preprocessing (architecture §32): pure, non-destructive raster transforms on a
 * COPY of the pixels. The original screenshot is never modified.
 *
 * Every step is benchmarked separately in Spike C; the default policy lives in
 * `choosePreprocessing()` and only uses steps the benchmark showed to help.
 */

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export type PreprocessStep = "gray" | "contrast" | "binarize" | "invert" | "sharpen" | "upscale1.5" | "upscale2";

export function toGray(img: Rgba): Gray {
  const out = new Uint8Array(img.width * img.height);
  const d = img.data;
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
  return { width: img.width, height: img.height, data: out };
}

export function grayToRgba(g: Gray): Rgba {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let i = 0, p = 0; i < g.data.length; i++, p += 4) {
    const v = g.data[i];
    out[p] = v;
    out[p + 1] = v;
    out[p + 2] = v;
    out[p + 3] = 255;
  }
  return { width: g.width, height: g.height, data: out };
}

function histogram(g: Gray): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < g.data.length; i++) h[g.data[i]]++;
  return h;
}

function percentile(h: Uint32Array, total: number, p: number): number {
  let acc = 0;
  const target = total * p;
  for (let v = 0; v < 256; v++) {
    acc += h[v];
    if (acc >= target) return v;
  }
  return 255;
}

/** Linear stretch so the lowPct..highPct percentile range covers 0..255. */
export function autoContrast(g: Gray, lowPct = 0.01, highPct = 0.99): Gray {
  const h = histogram(g);
  const lo = percentile(h, g.data.length, lowPct);
  const hi = percentile(h, g.data.length, highPct);
  const out = new Uint8Array(g.data.length);
  if (hi <= lo) return { ...g, data: g.data.slice() };
  const k = 255 / (hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((g.data[i] - lo) * k)));
  return { ...g, data: out };
}

export function otsuThreshold(g: Gray): number {
  const h = histogram(g);
  const total = g.data.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * h[v];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let v = 0; v < 256; v++) {
    wB += h[v];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += v * h[v];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = v;
    }
  }
  return thr;
}

export function binarize(g: Gray): Gray {
  const t = otsuThreshold(g);
  const out = new Uint8Array(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i] > t ? 255 : 0;
  return { ...g, data: out };
}

export function invert(g: Gray): Gray {
  const out = new Uint8Array(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = 255 - g.data[i];
  return { ...g, data: out };
}

/** Unsharp mask with a 3×3 box blur. */
export function sharpen(g: Gray, amount = 1): Gray {
  const { width: w, height: h, data } = g;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += data[yy * w + xx];
          n++;
        }
      }
      const v = data[y * w + x];
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(v + amount * (v - s / n))));
    }
  }
  return { ...g, data: out };
}

/** Bilinear upscale of a grey image. */
export function upscale(g: Gray, factor: number): Gray {
  const W = Math.round(g.width * factor);
  const H = Math.round(g.height * factor);
  const out = new Uint8Array(W * H);
  const sx = g.width / W;
  const sy = g.height / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5);
    const y0 = Math.min(g.height - 1, Math.floor(fy));
    const y1 = Math.min(g.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const x0 = Math.min(g.width - 1, Math.floor(fx));
      const x1 = Math.min(g.width - 1, x0 + 1);
      const tx = fx - x0;
      const a = g.data[y0 * g.width + x0] * (1 - tx) + g.data[y0 * g.width + x1] * tx;
      const b = g.data[y1 * g.width + x0] * (1 - tx) + g.data[y1 * g.width + x1] * tx;
      out[y * W + x] = Math.round(a * (1 - ty) + b * ty);
    }
  }
  return { width: W, height: H, data: out };
}

export interface PreprocessOutput {
  image: Gray;
  /** Recognised-image pixels per original pixel (for OcrTransform.scale). */
  scale: number;
  steps: PreprocessStep[];
}

/** Apply steps in a fixed canonical order: gray → invert → contrast → sharpen → upscale → binarize. */
export function applyPreprocessing(img: Rgba, steps: PreprocessStep[]): PreprocessOutput {
  const has = (s: PreprocessStep) => steps.includes(s);
  let g = toGray(img);
  if (has("invert")) g = invert(g);
  if (has("contrast")) g = autoContrast(g);
  if (has("sharpen")) g = sharpen(g);
  let scale = 1;
  if (has("upscale2")) scale = 2;
  else if (has("upscale1.5")) scale = 1.5;
  if (scale !== 1) g = upscale(g, scale);
  if (has("binarize")) g = binarize(g);
  return { image: g, scale, steps: ["gray", ...steps.filter((s) => s !== "gray")] };
}

export interface ImageStats {
  width: number;
  height: number;
  meanLuma: number;
  /** p95 − p5 luminance range (0–255). Low = low contrast. */
  contrastRange: number;
  /** Fraction of pixels darker than 96 (dark-mode indicator). */
  darkFraction: number;
  /**
   * Median height (px) of horizontal ink bands — a cheap text-line-height estimate from a
   * row projection profile. 0 if no bands found.
   */
  medianLineHeight: number;
}

export function imageStats(img: Rgba): ImageStats {
  const g = toGray(img);
  const h = histogram(g);
  const n = g.data.length;
  let sum = 0;
  let dark = 0;
  for (let v = 0; v < 256; v++) {
    sum += v * h[v];
    if (v < 96) dark += h[v];
  }
  const meanLuma = sum / n;
  const contrastRange = percentile(h, n, 0.95) - percentile(h, n, 0.05);
  return { width: img.width, height: img.height, meanLuma, contrastRange, darkFraction: dark / n, medianLineHeight: estimateLineHeight(g) };
}

/**
 * Row projection: a row is "ink" if ≥ 0.5% of its sampled pixels differ from the row median
 * (≈ background) by more than 40% of the image's contrast range. Consecutive ink rows form a band.
 */
export function estimateLineHeight(g: Gray): number {
  const { width: w, height: h, data } = g;
  // Ink threshold relative to the image's own contrast, so low-contrast text still registers.
  const hist = histogram(g);
  const range = percentile(hist, data.length, 0.995) - percentile(hist, data.length, 0.005);
  const inkDelta = Math.max(16, range * 0.4);
  const ink = new Uint8Array(h);
  const step = Math.max(1, Math.floor(w / 400));
  const buf: number[] = [];
  for (let y = 0; y < h; y++) {
    buf.length = 0;
    for (let x = 0; x < w; x += step) buf.push(data[y * w + x]);
    const sorted = [...buf].sort((a, b) => a - b);
    const bg = sorted[sorted.length >> 1];
    let c = 0;
    for (const v of buf) if (Math.abs(v - bg) > inkDelta) c++;
    ink[y] = c >= Math.max(2, buf.length * 0.005) ? 1 : 0;
  }
  const bands: number[] = [];
  let run = 0;
  for (let y = 0; y <= h; y++) {
    if (y < h && ink[y]) run++;
    else {
      if (run >= 3) bands.push(run);
      run = 0;
    }
  }
  if (!bands.length) return 0;
  bands.sort((a, b) => a - b);
  return bands[bands.length >> 1];
}

export interface PreprocessPolicy {
  /** Upscale ×2 when the estimated text-line height is below this (px). */
  upscaleBelowLineHeight: number;
  /**
   * Never upscale if the UPSCALED image would exceed this many pixels. Spike C: a 1280×800
   * capture upscaled ×2 (4.1 M px) already peaked at ~+300 MiB in Chromium.
   */
  maxUpscalePixels: number;
  /** Apply contrast stretch when p95−p5 range is below this. */
  contrastBelowRange: number;
  /** Invert when this fraction of pixels is dark (dark mode). */
  invertAboveDarkFraction: number;
}

/** PROVISIONAL — set from the Spike C benchmark (docs/spikes/SPIKE_C_OCR.md). */
export const DEFAULT_PREPROCESS_POLICY: PreprocessPolicy = {
  // Spike C: ×2 helped every fixture with estimated line height ≤ 17 px (tiny phone text,
  // code, receipts) and hurt every fixture ≥ 23 px (DPR 2–3 chat, HiDPI code).
  upscaleBelowLineHeight: 18,
  maxUpscalePixels: 4_200_000,
  // Disabled (< 0): contrast stretch did not improve the low-contrast/blur/JPEG fixtures,
  // which Tesseract already reads at ≤ 0.3% CER.
  contrastBelowRange: -1,
  // Disabled (> 1): inversion did not help dark themes (Tesseract handles light-on-dark).
  invertAboveDarkFraction: 2,
};

export function choosePreprocessing(stats: ImageStats, policy: PreprocessPolicy = DEFAULT_PREPROCESS_POLICY): PreprocessStep[] {
  const steps: PreprocessStep[] = [];
  if (stats.darkFraction > policy.invertAboveDarkFraction) steps.push("invert");
  if (stats.contrastRange < policy.contrastBelowRange) steps.push("contrast");
  if (
    stats.medianLineHeight > 0 &&
    stats.medianLineHeight < policy.upscaleBelowLineHeight &&
    stats.width * stats.height * 4 <= policy.maxUpscalePixels
  ) {
    steps.push("upscale2");
  }
  return steps;
}
