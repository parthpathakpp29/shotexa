/**
 * The one Beautifier renderer. The live preview and the full-resolution export both call it
 * with the same layout and a different `scale`, so the preview cannot drift from the file.
 *
 * Canvas shadows are NOT affected by the transformation matrix, so their blur and offset are
 * multiplied by `scale` by hand — that is what makes a shadow look identical at export size.
 */
import { drawImageClamped } from "@/core/image/draw-source";
import type { Rect } from "@/core/image-transform/types";
import { FRAME_COLORS, WINDOW_DOTS } from "./presets";
import { multiImageLayout } from "./multi-layout";
import { paintStudioArt } from "./studio-art";
import { paintWatermarks } from "./watermark";
import type { BeautifyDrawResource, BeautifyLayout, GradientAngle, Point } from "./types";

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

function paintBackground(ctx: Ctx, layout: BeautifyLayout, image: CanvasImageSource | null, imageScale: number, scale: number, resources: BeautifyDrawResource[]): void {
  const { canvas, background } = layout;
  if (background.kind === "studio") {
    paintStudioArt(ctx, canvas, background);
    return;
  }
  if (background.kind === "custom-image") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const resource = resources.find((item) => item.id === background.assetId);
    if (!resource) return;
    const cover = Math.max(canvas.width / resource.source.width, canvas.height / resource.source.height);
    const width = resource.source.width * cover;
    const height = resource.source.height * cover;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(resource.image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return;
  }
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
  } else if ((background.kind === "gradient" || background.kind === "soft-blur") && background.color2 !== background.color) {
    const g = ctx.createLinearGradient(...gradientLine(background.angle, canvas.width, canvas.height));
    g.addColorStop(0, background.color);
    g.addColorStop(1, background.color2);
    ctx.fillStyle = g;
  } else if (background.kind === "radial") {
    const g = ctx.createRadialGradient(canvas.width * 0.4, canvas.height * 0.35, 0, canvas.width * 0.5, canvas.height * 0.5, Math.max(canvas.width, canvas.height) * 0.72);
    g.addColorStop(0, background.color2);
    g.addColorStop(1, background.color);
    ctx.fillStyle = g;
  } else if (background.kind === "mesh" || background.kind === "aurora") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const alpha = Math.max(0.15, (background.intensity ?? 55) / 100);
    const spots = background.kind === "mesh"
      ? [[0.18, 0.22, 0.58], [0.82, 0.3, 0.48], [0.52, 0.88, 0.52]]
      : [[0.15, 0.72, 0.72], [0.52, 0.28, 0.6], [0.88, 0.7, 0.72]];
    spots.forEach(([x, y, radius], index) => {
      const g = ctx.createRadialGradient(canvas.width * x, canvas.height * y, 0, canvas.width * x, canvas.height * y, Math.max(canvas.width, canvas.height) * radius);
      g.addColorStop(0, hexWithAlpha(index === 1 ? background.color : background.color2, alpha));
      g.addColorStop(1, hexWithAlpha(index === 1 ? background.color : background.color2, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
    return;
  } else {
    ctx.fillStyle = background.color;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (background.kind === "pattern") paintPattern(ctx, layout);
  if (background.kind === "noise") paintNoise(ctx, layout);
}

function hexWithAlpha(hex: string, opacity: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Math.max(0, Math.min(1, opacity))})`;
}

function paintPattern(ctx: Ctx, layout: BeautifyLayout): void {
  const { canvas, background } = layout;
  const step = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.045));
  ctx.save();
  ctx.globalAlpha = 0.08 + (background.intensity ?? 55) / 900;
  ctx.strokeStyle = background.color2;
  ctx.fillStyle = background.color2;
  ctx.lineWidth = Math.max(1, step * 0.04);
  if (background.pattern === "dots") {
    for (let y = step / 2; y < canvas.height; y += step) for (let x = step / 2; x < canvas.width; x += step) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, step * 0.07), 0, Math.PI * 2); ctx.fill(); }
  } else if (background.pattern === "grid") {
    for (let x = 0; x < canvas.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  } else {
    for (let x = -canvas.height; x < canvas.width; x += step) { ctx.beginPath(); ctx.moveTo(x, canvas.height); ctx.lineTo(x + canvas.height, 0); ctx.stroke(); }
  }
  ctx.restore();
}

/** Seedless coordinate hash: deterministic preview/export grain without retaining a noise bitmap. */
function paintNoise(ctx: Ctx, layout: BeautifyLayout): void {
  const { canvas, background } = layout;
  const step = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) / 220));
  ctx.save();
  ctx.globalAlpha = 0.025 + (background.intensity ?? 55) / 1400;
  ctx.fillStyle = background.color2;
  for (let y = 0; y < canvas.height; y += step) for (let x = 0; x < canvas.width; x += step) {
    const n = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    if (n > 0.58) ctx.fillRect(x, y, Math.max(1, step * 0.45), Math.max(1, step * 0.45));
  }
  ctx.restore();
}

/**
 * The card the composition sits on: an opaque silhouette that casts the shadow and backs any
 * transparency in the screenshot, so a transparent PNG looks the same with and without a shadow.
 */
function paintCard(ctx: Ctx, layout: BeautifyLayout, scale: number, includeShadow = true): void {
  if (includeShadow && layout.shadow && !(layout.frame?.kind === "phone" && !layout.frame.shadow)) {
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
  if ((layout.border.kind === "glass" || layout.border.kind === "frosted") && layout.border.width >= 2) {
    if (layout.border.kind === "frosted") {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = layout.border.color;
      ctx.fill();
    }
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = Math.max(1, layout.border.width * 0.35);
    ctx.stroke();
  } else if (layout.border.kind === "inner") {
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = Math.max(1, layout.border.width * 2);
    ctx.stroke();
  } else if (layout.border.kind === "highlight") {
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = Math.max(1, layout.border.width * 0.55);
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
  const eyebrow = caption.eyebrow?.trim();
  const title = caption.title.trim();
  const subtitle = caption.subtitle.trim();
  const footer = caption.footer?.trim();
  const eyebrowSize = Math.max(11, caption.fontSize * 0.28);
  const footerSize = Math.max(12, caption.fontSize * 0.34);
  const lineHeight = caption.lineHeight / 100;
  const rows = [eyebrow, title, subtitle, footer].filter(Boolean).length;
  const total = (eyebrow ? eyebrowSize * lineHeight : 0) + (title ? caption.fontSize * lineHeight : 0) + (subtitle ? caption.subtitleSize * lineHeight : 0) + (footer ? footerSize * lineHeight : 0) + Math.max(0, rows - 1) * caption.spacing;
  let y = caption.rect.y + (caption.rect.height - total) / 2;
  const x = caption.align === "left" ? caption.rect.x : caption.align === "right" ? caption.rect.x + caption.rect.width : caption.rect.x + caption.rect.width / 2;
  ctx.save();
  ctx.fillStyle = caption.color;
  ctx.textAlign = caption.align;
  ctx.textBaseline = "top";
  (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${caption.letterSpacing}px`;
  const family = caption.family === "mono" ? 'ui-monospace, "SFMono-Regular", Consolas, monospace' : caption.family === "serif" ? 'Georgia, "Times New Roman", serif' : caption.family === "humanist" ? '"Segoe UI", Trebuchet MS, sans-serif' : caption.family === "geometric" ? 'Arial, Helvetica, sans-serif' : BEAUTIFY_FONT;
  if (eyebrow) {
    ctx.globalAlpha = 0.72;
    ctx.font = `700 ${eyebrowSize}px ${family}`;
    ctx.fillText(fitText(ctx, eyebrow.toUpperCase(), caption.rect.width), x, y);
    y += eyebrowSize * lineHeight + caption.spacing;
    ctx.globalAlpha = 1;
  }
  if (title) {
    ctx.font = `${caption.weight} ${caption.fontSize}px ${family}`;
    ctx.fillText(fitText(ctx, title, caption.rect.width), x, y);
    y += caption.fontSize * lineHeight + (subtitle || footer ? caption.spacing : 0);
  }
  if (subtitle) {
    ctx.globalAlpha = 0.78;
    ctx.font = `400 ${caption.subtitleSize}px ${family}`;
    ctx.fillText(fitText(ctx, subtitle, caption.rect.width), x, y);
    y += caption.subtitleSize * lineHeight + (footer ? caption.spacing : 0);
  }
  if (footer) {
    ctx.globalAlpha = 0.64;
    ctx.font = `500 ${footerSize}px ${family}`;
    ctx.fillText(fitText(ctx, footer, caption.rect.width), x, y);
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
  ctx.fillStyle = frame.color;
  ctx.fillRect(layout.content.x, layout.content.y, layout.content.width, frame.chrome);
  ctx.fillStyle = colors.barEdge;
  ctx.fillRect(layout.content.x, layout.content.y + frame.chrome - Math.max(1, frame.chrome * 0.02), layout.content.width, Math.max(1, frame.chrome * 0.02));
  if (frame.showControls && frame.style !== "minimal-browser" && frame.style !== "windows-window") frame.dots.forEach((dot, i) => {
    ctx.fillStyle = WINDOW_DOTS[i];
    ctx.beginPath();
    ctx.arc(dot.cx, dot.cy, dot.r, 0, Math.PI * 2);
    ctx.fill();
  });
  if (frame.showControls && frame.style === "windows-window") {
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = Math.max(1, frame.chrome * 0.025);
    const y = layout.content.y + frame.chrome / 2;
    for (let index = 0; index < 3; index++) {
      const x = layout.content.x + layout.content.width - frame.chrome * (2.8 - index * 0.8);
      ctx.beginPath(); ctx.moveTo(x - frame.chrome * 0.09, y); ctx.lineTo(x + frame.chrome * 0.09, y); ctx.stroke();
    }
  }
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
  if (frame.title && !frame.address) {
    ctx.fillStyle = colors.text;
    ctx.font = `${Math.max(8, frame.chrome * 0.28)}px ${BEAUTIFY_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fitText(ctx, frame.title, layout.content.width * 0.6), layout.content.x + layout.content.width / 2, layout.content.y + frame.chrome / 2);
  }
  ctx.restore();
}

function paintComputerBase(ctx: Ctx, layout: BeautifyLayout): void {
  const frame = layout.frame;
  if (frame?.kind !== "browser" || (frame.style !== "laptop" && frame.style !== "monitor")) return;
  const top = layout.screen.y + layout.screen.height;
  const height = layout.content.y + layout.content.height - top;
  if (height <= 0) return;
  ctx.save();
  ctx.fillStyle = frame.color;
  if (frame.style === "laptop") {
    ctx.beginPath();
    ctx.moveTo(layout.content.x, top);
    ctx.lineTo(layout.content.x + layout.content.width, top);
    ctx.lineTo(layout.content.x + layout.content.width * 0.94, top + height);
    ctx.lineTo(layout.content.x + layout.content.width * 0.06, top + height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = FRAME_COLORS[frame.theme].edge;
    ctx.stroke();
  } else {
    ctx.fillRect(layout.content.x, top, layout.content.width, Math.max(1, height * 0.16));
    ctx.fillRect(layout.content.x + layout.content.width * 0.46, top, layout.content.width * 0.08, height * 0.72);
    roundedRectPath(ctx, { x: layout.content.x + layout.content.width * 0.32, y: top + height * 0.68, width: layout.content.width * 0.36, height: height * 0.18 }, [height * 0.09, height * 0.09, height * 0.09, height * 0.09]);
    ctx.fill();
  }
  ctx.restore();
}

function paintPhoneShell(ctx: Ctx, layout: BeautifyLayout): void {
  const frame = layout.frame;
  if (frame?.kind !== "phone") return;
  const colors = FRAME_COLORS[frame.theme];
  roundedRectPath(ctx, layout.content, [layout.radius, layout.radius, layout.radius, layout.radius]);
  ctx.fillStyle = frame.color;
  ctx.fill();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = Math.max(0.5, frame.bezel * 0.12);
  ctx.stroke();
  if (frame.style === "tablet") {
    ctx.beginPath();
    ctx.arc(layout.content.x + layout.content.width / 2, layout.content.y + frame.bezel * 0.42, Math.max(1, frame.bezel * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = colors.edge;
    ctx.fill();
  }
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
  drawImageClamped(ctx, image, sourceRect.x * imageScale, sourceRect.y * imageScale, sourceRect.width * imageScale, sourceRect.height * imageScale, dest.x, dest.y, dest.width, dest.height);
  ctx.restore();
}

function paintMultiComposition(ctx: Ctx, layout: BeautifyLayout, primary: CanvasImageSource | null, primaryScale: number, resources: BeautifyDrawResource[]): void {
  const ids = ["__primary__", ...layout.composition.assetIds].slice(0, layout.composition.layout === "side-by-side" || layout.composition.layout === "stacked" ? 2 : 3);
  const all = ids.map((id) => id === "__primary__"
    ? { id, image: primary, imageScale: primaryScale, source: layout.source }
    : resources.find((resource) => resource.id === id)).filter(Boolean) as { id: string; image: CanvasImageSource | null; imageScale: number; source: { width: number; height: number } }[];
  const placements = multiImageLayout(layout.content, all.map((item) => item.source), layout.composition.layout, layout.composition.spacing);
  placements.forEach((placement, index) => {
    const item = all[index];
    if (!item) return;
    const configured = layout.composition.items[item.id];
    const rect = { ...placement.rect };
    if (configured) {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      rect.width *= configured.scale;
      rect.height *= configured.scale;
      rect.x = cx - rect.width / 2 + (configured.offsetX / 100) * layout.content.width * 0.2;
      rect.y = cy - rect.height / 2 + (configured.offsetY / 100) * layout.content.height * 0.2;
    }
    const radius = Math.min(rect.width, rect.height) * ((configured?.radius ?? 45) / 100) * 0.08;
    ctx.save();
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((placement.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    ctx.shadowColor = "rgba(15, 23, 42, 0.22)";
    ctx.shadowBlur = Math.max(4, Math.min(rect.width, rect.height) * 0.035);
    ctx.shadowOffsetY = Math.max(2, Math.min(rect.width, rect.height) * 0.018);
    roundedRectPath(ctx, rect, [radius, radius, radius, radius]);
    ctx.fillStyle = layout.screenBackground;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    if (item.image) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawImageClamped(ctx, item.image, 0, 0, item.source.width * item.imageScale, item.source.height * item.imageScale, rect.x, rect.y, rect.width, rect.height);
    }
    ctx.restore();
  });
}

function paintBranding(ctx: Ctx, layout: BeautifyLayout, resources: BeautifyDrawResource[]): void {
  const branding = layout.branding;
  if (!branding.assetId) return;
  const resource = resources.find((item) => item.id === branding.assetId);
  if (!resource) return;
  const maxWidth = layout.canvas.width * (branding.scale / 100);
  const maxHeight = layout.canvas.height * (branding.scale / 100);
  const k = Math.min(maxWidth / resource.source.width, maxHeight / resource.source.height);
  const width = resource.source.width * k;
  const height = resource.source.height * k;
  const margin = Math.min(layout.canvas.width, layout.canvas.height) * (branding.margin / 100);
  const x = branding.position.includes("left") ? margin : branding.position.includes("right") ? layout.canvas.width - margin - width : (layout.canvas.width - width) / 2;
  const y = branding.position.includes("top") ? margin : branding.position.includes("bottom") ? layout.canvas.height - margin - height : (layout.canvas.height - height) / 2;
  ctx.save();
  ctx.globalAlpha = branding.opacity / 100;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawImageClamped(ctx, resource.image, 0, 0, resource.source.width * resource.imageScale, resource.source.height * resource.imageScale, x, y, width, height);
  ctx.restore();
}

function paintNotch(ctx: Ctx, layout: BeautifyLayout): void {
  const frame = layout.frame;
  if (frame?.kind !== "phone") return;
  if (frame.style === "tablet") return;
  const n = frame.notch;
  roundedRectPath(ctx, n, [n.radius, n.radius, n.radius, n.radius]);
  ctx.fillStyle = "rgba(14, 12, 10, 0.92)";
  ctx.fill();
}

function paintProjectedShadow(ctx: Ctx, layout: BeautifyLayout, scale: number, quad = layout.perspective.quad): void {
  if (!layout.shadow || (layout.frame?.kind === "phone" && !layout.frame.shadow)) return;
  const [a, b, c, d] = quad;
  ctx.save();
  ctx.shadowColor = layout.shadow.color;
  ctx.shadowBlur = layout.shadow.blur * scale;
  ctx.shadowOffsetX = layout.shadow.offsetX * scale;
  ctx.shadowOffsetY = layout.shadow.offsetY * scale;
  ctx.fillStyle = layout.shadow.color;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function affine(source: readonly [Point, Point, Point], target: readonly [Point, Point, Point]): [number, number, number, number, number, number] {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = target;
  const det = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  const solve = (v0: number, v1: number, v2: number) => [
    (v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / det,
    (v0 * (s2.x - s1.x) + v1 * (s0.x - s2.x) + v2 * (s1.x - s0.x)) / det,
    (v0 * (s1.x * s2.y - s2.x * s1.y) + v1 * (s2.x * s0.y - s0.x * s2.y) + v2 * (s0.x * s1.y - s1.x * s0.y)) / det,
  ];
  const [a, c, e] = solve(d0.x, d1.x, d2.x);
  const [b, d, f] = solve(d0.y, d1.y, d2.y);
  return [a, b, c, d, e, f];
}

const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const bilinear = (quad: BeautifyLayout["perspective"]["quad"], u: number, v: number): Point => mix(mix(quad[0], quad[1], u), mix(quad[3], quad[2], u), v);

function paintComposition(ctx: Ctx, layout: BeautifyLayout, image: CanvasImageSource | null, imageScale: number, scale: number, includeShadow: boolean, resources: BeautifyDrawResource[]): void {
  if (layout.composition.layout !== "single" && resources.some((resource) => layout.composition.assetIds.includes(resource.id))) {
    if (includeShadow) paintCard(ctx, layout, scale, true);
    paintMultiComposition(ctx, layout, image, imageScale, resources);
    return;
  }
  paintCard(ctx, layout, scale, includeShadow);
  if (layout.frame?.kind === "phone") paintPhoneShell(ctx, layout);
  paintScreen(ctx, layout, image, imageScale);
  paintBrowserChrome(ctx, layout);
  paintComputerBase(ctx, layout);
  paintNotch(ctx, layout);
  paintBorder(ctx, layout);
}

/** Piecewise-affine projection keeps vectors and source pixels in the canonical Canvas2D path. */
function paintPerspectiveComposition(ctx: Ctx, layout: BeautifyLayout, image: CanvasImageSource | null, imageScale: number, scale: number, resources: BeautifyDrawResource[]): void {
  const r = layout.content;
  const [tl, tr, br, bl] = layout.perspective.quad;
  const affineBr = { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y };
  // A gentle camera tilt is visually indistinguishable from an affine projection. Drawing it
  // in one pass avoids triangle seams entirely and keeps small type sharp in live previews.
  if (Math.hypot(affineBr.x - br.x, affineBr.y - br.y) < Math.min(r.width, r.height) * 0.03) {
    paintProjectedShadow(ctx, layout, scale, [tl, tr, affineBr, bl]);
    ctx.save();
    ctx.transform(...affine(
      [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x, y: r.y + r.height }],
      [tl, tr, bl],
    ));
    paintComposition(ctx, layout, image, imageScale, scale, false, resources);
    ctx.restore();
    return;
  }
  paintProjectedShadow(ctx, layout, scale);
  // Canvas antialiasing leaves hairline gaps where adjacent triangle clips meet at preview
  // scale. Let the opaque triangles overlap by one device pixel, clipped to the outer quad.
  ctx.save();
  ctx.beginPath();
  layout.perspective.quad.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.closePath();
  ctx.clip();
  const overlap = 1.5 / Math.max(scale, 0.1);
  const cells = 6;
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const u0 = x / cells, u1 = (x + 1) / cells, v0 = y / cells, v1 = (y + 1) / cells;
    const s00 = { x: r.x + r.width * u0, y: r.y + r.height * v0 };
    const s10 = { x: r.x + r.width * u1, y: r.y + r.height * v0 };
    const s11 = { x: r.x + r.width * u1, y: r.y + r.height * v1 };
    const s01 = { x: r.x + r.width * u0, y: r.y + r.height * v1 };
    const d00 = bilinear(layout.perspective.quad, u0, v0);
    const d10 = bilinear(layout.perspective.quad, u1, v0);
    const d11 = bilinear(layout.perspective.quad, u1, v1);
    const d01 = bilinear(layout.perspective.quad, u0, v1);
    const triangles = [[[s00, s10, s11], [d00, d10, d11]], [[s00, s11, s01], [d00, d11, d01]]] as const;
    for (const [source, target] of triangles) {
      const cx = (target[0].x + target[1].x + target[2].x) / 3;
      const cy = (target[0].y + target[1].y + target[2].y) / 3;
      const area = Math.abs((target[1].x - target[0].x) * (target[2].y - target[0].y) - (target[2].x - target[0].x) * (target[1].y - target[0].y)) / 2;
      const perimeter = Math.hypot(target[1].x - target[0].x, target[1].y - target[0].y) + Math.hypot(target[2].x - target[1].x, target[2].y - target[1].y) + Math.hypot(target[0].x - target[2].x, target[0].y - target[2].y);
      const inradius = Math.max(1, (2 * area) / perimeter);
      const expansion = 1 + overlap / inradius;
      const expanded = target.map((point) => {
        return { x: cx + (point.x - cx) * expansion, y: cy + (point.y - cy) * expansion };
      });
      ctx.save();
      ctx.beginPath(); ctx.moveTo(expanded[0].x, expanded[0].y); ctx.lineTo(expanded[1].x, expanded[1].y); ctx.lineTo(expanded[2].x, expanded[2].y); ctx.closePath(); ctx.clip();
      ctx.transform(...affine(source, target));
      paintComposition(ctx, layout, image, imageScale, scale, false, resources);
      ctx.restore();
    }
  }
  ctx.restore();
}

/**
 * Draw the whole composition. `imageScale` is the image's pixels per source pixel (1 for the
 * original file, less for the workspace preview); `scale` maps output pixels to canvas pixels;
 * `offsetY` is the first output row of this tile. A null image draws everything but the
 * screenshot, so the preview can show the composition before its bitmap arrives.
 */
export function drawBeautified(ctx: Ctx, layout: BeautifyLayout, image: CanvasImageSource | null, imageScale = 1, scale = 1, offsetY = 0, resources: BeautifyDrawResource[] = []): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, -offsetY * scale);
  paintBackground(ctx, layout, image, imageScale, scale, resources);
  if (layout.perspective.active) paintPerspectiveComposition(ctx, layout, image, imageScale, scale, resources);
  else paintComposition(ctx, layout, image, imageScale, scale, true, resources);
  paintBranding(ctx, layout, resources);
  paintWatermarks(ctx, layout, resources);
  paintCaption(ctx, layout);
  ctx.restore();
}
