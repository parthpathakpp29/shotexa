/**
 * Full-resolution comparison export, from the ORIGINAL files (never the previews).
 *
 *   decode A and B → compose the comparison → encode → verify dimensions
 *
 * One canvas: every mode needs both screenshots resident, and difference reads the rasterised
 * pixels back, so there is no tiled path here. A comparison that will not fit is refused with a
 * controlled code instead of producing a truncated image. Bitmaps and canvases are released in
 * `finally`; no data URLs.
 */
import { DEFAULT_LIMITS } from "@/config/limits";
import { encodeCanvas } from "@/core/image-encode/encode";
import { toEncodeError } from "@/core/image-encode/reencode";
import { EncodeError } from "@/core/image-encode/types";
import { readImageSize } from "@/core/image/image-size";
import { decodedBytes, type OutputFormat } from "@/core/image/output-strategy";
import { decodeSource } from "@/core/image-transform/render";
import type { Size } from "@/core/image-transform/types";
import { drawCompare } from "./draw";
import { compareLayout } from "./layout";
import { CompareError, type CompareSettings } from "./types";

type Canvas = OffscreenCanvas | HTMLCanvasElement;

export interface CompareRenderOptions {
  a: Size;
  b: Size;
  format: OutputFormat;
  quality?: number;
  createCanvas?: (width: number, height: number) => Canvas;
  signal?: { readonly aborted: boolean };
  onProgress?: (progress: number) => void;
}

export interface CompareRenderResult {
  blob: Blob;
  width: number;
  height: number;
  ms: number;
}

const release = (canvas: Canvas | null) => {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
};

/** Can this comparison be rendered in a browser? Pure, so the UI can warn before decoding. */
export function compareIssue(canvas: Size, mode: CompareSettings["mode"], a: Size, b: Size): "too-large" | "format-dimension" | null {
  const limits = DEFAULT_LIMITS;
  if (canvas.height > limits.maxSingleCanvasHeight || canvas.width * canvas.height > limits.maxSingleCanvasArea) return "too-large";
  // Both sources stay decoded, plus the canvas — and difference holds two more full buffers.
  const buffers = mode === "difference" ? 3 : 1;
  const peak = decodedBytes(canvas.width, canvas.height) * buffers + decodedBytes(a.width, a.height) + decodedBytes(b.width, b.height);
  return peak > limits.softBudgetBytes ? "too-large" : null;
}

export async function renderCompare(imageA: Blob, imageB: Blob, settings: CompareSettings, o: CompareRenderOptions): Promise<CompareRenderResult> {
  const started = performance.now();
  const layout = compareLayout(settings, { size: o.a, name: "" }, { size: o.b, name: "" });
  const out = layout.canvas;
  if (compareIssue(out, layout.mode, o.a, o.b)) throw new CompareError("COMPARE_TOO_LARGE", `${out.width}x${out.height}`);
  const make = o.createCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
  let bitmapA: ImageBitmap | null = null;
  let bitmapB: ImageBitmap | null = null;
  let canvas: Canvas | null = null;
  let blob: Blob;
  try {
    bitmapA = await decodeSource(imageA, o.a);
    o.onProgress?.(0.25);
    bitmapB = await decodeSource(imageB, o.b);
    o.onProgress?.(0.5);
    if (o.signal?.aborted) throw new EncodeError("ENCODE_CANCELLED");
    canvas = make(out.width, out.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: layout.mode === "difference" });
    if (!ctx) throw new EncodeError("ENCODE_MEMORY_PRESSURE", "2d context unavailable");
    drawCompare(ctx as never, layout, { image: bitmapA, imageScale: 1 }, { image: bitmapB, imageScale: 1 }, out.width, out.height, { scale: 1, createCanvas: make });
    o.onProgress?.(0.8);
    blob = (await encodeCanvas(canvas, o.format, o.quality)) ?? (() => {
      throw new EncodeError("ENCODE_MEMORY_PRESSURE", "encoder returned null");
    })();
  } catch (error) {
    if (error instanceof CompareError) throw error;
    throw toEncodeError(error);
  } finally {
    bitmapA?.close();
    bitmapB?.close();
    release(canvas);
  }
  // Encoders can crop silently (Chromium WebP beyond 16,383 px): never hand back a wrong size.
  const size = await readImageSize(blob);
  if (!size || size.width !== out.width || size.height !== out.height) throw new EncodeError("ENCODE_VERIFY_FAILED", `${size?.width}x${size?.height}`);
  o.onProgress?.(1);
  return { blob, width: out.width, height: out.height, ms: Math.round(performance.now() - started) };
}
