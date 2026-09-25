/**
 * Full-resolution composition of a stitch chain from the ORIGINAL files (never previews).
 *
 * Strategy (Spike B, `chooseOutputStrategy`):
 *  - single canvas when the output fits the canvas-area ceiling and memory budget;
 *  - tiled composition + streaming PNG encoder for tall PNG outputs (one reusable 2,048-row
 *    tile canvas; sources decoded lazily and released after their last tile);
 *  - JPEG/WebP beyond format/canvas limits → controlled EXPORT_TOO_LARGE (UI offers PNG).
 * Every result is verified against the requested size (encoders can crop silently).
 * Runs in the Image Worker; the main-thread fallback passes a DOM canvas factory.
 */
import { DEFAULT_LIMITS, type ProcessingLimits } from "@/config/limits";
import { createPngStreamEncoder } from "@/core/export/png-stream-encoder";
import { readImageSize } from "@/core/image/image-size";
import { chooseOutputStrategy, type OutputFormat } from "@/core/image/output-strategy";
import { composeTiles, createBlobBitmapProvider, type ComposePlan } from "@/core/image/tiled-compose";
import { StitchError } from "./types";

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export interface ComposeChainOptions {
  format: OutputFormat;
  quality?: number;
  signal?: { readonly aborted: boolean };
  createCanvas?: (w: number, h: number) => AnyCanvas;
  /** Called between tiles on the main-thread fallback to keep the page responsive. */
  yieldBetweenTiles?: () => Promise<void>;
  limits?: ProcessingLimits;
  /** Source dimensions (for the decoded-memory estimate). */
  sources: { width: number; height: number }[];
  onProgress?: (p: number) => void;
}

export interface ComposeChainResult {
  blob: Blob;
  width: number;
  height: number;
  strategy: "single-canvas" | "tiled-png";
  ms: number;
}

const MIME: Record<OutputFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

async function encode(c: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  const blob = "convertToBlob" in c ? await c.convertToBlob({ type, quality }) : await new Promise<Blob | null>((r) => (c as HTMLCanvasElement).toBlob(r, type, quality));
  if (!blob) throw new StitchError("INTERNAL", "encoder returned null");
  return blob;
}

export async function composeChain(images: Blob[], plan: ComposePlan, o: ComposeChainOptions): Promise<ComposeChainResult> {
  const t0 = performance.now();
  const limits = o.limits ?? DEFAULT_LIMITS;
  const make = o.createCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
  const provider = createBlobBitmapProvider(images);
  // Largest single decoded source that must be resident at once.
  const largestSourceBytes = Math.max(...o.sources.map((d) => d.width * d.height * 4), 0);
  const decision = chooseOutputStrategy(
    { width: plan.width, height: plan.height, format: o.format, largestSourceBytes },
    { offscreenCanvas: true, compressionStream: typeof CompressionStream !== "undefined" },
    limits,
  );
  const s = decision.strategy;
  let blob: Blob;
  if (s.kind === "single-canvas") {
    const canvas = make(plan.width, plan.height);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new RangeError("canvas allocation failed");
    try {
      if (o.format === "jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, plan.width, plan.height);
      }
      for (const [i, seg] of plan.segments.entries()) {
        if (o.signal?.aborted) throw new StitchError("CANCELLED");
        const bm = await provider.get(seg.source);
        ctx.drawImage(bm, 0, seg.sy, bm.width, seg.height, 0, seg.dy, bm.width, seg.height);
        o.onProgress?.((i + 1) / (plan.segments.length + 1));
        await o.yieldBetweenTiles?.();
      }
      blob = await encode(canvas, MIME[o.format], o.quality);
    } finally {
      for (const seg of plan.segments) provider.release(seg.source);
      canvas.width = 0; // a canvas that drew bitmaps pins them until reset (Spike B)
      canvas.height = 0;
    }
  } else if (s.kind === "tiled-png") {
    const encoder = createPngStreamEncoder(plan.width, plan.height);
    const total = Math.ceil(plan.height / s.tileHeight);
    try {
      await composeTiles(plan, provider, {
        tileHeight: s.tileHeight,
        signal: o.signal,
        createCanvas: make,
        onTile: async (t) => {
          await encoder.writeRows(t.ctx.getImageData(0, 0, plan.width, t.height).data, t.height);
          o.onProgress?.((t.index + 1) / (total + 1));
          await o.yieldBetweenTiles?.();
        },
      });
      blob = await encoder.finish();
    } catch (e) {
      encoder.abort();
      if ((e as Error).message === "CANCELLED") throw new StitchError("CANCELLED");
      throw e;
    }
  } else {
    // JPEG/WebP too tall for the browser encoder, or a source beyond the memory budget.
    throw new StitchError("EXPORT_TOO_LARGE", decision.reasons.join(","));
  }
  // Export verification: an encoder must never silently crop (Chromium WebP > 16,383 px).
  const size = await readImageSize(blob);
  if (!size || size.width !== plan.width || size.height !== plan.height) throw new StitchError("EXPORT_VERIFY_FAILED", `${size?.width}x${size?.height}`);
  o.onProgress?.(1);
  return { blob, width: plan.width, height: plan.height, strategy: s.kind, ms: Math.round(performance.now() - t0) };
}
