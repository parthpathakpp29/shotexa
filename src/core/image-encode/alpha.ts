/**
 * Does an image have transparent pixels? Checked on the ≤ 4 MP workspace preview (never the
 * full-resolution file) so the JPEG background choice can say whether it matters. Downscaling
 * keeps any partially transparent area below 255, so a real transparent region is still seen.
 */

/** True if any pixel's alpha is below 255 (RGBA bytes). */
export function scanAlpha(rgba: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

export function bitmapHasAlpha(bitmap: ImageBitmap, createCanvas?: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement): boolean {
  const make = createCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
  const canvas = make(bitmap.width, bitmap.height);
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) return false;
    ctx.clearRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    // Row bands keep the readback buffer small on tall previews.
    const band = Math.max(1, Math.floor(1_000_000 / Math.max(1, bitmap.width)));
    for (let y = 0; y < bitmap.height; y += band) {
      if (scanAlpha(ctx.getImageData(0, y, bitmap.width, Math.min(band, bitmap.height - y)).data)) return true;
    }
    return false;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
