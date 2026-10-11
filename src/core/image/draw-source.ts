/**
 * One safe `drawImage` for every renderer that draws from a downscaled preview bitmap.
 *
 * A preview is the original resized by a factor and then ROUNDED to whole pixels, so
 * `source × imageScale` routinely overshoots the bitmap by a fraction of a pixel. The HTML
 * spec says such a source rectangle is clipped to the intersection; WebKit instead draws
 * nothing at all, which silently blanks the whole screenshot in a preview. Clamping the
 * source rectangle here — and shrinking the destination by the same ratio, so the placement
 * stays exact to a fraction of a pixel — keeps every engine drawing the same picture.
 */
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Intrinsic size of whatever we were handed, when it exposes one. */
export function intrinsicSize(image: CanvasImageSource): { width: number; height: number } | null {
  const candidate = image as { width?: number | { baseVal?: number }; height?: number | { baseVal?: number }; videoWidth?: number; videoHeight?: number };
  if (typeof candidate.width === "number" && typeof candidate.height === "number") return { width: candidate.width, height: candidate.height };
  if (typeof candidate.videoWidth === "number" && typeof candidate.videoHeight === "number") return { width: candidate.videoWidth, height: candidate.videoHeight };
  return null;
}

export function drawImageClamped(
  ctx: Ctx,
  image: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  let sourceWidth = Math.max(1, sw);
  let sourceHeight = Math.max(1, sh);
  let destWidth = dw;
  let destHeight = dh;
  const size = intrinsicSize(image);
  if (size && size.width > 0 && size.height > 0) {
    const maxWidth = Math.max(0, size.width - sx);
    const maxHeight = Math.max(0, size.height - sy);
    if (maxWidth <= 0 || maxHeight <= 0) return;
    if (sourceWidth > maxWidth) {
      destWidth *= maxWidth / sourceWidth;
      sourceWidth = maxWidth;
    }
    if (sourceHeight > maxHeight) {
      destHeight *= maxHeight / sourceHeight;
      sourceHeight = maxHeight;
    }
  }
  ctx.drawImage(image, sx, sy, sourceWidth, sourceHeight, dx, dy, destWidth, destHeight);
}
