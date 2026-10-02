/**
 * The one annotation renderer. The live preview and the full-resolution export both call
 * `drawAnnotations` with output-pixel objects, so a mark previews exactly where it exports.
 */
import { arrowGeometry, TEXT_LINE_HEIGHT, textLines, type MeasureText } from "./geometry";
import type { AnnotationObject } from "./types";

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/**
 * System UI sans. Page web fonts are not visible to an export worker's OffscreenCanvas, so a
 * font both the page and the worker resolve identically keeps preview and export the same.
 */
export const ANNOTATION_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const textFont = (size: number, weight = 600) => `${weight} ${size}px ${ANNOTATION_FONT_FAMILY}`;

/** Perceived brightness 0–1 of a #rrggbb colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Ink or white — whichever reads on top of `hex`. */
export const contrastOn = (hex: string) => (luminance(hex) > 0.6 ? "#1c1714" : "#ffffff");

export function canvasMeasure(ctx: Ctx): MeasureText {
  return (line, size) => {
    ctx.font = textFont(size);
    return ctx.measureText(line).width;
  };
}

function drawOne(ctx: Ctx, o: AnnotationObject) {
  ctx.save();
  switch (o.type) {
    case "arrow": {
      const g = arrowGeometry(o.from, o.to, o.width);
      ctx.strokeStyle = ctx.fillStyle = o.color;
      ctx.lineWidth = o.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(o.from.x, o.from.y);
      ctx.lineTo(g.shaftEnd.x, g.shaftEnd.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(g.head[0].x, g.head[0].y);
      ctx.lineTo(g.head[1].x, g.head[1].y);
      ctx.lineTo(g.head[2].x, g.head[2].y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "rectangle":
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.width;
      ctx.lineJoin = "round";
      ctx.strokeRect(o.rect.x, o.rect.y, o.rect.width, o.rect.height);
      break;
    case "highlight":
      // Multiply behaves like a highlighter pen: dark text underneath stays dark and legible.
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity));
      ctx.fillStyle = o.color;
      ctx.fillRect(o.rect.x, o.rect.y, o.rect.width, o.rect.height);
      break;
    case "text": {
      ctx.font = textFont(o.size);
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      // A thin contrasting halo keeps the label readable on any part of a screenshot.
      ctx.strokeStyle = contrastOn(o.color);
      ctx.lineWidth = Math.max(1, o.size * 0.16);
      ctx.fillStyle = o.color;
      textLines(o.text).forEach((line, i) => {
        const y = o.at.y + i * o.size * TEXT_LINE_HEIGHT + o.size * 0.1;
        ctx.strokeText(line, o.at.x, y);
        ctx.fillText(line, o.at.x, y);
      });
      break;
    }
    case "freehand": {
      ctx.strokeStyle = ctx.fillStyle = o.color;
      ctx.lineWidth = o.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pts = o.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, o.width / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      // Quadratic curves through segment midpoints: smooth, and passes near every stored point.
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      break;
    }
    case "step": {
      const ring = contrastOn(o.color);
      ctx.beginPath();
      ctx.arc(o.at.x, o.at.y, o.radius, 0, Math.PI * 2);
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, o.radius * 0.14);
      ctx.strokeStyle = ring;
      ctx.stroke();
      ctx.fillStyle = ring;
      ctx.font = textFont(Math.round(o.radius * (o.n > 9 ? 0.9 : 1.1)), 700);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(o.n), o.at.x, o.at.y + o.radius * 0.04);
      break;
    }
  }
  ctx.restore();
}

/**
 * Draw output-pixel annotations. `scale` maps output pixels to this canvas's pixels (1 for
 * export, the display scale for the preview); `offsetY` is the first output row of an export
 * tile, so marks spanning tiles join seamlessly.
 */
export function drawAnnotations(ctx: Ctx, objects: AnnotationObject[], scale = 1, offsetY = 0): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, -offsetY * scale);
  for (const o of objects) drawOne(ctx, o);
  ctx.restore();
}
