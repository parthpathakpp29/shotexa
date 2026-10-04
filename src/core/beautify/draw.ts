/**
 * The one Beautifier renderer. The live preview and the full-resolution export both call it
 * with the same layout and a different `scale`, so the preview cannot drift from the file.
 *
 * Canvas shadows are NOT affected by the transformation matrix, so their blur and offset are
 * multiplied by `scale` by hand — that is what makes a shadow look identical at export size.
 */
import type { Rect } from "@/core/image-transform/types";
import { FRAME_COLORS, WINDOW_DOTS } from "./presets";
import type { BeautifyLayout, GradientAngle } from "./types";

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
type Radii = readonly [number, number, number, number];

/** A system stack: the worker's OffscreenCanvas cannot see the page's web fonts. */
export const BEAUTIFY_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Rounded rectangle via arcTo — supported everywhere, unlike `roundRect`. */
export function roundedRectPath(ctx: Ctx, r: Rect, radii: Radii): void {
  const max = Math.min(r.width, r.height) / 2;
  const [tl, tr, br, bl] = radii.map((v) => Math.max(0, Math.min(v, max)));
  ctx.beginPath();
  ctx.moveTo(r.x + tl, r.y);
  ctx.lineTo(r.x + r.width - tr, r.y);
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + tr, tr);
  ctx.lineTo(r.x + r.width, r.y + r.height - br);
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x + r.width - br, r.y + r.height, br);
  ctx.lineTo(r.x + bl, r.y + r.height);
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y + r.height - bl, bl);
  ctx.lineTo(r.x, r.y + tl);
  ctx.arcTo(r.x, r.y, r.x + tl, r.y, tl);
  ctx.closePath();
}

/** Gradient line across the canvas for each supported direction. */
export function gradientLine(angle: GradientAngle, width: number, height: number): [number, number, number, number] {
  if (angle === 90) return [0, 0, width, 0];
  if (angle === 45) return [0, 0, width, height];
  if (angle === 135) return [0, height, width, 0];
  return [0, 0, 0, height];
}

