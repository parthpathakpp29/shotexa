/**
 * One affine matrix per transform, shared by the live preview and the full-resolution export,
 * so what the user previews is exactly what they download.
 *
 * Maps crop-local coordinates (0..crop.width, 0..crop.height) to output pixels:
 *   rotate (clockwise) → flip (visible frame) → scale to the output size.
 */
import { orientedSize } from "./orientation";
import { outputSize, sourceCrop } from "./transform";
import type { ImageTransform, Orientation, Point, Size } from "./types";

/** Canvas affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `outer ∘ inner`: apply `inner` first, then `outer`. */
export function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a2, b2, c2, d2, e2, f2] = outer;
  const [a1, b1, c1, d1, e1, f1] = inner;
  return [a2 * a1 + c2 * b1, b2 * a1 + d2 * b1, a2 * c1 + c2 * d1, b2 * c1 + d2 * d1, a2 * e1 + c2 * f1 + e2, b2 * e1 + d2 * f1 + f2];
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Clockwise rotation of a `w`×`h` frame into its rotated frame (origin stays top-left). */
function rotationMatrix(rotation: Orientation["rotation"], w: number, h: number): Matrix {
  switch (rotation) {
    case 90:
      return [0, 1, -1, 0, h, 0];
    case 180:
      return [-1, 0, 0, -1, w, h];
    case 270:
      return [0, -1, 1, 0, 0, w];
    default:
      return IDENTITY;
  }
}

/** Crop-local → output pixels for a crop of `crop` size shown at `out` size. */
export function transformMatrix(crop: Size, o: Orientation, out: Size): Matrix {
  const oriented = orientedSize(crop, o.rotation);
  const rotate = rotationMatrix(o.rotation, crop.width, crop.height);
  const flip: Matrix = [o.flipH ? -1 : 1, 0, 0, o.flipV ? -1 : 1, o.flipH ? oriented.width : 0, o.flipV ? oriented.height : 0];
  const scale: Matrix = [out.width / oriented.width, 0, 0, out.height / oriented.height, 0, 0];
  return multiply(scale, multiply(flip, rotate));
}

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/**
 * Draw `image` transformed into a canvas of `out` size.
 *
 * - `imageScale`: pixels of `image` per source pixel (1 for the original, < 1 for a preview).
 * - `offsetY`: output row at the top of this canvas, for tiled export of tall results.
 *
 * Only the crop region is sampled, so pixels outside the crop can never bleed into the edge.
 */
export function drawTransformed(ctx: Ctx, image: CanvasImageSource, imageScale: number, t: ImageTransform, source: Size, out: Size, offsetY = 0): void {
  const crop = sourceCrop(t, source);
  const m = transformMatrix({ width: crop.width, height: crop.height }, t, out);
  const oriented = orientedSize({ width: crop.width, height: crop.height }, t.rotation);
  // A pure crop/rotate/flip at 1:1 is an exact pixel copy — never let smoothing soften it.
  const exact = imageScale === 1 && out.width === oriented.width && out.height === oriented.height;
  ctx.save();
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5] - offsetY);
  ctx.imageSmoothingEnabled = !exact;
  if (!exact) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, crop.x * imageScale, crop.y * imageScale, crop.width * imageScale, crop.height * imageScale, 0, 0, crop.width, crop.height);
  ctx.restore();
}

/** Final output size for a transform — re-exported so renderers need one import. */
export { outputSize };
