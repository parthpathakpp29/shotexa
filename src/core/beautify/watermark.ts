import type { BeautifyDrawResource, BeautifyLayout, WatermarkLayer } from "./types";

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const FONT: Record<WatermarkLayer["font"], string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  humanist: '"Segoe UI", Trebuchet MS, sans-serif',
  geometric: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'Consolas, ui-monospace, monospace',
};

export function watermarkGeometry(ctx: Ctx, layout: BeautifyLayout, layer: WatermarkLayer, resource?: BeautifyDrawResource) {
  const short = Math.min(layout.canvas.width, layout.canvas.height);
  const size = short * layer.size / 100;
  if (layer.kind === "text") {
    ctx.font = `600 ${size}px ${FONT[layer.font]}`;
    const width = Math.max(1, ctx.measureText(layer.text).width + Math.max(0, layer.text.length - 1) * layer.letterSpacing * layout.canvas.width / 1000);
    return { x: layout.canvas.width * layer.x / 100, y: layout.canvas.height * layer.y / 100, width, height: size * 1.2 };
  }
  const ratio = resource ? resource.source.height / resource.source.width : 1;
  return { x: layout.canvas.width * layer.x / 100, y: layout.canvas.height * layer.y / 100, width: size, height: size * ratio };
}

export function watermarkCoverage(layout: BeautifyLayout, layer: WatermarkLayer) {
  if (layer.tileScope === "screenshot") return layout.composition.layout === "single" ? layout.image : layout.content;
  return { x: 0, y: 0, width: layout.canvas.width, height: layout.canvas.height };
}

/** The same canvas-space geometry is used by the live editor and every export strategy. */
export function paintWatermarks(ctx: Ctx, layout: BeautifyLayout, resources: BeautifyDrawResource[]): void {
  for (const layer of layout.watermarks) {
    if (layer.opacity <= 0 || (layer.kind === "text" && !layer.text.trim())) continue;
    const resource = layer.kind === "image" ? resources.find((item) => item.id === layer.assetId) : undefined;
    if (layer.kind === "image" && !resource) continue;
    const box = watermarkGeometry(ctx, layout, layer, resource);
    const paintOne = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(layer.rotation * Math.PI / 180);
      ctx.globalAlpha = layer.opacity / 100;
      if (layer.kind === "image" && resource) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(resource.image, -box.width / 2, -box.height / 2, box.width, box.height);
      } else {
        ctx.fillStyle = layer.color;
        ctx.font = `600 ${Math.min(layout.canvas.width, layout.canvas.height) * layer.size / 100}px ${FONT[layer.font]}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${layer.letterSpacing * layout.canvas.width / 1000}px`;
        ctx.fillText(layer.text, 0, 0);
      }
      ctx.restore();
    };
    if (!layer.tiled) { paintOne(box.x, box.y); continue; }
    const coverage = watermarkCoverage(layout, layer);
    const gap = Math.min(layout.canvas.width, layout.canvas.height) * layer.tileGap / 100;
    const stepX = Math.max(12, box.width + gap);
    const stepY = Math.max(12, box.height + gap);
    const startX = ((box.x % stepX) + stepX) % stepX;
    const startY = ((box.y % stepY) + stepY) % stepY;
    ctx.save();
    if (layer.tileScope === "screenshot") {
      ctx.beginPath();
      ctx.rect(coverage.x, coverage.y, coverage.width, coverage.height);
      ctx.clip();
    }
    const firstY = startY + Math.floor((coverage.y - startY) / stepY) * stepY - stepY;
    const firstX = startX + Math.floor((coverage.x - startX) / stepX) * stepX - stepX;
    for (let y = firstY; y < coverage.y + coverage.height + stepY; y += stepY) {
      for (let x = firstX; x < coverage.x + coverage.width + stepX; x += stepX) paintOne(x, y);
    }
    ctx.restore();
  }
}
