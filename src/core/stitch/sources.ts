import { cropGray, downscaleGray, rgbaToGray } from "./gray";
import type { GrayImage, StitchImageSource } from "./types";

/** Source backed by an already-decoded RGBA buffer (Node tests/benchmarks). */
export function createRgbaSource(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): StitchImageSource {
  let gray: GrayImage | null = null;
  const full = () => (gray ??= rgbaToGray(rgba, width, height));
  return {
    width,
    height,
    async getProxy(w, h) {
      return w === width && h === height ? full() : downscaleGray(full(), w, h);
    },
    async getRows(y, h, w) {
      return cropGray(full(), 0, y, Math.min(w, width), h);
    },
  };
}

type Ctx2D = OffscreenCanvasRenderingContext2D;

/**
 * Source backed by an ImageBitmap (browser worker). Pixels are only materialised for the
 * requested proxy/strip — the full-resolution image is never copied into JS memory.
 */
export function createBitmapSource(bitmap: ImageBitmap): StitchImageSource {
  const read = (canvas: OffscreenCanvas, ctx: Ctx2D): GrayImage => {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return rgbaToGray(img.data, canvas.width, canvas.height);
  };
  const context = (w: number, h: number) => {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    return { canvas, ctx };
  };
  return {
    width: bitmap.width,
    height: bitmap.height,
    async getProxy(w, h) {
      const { canvas, ctx } = context(w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, w, h);
      return read(canvas, ctx);
    },
    async getRows(y, h, w) {
      const { canvas, ctx } = context(w, h);
      ctx.drawImage(bitmap, 0, y, w, h, 0, 0, w, h);
      return read(canvas, ctx);
    },
  };
}
