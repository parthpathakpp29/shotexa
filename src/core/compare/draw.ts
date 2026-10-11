/**
 * The one comparison renderer. The preview calls it with the workspace preview bitmaps and a
 * display scale; the export calls it with the decoded originals at scale 1. Same layout, same
 * alignment, same difference engine — so what is on screen is what gets saved.
 */
import { drawImageClamped } from "@/core/image/draw-source";
import type { Rect } from "@/core/image-transform/types";
import { analyseComparison } from "./analysis";
import { compareBuffers, heatColor, parseHexColour } from "./difference";
import { DEFAULT_BACKGROUND } from "./presets";
import type { CompareLayout, ComparePlacement, CompareVisualAnalysis } from "./types";

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
  drawImageClamped(ctx, src.image, p.source.x * k, p.source.y * k, p.source.width * k, p.source.height * k, p.dest.x, p.dest.y, p.dest.width, p.dest.height);
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

/** Dashed outlines over the areas that were deliberately left out of the comparison. */
function drawIgnoreRegions(ctx: Ctx, regions: Rect[], cell: { width: number; height: number }): void {
  if (!regions.length) return;
  const size = Math.max(8, Math.round(Math.min(cell.width, cell.height) * 0.024));
  const line = Math.max(1, Math.round(size * 0.18));
  ctx.save();
  ctx.lineWidth = line;
  ctx.setLineDash([size * 0.7, size * 0.5]);
  ctx.strokeStyle = "rgba(146, 180, 255, 0.95)";
  ctx.font = `600 ${size}px ${COMPARE_FONT}`;
  ctx.textBaseline = "top";
  for (const region of regions) {
    ctx.strokeRect(region.x + line / 2, region.y + line / 2, Math.max(1, region.width - line), Math.max(1, region.height - line));
  }
  ctx.restore();
}

/**
 * The heatmap colour scale, drawn into the image so a saved heatmap explains its own colours.
 * Without it the picture would be pretty and misleading.
 */
