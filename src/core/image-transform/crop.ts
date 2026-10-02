/**
 * Crop-box geometry in the VISIBLE (oriented) frame — the frame the user drags in. Pure
 * functions: the canvas only converts pointer positions to image pixels and calls these.
 */
import type { AspectPreset, CropHandle, Point, Rect, Size } from "./types";

/** Smallest crop, in image pixels. Keeps handles grabbable and the output non-degenerate. */
export const MIN_CROP = 8;

/** Width ÷ height the crop must keep, or null for a free crop. */
export function aspectRatio(preset: AspectPreset, visible: Size): number | null {
  switch (preset) {
    case "original":
      return visible.width / visible.height;
    case "1:1":
      return 1;
    case "4:3":
      return 4 / 3;
    case "16:9":
      return 16 / 9;
    default:
      return null;
  }
}

export function roundRect(r: Rect): Rect {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  return { x, y, width: Math.round(r.x + r.width) - x, height: Math.round(r.y + r.height) - y };
}

/** Largest centred rectangle of `ratio` that fits in `bounds`. */
export function presetCrop(ratio: number, bounds: Size): Rect {
  let width = bounds.width;
  let height = width / ratio;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * ratio;
  }
  return roundRect({ x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height });
}

/** Keep a rectangle inside `bounds` without changing its size (unless it is larger than them). */
export function clampCrop(r: Rect, bounds: Size, min = MIN_CROP): Rect {
  const width = Math.max(Math.min(min, bounds.width), Math.min(r.width, bounds.width));
  const height = Math.max(Math.min(min, bounds.height), Math.min(r.height, bounds.height));
  return {
    x: Math.min(Math.max(0, r.x), bounds.width - width),
    y: Math.min(Math.max(0, r.y), bounds.height - height),
    width,
    height,
  };
}

export function moveCrop(r: Rect, dx: number, dy: number, bounds: Size): Rect {
  return clampCrop({ ...r, x: r.x + dx, y: r.y + dy }, bounds);
}

const HORIZONTAL: Record<CropHandle, -1 | 0 | 1> = { n: 0, s: 0, e: 1, w: -1, ne: 1, nw: -1, se: 1, sw: -1 };
const VERTICAL: Record<CropHandle, -1 | 0 | 1> = { n: -1, s: 1, e: 0, w: 0, ne: -1, nw: -1, se: 1, sw: 1 };

/**
 * Resize by dragging `handle` to `pointer`. The opposite edge (or corner) stays anchored; the
 * box never flips past its anchor, never leaves `bounds`, and keeps `ratio` when one is given.
 */
export function resizeCrop(r: Rect, handle: CropHandle, pointer: Point, bounds: Size, ratio: number | null, min = MIN_CROP): Rect {
  const hx = HORIZONTAL[handle];
  const hy = VERTICAL[handle];
  // Anchor: the edge opposite each moving edge. An axis that does not move keeps its span.
  const anchorX = hx === 1 ? r.x : hx === -1 ? r.x + r.width : r.x;
  const anchorY = hy === 1 ? r.y : hy === -1 ? r.y + r.height : r.y;
  // Room available from the anchor towards the moving edge.
  const roomX = hx === 1 ? bounds.width - anchorX : hx === -1 ? anchorX : bounds.width;
  const roomY = hy === 1 ? bounds.height - anchorY : hy === -1 ? anchorY : bounds.height;

  let width = hx === 0 ? r.width : Math.min(roomX, Math.max(min, (pointer.x - anchorX) * hx));
  let height = hy === 0 ? r.height : Math.min(roomY, Math.max(min, (pointer.y - anchorY) * hy));

  if (ratio) {
    if (hx !== 0 && hy !== 0) {
      // Corner: follow whichever axis the pointer has moved further, then fit the room.
      if (width / height > ratio) height = width / ratio;
      else width = height * ratio;
    } else if (hx !== 0) height = width / ratio;
    else width = height * ratio;
    // An edge drag grows the other axis about the box's centre; its room is the whole bound.
    const maxW = hx === 0 ? bounds.width : roomX;
    const maxH = hy === 0 ? bounds.height : roomY;
    if (width > maxW) {
      width = maxW;
      height = width / ratio;
    }
    if (height > maxH) {
      height = maxH;
      width = height * ratio;
    }
  }

  const x = hx === 1 ? anchorX : hx === -1 ? anchorX - width : r.x + (r.width - width) / 2;
  const y = hy === 1 ? anchorY : hy === -1 ? anchorY - height : r.y + (r.height - height) / 2;
  return clampCrop(roundRect({ x, y, width, height }), bounds, min);
}

/** True when a rectangle covers the whole of `bounds` (i.e. there is no crop). */
export const coversAll = (r: Rect, bounds: Size) => r.x <= 0 && r.y <= 0 && r.x + r.width >= bounds.width && r.y + r.height >= bounds.height;
