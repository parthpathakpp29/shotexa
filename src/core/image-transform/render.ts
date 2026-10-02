/**
 * Full-resolution Screenshot Editor export, from the ORIGINAL file (never the preview).
 *
 *   decode source → crop → rotate → flip → resize → encode → verify dimensions
 *
 * Same Blob-first pipeline as Smart Stitch and Combine (Spike B): one canvas when the output
 * fits the canvas and memory budget, otherwise tiled PNG streaming, where each tile redraws
 * the transformed source offset by its row so every output row is written exactly once.
 * No data URLs; bitmaps and canvases are released in `finally`.
 */
import { DEFAULT_LIMITS } from "@/config/limits";
import { createPngStreamEncoder } from "@/core/export/png-stream-encoder";
import { readImageSize } from "@/core/image/image-size";
import { chooseOutputStrategy, type OutputFormat } from "@/core/image/output-strategy";
import { encodeCanvas, prepareBackground } from "@/core/image-encode/encode";
import { drawTransformed } from "./matrix";
import { isValidTransform, outputIssue, outputSize } from "./transform";
import { EditorError, type ImageTransform, type TransformExportOptions, type TransformExportResult } from "./types";

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
async function encode(canvas: Canvas, format: TransformExportOptions["format"], quality?: number): Promise<Blob> {
  const blob = await encodeCanvas(canvas, format, quality);
  if (!blob) throw new EditorError("EDITOR_MEMORY_PRESSURE", "encoder returned null");
  return blob;
}

function context(canvas: Canvas): Ctx {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new EditorError("EDITOR_MEMORY_PRESSURE", "2d context unavailable");
  return ctx;
}

const release = (canvas: Canvas | null) => {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
};

/** How an export will run — pure, so the limits and tiling can be unit-tested. */
export function planTransformExport(t: ImageTransform, source: { width: number; height: number }, format: OutputFormat, compressionStream: boolean) {
  if (!isValidTransform(t, source)) throw new EditorError("EDITOR_INVALID_TRANSFORM");
  const out = outputSize(t, source);
  if (outputIssue(out)) throw new EditorError("EDITOR_EXPORT_TOO_LARGE", outputIssue(out)!);
  const decision = chooseOutputStrategy(
    // The whole decoded source stays resident: any output row may sample any source row.
    { width: out.width, height: out.height, format, largestSourceBytes: source.width * source.height * 4 },
    { offscreenCanvas: true, compressionStream },
    DEFAULT_LIMITS,
  );
  const kind = decision.strategy.kind;
  if (kind === "split" || kind === "reduce-or-split") throw new EditorError("EDITOR_EXPORT_TOO_LARGE", decision.reasons.join(","));
  // One tile never exceeds the single-canvas area ceiling, whatever the output width.
  const safeTileHeight = Math.max(1, Math.floor(DEFAULT_LIMITS.maxSingleCanvasArea / out.width));
  const tileHeight = kind === "tiled-png" ? Math.min(decision.strategy.tileHeight, safeTileHeight, out.height) : out.height;
  return { out, strategy: kind, tileHeight, tiles: Math.ceil(out.height / tileHeight) };
}

/**
 * Decode the ORIGINAL file once, refusing a decoder that disagrees with the header size: every
 * crop and split row was authored against the header dimensions, and a reoriented decode (e.g.
 * EXIF rotation) would silently misplace them. The caller owns — and must close — the bitmap.
 */
export async function decodeSource(image: Blob, source: { width: number; height: number }): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(image).catch(() => {
    throw new EditorError("EDITOR_DECODE_FAILED");
  });
  if (bitmap.width !== source.width || bitmap.height !== source.height) {
    bitmap.close();
    throw new EditorError("EDITOR_SOURCE_MISMATCH", `${bitmap.width}x${bitmap.height}`);
  }
  return bitmap;
}

export async function renderTransform(image: Blob, t: ImageTransform, o: TransformExportOptions): Promise<TransformExportResult> {
  planTransformExport(t, o.source, o.format, typeof CompressionStream !== "undefined"); // fail fast, before decoding
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeSource(image, o.source);
    return await renderDecoded(bitmap, t, o);
  } catch (error) {
    if (error instanceof EditorError) throw error;
    if (error instanceof RangeError) throw new EditorError("EDITOR_MEMORY_PRESSURE");
    throw new EditorError("EDITOR_MEMORY_PRESSURE", String(error));
  } finally {
    bitmap?.close();
  }
}

/**
 * Render one transform from an already-decoded source. Split renders every piece from a single
 * decode through here; the bitmap is left open for the caller.
 */
export async function renderDecoded(bitmap: ImageBitmap, t: ImageTransform, o: TransformExportOptions): Promise<TransformExportResult> {
  const started = performance.now();
  const plan = planTransformExport(t, o.source, o.format, typeof CompressionStream !== "undefined");
  const { out } = plan;
  const make = o.createCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
  let canvas: Canvas | null = null;
  let blob: Blob;
  try {
    if (o.signal?.aborted) throw new EditorError("EDITOR_CANCELLED");

    if (plan.strategy === "single-canvas") {
      canvas = make(out.width, out.height);
      const ctx = context(canvas);
      // JPEG has no transparency: paint the chosen background (white by default), never black.
      prepareBackground(ctx, o.format, out.width, out.height, o.background);
      drawTransformed(ctx, bitmap, 1, t, o.source, out);
      o.overlay?.(ctx, out, 0);
      o.onProgress?.(0.6);
      blob = await encode(canvas, o.format, o.quality);
    } else {
      const encoder = createPngStreamEncoder(out.width, out.height);
      canvas = make(out.width, plan.tileHeight);
      const ctx = context(canvas);
      try {
        for (let index = 0, y = 0; y < out.height; index++, y += plan.tileHeight) {
          if (o.signal?.aborted) throw new EditorError("EDITOR_CANCELLED");
          const tileH = Math.min(plan.tileHeight, out.height - y);
          if (canvas.height !== tileH) canvas.height = tileH;
          ctx.clearRect(0, 0, out.width, tileH);
          drawTransformed(ctx, bitmap, 1, t, o.source, out, y);
          o.overlay?.(ctx, out, y);
          await encoder.writeRows(ctx.getImageData(0, 0, out.width, tileH).data, tileH);
          o.onProgress?.((index + 1) / (plan.tiles + 1));
          await o.yieldBetweenTiles?.();
        }
        blob = await encoder.finish();
      } catch (error) {
        encoder.abort();
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof EditorError) throw error;
    if (error instanceof RangeError) throw new EditorError("EDITOR_MEMORY_PRESSURE");
    throw new EditorError("EDITOR_MEMORY_PRESSURE", String(error));
  } finally {
    release(canvas);
  }
  // Encoders can crop silently (Chromium WebP beyond 16,383 px): never hand back a wrong size.
  const size = await readImageSize(blob);
  if (!size || size.width !== out.width || size.height !== out.height) throw new EditorError("EDITOR_EXPORT_VERIFY_FAILED", `${size?.width}x${size?.height}`);
  o.onProgress?.(1);
  return { blob, width: out.width, height: out.height, strategy: plan.strategy, ms: Math.round(performance.now() - started) };
}
