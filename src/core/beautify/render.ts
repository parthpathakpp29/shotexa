/**
 * Full-resolution Beautifier export, from the ORIGINAL file (never the preview).
 *
 *   decode source once → compose (background, card, frame, screenshot) → encode → verify
 *
 * Same Blob-first pipeline as every other Shotexa export (Spike B): one canvas when the output
 * fits the canvas and memory budget, otherwise tiled PNG streaming, where each tile redraws the
 * composition offset by its row. No data URLs; bitmaps and canvases are released in `finally`.
 */
import { DEFAULT_LIMITS } from "@/config/limits";
import { createPngStreamEncoder } from "@/core/export/png-stream-encoder";
import { encodeCanvas } from "@/core/image-encode/encode";
import { toEncodeError } from "@/core/image-encode/reencode";
import { EncodeError } from "@/core/image-encode/types";
import { readImageSize } from "@/core/image/image-size";
import { chooseOutputStrategy, type OutputFormat } from "@/core/image/output-strategy";
import { decodeSource } from "@/core/image-transform/render";
import type { Size } from "@/core/image-transform/types";
import { drawBeautified } from "./draw";
import { beautifyLayout } from "./layout";
import { BeautifyError, type BeautifyLayout, type BeautifySettings } from "./types";

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface BeautifyRenderOptions {
  source: Size;
  format: OutputFormat;
  quality?: number;
  createCanvas?: (width: number, height: number) => Canvas;
  yieldBetweenTiles?: () => Promise<void>;
  signal?: { readonly aborted: boolean };
  onProgress?: (progress: number) => void;
}

export interface BeautifyRenderResult {
  blob: Blob;
  width: number;
  height: number;
  strategy: "single-canvas" | "tiled-png";
  ms: number;
}

function context(canvas: Canvas): Ctx {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new EncodeError("ENCODE_MEMORY_PRESSURE", "2d context unavailable");
  return ctx;
}

const release = (canvas: Canvas | null) => {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
};

/** How an export will run — pure, so the limits and tiling can be unit-tested. */
export function planBeautifyExport(layout: BeautifyLayout, source: Size, format: OutputFormat, compressionStream: boolean) {
  const out = layout.canvas;
  if (!(out.width >= 1 && out.height >= 1 && Number.isInteger(out.width) && Number.isInteger(out.height))) throw new BeautifyError("BEAUTIFY_INVALID", `${out.width}x${out.height}`);
  const decision = chooseOutputStrategy(
    // The whole decoded source stays resident: any output row may sample any source row.
    { width: out.width, height: out.height, format, largestSourceBytes: source.width * source.height * 4 },
    { offscreenCanvas: true, compressionStream },
    DEFAULT_LIMITS,
  );
  const kind = decision.strategy.kind;
  if (kind === "split" || kind === "reduce-or-split") throw new BeautifyError("BEAUTIFY_TOO_LARGE", decision.reasons.join(","));
  const safeTileHeight = Math.max(1, Math.floor(DEFAULT_LIMITS.maxSingleCanvasArea / out.width));
  const tileHeight = kind === "tiled-png" ? Math.min(decision.strategy.tileHeight, safeTileHeight, out.height) : out.height;
  return { out, strategy: kind, tileHeight, tiles: Math.ceil(out.height / tileHeight) };
}

export async function renderBeautified(image: Blob, settings: BeautifySettings, o: BeautifyRenderOptions): Promise<BeautifyRenderResult> {
  const started = performance.now();
  const layout = beautifyLayout(settings, o.source);
  const plan = planBeautifyExport(layout, o.source, o.format, typeof CompressionStream !== "undefined");
  // Filtered canvas draws can sample outside a tile. Until every supported engine proves the
  // same edge behaviour, refuse a tiled blurred-background export rather than risk faint seams.
  if (plan.strategy === "tiled-png" && settings.background.kind === "screenshot" && settings.background.blur > 0) {
    throw new BeautifyError("BEAUTIFY_TOO_LARGE", "BLURRED_BACKGROUND_REQUIRES_SINGLE_CANVAS");
  }
  const { out } = plan;
  const make = o.createCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
  let bitmap: ImageBitmap | null = null;
  let canvas: Canvas | null = null;
  let blob: Blob;
  try {
    bitmap = await decodeSource(image, o.source);
    if (o.signal?.aborted) throw new EncodeError("ENCODE_CANCELLED");

    if (plan.strategy === "single-canvas") {
      canvas = make(out.width, out.height);
      const ctx = context(canvas);
      drawBeautified(ctx, layout, bitmap, 1, 1, 0);
      o.onProgress?.(0.6);
      blob = (await encodeCanvas(canvas, o.format, o.quality)) ?? (() => {
        throw new EncodeError("ENCODE_MEMORY_PRESSURE", "encoder returned null");
      })();
    } else {
      const encoder = createPngStreamEncoder(out.width, out.height);
      canvas = make(out.width, plan.tileHeight);
      const ctx = context(canvas);
      try {
        for (let index = 0, y = 0; y < out.height; index++, y += plan.tileHeight) {
          if (o.signal?.aborted) throw new EncodeError("ENCODE_CANCELLED");
          const tileH = Math.min(plan.tileHeight, out.height - y);
          if (canvas.height !== tileH) canvas.height = tileH;
          ctx.clearRect(0, 0, out.width, tileH);
          drawBeautified(ctx, layout, bitmap, 1, 1, y);
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
    if (error instanceof BeautifyError) throw error;
    throw toEncodeError(error);
  } finally {
    bitmap?.close();
    release(canvas);
  }
  // Encoders can crop silently (Chromium WebP beyond 16,383 px): never hand back a wrong size.
  const size = await readImageSize(blob);
  if (!size || size.width !== out.width || size.height !== out.height) throw new EncodeError("ENCODE_VERIFY_FAILED", `${size?.width}x${size?.height}`);
  o.onProgress?.(1);
  return { blob, width: out.width, height: out.height, strategy: plan.strategy, ms: Math.round(performance.now() - started) };
}
