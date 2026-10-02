/**
 * Whole-transform operations. Every function is pure and returns a new transform, so each
 * user action is one `{ before, after }` step in the workspace undo history.
 */
import { aspectRatio, clampCrop, coversAll, presetCrop, roundRect } from "./crop";
import { flipOrientation, isQuarterTurn, orientedSize, rectFromOriented, rectToOriented, rotateOrientation } from "./orientation";
import type { AspectPreset, ImageTransform, Rect, Size } from "./types";

export const IDENTITY_TRANSFORM: ImageTransform = {
  crop: null,
  rotation: 0,
  flipH: false,
  flipV: false,
  resize: null,
  lockAspect: true,
  cropAspect: "free",
};

/**
 * Output bounds. The width is also the width of each export tile, so it stays within every
 * engine's canvas dimension limit. Height can exceed a single canvas because tall PNGs are
 * streamed tile by tile (Spike B) — long Smart Stitch results must stay editable.
 */
export const EDITOR_LIMITS = {
  maxWidth: 32_767,
  maxHeight: 131_072,
  maxArea: 200_000_000,
  /** Largest enlargement a typed size may request (upscaling adds no detail). */
  maxScale: 8,
} as const;

/** True when exporting would reproduce the source pixel-for-pixel (nothing to export). */
export function isIdentity(t: ImageTransform): boolean {
  return t.crop === null && t.rotation === 0 && !t.flipH && !t.flipV && t.resize === null;
}

export const sameTransform = (a: ImageTransform, b: ImageTransform) => JSON.stringify(a) === JSON.stringify(b);

const fullRect = (source: Size): Rect => ({ x: 0, y: 0, width: source.width, height: source.height });

/** The crop in source pixels (the whole image when uncropped). */
export const sourceCrop = (t: ImageTransform, source: Size): Rect => t.crop ?? fullRect(source);

/** Size of the whole image as currently seen (after rotation). */
export const visibleSize = (t: ImageTransform, source: Size): Size => orientedSize(source, t.rotation);

/** The crop box as the user sees it, in visible-frame pixels. */
export const visibleCrop = (t: ImageTransform, source: Size): Rect => rectToOriented(sourceCrop(t, source), source, t);

/** Set the crop from a visible-frame rectangle. A crop covering everything is stored as null. */
export function withVisibleCrop(t: ImageTransform, source: Size, rect: Rect): ImageTransform {
  const visible = visibleSize(t, source);
  const clamped = clampCrop(roundRect(rect), visible);
  const crop = coversAll(clamped, visible) ? null : roundRect(rectFromOriented(clamped, source, t));
  return { ...t, crop };
}

/** Natural output size: the crop after rotation, before any resize. */
export function naturalSize(t: ImageTransform, source: Size): Size {
  const crop = sourceCrop(t, source);
  return orientedSize({ width: crop.width, height: crop.height }, t.rotation);
}

/** Final output size in pixels. Never below 1 px on either side. */
export function outputSize(t: ImageTransform, source: Size): Size {
  const natural = naturalSize(t, source);
  if (!t.resize) return natural;
  return {
    width: Math.max(1, Math.round(natural.width * t.resize.scaleX)),
    height: Math.max(1, Math.round(natural.height * t.resize.scaleY)),
  };
}

/** Rotate the visible image a quarter turn. The crop rotates with it (it is stored in source space). */
export function rotateTransform(t: ImageTransform, direction: "cw" | "ccw"): ImageTransform {
  const orientation = rotateOrientation(t, direction);
  // A fixed landscape ratio would snap a now-portrait crop back on the next drag.
  const cropAspect: AspectPreset = t.cropAspect === "4:3" || t.cropAspect === "16:9" ? "free" : t.cropAspect;
  // Width and height swap, so their scales swap with them.
  const resize = t.resize ? { scaleX: t.resize.scaleY, scaleY: t.resize.scaleX } : null;
  return { ...t, ...orientation, cropAspect, resize };
}

/** Half turn. Width and height keep their axes, so the crop ratio and scales are untouched. */
export function rotate180(t: ImageTransform): ImageTransform {
  return { ...t, ...rotateOrientation(rotateOrientation(t, "cw"), "cw") };
}

export function flipTransform(t: ImageTransform, axis: "horizontal" | "vertical"): ImageTransform {
  return { ...t, ...flipOrientation(t, axis) };
}

/** Choose a crop ratio and apply it: the largest centred box of that ratio (free keeps the crop). */
export function withCropAspect(t: ImageTransform, source: Size, preset: AspectPreset): ImageTransform {
  const next = { ...t, cropAspect: preset };
  const visible = visibleSize(t, source);
  const ratio = aspectRatio(preset, visible);
  if (ratio === null) return next;
  return withVisibleCrop(next, source, presetCrop(ratio, visible));
}

export const resetCrop = (t: ImageTransform): ImageTransform => ({ ...t, crop: null, cropAspect: "free" });

/**
 * Apply one typed crop value (visible-frame pixels). A typed value is honoured rather than
 * silently snapped back: a position that would push the box past the image trims the box to
 * fit, and with a fixed ratio the other side follows so the ratio holds.
 */
