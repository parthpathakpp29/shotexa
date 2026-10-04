/**
 * The one comparison renderer. The preview calls it with the workspace preview bitmaps and a
 * display scale; the export calls it with the decoded originals at scale 1. Same layout, same
 * code — so what is on screen is what gets saved.
 */
import type { Rect } from "@/core/image-transform/types";
import { changedRegions, differencePixels, differenceStats, type DifferenceAnalysis } from "./difference";
import type { CompareLayout, ComparePlacement } from "./types";

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export const COMPARE_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** One screenshot plus the scale of the bitmap we have for it (1 = the original's pixels). */
export interface CompareSource {
  image: CanvasImageSource | null;
  /** The image's pixels per source pixel. */
  imageScale: number;
}

export interface DrawCompareOptions {
  /** Canvas pixels per layout pixel. */
  scale?: number;
  /** Needed for difference mode, which compares rasterised pixels. */
  createCanvas?: (width: number, height: number) => Canvas;
}

function drawPlacement(ctx: Ctx, p: ComparePlacement, src: CompareSource): void {
  if (!src.image) return;
  const k = src.imageScale;
  const exact = Math.abs(p.dest.width - p.source.width * k) < 0.5;
  ctx.imageSmoothingEnabled = !exact;
  if (!exact) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    src.image,
    p.source.x * k,
    p.source.y * k,
    Math.max(1, p.source.width * k),
    Math.max(1, p.source.height * k),
    p.dest.x,
    p.dest.y,
    p.dest.width,
    p.dest.height,
  );
}

function label(ctx: Ctx, text: string, box: Rect, cell: { width: number; height: number }, align: "left" | "right"): void {
  const size = Math.max(9, Math.round(Math.min(cell.width, cell.height) * 0.035));
  const padX = Math.round(size * 0.7);
  const padY = Math.round(size * 0.45);
  ctx.font = `600 ${size}px ${COMPARE_FONT}`;
  ctx.textBaseline = "top";
  const width = Math.round(ctx.measureText(text).width) + padX * 2;
  const height = size + padY * 2;
  const margin = Math.round(size * 0.8);
  const x = align === "left" ? box.x + margin : box.x + box.width - margin - width;
  const y = box.y + margin;
  ctx.fillStyle = "rgba(20, 16, 12, 0.72)";
  const r = height / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x + padX, y + padY);
}

/** Difference mode: rasterise both sides on the same background, then compare pixel by pixel. */
function drawDifference(ctx: Ctx, layout: CompareLayout, a: CompareSource, b: CompareSource, width: number, height: number, scale: number, make: (w: number, h: number) => Canvas): DifferenceAnalysis | null {
  let left: Canvas | null = null;
  let right: Canvas | null = null;
  try {
    left = make(width, height);
    right = make(width, height);
    const lc = left.getContext("2d", { willReadFrequently: true }) as Ctx | null;
    const rc = right.getContext("2d", { willReadFrequently: true }) as Ctx | null;
    if (!lc || !rc) return null;
    for (const [c, placement, source] of [
      [lc, layout.a, a],
      [rc, layout.b, b],
    ] as const) {
      c.setTransform(scale, 0, 0, scale, 0, 0);
      // The same background on both sides: a pixel outside one screenshot compares against it.
      c.fillStyle = layout.background;
      c.fillRect(0, 0, layout.canvas.width, layout.canvas.height);
      drawPlacement(c, placement, source);
    }
    const la = lc.getImageData(0, 0, width, height);
    const rb = rc.getImageData(0, 0, width, height);
    const mask = new Uint8Array(width * height);
    const changed = differencePixels(la.data, rb.data, la.data, layout.threshold, mask, layout.mode === "heatmap" ? "heatmap" : "difference");
    const grouped = changedRegions(mask, width, height, {
      minRegionSize: layout.minRegionSize,
      mergeDistance: layout.mergeDistance,
      ignoreTiny: layout.ignoreTiny,
    });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(la, 0, 0);
    ctx.restore();
    return { ...differenceStats(changed, width * height), width, height, regions: grouped.regions, regionsTruncated: grouped.truncated };
  } finally {
    for (const c of [left, right]) {
      if (!c) continue;
      c.width = 0;
      c.height = 0;
    }
  }
  return null;
}

/**
 * Draw the comparison. `width`/`height` are the target canvas's device pixels; everything else
 * comes from the layout, so the preview and the export place things identically.
 */
export function drawCompare(ctx: Ctx, layout: CompareLayout, a: CompareSource, b: CompareSource, width: number, height: number, o: DrawCompareOptions = {}): DifferenceAnalysis | null {
  const scale = o.scale ?? width / layout.canvas.width;
  if (layout.mode === "difference" || layout.mode === "heatmap") {
    const make = o.createCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
    const stats = drawDifference(ctx, layout, a, b, width, height, scale, make);
    if (layout.labels) {
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      label(ctx, layout.labels.a, layout.cellA, layout.cell, "left");
      label(ctx, layout.labels.b, layout.cellB, layout.cell, "right");
      ctx.restore();
    }
    return stats;
  } else {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = layout.background;
    ctx.fillRect(0, 0, layout.canvas.width, layout.canvas.height);
    drawPlacement(ctx, layout.a, a);
    if (layout.mode === "slider") {
      // "After" is revealed to the right of the divider.
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.divider, 0, layout.canvas.width - layout.divider, layout.canvas.height);
      ctx.clip();
      ctx.fillStyle = layout.background;
      ctx.fillRect(layout.divider, 0, layout.canvas.width - layout.divider, layout.canvas.height);
      drawPlacement(ctx, layout.b, b);
      ctx.restore();
      const lineWidth = Math.max(1, Math.round(Math.min(layout.canvas.width, layout.canvas.height) * 0.003));
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillRect(layout.divider - lineWidth / 2, 0, lineWidth, layout.canvas.height);
    } else if (layout.mode === "overlay") {
      ctx.globalAlpha = layout.opacity;
      drawPlacement(ctx, layout.b, b);
      ctx.globalAlpha = 1;
    } else {
      drawPlacement(ctx, layout.b, b);
    }
    ctx.restore();
  }
  if (!layout.labels) return null;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  label(ctx, layout.labels.a, layout.cellA, layout.cell, "left");
  label(ctx, layout.labels.b, layout.cellB, layout.cell, layout.mode === "side-by-side" ? "left" : "right");
  ctx.restore();
  return null;
}
