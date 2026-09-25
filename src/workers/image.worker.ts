/// <reference lib="webworker" />
/**
 * Image worker: ordinary raster work (compositing/encoding, OCR-only preprocessing).
 * No OpenCV and no OCR engine here.
 */
import { MetadataError } from "@/core/metadata/errors";
import { runMetadataClean, runMetadataInspect } from "@/core/metadata/run";
import { PrepareError, prepareForOcr } from "@/core/ocr/prepare-image";
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
);