export function withCropField(t: ImageTransform, source: Size, field: keyof Rect, value: number): ImageTransform {
  const visible = visibleSize(t, source);
  const crop = visibleCrop(t, source);
  const ratio = aspectRatio(t.cropAspect, visible);
  const v = Math.max(0, Math.round(value));
  const next = { ...crop };
  if (field === "x") {
    next.x = Math.min(v, visible.width - 1);
    next.width = Math.min(crop.width, visible.width - next.x);
    if (ratio) next.height = Math.round(next.width / ratio);
  } else if (field === "y") {
    next.y = Math.min(v, visible.height - 1);
    next.height = Math.min(crop.height, visible.height - next.y);
    if (ratio) next.width = Math.round(next.height * ratio);
  } else if (field === "width") {
    next.width = Math.max(1, Math.min(v, visible.width - crop.x));
    if (ratio) next.height = Math.round(next.width / ratio);
  } else {
    next.height = Math.max(1, Math.min(v, visible.height - crop.y));
    if (ratio) next.width = Math.round(next.height * ratio);
  }
  return withVisibleCrop(t, source, next);
}

function withScale(t: ImageTransform, scaleX: number, scaleY: number): ImageTransform {
  const clamp = (s: number) => Math.min(EDITOR_LIMITS.maxScale, Math.max(Number.EPSILON, s));
  const sx = clamp(scaleX);
  const sy = clamp(scaleY);
  // Natural size again: drop the resize so later crops keep tracking the real pixels.
  return { ...t, resize: sx === 1 && sy === 1 ? null : { scaleX: sx, scaleY: sy } };
}

/** Parse a typed pixel dimension: whole, positive, finite. */
export function parseDimension(value: string | number): number | null {
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const whole = Math.round(n);
  return whole >= 1 ? whole : null;
}

/** Set the output width in pixels; with the aspect locked, height follows. */
export function withOutputWidth(t: ImageTransform, source: Size, width: number): ImageTransform {
  const natural = naturalSize(t, source);
  const w = Math.min(EDITOR_LIMITS.maxWidth, Math.max(1, Math.round(width)));
  const sx = w / natural.width;
  const current = t.resize ?? { scaleX: 1, scaleY: 1 };
  return withScale(t, sx, t.lockAspect ? sx : current.scaleY);
}

/** Set the output height in pixels; with the aspect locked, width follows. */
export function withOutputHeight(t: ImageTransform, source: Size, height: number): ImageTransform {
  const natural = naturalSize(t, source);
  const h = Math.min(EDITOR_LIMITS.maxHeight, Math.max(1, Math.round(height)));
  const sy = h / natural.height;
  const current = t.resize ?? { scaleX: 1, scaleY: 1 };
  return withScale(t, t.lockAspect ? sy : current.scaleX, sy);
}

/** Scale both sides by a percentage of the natural size. */
export const withScalePercent = (t: ImageTransform, percent: number) => withScale(t, percent / 100, percent / 100);

/** Locking snaps height back to the width's scale so the image is never left distorted. */
export function withLockAspect(t: ImageTransform, lockAspect: boolean): ImageTransform {
  const next = { ...t, lockAspect };
  return lockAspect && t.resize ? withScale(next, t.resize.scaleX, t.resize.scaleX) : next;
}

export const resetResize = (t: ImageTransform): ImageTransform => ({ ...t, resize: null });

export type OutputIssue = "too-large" | "too-many-pixels";

/** Why an output size cannot be exported, or null when it is fine. */
export function outputIssue(size: Size): OutputIssue | null {
  if (size.width > EDITOR_LIMITS.maxWidth || size.height > EDITOR_LIMITS.maxHeight) return "too-large";
  if (size.width * size.height > EDITOR_LIMITS.maxArea) return "too-many-pixels";
  return null;
}

/** Guard for anything that reaches the renderer: integers, inside the source, positive scales. */
export function isValidTransform(t: ImageTransform, source: Size): boolean {
  if (![0, 90, 180, 270].includes(t.rotation)) return false;
  if (t.resize && !(t.resize.scaleX > 0 && t.resize.scaleY > 0 && Number.isFinite(t.resize.scaleX) && Number.isFinite(t.resize.scaleY))) return false;
  if (!t.crop) return true;
  const c = t.crop;
  const ints = [c.x, c.y, c.width, c.height].every(Number.isInteger);
  return ints && c.x >= 0 && c.y >= 0 && c.width >= 1 && c.height >= 1 && c.x + c.width <= source.width && c.y + c.height <= source.height;
}

const ROTATION_LABEL: Record<number, string> = { 90: "Rotated 90° right", 180: "Rotated 180°", 270: "Rotated 90° left" };

/**
 * Plain-language summary for the inspector. Orientations are stored canonically (a rotation
 * plus at most a horizontal mirror), and several user actions reach the same stored state —
 * e.g. "rotate right, flip vertical" and "rotate left, flip horizontal" produce the identical
 * picture. So a mirrored quarter turn is described without claiming a direction or an axis
 * the user may not have chosen; every other state has exactly one natural description.
 */
export function describeOrientation(t: ImageTransform): string[] {
  if (!t.flipH) return t.rotation ? [ROTATION_LABEL[t.rotation]] : [];
  if (t.rotation === 0) return ["Flipped horizontally"];
  if (t.rotation === 180) return ["Flipped vertically"];
  return ["Rotated 90°", "Mirrored"];
}

export { isQuarterTurn };
