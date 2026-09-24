/// <reference lib="webworker" />
/**
 * Document worker (architecture §24): pagination analysis and PDF generation.
 * pdf-lib is loaded lazily on the first `pdf.create`.
 */
import { analyseImage } from "@/core/pdf/analyse-image";
import { decodeImage } from "@/core/pdf/decode";
import { resolvePaginationConfig } from "@/core/pdf/config";
import { PdfError, toPdfError } from "@/core/pdf/errors";
import { assemblePdf, renderPages } from "@/core/pdf/render-pdf";
import { serveWorker, type WorkerErrorCode } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

serveWorker(
  self,
  {
    "pdf.analyse": async ({ images, config }, ctx) => {
      const cfg = resolvePaginationConfig(config);
      const out = [];
      for (const [i, img] of images.entries()) {
        if (ctx.signal.aborted) throw new PdfError("PDF_CANCELLED");
        try {
          out.push(await analyseImage(img, cfg));
        } catch (e) {
          throw toPdfError(e, "analyse");
        }
        ctx.progress((i + 1) / images.length, "analyse");
      }
      return { images: out };
    },
    "pdf.decode": async ({ image }) => {
      const t = performance.now();
      const d = await decodeImage(image).catch(() => {
        throw new PdfError("PDF_DECODE_FAILED");
      });
      // ImageBitmap is transferable everywhere (VideoFrame transfer is not universal).
      const bitmap = d.source instanceof ImageBitmap ? d.source : await createImageBitmap(d.source as VideoFrame);
      if (!(d.source instanceof ImageBitmap)) d.close();
      return { bitmap, decodeMs: performance.now() - t };
    },
    "pdf.create": async ({ images, slices, setup, imageFormat, jpegQuality, title, pages }, ctx) => {
      const t = performance.now();
      const o = { setup, imageFormat, jpegQuality, title, signal: ctx.signal, onProgress: (p: number, s: string) => ctx.progress(p, s) };
      const source = pages ?? renderPages(images ?? [], slices, o);
      const blob = await assemblePdf(source, slices.length, o);
      return { blob, ms: Math.round(performance.now() - t), pages: slices.length };
    },
  },
  (err): WorkerErrorCode => {
    if (err instanceof PdfError) return err.code === "PDF_CANCELLED" ? "CANCELLED" : err.code;
    return toPdfError(err, "export").code;
  },
  (op, output) => (op === "pdf.decode" ? [(output as { bitmap: ImageBitmap }).bitmap] : []),
);
