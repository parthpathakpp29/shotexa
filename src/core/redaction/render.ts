import { readImageSize } from "@/core/image/image-size";
import { runMetadataClean } from "@/core/metadata/run";
import { clampRect } from "./geometry";
import { RedactionError, type Redaction, type SafeShareExportResult } from "./types";

type CanvasLike = OffscreenCanvas | HTMLCanvasElement;
type ContextLike = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
export type RedactionCanvasFactory = (width: number, height: number) => CanvasLike;

export interface RenderRedactionsOptions {
  format: "png" | "jpeg" | "webp";
  quality?: number;
  createCanvas?: RedactionCanvasFactory;
  signal?: { readonly aborted: boolean };
  onProgress?: (progress: number, stage: string) => void;
}

const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
const EXT = { png: "png", jpeg: "jpg", webp: "webp" } as const;

function defaultCanvas(width: number, height: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === "undefined") throw new RedactionError("REDACTION_RENDER_FAILED", "OffscreenCanvas unavailable");
  return new OffscreenCanvas(width, height);
}

function reset(canvas: CanvasLike | null) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function context(canvas: CanvasLike): ContextLike {
  const ctx = canvas.getContext("2d") as ContextLike | null;
  if (!ctx) throw new RedactionError("REDACTION_RENDER_FAILED");
  return ctx;
}

async function encode(canvas: CanvasLike, type: string, quality?: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob((blob: Blob | null) => (blob ? resolve(blob) : reject(new RedactionError("REDACTION_EXPORT_FAILED"))), type, quality),
  );
}

function throwIfCancelled(signal?: { readonly aborted: boolean }) {
  if (signal?.aborted) throw new RedactionError("REDACTION_CANCELLED");
}

function drawBlur(canvas: CanvasLike, ctx: ContextLike, op: Redaction, make: RedactionCanvasFactory) {
  const r = clampRect(op.rect, canvas.width, canvas.height);
  const radius = Math.max(2, Math.min(80, op.intensity));
  const pad = Math.ceil(radius * 2);
  const sx = Math.max(0, Math.floor(r.x - pad));
  const sy = Math.max(0, Math.floor(r.y - pad));
  const sw = Math.min(canvas.width - sx, Math.ceil(r.width + pad * 2));
  const sh = Math.min(canvas.height - sy, Math.ceil(r.height + pad * 2));
  const tmp = make(sw, sh);
  try {
    const t = context(tmp);
    t.filter = `blur(${radius}px)`;
    t.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.clip();
    ctx.drawImage(tmp, 0, 0, sw, sh, sx, sy, sw, sh);
    ctx.restore();
  } finally {
    reset(tmp);
  }
}

function drawPixelate(canvas: CanvasLike, ctx: ContextLike, op: Redaction, make: RedactionCanvasFactory) {
  const r = clampRect(op.rect, canvas.width, canvas.height);
  const block = Math.max(4, Math.min(96, Math.round(op.intensity)));
  const w = Math.max(1, Math.ceil(r.width / block));
  const h = Math.max(1, Math.ceil(r.height / block));
  const tmp = make(w, h);
  try {
    const t = context(tmp);
    t.imageSmoothingEnabled = true;
    t.drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, w, h);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, w, h, r.x, r.y, r.width, r.height);
    ctx.restore();
  } finally {
    reset(tmp);
  }
}

/** Full-resolution render → flatten → encode → Privacy Clean → verify → decode verification. */
export async function renderSafeShare(image: Blob, operations: Redaction[], options: RenderRedactionsOptions): Promise<SafeShareExportResult> {
  const started = performance.now();
  const make = options.createCanvas ?? defaultCanvas;
  let bitmap: ImageBitmap | null = null;
  let canvas: CanvasLike | null = null;
  try {
    throwIfCancelled(options.signal);
    bitmap = await createImageBitmap(image).catch(() => {
      throw new RedactionError("REDACTION_DECODE_FAILED");
    });
    canvas = make(bitmap.width, bitmap.height);
    const ctx = context(canvas);
    if (options.format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    for (let i = 0; i < operations.length; i++) {
      throwIfCancelled(options.signal);
      const op = operations[i];
      if (op.rect.width < 1 || op.rect.height < 1) throw new RedactionError("REDACTION_INVALID_RECT");
      const r = clampRect(op.rect, canvas.width, canvas.height);
      if (op.mode === "blackout") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(r.x, r.y, r.width, r.height);
      } else if (op.mode === "blur") drawBlur(canvas, ctx, op, make);
      else drawPixelate(canvas, ctx, op, make);
      options.onProgress?.((i + 1) / Math.max(1, operations.length) * 0.6, "render");
    }
    const renderDone = performance.now();
    throwIfCancelled(options.signal);
    const encoded = await encode(canvas, MIME[options.format], options.quality);
    options.onProgress?.(0.75, "privacy-clean");
    const cleaned = await runMetadataClean(encoded, `safe-copy.${EXT[options.format]}`, MIME[options.format]);
    const finalBlob = cleaned.output ?? encoded;
    const cleanDone = performance.now();
    throwIfCancelled(options.signal);
    const size = await readImageSize(finalBlob);
    if (!size || size.width !== bitmap.width || size.height !== bitmap.height) throw new RedactionError("REDACTION_VERIFY_FAILED", "Output dimensions changed");
    const decoded = await createImageBitmap(finalBlob).catch(() => {
      throw new RedactionError("REDACTION_VERIFY_FAILED", "Output did not decode");
    });
    const decodedOk = decoded.width === bitmap.width && decoded.height === bitmap.height;
    decoded.close();
    if (!decodedOk || !cleaned.verification.passed) throw new RedactionError("REDACTION_VERIFY_FAILED");
    options.onProgress?.(1, "verified");
    const done = performance.now();
    return {
      blob: finalBlob,
      width: bitmap.width,
      height: bitmap.height,
      verification: {
        redactionsFlattened: operations.length > 0,
        privacyMetadataRemoved: cleaned.verification.unexpectedRemainingPrivacyMetadata.length === 0,
        outputVerified: true,
        dimensionsMatch: true,
        formatMatch: finalBlob.type === MIME[options.format],
      },
      removedCategories: cleaned.verification.removedCategories,
      ms: { render: renderDone - started, clean: cleanDone - renderDone, verifyDecode: done - cleanDone, total: done - started },
    };
  } catch (error) {
    if (error instanceof RedactionError) throw error;
    if (error instanceof RangeError) throw new RedactionError("REDACTION_MEMORY_PRESSURE");
    throw new RedactionError("REDACTION_EXPORT_FAILED", String(error));
  } finally {
    bitmap?.close();
    reset(canvas);
  }
}
