import type { BBox, OcrTransform } from "./types";

export const IDENTITY: OcrTransform = { scale: 1, offsetX: 0, offsetY: 0 };

/** Engine box (x0,y0,x1,y1 in recognised-image pixels) → original-screenshot BBox. */
export function toOriginal(b: { x0: number; y0: number; x1: number; y1: number }, t: OcrTransform = IDENTITY): BBox {
  const x0 = b.x0 / t.scale + t.offsetX;
  const y0 = b.y0 / t.scale + t.offsetY;
  const x1 = b.x1 / t.scale + t.offsetX;
  const y1 = b.y1 / t.scale + t.offsetY;
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function composeTransforms(inner: OcrTransform, outer: OcrTransform): OcrTransform {
  // original = (p / inner.scale + inner.offset) / outer.scale + outer.offset
  return {
    scale: inner.scale * outer.scale,
    offsetX: inner.offsetX / outer.scale + outer.offsetX,
    offsetY: inner.offsetY / outer.scale + outer.offsetY,
  };
}

export function unionBox(boxes: BBox[]): BBox {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function iou(a: BBox, b: BBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

export interface PdfPlacement {
  /** Page size in PDF points (1/72 in). */
  pageWidth: number;
  pageHeight: number;
  /** Where the image is drawn on the page, in points, PDF origin (bottom-left). */
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  /** Image pixel size the boxes are expressed in. */
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * Image pixel box (top-left origin) → PDF user-space rectangle (bottom-left origin),
 * as needed for an invisible searchable-PDF text layer (architecture §34).
 */
export function imageBoxToPdf(b: BBox, p: PdfPlacement): { x: number; y: number; w: number; h: number } {
  const sx = p.imageWidth / p.pixelWidth;
  const sy = p.imageHeight / p.pixelHeight;
  return {
    x: p.imageX + b.x * sx,
    y: p.imageY + p.imageHeight - (b.y + b.h) * sy,
    w: b.w * sx,
    h: b.h * sy,
  };
}
