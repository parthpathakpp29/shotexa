/**
 * Worker-side OCR preparation (runs in the image worker; needs OffscreenCanvas).
 * Decodes the screenshot ONCE, optionally cuts horizontal strips (long screenshots),
 * applies OCR-only preprocessing to copies, and encodes each part as PNG for the OCR engine.
 * The original Blob is never modified; if nothing needs changing it is passed through.
 */
import { applyPreprocessing, choosePreprocessing, grayToRgba, imageStats, type ImageStats, type PreprocessStep } from "./preprocess";

export interface PreparedPart {
  image: Blob;
  /** Recognised pixels per original pixel. */
  scale: number;
  /** Original-image row where this part starts. */
  y: number;
  height: number;
}

export interface PreparedImage {
  parts: PreparedPart[];
  steps: PreprocessStep[];
  stats: ImageStats;
  width: number;
  height: number;
  decodeMs: number;
  prepMs: number;
  encodeMs: number;
}

export class PrepareError extends Error {
  constructor(readonly code: "OCR_DECODE_FAILED" | "OCR_OUT_OF_MEMORY" | "CANCELLED") {
    super(code);
  }
}

export async function prepareForOcr(
  image: Blob,
  steps: PreprocessStep[] | "auto",
  strips?: { y: number; height: number }[],
  signal?: { readonly aborted: boolean },
): Promise<PreparedImage> {
  const t0 = performance.now();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    throw new PrepareError("OCR_DECODE_FAILED");
  }
  const { width, height } = bitmap;
  const decodeMs = performance.now() - t0;
  let prepMs = 0;
  let encodeMs = 0;
  try {
    // Stats from a bounded sample (first 4000 rows) so huge images don't need a full RGBA copy.
    const sampleH = Math.min(height, 4000);
    const sample = readRows(bitmap, 0, sampleH);
    const t1 = performance.now();
    const stats = { ...imageStats(sample), height };
    const chosen = steps === "auto" ? choosePreprocessing(stats) : steps;
    prepMs += performance.now() - t1;
    const regions = strips?.length ? strips : [{ y: 0, height }];
    if (chosen.length === 0 && regions.length === 1) {
      return { parts: [{ image, scale: 1, y: 0, height }], steps: [], stats, width, height, decodeMs, prepMs, encodeMs };
    }
    const parts: PreparedPart[] = [];
    let applied: PreprocessStep[] = [];
    for (const r of regions) {
      if (signal?.aborted) throw new PrepareError("CANCELLED");
      const rgba = readRows(bitmap, r.y, r.height);
      const t2 = performance.now();
      let px: { width: number; height: number; data: Uint8ClampedArray | Uint8Array } = rgba;
      let scale = 1;
      if (chosen.length) {
        const out = applyPreprocessing(rgba, chosen);
        px = grayToRgba(out.image);
        scale = out.scale;
        applied = out.steps;
      }
      prepMs += performance.now() - t2;
      const t3 = performance.now();
      const enc = new OffscreenCanvas(px.width, px.height);
      enc.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
      parts.push({ image: await enc.convertToBlob({ type: "image/png" }), scale, y: r.y, height: r.height });
      enc.width = 0; // release promptly (Spike B canvas hygiene)
      encodeMs += performance.now() - t3;
    }
    return { parts, steps: applied, stats, width, height, decodeMs, prepMs, encodeMs };
  } finally {
    bitmap.close();
  }
}

function readRows(bitmap: ImageBitmap, y: number, h: number): ImageData {
  const c = new OffscreenCanvas(bitmap.width, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new PrepareError("OCR_OUT_OF_MEMORY");
  ctx.drawImage(bitmap, 0, y, bitmap.width, h, 0, 0, bitmap.width, h);
  const data = ctx.getImageData(0, 0, bitmap.width, h);
  c.width = 0; // the canvas drew the bitmap: reset so it does not pin decoded pixels (Spike B)
  return data;
}
