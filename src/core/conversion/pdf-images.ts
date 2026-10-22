import { assertRasterSize, encodeCanvas, releaseCanvas, type RasterFormat } from "./raster";

const MAX_PDF_BYTES = 60 * 1024 * 1024;
export const MAX_PDF_PAGES = 80;

export async function openPdf(file: File) {
  if (file.size < 8 || file.size > MAX_PDF_BYTES) throw new Error("Choose a PDF under 60 MB.");
  const head = new TextDecoder().decode(await file.slice(0, 8).arrayBuffer());
  if (!head.startsWith("%PDF-")) throw new Error("This is not a valid PDF file.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableAutoFetch: true, disableStream: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > MAX_PDF_PAGES) {
      await doc.destroy();
      throw new Error(`This PDF has more than ${MAX_PDF_PAGES} pages. Split it into smaller documents first.`);
    }
    return doc;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    if (error instanceof Error && /more than/.test(error.message)) throw error;
    if (error instanceof Error && /password/i.test(error.name + error.message)) throw new Error("This PDF is password protected. Unlock it before converting.");
    throw new Error("This PDF could not be opened. It may be damaged or unsupported.");
  }
}

export async function renderPdfPage(doc: Awaited<ReturnType<typeof openPdf>>, pageNumber: number, scale: number, format: RasterFormat, quality = 0.92): Promise<{ blob: Blob; width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  const canvas = document.createElement("canvas");
  try {
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    assertRasterSize(width, height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: format === "png" });
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    await page.render({ canvasContext: context, viewport }).promise;
    return { blob: await encodeCanvas(canvas, format, quality), width, height };
  } finally {
    page.cleanup();
    releaseCanvas(canvas);
  }
}
