import { encodeCanvas } from "@/core/image-encode/encode";
import { maskBounds, refineMask } from "./mask";
import { BackgroundRemovalError, type BackgroundRemovalRenderOptions, type BackgroundRemovalRenderResult } from "./types";

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
const context = (canvas: Canvas) => { const value = canvas.getContext("2d", { willReadFrequently: true }) as Ctx | null; if (!value) throw new BackgroundRemovalError("BACKGROUND_MEMORY_PRESSURE"); return value; };
const release = (canvas: Canvas | null) => { if (canvas) { canvas.width = 0; canvas.height = 0; } };

export const backgroundIsOpaque = (background: BackgroundRemovalRenderOptions["settings"]["background"]) => background.kind !== "transparent";
export function validateRemovalFormat(format: BackgroundRemovalRenderOptions["format"], background: BackgroundRemovalRenderOptions["settings"]["background"]) {
  if (format === "jpeg" && !backgroundIsOpaque(background)) throw new BackgroundRemovalError("BACKGROUND_JPEG_NEEDS_BACKGROUND");
  return { transparency: format !== "jpeg", opaque: backgroundIsOpaque(background) };
}

export function removalOutputPlan(mask: Uint8ClampedArray, maskWidth: number, maskHeight: number, source: { width: number; height: number }, settings: BackgroundRemovalRenderOptions["settings"]) {
  const bounds = maskBounds(mask, maskWidth, maskHeight);
  const sourceBounds = bounds ? {
    x: Math.floor(bounds.x / maskWidth * source.width), y: Math.floor(bounds.y / maskHeight * source.height),
    width: Math.ceil(bounds.width / maskWidth * source.width), height: Math.ceil(bounds.height / maskHeight * source.height),
  } : { x: 0, y: 0, width: source.width, height: source.height };
  const padding = settings.trim ? Math.max(0, Math.round(settings.subject.padding)) : 0;
  return { sourceBounds, padding, width: settings.trim ? Math.max(1, sourceBounds.width + padding * 2) : source.width, height: settings.trim ? Math.max(1, sourceBounds.height + padding * 2) : source.height };
}

function cover(ctx: Ctx, image: CanvasImageSource, iw: number, ih: number, width: number, height: number) {
  const scale = Math.max(width / iw, height / ih), w = iw * scale, h = ih * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

export async function renderRemovedBackground(image: Blob, options: BackgroundRemovalRenderOptions): Promise<BackgroundRemovalRenderResult> {
  validateRemovalFormat(options.format, options.settings.background);
  if (options.settings.background.kind === "image" && !options.backgroundImage) throw new BackgroundRemovalError("BACKGROUND_CUSTOM_IMAGE_MISSING");
  const make = options.createCanvas ?? ((width: number, height: number) => new OffscreenCanvas(width, height));
  let source: ImageBitmap | null = null, background: ImageBitmap | null = null;
  let maskCanvas: Canvas | null = null, subjectCanvas: Canvas | null = null, output: Canvas | null = null;
  try {
    if (options.signal?.aborted) throw new BackgroundRemovalError("BACKGROUND_CANCELLED");
    source = await createImageBitmap(image).catch(() => { throw new BackgroundRemovalError("BACKGROUND_DECODE_FAILED"); });
    const refined = refineMask(options.mask.data, options.mask.width, options.mask.height, options.settings.edge);
    const plan = removalOutputPlan(refined, options.mask.width, options.mask.height, options.source, options.settings);
    const sourceBounds = plan.sourceBounds, pad = plan.padding, outWidth = plan.width, outHeight = plan.height;
    maskCanvas = make(options.mask.width, options.mask.height);
    const maskCtx = context(maskCanvas);
    const rgba = maskCtx.createImageData(options.mask.width, options.mask.height);
    for (let i = 0; i < refined.length; i++) rgba.data.set([255, 255, 255, refined[i]], i * 4);
    maskCtx.putImageData(rgba, 0, 0);

    subjectCanvas = make(options.source.width, options.source.height);
    const subjectCtx = context(subjectCanvas);
    subjectCtx.drawImage(source, 0, 0, options.source.width, options.source.height);
    subjectCtx.globalCompositeOperation = "destination-in";
    subjectCtx.imageSmoothingEnabled = true;
    subjectCtx.imageSmoothingQuality = "high";
    subjectCtx.drawImage(maskCanvas, 0, 0, options.source.width, options.source.height);
    subjectCtx.globalCompositeOperation = "source-over";

    output = make(outWidth, outHeight);
    const ctx = context(output);
    const bg = options.settings.background;
    if (bg.kind === "solid") { ctx.fillStyle = bg.color; ctx.fillRect(0, 0, outWidth, outHeight); }
    else if (bg.kind === "gradient" || bg.kind === "derived") {
      const radians = bg.angle * Math.PI / 180, cx = outWidth / 2, cy = outHeight / 2, length = Math.abs(outWidth * Math.cos(radians)) + Math.abs(outHeight * Math.sin(radians));
      const gradient = ctx.createLinearGradient(cx - Math.cos(radians) * length / 2, cy - Math.sin(radians) * length / 2, cx + Math.cos(radians) * length / 2, cy + Math.sin(radians) * length / 2);
      gradient.addColorStop(0, bg.from); gradient.addColorStop(1, bg.to); ctx.fillStyle = gradient; ctx.fillRect(0, 0, outWidth, outHeight);
    } else if (bg.kind === "blur-original") {
      ctx.save(); ctx.filter = `blur(${Math.max(0, bg.blur)}px)`; cover(ctx, source, options.source.width, options.source.height, outWidth, outHeight); ctx.restore();
    } else if (bg.kind === "image" && options.backgroundImage) {
      background = await createImageBitmap(options.backgroundImage).catch(() => null); if (background) cover(ctx, background, background.width, background.height, outWidth, outHeight);
    }

    const placement = options.settings.subject;
    const baseX = options.settings.trim ? pad - sourceBounds.x : 0;
    const baseY = options.settings.trim ? pad - sourceBounds.y : 0;
    const drawWidth = options.source.width * placement.scale, drawHeight = options.source.height * placement.scale;
    const dx = baseX + (outWidth - options.source.width) / 2 + placement.x + (options.source.width - drawWidth) / 2;
    const dy = baseY + (outHeight - options.source.height) / 2 + placement.y + (options.source.height - drawHeight) / 2;
    if (placement.shadow && bg.kind !== "transparent") { ctx.save(); ctx.shadowColor = "rgba(15,23,42,.28)"; ctx.shadowBlur = Math.max(12, Math.min(outWidth, outHeight) * .035); ctx.shadowOffsetY = Math.max(5, outHeight * .018); ctx.drawImage(subjectCanvas, dx, dy, drawWidth, drawHeight); ctx.restore(); }
    ctx.drawImage(subjectCanvas, dx, dy, drawWidth, drawHeight);
    if (options.signal?.aborted) throw new BackgroundRemovalError("BACKGROUND_CANCELLED");
    const blob = await encodeCanvas(output, options.format, options.quality);
    if (!blob) throw new BackgroundRemovalError("BACKGROUND_EXPORT_FAILED");
    return { blob, width: outWidth, height: outHeight, bytes: blob.size };
  } catch (error) {
    if (error instanceof BackgroundRemovalError) throw error;
    throw new BackgroundRemovalError(error instanceof RangeError ? "BACKGROUND_MEMORY_PRESSURE" : "BACKGROUND_EXPORT_FAILED");
  } finally {
    source?.close(); background?.close(); release(maskCanvas); release(subjectCanvas); release(output);
  }
}
