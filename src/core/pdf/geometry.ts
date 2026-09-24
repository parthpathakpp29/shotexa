import { DEFAULT_LIMITS } from "@/config/limits";
import { PdfError } from "./errors";
import type { PageSetup, PaperSize } from "./types";

/** Largest source image the PDF pipeline accepts (Spike B: canvas height / JPEG side limits). */
export const MAX_SOURCE = { width: 16_384, height: DEFAULT_LIMITS.maxSingleCanvasHeight };

export function assertSupportedSize(w: number, h: number) {
  if (!(w >= 1 && h >= 1 && w <= MAX_SOURCE.width && h <= MAX_SOURCE.height)) throw new PdfError("PDF_UNSUPPORTED_SIZE", `${w}x${h}`);
}

/** Portrait paper sizes in PDF points. */
export const PAPER: Record<Exclude<PaperSize, "fit">, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
};

/** PDF 1.x/Acrobat practical page-size limit (200 in). */
export const MAX_PAGE_PT = 14_400;
/** "Fit" pages use 96 dpi screenshots → 72 pt/in. */
export const FIT_PT_PER_PX = 0.75;

export interface PageGeometry {
  pageW: number;
  pageH: number;
  contentW: number;
  contentH: number;
  /** PDF points per image pixel (image scaled to the content width). */
  scale: number;
  /** How many image rows fit on one page. Infinity for "fit" (one page per image). */
  capacityPx: number;
}

export function pageGeometry(setup: PageSetup, imageWidth: number, imageHeight: number): PageGeometry {
  const m = setup.marginPt;
  if (setup.paper === "fit") {
    const scale = Math.min(FIT_PT_PER_PX, (MAX_PAGE_PT - 2 * m) / imageHeight, (MAX_PAGE_PT - 2 * m) / imageWidth);
    const contentW = imageWidth * scale;
    const contentH = imageHeight * scale;
    return { pageW: contentW + 2 * m, pageH: contentH + 2 * m, contentW, contentH, scale, capacityPx: Number.POSITIVE_INFINITY };
  }
  const { w, h } = PAPER[setup.paper];
  const contentW = w - 2 * m;
  const contentH = h - 2 * m;
  if (contentW <= 0 || contentH <= 0) throw new RangeError("margins too large");
  const scale = contentW / imageWidth;
  return { pageW: w, pageH: h, contentW, contentH, scale, capacityPx: Math.floor(contentH / scale) };
}