function paintBackground(ctx: Ctx, layout: BeautifyLayout, image: CanvasImageSource | null, imageScale: number, scale: number): void {
  const { canvas, background } = layout;
  if (background.kind === "screenshot") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!image) return;
    const sourceWidth = layout.source.width * imageScale;
    const sourceHeight = layout.source.height * imageScale;
    const cover = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const width = sourceWidth * cover;
    const height = sourceHeight * cover;
    ctx.save();
    ctx.filter = `blur(${background.blur * scale}px) brightness(${background.brightness}%) saturate(${background.saturation}%)`;
    // Grow the draw under the canvas edge so blur never reveals an unpainted fringe.
    const bleed = background.blur * 2;
    ctx.drawImage(image, (canvas.width - width) / 2 - bleed, (canvas.height - height) / 2 - bleed, width + bleed * 2, height + bleed * 2);
    ctx.restore();
  } else if (background.kind === "gradient" && background.color2 !== background.color) {
    const g = ctx.createLinearGradient(...gradientLine(background.angle, canvas.width, canvas.height));
    g.addColorStop(0, background.color);
    g.addColorStop(1, background.color2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = background.color;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * The card the composition sits on: an opaque silhouette that casts the shadow and backs any
 * transparency in the screenshot, so a transparent PNG looks the same with and without a shadow.
 */
function paintCard(ctx: Ctx, layout: BeautifyLayout, scale: number): void {
  if (layout.shadow) {
    const spread = layout.shadow.spread;
    const shadowRect = {
      x: layout.content.x - spread,
      y: layout.content.y - spread,
      width: layout.content.width + spread * 2,
      height: layout.content.height + spread * 2,
    };
    ctx.save();
    ctx.shadowColor = layout.shadow.color;
    // Shadow geometry ignores the transform: scale it explicitly.
    ctx.shadowBlur = layout.shadow.blur * scale;
    ctx.shadowOffsetX = layout.shadow.offsetX * scale;
    ctx.shadowOffsetY = layout.shadow.offsetY * scale;
    ctx.fillStyle = layout.shadow.color;
    const radius = layout.radius + spread;
    roundedRectPath(ctx, shadowRect, [radius, radius, radius, radius]);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = layout.screenBackground;
  roundedRectPath(ctx, layout.content, [layout.radius, layout.radius, layout.radius, layout.radius]);
  ctx.fill();
  ctx.restore();
}

function paintBorder(ctx: Ctx, layout: BeautifyLayout): void {
  if (!layout.border) return;
  ctx.save();
  roundedRectPath(ctx, layout.content, [layout.radius, layout.radius, layout.radius, layout.radius]);
  ctx.strokeStyle = layout.border.color;
  ctx.lineWidth = layout.border.width;
  ctx.stroke();
  if (layout.border.kind === "glass" && layout.border.width >= 2) {
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = Math.max(1, layout.border.width * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

function fitText(ctx: Ctx, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  const suffix = "…";
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(value.slice(0, mid) + suffix).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return value.slice(0, lo).trimEnd() + suffix;
}

function paintCaption(ctx: Ctx, layout: BeautifyLayout): void {
  const caption = layout.caption;
  if (!caption) return;
  const title = caption.title.trim();
  const subtitle = caption.subtitle.trim();
  const total = (title ? caption.fontSize * 1.2 : 0) + (subtitle ? caption.subtitleSize * 1.3 : 0) + (title && subtitle ? caption.spacing : 0);
  let y = caption.rect.y + (caption.rect.height - total) / 2;
  const x = caption.align === "left" ? caption.rect.x : caption.align === "right" ? caption.rect.x + caption.rect.width : caption.rect.x + caption.rect.width / 2;
  ctx.save();
  ctx.fillStyle = caption.color;
  ctx.textAlign = caption.align;
  ctx.textBaseline = "top";
  if (title) {
    ctx.font = `${caption.weight} ${caption.fontSize}px ${BEAUTIFY_FONT}`;
    ctx.fillText(fitText(ctx, title, caption.rect.width), x, y);
    y += caption.fontSize * 1.2 + (subtitle ? caption.spacing : 0);
  }
  if (subtitle) {
    ctx.globalAlpha = 0.78;
    ctx.font = `400 ${caption.subtitleSize}px ${BEAUTIFY_FONT}`;
    ctx.fillText(fitText(ctx, subtitle, caption.rect.width), x, y);
  }
  ctx.restore();
}

function paintBrowserChrome(ctx: Ctx, layout: BeautifyLayout): void {
  const frame = layout.frame;
  if (frame?.kind !== "browser") return;
  const colors = FRAME_COLORS[frame.theme];
  ctx.save();
  roundedRectPath(ctx, layout.content, [layout.radius, layout.radius, layout.radius, layout.radius]);
  ctx.clip();
  ctx.fillStyle = colors.chrome;
  ctx.fillRect(layout.content.x, layout.content.y, layout.content.width, frame.chrome);
  ctx.fillStyle = colors.barEdge;
  ctx.fillRect(layout.content.x, layout.content.y + frame.chrome - Math.max(1, frame.chrome * 0.02), layout.content.width, Math.max(1, frame.chrome * 0.02));
  frame.dots.forEach((dot, i) => {
    ctx.fillStyle = WINDOW_DOTS[i];
    ctx.beginPath();
    ctx.arc(dot.cx, dot.cy, dot.r, 0, Math.PI * 2);
    ctx.fill();
  });
  if (frame.address) {
    const bar = frame.address;
    roundedRectPath(ctx, bar, [bar.radius, bar.radius, bar.radius, bar.radius]);
    ctx.fillStyle = colors.bar;
    ctx.fill();
    ctx.strokeStyle = colors.barEdge;
    ctx.lineWidth = Math.max(0.5, bar.height * 0.04);
    ctx.stroke();
    ctx.save();
    roundedRectPath(ctx, bar, [bar.radius, bar.radius, bar.radius, bar.radius]);
    ctx.clip();
    ctx.fillStyle = colors.text;
    ctx.font = `${bar.fontSize}px ${BEAUTIFY_FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText(bar.text, bar.x + bar.height * 0.6, bar.y + bar.height / 2);
    ctx.restore();
  }
  ctx.restore();
}

function paintPhoneShell(ctx: Ctx, layout: BeautifyLayout): void {
  const frame = layout.frame;
  if (frame?.kind !== "phone") return;
  const colors = FRAME_COLORS[frame.theme];
  roundedRectPath(ctx, layout.content, [layout.radius, layout.radius, layout.radius, layout.radius]);
  ctx.fillStyle = colors.shell;
  ctx.fill();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = Math.max(0.5, frame.bezel * 0.12);
  ctx.stroke();
}

function paintScreen(ctx: Ctx, layout: BeautifyLayout, image: CanvasImageSource | null, imageScale: number): void {
  const { screen, image: dest, sourceRect, screenRadii } = layout;
  ctx.save();
  roundedRectPath(ctx, screen, screenRadii);
  ctx.clip();
  // A contain fit leaves the screen showing around the screenshot: paint it first.
  if (layout.frame?.kind === "phone") {
    ctx.fillStyle = layout.screenBackground;
    ctx.fill();
  }
  if (!image) {
    // The preview bitmap is not ready yet: show the composition with an empty screen.
    ctx.restore();
    return;
  }
  const exact = Math.abs(dest.width - sourceRect.width * imageScale) < 0.5 && Math.abs(dest.height - sourceRect.height * imageScale) < 0.5;
  ctx.imageSmoothingEnabled = !exact;
  if (!exact) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    sourceRect.x * imageScale,
    sourceRect.y * imageScale,
    Math.max(1, sourceRect.width * imageScale),
    Math.max(1, sourceRect.height * imageScale),
    dest.x,
    dest.y,
    dest.width,
    dest.height,
  );
  ctx.restore();
}

function paintNotch(ctx: Ctx, layout: BeautifyLayout): void {
  const frame = layout.frame;
  if (frame?.kind !== "phone") return;
  const n = frame.notch;
  roundedRectPath(ctx, n, [n.radius, n.radius, n.radius, n.radius]);
  ctx.fillStyle = "rgba(14, 12, 10, 0.92)";
  ctx.fill();
}

/**
 * Draw the whole composition. `imageScale` is the image's pixels per source pixel (1 for the
 * original file, less for the workspace preview); `scale` maps output pixels to canvas pixels;
 * `offsetY` is the first output row of this tile. A null image draws everything but the
 * screenshot, so the preview can show the composition before its bitmap arrives.
 */
export function drawBeautified(ctx: Ctx, layout: BeautifyLayout, image: CanvasImageSource | null, imageScale = 1, scale = 1, offsetY = 0): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, -offsetY * scale);
  paintBackground(ctx, layout, image, imageScale, scale);
  paintCard(ctx, layout, scale);
  if (layout.frame?.kind === "phone") paintPhoneShell(ctx, layout);
  paintScreen(ctx, layout, image, imageScale);
  paintBrowserChrome(ctx, layout);
  paintNotch(ctx, layout);
  paintBorder(ctx, layout);
  paintCaption(ctx, layout);
  ctx.restore();
}
