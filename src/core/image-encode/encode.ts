/**
 * The one canvas → Blob step every Shotexa export uses. Returns null when the browser's encoder
 * gives up (usually memory), so each caller can raise its own controlled error.
 */
import { FORMAT_MIME, encoderQuality, supportsAlpha, type OutputFormat } from "./formats";

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export async function encodeCanvas(canvas: Canvas, format: OutputFormat, quality?: number): Promise<Blob | null> {
  const type = FORMAT_MIME[format];
  const q = quality === undefined ? undefined : encoderQuality(format, quality);
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality: q });
  return new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, q));
}

/** Default background for formats without transparency (JPEG). */
export const DEFAULT_BACKGROUND = "#ffffff";

/**
 * Prepare a fresh canvas area before drawing: for JPEG, paint the background so transparent
 * pixels become that colour (never the encoder's implicit black); otherwise leave it clear.
 */
export function prepareBackground(ctx: Ctx, format: OutputFormat, width: number, height: number, background: string = DEFAULT_BACKGROUND) {
  if (supportsAlpha(format)) {
    ctx.clearRect(0, 0, width, height);
    return;
  }
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
}
