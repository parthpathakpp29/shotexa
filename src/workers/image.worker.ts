/// <reference lib="webworker" />
/**
 * Image worker: ordinary raster work (compositing/encoding, OCR-only preprocessing).
 * No OpenCV and no OCR engine here.
 */
import { MetadataError } from "@/core/metadata/errors";
import { runMetadataClean, runMetadataInspect } from "@/core/metadata/run";
import { PrepareError, prepareForOcr } from "@/core/ocr/prepare-image";
import { renderSafeShare } from "@/core/redaction/render";
import { RedactionError } from "@/core/redaction/types";
import { composeChain } from "@/core/stitch/compose-chain";
import { composeCombine } from "@/core/combine/compose";
import { CombineError } from "@/core/combine/errors";
import { renderTransform } from "@/core/image-transform/render";
import { EditorError } from "@/core/image-transform/types";
import { renderAnnotated } from "@/core/annotation/export";
import { AnnotationError } from "@/core/annotation/types";
import { renderSplit } from "@/core/split/render";
import { SplitError } from "@/core/split/types";
import { encodeImage } from "@/core/image-encode/reencode";
import { EncodeError } from "@/core/image-encode/types";
import { renderBeautified } from "@/core/beautify/render";
import { BeautifyError } from "@/core/beautify/types";
import { renderCompare } from "@/core/compare/render";
import { CompareError } from "@/core/compare/types";
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
    "combine.compose": async ({ images, plan, format, quality }, ctx) =>
      composeCombine(images, plan, { format, quality, signal: ctx.signal, onProgress: (p) => ctx.progress(p, "compose") }),
    "transform.export": async ({ image, transform, source, format, quality }, ctx) =>
      renderTransform(image, transform, { source, format, quality, signal: ctx.signal, onProgress: (p) => ctx.progress(p, "render") }),
    "annotation.export": async ({ image, transform, annotations, source, format, quality }, ctx) =>
      renderAnnotated(image, transform, annotations, { source, format, quality, signal: ctx.signal, onProgress: (p) => ctx.progress(p, "render") }),
    "split.export": async ({ image, pieces, source, format, quality }, ctx) =>
      renderSplit(image, pieces, { source, format, quality, signal: ctx.signal, onProgress: (p) => ctx.progress(p, "render") }),
    "image.encode": async ({ image, source, format, quality, background, probe }, ctx) =>
      encodeImage(image, { source, format, quality, background, probe, signal: ctx.signal, onProgress: (p) => ctx.progress(p, "encode") }),
    "beautify.export": async ({ image, settings, source, format, quality }, ctx) =>
      renderBeautified(image, settings, { source, format, quality, signal: ctx.signal, onProgress: (p) => ctx.progress(p, "compose") }),
    "compare.export": async ({ imageA, imageB, settings, a, b, format, quality }, ctx) =>
      renderCompare(imageA, imageB, settings, { a, b, format, quality, signal: ctx.signal, onProgress: (p) => ctx.progress(p, "compose") }),
    "metadata.inspect": async ({ image, name, type }) => runMetadataInspect(image, name, type),
    "metadata.clean": async ({ image, name, type, policy }) => runMetadataClean(image, name, type, policy),
    "redaction.export": async ({ image, operations, format, quality }, ctx) =>
      renderSafeShare(image, operations, { format, quality, signal: ctx.signal, onProgress: (progress, stage) => ctx.progress(progress, stage) }),
    "ocr.prepare": async ({ image, steps, strips }, ctx) => prepareForOcr(image, steps, strips, ctx.signal),
  },
  (err): WorkerErrorCode => {
    if (err instanceof StitchError) return err.code;
    if (err instanceof CombineError) return err.code;
    if (err instanceof EditorError) return err.code;
    if (err instanceof AnnotationError) return err.code;
    if (err instanceof SplitError) return err.code;
    if (err instanceof EncodeError) return err.code;
    if (err instanceof BeautifyError) return err.code;
    if (err instanceof CompareError) return err.code;
    if (err instanceof MetadataError) return err.code;
    if (err instanceof RedactionError) return err.code;
    if (err instanceof PrepareError) return err.code === "CANCELLED" ? "CANCELLED" : err.code;
    if (err instanceof RangeError) return "MEMORY_PRESSURE";
    return "COMPOSE_FAILED";
  },
  (op, output) => (op === "image.preview" ? [(output as { bitmap: ImageBitmap }).bitmap] : []),
);
