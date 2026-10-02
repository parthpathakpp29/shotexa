/**
 * Full-resolution Combine export. It deliberately shares the same Blob-first strategy as
 * Smart Stitch: one worker job, ImageBitmaps closed as soon as their last tile is emitted,
 * no data URLs, and post-encode dimension verification.
 */
import { DEFAULT_LIMITS } from "@/config/limits";
import { createPngStreamEncoder } from "@/core/export/png-stream-encoder";
import { readImageSize } from "@/core/image/image-size";
import { chooseOutputStrategy, type OutputFormat } from "@/core/image/output-strategy";
import { encodeCanvas } from "@/core/image-encode/encode";
import { createBlobBitmapProvider } from "@/core/image/tiled-compose";
import { CombineError } from "./errors";
import type { CombineComposeOptions, CombineComposeResult, CombinePlan } from "./types";

type Canvas = OffscreenCanvas | HTMLCanvasElement;
async function encode(canvas: Canvas, format: OutputFormat, quality?: number): Promise<Blob> {
  const blob = await encodeCanvas(canvas, format, quality);
  if (!blob) throw new CombineError("COMBINE_MEMORY_PRESSURE", "encoder returned null");
  return blob;
}

function tileResidentBytes(plan: CombinePlan, sources: { width: number; height: number }[], tileHeight: number): number {
  let peak = 0;
  for (let y = 0; y < plan.height; y += tileHeight) {
    const bottom = Math.min(plan.height, y + tileHeight);
    const live = new Set(plan.placements.filter((p) => p.y < bottom && p.y + p.height > y).map((p) => p.source));
    peak = Math.max(peak, [...live].reduce((total, source) => total + sources[source].width * sources[source].height * 4, 0));
  }
  return peak;
}

function lastTile(plan: CombinePlan, tileHeight: number) {
  const last = new Map<number, number>();
  for (const p of plan.placements) last.set(p.source, Math.floor((p.y + p.height - 1) / tileHeight));
  return last;
}

function paintBackground(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, plan: CombinePlan, width: number, height: number, format: OutputFormat) {
  const color = plan.background ?? (format === "jpeg" ? "#ffffff" : undefined);
  if (!color) return;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

export async function composeCombine(images: Blob[], plan: CombinePlan, options: CombineComposeOptions): Promise<CombineComposeResult> {
  if (images.length < 2 || plan.placements.length !== images.length || plan.width < 1 || plan.height < 1) throw new CombineError("COMBINE_INVALID_LAYOUT");
  const started = performance.now();
  const make = options.createCanvas ?? ((width, height) => new OffscreenCanvas(width, height));
  // Source dimensions are decoded from each Blob only when drawn. We use image headers for
  // preflight below so different layout scaling never affects the decoded-memory estimate.
  const dimensions = await Promise.all(images.map(async (blob) => {
    const size = await readImageSize(blob);
    if (!size) throw new CombineError("COMBINE_INVALID_LAYOUT");
    return size;
  }));
  const width = plan.width;
  const safeTileHeight = Math.min(DEFAULT_LIMITS.tileHeight, Math.max(1, Math.floor(DEFAULT_LIMITS.maxSingleCanvasArea / width)));
  if (width > DEFAULT_LIMITS.maxSingleCanvasArea || safeTileHeight < 1) throw new CombineError("COMBINE_EXPORT_TOO_LARGE", "CANVAS_WIDTH_LIMIT");
  const residentBytes = tileResidentBytes(plan, dimensions, safeTileHeight);
  const decision = chooseOutputStrategy(
    { width, height: plan.height, format: options.format, largestSourceBytes: residentBytes },
    { offscreenCanvas: true, compressionStream: typeof CompressionStream !== "undefined" },
    DEFAULT_LIMITS,
  );
  if (decision.strategy.kind === "split" || decision.strategy.kind === "reduce-or-split") throw new CombineError("COMBINE_EXPORT_TOO_LARGE", decision.reasons.join(","));
  const provider = createBlobBitmapProvider(images);
  let blob: Blob;
  try {
    if (decision.strategy.kind === "single-canvas") {
      const canvas = make(width, plan.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!ctx) throw new CombineError("COMBINE_MEMORY_PRESSURE");
      try {
        paintBackground(ctx, plan, width, plan.height, options.format);
        for (const [index, placement] of plan.placements.entries()) {
          if (options.signal?.aborted) throw new CombineError("COMBINE_CANCELLED");
          const bitmap = await provider.get(placement.source);
          ctx.drawImage(bitmap, placement.x, placement.y, placement.width, placement.height);
          provider.release(placement.source);
          options.onProgress?.((index + 1) / (plan.placements.length + 1));
          await options.yieldBetweenTiles?.();
        }
        blob = await encode(canvas, options.format, options.quality);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    } else {
      const tileHeight = Math.min(decision.strategy.tileHeight, safeTileHeight);
      const encoder = createPngStreamEncoder(width, plan.height);
      const canvas = make(width, Math.min(tileHeight, plan.height));
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!ctx) throw new CombineError("COMBINE_MEMORY_PRESSURE");
      const lastUse = lastTile(plan, tileHeight);
      const released = new Set<number>();
      try {
        const total = Math.ceil(plan.height / tileHeight);
        for (let index = 0, y = 0; y < plan.height; index++, y += tileHeight) {
          if (options.signal?.aborted) throw new CombineError("COMBINE_CANCELLED");
          const tileH = Math.min(tileHeight, plan.height - y);
          if (canvas.height !== tileH) canvas.height = tileH;
          ctx.clearRect(0, 0, width, tileH);
          paintBackground(ctx, plan, width, tileH, "png");
          for (const placement of plan.placements) {
            const top = Math.max(y, placement.y);
            const bottom = Math.min(y + tileH, placement.y + placement.height);
            if (bottom <= top) continue;
            const bitmap = await provider.get(placement.source);
            const scaleY = placement.height / bitmap.height;
            const sourceY = (top - placement.y) / scaleY;
            const sourceHeight = (bottom - top) / scaleY;
            ctx.drawImage(bitmap, 0, sourceY, bitmap.width, sourceHeight, placement.x, top - y, placement.width, bottom - top);
          }
          await encoder.writeRows(ctx.getImageData(0, 0, width, tileH).data, tileH);
          for (const [source, last] of lastUse) if (last <= index && !released.has(source)) {
            provider.release(source);
            released.add(source);
          }
          options.onProgress?.((index + 1) / (total + 1));
          await options.yieldBetweenTiles?.();
        }
        blob = await encoder.finish();
      } catch (error) {
        encoder.abort();
        throw error;
      } finally {
        for (const source of lastUse.keys()) if (!released.has(source)) provider.release(source);
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } catch (error) {
    if (error instanceof CombineError) throw error;
    if (error instanceof RangeError) throw new CombineError("COMBINE_MEMORY_PRESSURE");
    throw error;
  }
  const size = await readImageSize(blob);
  if (!size || size.width !== width || size.height !== plan.height) throw new CombineError("COMBINE_EXPORT_VERIFY_FAILED", `${size?.width}x${size?.height}`);
  options.onProgress?.(1);
  return { blob, width, height: plan.height, strategy: decision.strategy.kind, ms: Math.round(performance.now() - started) };
}
