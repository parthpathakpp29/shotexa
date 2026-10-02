/**
 * Structural PDF validation (Spike D): reload with pdf-lib and check, per page, against the
 * plan: page count, page size, the expected image bands (tall slices are drawn as ≤ tileRows
 * bands), image width = source width and band rows = slice rows (no clipping), placement of
 * the union of band draws inside the margins, top-aligned and centred, non-trivial image data
 * (no blank pages). Rotation must be 0.
 */
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFPage } from "pdf-lib";
import { DEFAULT_LIMITS } from "../../../src/config/limits";
import { slicePlacement } from "../../../src/core/pdf/coords";
import { pageGeometry } from "../../../src/core/pdf/geometry";
import { sliceTiles } from "../../../src/core/pdf/render-pdf";
import type { PageSetup, PageSlice } from "../../../src/core/pdf/types";

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

function contentText(page: PDFPage): string {
  const c = page.node.Contents();
  const streams = c instanceof PDFArray ? c.asArray().map((r) => page.doc.context.lookup(r)) : [c];
  return streams.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString("latin1") : "")).join("\n");
}

/** Current transform at each image `Do` (cm operators composed; q/Q stack honoured). */
function imageMatrices(text: string): M[] {
  const stack: M[] = [];
  const out: M[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const num = String.raw`(-?[\d.]+)\s+`;
  const re = new RegExp(`${num.repeat(6)}cm|\\bq\\b|\\bQ\\b|/\\S+\\s+Do`, "g");
  for (const m of text.matchAll(re)) {
    if (m[0] === "q") stack.push(ctm);
    else if (m[0] === "Q") ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (m[0].endsWith("Do")) out.push(ctm);
    else ctm = mul(m.slice(1, 7).map(Number) as M, ctm);
  }
  return out;
}

export async function validatePdf(buf: Uint8Array, slices: PageSlice[], images: { width: number; height: number }[], setup: PageSetup, tileRows = DEFAULT_LIMITS.tileHeight) {
  const problems: string[] = [];
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  const pages = doc.getPages();
  if (pages.length !== slices.length) problems.push(`page count ${pages.length} ≠ plan ${slices.length}`);
  const eps = 0.05;
  let minImageBytes = Infinity;
  let maxBands = 0;
  pages.forEach((page, i) => {
    const s = slices[i];
    if (!s) return;
    const src = images[s.imageIndex];
    const g = pageGeometry(setup, src.width, src.height);
    const { width, height } = page.getSize();
    const expH = setup.paper === "fit" ? (s.y1 - s.y0) * g.scale + 2 * setup.marginPt : g.pageH;
    if (Math.abs(width - g.pageW) > eps || Math.abs(height - expH) > eps) problems.push(`p${i + 1} size ${width.toFixed(2)}×${height.toFixed(2)} ≠ ${g.pageW.toFixed(2)}×${expH.toFixed(2)}`);
    if (page.getRotation().angle !== 0) problems.push(`p${i + 1} rotated`);

    const wantTiles = sliceTiles(s, tileRows);
    maxBands = Math.max(maxBands, wantTiles.length);
    const xo = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    const refs = xo ? xo.values() : [];
    if (refs.length !== wantTiles.length) problems.push(`p${i + 1} has ${refs.length} images, expected ${wantTiles.length}`);
    let rows = 0;
    for (const ref of refs) {
      const img = ref instanceof PDFRef ? doc.context.lookup(ref) : undefined;
      if (!(img instanceof PDFRawStream)) continue;
      const w = img.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber();
      rows += img.dict.lookup(PDFName.of("Height"), PDFNumber).asNumber();
      if (w !== src.width) problems.push(`p${i + 1} image width ${w} ≠ ${src.width}`);
      minImageBytes = Math.min(minImageBytes, img.contents.length);
    }
    const wantRows = wantTiles.reduce((n, t) => n + t.y1 - t.y0, 0);
    if (rows !== wantRows) problems.push(`p${i + 1} image rows ${rows} ≠ ${wantRows} (slice ${s.y1 - s.y0})`);

    const ms = imageMatrices(contentText(page));
    if (!ms.length) {
      problems.push(`p${i + 1} no image draw`);
      return;
    }
    const gg = setup.paper === "fit" ? { ...g, pageH: expH } : g;
    const want = slicePlacement(s, gg, setup.marginPt);
    // Union of all band draws must equal the slice placement (no gaps, no clipping).
    const a = Math.max(...ms.map((m) => m[0]));
    const e = Math.min(...ms.map((m) => m[4]));
    const f = Math.min(...ms.map((m) => m[5]));
    const d = Math.max(...ms.map((m) => m[5] + m[3])) - f;
    const off = Math.max(Math.abs(a - want.w), Math.abs(d - want.h), Math.abs(e - want.x), Math.abs(f - want.y));
    if (off > eps) problems.push(`p${i + 1} placement [${[a, d, e, f].map((v) => v.toFixed(2))}] ≠ [${[want.w, want.h, want.x, want.y].map((v) => v.toFixed(2))}]`);
    if (e < setup.marginPt - eps || f < setup.marginPt - eps || e + a > width - setup.marginPt + eps || f + d > height - setup.marginPt + eps) problems.push(`p${i + 1} outside margins`);
  });
  return { ok: problems.length === 0, pages: pages.length, bytes: buf.length, minImageBytes, maxBandsPerPage: maxBands, problems: problems.slice(0, 10), producer: doc.getProducer() };
}
