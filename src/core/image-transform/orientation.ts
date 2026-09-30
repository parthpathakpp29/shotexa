/**
 * Quarter-turn rotation and mirroring. Continuous coordinates (pixel edges), so an integer
 * rectangle maps to an integer rectangle exactly — quarter turns and flips never resample.
 *
 * Model: visible = flip(rotate(source)). Rotation is clockwise; flips act on the rotated
 * (visible) frame, so "Flip horizontal" always mirrors what the user currently sees.
 */
import type { Orientation, Point, Rect, Rotation, Size } from "./types";

export const IDENTITY_ORIENTATION: Orientation = { rotation: 0, flipH: false, flipV: false };

export const isQuarterTurn = (rotation: Rotation) => rotation === 90 || rotation === 270;

/** Size of an image after rotation (width and height swap on a quarter turn). */
export function orientedSize(size: Size, rotation: Rotation): Size {
  return isQuarterTurn(rotation) ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}

/** Rotate a point of a `width`×`height` frame clockwise by `rotation`. */
function rotatePoint(p: Point, width: number, height: number, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: height - p.y, y: p.x };
    case 180:
      return { x: width - p.x, y: height - p.y };
    case 270:
      return { x: p.y, y: width - p.x };
    default:
      return { x: p.x, y: p.y };
  }
}

/** Source-frame point → visible-frame point. */
export function toOriented(p: Point, source: Size, o: Orientation): Point {
  const q = rotatePoint(p, source.width, source.height, o.rotation);
  const os = orientedSize(source, o.rotation);
  return { x: o.flipH ? os.width - q.x : q.x, y: o.flipV ? os.height - q.y : q.y };
}

/** Visible-frame point → source-frame point (exact inverse of `toOriented`). */
export function fromOriented(p: Point, source: Size, o: Orientation): Point {
  const os = orientedSize(source, o.rotation);
  const q = { x: o.flipH ? os.width - p.x : p.x, y: o.flipV ? os.height - p.y : p.y };
  return rotatePoint(q, os.width, os.height, ((360 - o.rotation) % 360) as Rotation);
}

function rectThrough(rect: Rect, map: (p: Point) => Point): Rect {
  const a = map({ x: rect.x, y: rect.y });
  const b = map({ x: rect.x + rect.width, y: rect.y + rect.height });
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export const rectToOriented = (rect: Rect, source: Size, o: Orientation): Rect => rectThrough(rect, (p) => toOriented(p, source, o));
export const rectFromOriented = (rect: Rect, source: Size, o: Orientation): Rect => rectThrough(rect, (p) => fromOriented(p, source, o));

/**
 * Rotations and mirrors of a rectangle form only eight distinct pictures, but rotation × two
 * flips can spell them sixteen ways. Store each picture exactly one way — a rotation plus at
 * most a horizontal mirror — so equal images always compare equal (undo, reset, identity).
 *
 * Uses FlipV = FlipH · R180 (a vertical mirror is a horizontal mirror plus a half turn),
 * so FlipH · FlipV = R180.
 */
export function normaliseOrientation(o: Orientation): Orientation {
  if (!o.flipV) return { rotation: o.rotation, flipH: o.flipH, flipV: false };
  return { rotation: ((o.rotation + 180) % 360) as Rotation, flipH: !o.flipH, flipV: false };
}

/**
 * Rotate what the user currently sees by a quarter turn. Because R90·FlipH = FlipV·R90, a
 * quarter turn swaps which axis an existing flip acts on.
 */
export function rotateOrientation(o: Orientation, direction: "cw" | "ccw"): Orientation {
  const step = direction === "cw" ? 90 : 270;
  return normaliseOrientation({ rotation: ((o.rotation + step) % 360) as Rotation, flipH: o.flipV, flipV: o.flipH });
}

/** Mirror what the user currently sees. */
export function flipOrientation(o: Orientation, axis: "horizontal" | "vertical"): Orientation {
  return normaliseOrientation(axis === "horizontal" ? { ...o, flipH: !o.flipH } : { ...o, flipV: !o.flipV });
}
