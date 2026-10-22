import { BackgroundRemovalError, type InkMatte, type SegmentationResult } from "./types";

type RGB = [number, number, number];
const distance = (a: RGB, b: RGB) => a.reduce((sum, value, c) => sum + (value - b[c]) ** 2, 0);

/**
 * A deliberately narrow alternative to object segmentation: one ink colour on
 * uniform paper. Estimate paper from the border and undo its antialias matte.
 * Never runs automatically on photographs or multicolour artwork.
 */
export function detectInk(pixels: Uint8ClampedArray, width: number, height: number) {
  if (pixels.length !== width * height * 4) throw new RangeError("Invalid image dimensions");
  const border: RGB[] = [];
  const read = (i: number): RGB => [pixels[i], pixels[i + 1], pixels[i + 2]];
  const step = Math.max(1, Math.floor(Math.max(width, height) / 256));
  for (let x = 0; x < width; x += step) for (const y of [0, height - 1]) border.push(read((y * width + x) * 4));
  for (let y = 0; y < height; y += step) for (const x of [0, width - 1]) border.push(read((y * width + x) * 4));
  const background = [0, 1, 2].map(c => border.map(p => p[c]).sort((a, b) => a - b)[Math.floor(border.length / 2)]) as RGB;
  if (border.filter(p => distance(p, background) < 18 ** 2).length / border.length < .95) {
    throw new BackgroundRemovalError("BACKGROUND_INK_UNSUITABLE");
  }
  let foreground = background, greatest = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 250) throw new BackgroundRemovalError("BACKGROUND_INK_UNSUITABLE");
    const d = (pixels[i] - background[0]) ** 2 + (pixels[i + 1] - background[1]) ** 2 + (pixels[i + 2] - background[2]) ** 2;
    if (d > greatest) { greatest = d; foreground = read(i); }
  }
  if (greatest < 40 ** 2) throw new BackgroundRemovalError("BACKGROUND_INK_UNSUITABLE");
  const matte: InkMatte = { background, foreground };
  const mask = new Uint8ClampedArray(width * height);
  let colored = 0, inconsistent = 0;
  for (let i = 0; i < mask.length; i++) {
    const alpha = inkCoverage(pixels, matte, i * 4);
    mask[i] = Math.round(alpha * 255);
    if (alpha > .1) {
      colored++;
      let residual = 0;
      for (let c = 0; c < 3; c++) residual += (pixels[i * 4 + c] - background[c] - alpha * (foreground[c] - background[c])) ** 2;
      if (residual > 24 ** 2) inconsistent++;
    }
  }
  if (inconsistent > colored * .08) throw new BackgroundRemovalError("BACKGROUND_INK_UNSUITABLE");
  return { mask, matte };
}

export function inkCoverage(color: ArrayLike<number>, matte: InkMatte, offset = 0) {
  let dot = 0, norm = 0;
  for (let c = 0; c < 3; c++) {
    const direction = matte.foreground[c] - matte.background[c];
    dot += (color[offset + c] - matte.background[c]) * direction;
    norm += direction * direction;
  }
  return Math.max(0, Math.min(1, dot / Math.max(1, norm)));
}

/** Remove paper contamination at partially covered pixels, preserving solid ink. */
export function unmatteInk(pixels: Uint8ClampedArray, matte: InkMatte) {
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = inkCoverage(pixels, matte, i);
    if (alpha <= 0 || alpha >= .995) continue;
    for (let c = 0; c < 3; c++) pixels[i + c] = Math.round((pixels[i + c] - (1 - alpha) * matte.background[c]) / alpha);
  }
}

export async function segmentInk(image: Blob, signal: { readonly aborted: boolean }, make = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement => new OffscreenCanvas(w, h)): Promise<SegmentationResult> {
  const started = performance.now();
  let bitmap: ImageBitmap | undefined;
  let canvas: OffscreenCanvas | HTMLCanvasElement | undefined;
  try {
    if (signal.aborted) throw new BackgroundRemovalError("BACKGROUND_CANCELLED");
    bitmap = await createImageBitmap(image);
    if (bitmap.width * bitmap.height > 16_000_000) throw new BackgroundRemovalError("BACKGROUND_INK_TOO_LARGE");
    canvas = make(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    if (!ctx) throw new BackgroundRemovalError("BACKGROUND_MEMORY_PRESSURE");
    ctx.drawImage(bitmap, 0, 0);
    const { mask, matte } = detectInk(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height);
    if (signal.aborted) throw new BackgroundRemovalError("BACKGROUND_CANCELLED");
    return { mask, matte, width: bitmap.width, height: bitmap.height, provider: "local", model: "single-ink", modelBytes: 0, modelLoadMs: 0, inferenceMs: Math.round(performance.now() - started), sessionReused: false };
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
