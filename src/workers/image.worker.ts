/// <reference lib="webworker" />
/**
 * Image worker: ordinary raster work (compositing/encoding, OCR-only preprocessing).
 * No OpenCV and no OCR engine here.
 */
import { MetadataError } from "@/core/metadata/errors";
import { runMetadataClean, runMetadataInspect } from "@/core/metadata/run";
import { PrepareError, prepareForOcr } from "@/core/ocr/prepare-image";
import { composeChain } from "@/core/stitch/compose-chain";
import { composeStitch } from "@/core/stitch/compose";
import { StitchError } from "@/core/stitch/types";
import { serveWorker, type WorkerErrorCode } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

serveWorker(
  self,
  {
    "stitch.compose": async ({ a, b, plan, type, quality }, ctx) => {
      const t = performance.now();
      const blob = await composeStitch(a, b, plan, { type, quality, signal: ctx.signal });
      return { blob, ms: Math.round(performance.now() - t) };
    },
    "image.preview": async ({ image, maxWidth, maxPixels }) => {
      const full = await createImageBitmap(image).catch(() => {
        throw new StitchError("DECODE_FAILED");
      });
      const { width, height } = full;
      const scale = Math.min(1, maxWidth / width, Math.sqrt(maxPixels / (width * height)));
      try {
        const bitmap = await createImageBitmap(full, { resizeWidth: Math.max(1, Math.round(width * scale)), resizeHeight: Math.max(1, Math.round(height * scale)), resizeQuality: "high" });
        return { bitmap, width, height };
      } finally {
        full.close();
      }
    },
    "stitch.composeChain": async ({ images, plan, sources, format, quality }, ctx) =>
      composeChain(images, plan, { format, quality, sources, signal: ctx.signal, onProgress: (p) => ctx.progress(p, "compose") }),
    "metadata.inspect": async ({ image, name, type }) => runMetadataInspect(image, name, type),
    "metadata.clean": async ({ image, name, type, policy }) => runMetadataClean(image, name, type, policy),
    "ocr.prepare": async ({ image, steps, strips }, ctx) => prepareForOcr(image, steps, strips, ctx.signal),
  },
  (err): WorkerErrorCode => {
    if (err instanceof StitchError) return err.code;
    if (err instanceof MetadataError) return err.code;
    if (err instanceof PrepareError) return err.code === "CANCELLED" ? "CANCELLED" : err.code;
    if (err instanceof RangeError) return "MEMORY_PRESSURE";
    return "COMPOSE_FAILED";
  },
  (op, output) => (op === "image.preview" ? [(output as { bitmap: ImageBitmap }).bitmap] : []),
);
