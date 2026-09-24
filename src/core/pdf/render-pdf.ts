/**
 * Page-by-page PDF generation with pdf-lib (document worker).
 *
 *   for each source image (decoded once):
 *     for each page slice, for each ≤ tileRows band: crop → encode (JPEG by default) → release canvas
 *     → embed each band as its own image XObject, drawn edge to edge on the same page
 *   save → Blob
 *
 * Never builds one tall canvas: the largest canvas is width × tileRows (2048 by default), so
 * "Fit" pages of 1080×20000+ stay under the cross-browser canvas-area ceiling (Spike B).
 * Peak ≈ one decoded source + one tile canvas + the accumulated encoded pages in the document.
 */
import type { PageGeometry } from "./geometry";
import { assertSupportedSize, pageGeometry } from "./geometry";
import { DEFAULT_LIMITS } from "@/config/limits";
import { decodeImage, type DecodedImage } from "./decode";
import { PdfError, toPdfError } from "./errors";
import type { PageSetup, PageSlice } from "./types";
import { slicePlacement } from "./coords";

export interface RenderOptions {
  setup: PageSetup;
  imageFormat: "jpeg" | "png";
  jpegQuality?: number;
  title?: string;
  signal?: { readonly aborted: boolean };
  onProgress?: (fraction: number, stage: string) => void;
  /** Largest band encoded as one image (rows). Default: Spike B tile height (2048). */
  tileRows?: number;
  /** Decoder (default: `decodeImage`; the main-thread fallback decodes in the worker). */
  decode?: (b: Blob) => Promise<DecodedImage>;
  /** Called after each encoded band (the main-thread fallback yields here). */
  afterTile?: () => Promise<void>;
  /** Canvas factory (default OffscreenCanvas). */
  makeCanvas?: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement;
}

/** One encoded band of a page: source rows [y0, y1) of the slice's image. */
export interface EncodedTile {
  y0: number;
  y1: number;
  bytes: Uint8Array;
}

/** Pre-encoded page images (main-thread fallback renders these itself). */
export interface EncodedPage {
  slice: PageSlice;
  imageWidth: number;
  imageHeight: number;
  tiles: EncodedTile[];
  format: "jpeg" | "png";
}

/**
 * Bands for one slice. Each band except the last carries one extra source row, drawn under
 * the next band, so viewers never show a hairline seam between bands.
 */
export function sliceTiles(slice: PageSlice, tileRows: number): { y0: number; y1: number }[] {
  const out: { y0: number; y1: number }[] = [];
  for (let y = slice.y0; y < slice.y1; y += tileRows) out.push({ y0: y, y1: Math.min(slice.y1, y + tileRows + 1) });
  return out;
}

type PdfLib = typeof import("pdf-lib");

async function encodeCanvas(c: OffscreenCanvas | HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  const blob = "convertToBlob" in c ? await c.convertToBlob({ type, quality }) : await new Promise<Blob | null>((r) => (c as HTMLCanvasElement).toBlob(r, type, quality));
  if (!blob) throw new PdfError("PDF_EXPORT_FAILED", "encode returned null");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Crop + encode every page slice, one source bitmap at a time. */
export async function* renderPages(images: Blob[], slices: PageSlice[], o: RenderOptions): AsyncGenerator<EncodedPage> {
  const make = o.makeCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
  const type = o.imageFormat === "png" ? "image/png" : "image/jpeg";
  const tileRows = o.tileRows ?? DEFAULT_LIMITS.tileHeight;
  for (let i = 0; i < images.length; i++) {
    const mine = slices.filter((s) => s.imageIndex === i);
    if (!mine.length) continue;
    let bm: DecodedImage;
    try {
      bm = await (o.decode ?? decodeImage)(images[i]);
    } catch {
      throw new PdfError("PDF_DECODE_FAILED");
    }
    try {
      assertSupportedSize(bm.width, bm.height);
      for (const s of mine) {
        const tiles: EncodedTile[] = [];
        for (const t of sliceTiles(s, tileRows)) {
          if (o.signal?.aborted) throw new PdfError("PDF_CANCELLED");
          const h = t.y1 - t.y0;
          const c = make(bm.width, h);
          // Software canvas: an accelerated one uploads the WHOLE source bitmap to the GPU process on
          // drawImage. Chromium, 1080×30000 export: +414–420 MiB accelerated vs +168–179 MiB software.
          const ctx = c.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
          if (!ctx) throw new PdfError("PDF_MEMORY_PRESSURE");
          if (type === "image/jpeg") {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, bm.width, h);
          }
          ctx.drawImage(bm.source, 0, t.y0, bm.width, h, 0, 0, bm.width, h);
          const bytes = await encodeCanvas(c, type, o.jpegQuality ?? 0.9);
          c.width = 0; // release promptly: a canvas that drew the bitmap pins it (Spike B)
          tiles.push({ ...t, bytes });
          await o.afterTile?.();
        }
        yield { slice: s, imageWidth: bm.width, imageHeight: bm.height, tiles, format: o.imageFormat };
      }
    } finally {
      bm.close();
    }
  }
}

/** Assemble pre-encoded pages into a PDF. */
export async function assemblePdf(pages: AsyncIterable<EncodedPage> | Iterable<EncodedPage>, total: number, o: RenderOptions, lib?: PdfLib): Promise<Blob> {
  const { PDFDocument } = lib ?? (await import("pdf-lib"));
  try {
    const doc = await PDFDocument.create();
    if (o.title) doc.setTitle(o.title);
    doc.setProducer("Shotexa (local, in-browser)");
    doc.setCreator("Shotexa");
    let n = 0;
    const geoms = new Map<string, PageGeometry>();
    for await (const p of pages) {
      if (o.signal?.aborted) throw new PdfError("PDF_CANCELLED");
      const key = `${p.imageWidth}x${p.imageHeight}`;
      let g = geoms.get(key);
      if (!g) {
        g = pageGeometry(o.setup, p.imageWidth, p.imageHeight);
        geoms.set(key, g);
      }
      const pageW = g.pageW;
      const pageH = o.setup.paper === "fit" ? (p.slice.y1 - p.slice.y0) * g.scale + 2 * o.setup.marginPt : g.pageH;
      const page = doc.addPage([pageW, pageH]);
      const gg = o.setup.paper === "fit" ? { ...g, pageH } : g;
      const at = slicePlacement(p.slice, gg, o.setup.marginPt);
      for (const t of p.tiles) {
        const img = p.format === "png" ? await doc.embedPng(t.bytes) : await doc.embedJpg(t.bytes);
        const h = (t.y1 - t.y0) * at.scale;
        page.drawImage(img, { x: at.x, y: at.y + (p.slice.y1 - t.y1) * at.scale, width: at.w, height: h });
      }
      n++;
      o.onProgress?.(n / Math.max(1, total), `page ${n}/${total}`);
    }
    if (o.signal?.aborted) throw new PdfError("PDF_CANCELLED");
    o.onProgress?.(1, "saving");
    const bytes = await doc.save();
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
  } catch (e) {
    throw toPdfError(e, "export");
  }
}

export async function renderPdf(images: Blob[], slices: PageSlice[], o: RenderOptions): Promise<Blob> {
  return assemblePdf(renderPages(images, slices, o), slices.length, o);
}