function drawHeatLegend(ctx: Ctx, cell: { width: number; height: number }, box: Rect): void {
  const width = Math.max(96, Math.min(240, Math.round(cell.width * 0.34)));
  const size = Math.max(8, Math.round(Math.min(cell.width, cell.height) * 0.026));
  const pad = Math.round(size * 0.7);
  const barHeight = Math.max(5, Math.round(size * 0.7));
  const height = pad * 2 + size * 2 + barHeight + Math.round(size * 0.5);
  const x = box.x + Math.round(size * 1.2);
  const y = box.y + box.height - height - Math.round(size * 1.2);
  ctx.save();
  ctx.fillStyle = "rgba(16, 14, 12, 0.78)";
  const r = Math.round(size * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${size}px ${COMPARE_FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText("Measured change", x + pad, y + pad);
  const barY = y + pad + size + Math.round(size * 0.4);
  const barWidth = width - pad * 2;
  const gradient = ctx.createLinearGradient(x + pad, barY, x + pad + barWidth, barY);
  for (let step = 0; step <= 10; step++) {
    const [r0, g0, b0] = heatColor(step / 10);
    gradient.addColorStop(step / 10, `rgb(${r0}, ${g0}, ${b0})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(x + pad, barY, barWidth, barHeight);
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.font = `500 ${Math.max(7, Math.round(size * 0.82))}px ${COMPARE_FONT}`;
  ctx.fillText("Smaller", x + pad, barY + barHeight + Math.round(size * 0.25));
  const high = "Larger";
  ctx.fillText(high, x + pad + barWidth - ctx.measureText(high).width, barY + barHeight + Math.round(size * 0.25));
  ctx.restore();
}

/**
 * Difference and heatmap: rasterise both sides into the same space on transparent canvases,
 * then compare. Keeping the canvases transparent is what makes alpha handling possible —
 * the shared background is composited per pixel inside the difference engine instead.
 */
function drawDifference(
  ctx: Ctx,
  layout: CompareLayout,
  a: CompareSource,
  b: CompareSource,
  width: number,
  height: number,
  scale: number,
  make: (w: number, h: number) => Canvas,
): CompareVisualAnalysis | null {
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
      c.clearRect(0, 0, layout.canvas.width, layout.canvas.height);
      drawPlacement(c, placement, source);
    }
    const la = lc.getImageData(0, 0, width, height);
    const rb = rc.getImageData(0, 0, width, height);
    const ignore = layout.ignoreRegions.map((region) => ({
      x: region.x * scale,
      y: region.y * scale,
      width: region.width * scale,
      height: region.height * scale,
    }));
    const result = compareBuffers(la.data, rb.data, la.data, {
      width,
      height,
      threshold: layout.threshold,
      diff: layout.diff,
      background: parseHexColour(layout.background) ?? parseHexColour(DEFAULT_BACKGROUND)!,
      ignore,
      palette: layout.mode === "heatmap" ? "heatmap" : "difference",
      heatmap: layout.heatmap,
    });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(la, 0, 0);
    ctx.restore();
    // Grouping consumes the mask; the rendered picture above is already final.
    return analyseComparison(result, {
      width,
      height,
      analysisScale: 1 / Math.max(0.0001, scale),
      metric: layout.diff.metric,
      detectMovement: layout.detectMovement,
      minRegionSize: Math.max(1, Math.round(layout.minRegionSize * scale * scale)),
      mergeDistance: Math.max(0, Math.round(layout.mergeDistance * scale)),
      ignoreTiny: layout.ignoreTiny,
      placements: { a: layout.a, b: layout.b },
    });
  } finally {
    for (const c of [left, right]) {
      if (!c) continue;
      c.width = 0;
      c.height = 0;
    }
  }
}

/**
 * Draw the comparison. `width`/`height` are the target canvas's device pixels; everything else
 * comes from the layout, so the preview and the export place things identically.
 */
export function drawCompare(
  ctx: Ctx,
  layout: CompareLayout,
  a: CompareSource,
  b: CompareSource,
  width: number,
  height: number,
  o: DrawCompareOptions = {},
): CompareVisualAnalysis | null {
  const scale = o.scale ?? width / layout.canvas.width;
  if (layout.mode === "difference" || layout.mode === "heatmap") {
    const make = o.createCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
    const stats = drawDifference(ctx, layout, a, b, width, height, scale, make);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawIgnoreRegions(ctx, layout.ignoreRegions, layout.cell);
    if (layout.mode === "heatmap" && layout.heatmap.legend) drawHeatLegend(ctx, layout.cell, layout.cellA);
    if (layout.labels) {
      label(ctx, layout.labels.a, layout.cellA, layout.cell, "left");
      label(ctx, layout.labels.b, layout.cellB, layout.cell, "right");
    }
    ctx.restore();
    return stats;
  }
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
  if (!layout.labels) return null;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  label(ctx, layout.labels.a, layout.cellA, layout.cell, "left");
  label(ctx, layout.labels.b, layout.cellB, layout.cell, layout.mode === "side-by-side" ? "left" : "right");
  ctx.restore();
  return null;
}

/**
 * Greyscale proxies of both sides, rasterised through the SAME placement maths the comparison
 * uses, for automatic alignment. Small by construction: `maxWidth` caps the analysis size, so
 * measuring an alignment costs milliseconds and never touches full-resolution pixels.
 *
 * The caller must pass a layout built WITHOUT an alignment estimate, so the measurement is
 * absolute rather than relative to a transform that is already applied.
 */
export function compareProxies(
  layout: CompareLayout,
  a: CompareSource,
  b: CompareSource,
  maxWidth: number,
  make: (w: number, h: number) => Canvas,
): { a: { width: number; height: number; data: Uint8Array }; b: { width: number; height: number; data: Uint8Array }; scale: number } | null {
  const cell = layout.cell;
  const scale = Math.min(1, maxWidth / Math.max(1, cell.width));
  const width = Math.max(1, Math.round(cell.width * scale));
  const height = Math.max(1, Math.round(cell.height * scale));
  let canvas: Canvas | null = null;
  try {
    canvas = make(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as Ctx | null;
    if (!ctx) return null;
    const background = parseHexColour(layout.background) ?? [243, 241, 238];
    const read = (placement: ComparePlacement, source: CompareSource) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = layout.background;
      ctx.fillRect(0, 0, width, height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawPlacement(ctx, placement, source);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const data = new Uint8Array(width * height);
      for (let p = 0, i = 0; p < data.length; p++, i += 4) {
        const alpha = rgba[i + 3] / 255;
        const r = rgba[i] * alpha + background[0] * (1 - alpha);
        const g = rgba[i + 1] * alpha + background[1] * (1 - alpha);
        const blue = rgba[i + 2] * alpha + background[2] * (1 - alpha);
        data[p] = (r * 77 + g * 150 + blue * 29) >> 8;
      }
      return { width, height, data };
    };
    // Both sides are read inside the shared cell, so side-by-side aligns like the rest.
    const inCell = (p: ComparePlacement, origin: Rect): ComparePlacement => ({
      ...p,
      dest: { ...p.dest, x: p.dest.x - origin.x, y: p.dest.y - origin.y },
    });
    return { a: read(inCell(layout.a, layout.cellA), a), b: read(inCell(layout.b, layout.cellB), b), scale };
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
