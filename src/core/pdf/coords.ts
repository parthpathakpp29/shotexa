/**
 * Image → page → PDF coordinate mapping for a paginated screenshot (searchable-PDF
 * readiness, architecture §34). One long screenshot is split into page slices; each OCR
 * box must be assigned to a page and expressed in that page's PDF user space.
 */
import type { PageGeometry } from "./geometry";
import type { PageSlice } from "./types";

export interface PdfRect {
  pageIndex: number;
  /** PDF user space: origin bottom-left, points. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a slice's image is drawn on its page (points, bottom-left origin). */
export function slicePlacement(slice: PageSlice, g: PageGeometry, marginPt: number) {
  const s = g.scale * slice.fitScale;
  const drawW = (g.contentW / g.scale) * s; // image width in pt at this page's scale
  const drawH = (slice.y1 - slice.y0) * s;
  // Top-aligned in the content box, horizontally centred (matters only when fitScale < 1).
  const x = marginPt + (g.contentW - drawW) / 2;
  const y = g.pageH - marginPt - drawH;
  return { x, y, w: drawW, h: drawH, scale: s };
}

/**
 * Map an image-pixel box to PDF coordinates. A box is assigned to the page containing its
 * vertical centre; with page overlap, the first such page wins. Returns null if outside.
 */
export function imageBoxToPdfPage(
  box: { x: number; y: number; w: number; h: number },
  slices: PageSlice[],
  imageIndex: number,
  g: PageGeometry,
  marginPt: number,
): PdfRect | null {
  const cy = box.y + box.h / 2;
  const pageIndex = slices.findIndex((s) => s.imageIndex === imageIndex && cy >= s.y0 && cy < s.y1);
  if (pageIndex < 0) return null;
  const slice = slices[pageIndex];
  const p = slicePlacement(slice, g, marginPt);
  const localTop = box.y - slice.y0; // page-local image px (may be < 0 if the box straddles the cut)
  return {
    pageIndex,
    x: p.x + box.x * p.scale,
    y: p.y + p.h - (localTop + box.h) * p.scale,
    w: box.w * p.scale,
    h: box.h * p.scale,
  };
}
