/**
 * Annotation geometry. Annotations are STORED in source pixels and INTERACTED WITH in output
 * pixels (what the user sees and what exports). One frame — built from the Screenshot Editor's
 * own source→output matrix — converts between them, so no crop/rotate/flip/resize maths lives
 * here: it is all inherited from `image-transform`.
 *
 * Positions follow the matrix exactly. Lengths (stroke width, font size, marker radius) scale
 * by the matrix's scale. Text and step numbers are drawn upright in the output frame, so a
 * rotated or flipped image never produces sideways or mirrored glyphs.
 */
import { MIN_CROP, resizeCrop } from "@/core/image-transform/crop";
import { applyMatrix, invertMatrix, matrixScale, outputSize, sourceToOutputMatrix, type Matrix } from "@/core/image-transform/matrix";
import type { CropHandle, ImageTransform, Size } from "@/core/image-transform/types";
import type { AnnotationObject, ArrowAnnotation, Point, Rect, TextAnnotation } from "./types";

export interface AnnotationFrame {
  /** Source → output pixels. */
  m: Matrix;
  /** Output → source pixels. */
  inv: Matrix;
  /** Output pixels per source pixel, for lengths. */
  k: number;
  /** Output image size. */
  out: Size;
}

export function annotationFrame(t: ImageTransform, source: Size): AnnotationFrame {
  const m = sourceToOutputMatrix(t, source);
  return { m, inv: invertMatrix(m), k: matrixScale(m), out: outputSize(t, source) };
}

/** Axis-aligned rectangle through an affine that maps axes to axes (all editor transforms do). */
function mapRect(r: Rect, m: Matrix): Rect {
  const a = applyMatrix(m, { x: r.x, y: r.y });
  const b = applyMatrix(m, { x: r.x + r.width, y: r.y + r.height });
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function mapObject(o: AnnotationObject, m: Matrix, lengths: number): AnnotationObject {
  const p = (q: Point) => applyMatrix(m, q);
  switch (o.type) {
    case "arrow":
      return { ...o, from: p(o.from), to: p(o.to), width: o.width * lengths };
    case "rectangle":
      return { ...o, rect: mapRect(o.rect, m), width: o.width * lengths };
    case "highlight":
      return { ...o, rect: mapRect(o.rect, m) };
    case "text":
      return { ...o, at: p(o.at), size: o.size * lengths };
    case "freehand":
      return { ...o, points: o.points.map(p), width: o.width * lengths };
    case "step":
      return { ...o, at: p(o.at), radius: o.radius * lengths };
  }
}

/** Source-pixel object → output-pixel object (for drawing and interaction). */
export const toOutput = (o: AnnotationObject, f: AnnotationFrame) => mapObject(o, f.m, f.k);
/** Output-pixel object → source-pixel object (for storage). Exact inverse of `toOutput`. */
export const toSource = (o: AnnotationObject, f: AnnotationFrame) => mapObject(o, f.inv, 1 / f.k);

// ——— Text layout (shared by hit-testing, selection bounds and rendering) ———

export const TEXT_LINE_HEIGHT = 1.25;
/** Measures one line in output pixels. Rendering passes the canvas; tests use the estimate. */
export type MeasureText = (line: string, size: number) => number;
/** Average glyph width of a semibold UI sans — close enough where no canvas exists. */
export const estimateText: MeasureText = (line, size) => line.length * size * 0.56;

export function textLines(text: string): string[] {
  return text.split("\n");
}

export function textBox(o: TextAnnotation, measure: MeasureText = estimateText): Rect {
  const lines = textLines(o.text);
  const width = Math.max(o.size * 0.5, ...lines.map((l) => measure(l, o.size)));
  return { x: o.at.x, y: o.at.y, width, height: lines.length * o.size * TEXT_LINE_HEIGHT };
}

// ——— Arrow ———

export interface ArrowGeometry {
  /** Where the shaft stops, so the round cap never pokes through the head. */
  shaftEnd: Point;
  head: [Point, Point, Point];
}

/** Arrow head scaled to the stroke, shrinking on very short arrows so it never overshoots. */
export function arrowGeometry(from: Point, to: Point, width: number): ArrowGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const headLength = Math.min(Math.max(width * 3.4, 10), length * 0.8);
  const halfWidth = headLength * 0.58;
  const base = { x: to.x - ux * headLength, y: to.y - uy * headLength };
  return {
    shaftEnd: base,
    head: [
      { x: to.x, y: to.y },
      { x: base.x - uy * halfWidth, y: base.y + ux * halfWidth },
      { x: base.x + uy * halfWidth, y: base.y - ux * halfWidth },
    ],
  };
}

// ——— Bounds and hit-testing (output pixels) ———

const union = (rects: Rect[]): Rect => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
};

const pointRect = (p: Point, pad: number): Rect => ({ x: p.x - pad, y: p.y - pad, width: pad * 2, height: pad * 2 });

/** Visual bounds, including stroke thickness and arrow heads. */
export function bounds(o: AnnotationObject, measure?: MeasureText): Rect {
  switch (o.type) {
    case "arrow": {
      const g = arrowGeometry(o.from, o.to, o.width);
      return union([pointRect(o.from, o.width / 2), ...g.head.map((p) => pointRect(p, 0))]);
    }
    case "rectangle":
      return { x: o.rect.x - o.width / 2, y: o.rect.y - o.width / 2, width: o.rect.width + o.width, height: o.rect.height + o.width };
    case "highlight":
      return o.rect;
    case "text":
      return textBox(o, measure);
    case "freehand":
      return union(o.points.map((p) => pointRect(p, o.width / 2)));
    case "step":
      return pointRect(o.at, o.radius);
  }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const inside = (p: Point, r: Rect, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.width + pad && p.y >= r.y - pad && p.y <= r.y + r.height + pad;

/** Does `p` (output pixels) touch this object? `tolerance` makes thin strokes grabbable. */
export function hits(o: AnnotationObject, p: Point, tolerance: number, measure?: MeasureText): boolean {
  switch (o.type) {
    case "arrow":
      return distanceToSegment(p, o.from, o.to) <= o.width / 2 + tolerance;
    case "rectangle":
    case "highlight":
      // The whole box is grabbable, not just its thin outline.
      return inside(p, o.type === "rectangle" ? bounds(o) : o.rect, tolerance);
    case "text":
      return inside(p, textBox(o, measure), tolerance);
    case "freehand":
      if (o.points.length === 1) return Math.hypot(p.x - o.points[0].x, p.y - o.points[0].y) <= o.width / 2 + tolerance;
      return o.points.some((q, i) => i > 0 && distanceToSegment(p, o.points[i - 1], q) <= o.width / 2 + tolerance);
    case "step":
      return Math.hypot(p.x - o.at.x, p.y - o.at.y) <= o.radius + tolerance;
  }
}

/** Topmost object under `p` (last drawn wins), or null. */
export function hitTest(objects: AnnotationObject[], p: Point, tolerance: number, measure?: MeasureText): string | null {
  for (let i = objects.length - 1; i >= 0; i--) if (hits(objects[i], p, tolerance, measure)) return objects[i].id;
  return null;
}

// ——— Editing (output pixels) ———

export function moveBy(o: AnnotationObject, dx: number, dy: number): AnnotationObject {
  const p = (q: Point) => ({ x: q.x + dx, y: q.y + dy });
  switch (o.type) {
    case "arrow":
      return { ...o, from: p(o.from), to: p(o.to) };
    case "rectangle":
    case "highlight":
      return { ...o, rect: { ...o.rect, x: o.rect.x + dx, y: o.rect.y + dy } };
    case "text":
    case "step":
      return { ...o, at: p(o.at) };
    case "freehand":
      return { ...o, points: o.points.map(p) };
  }
}

/**
 * Limit a move so the object stays at least partly on the image: its bounds may overhang an
 * edge, but never leave the image entirely (it could not be selected again).
 */
export function clampMove(o: AnnotationObject, dx: number, dy: number, out: Size, measure?: MeasureText): Point {
  const b = bounds(o, measure);
  const keep = Math.min(24, b.width, b.height);
  const minDx = keep - (b.x + b.width);
  const maxDx = out.width - keep - b.x;
  const minDy = keep - (b.y + b.height);
  const maxDy = out.height - keep - b.y;
  return { x: Math.min(maxDx, Math.max(minDx, dx)), y: Math.min(maxDy, Math.max(minDy, dy)) };
}

/** Resize a box-shaped annotation by a handle — the Screenshot Editor's crop-handle maths. */
export function resizeBox(r: Rect, handle: CropHandle, pointer: Point, out: Size): Rect {
  return resizeCrop(r, handle, pointer, out, null, Math.min(MIN_CROP, out.width, out.height));
}

/** Keep a point on the image (drawing gestures may wander off the edge). */
export const clampPoint = (p: Point, out: Size): Point => ({ x: Math.min(out.width, Math.max(0, p.x)), y: Math.min(out.height, Math.max(0, p.y)) });

/** The box spanned by a drag from `a` to `b`, in any direction. */
export function boxFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Is a just-drawn object big enough to be intentional, rather than a stray click? */
export function isMeaningful(o: AnnotationObject, minSize: number): boolean {
  if (o.type === "arrow") return Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y) >= minSize;
  if (o.type === "rectangle" || o.type === "highlight") return o.rect.width >= minSize && o.rect.height >= minSize;
  return true;
}

/** Move one end of an arrow. */
export function setEndpoint(o: ArrowAnnotation, end: "from" | "to", p: Point): ArrowAnnotation {
  return { ...o, [end]: p };
}

/** Which handles an object offers (output-pixel positions). */
export function handlesFor(o: AnnotationObject): { id: string; at: Point }[] {
  if (o.type === "arrow") {
    return [
      { id: "from", at: o.from },
      { id: "to", at: o.to },
    ];
  }
  if (o.type === "rectangle" || o.type === "highlight") {
    const { x, y, width: w, height: h } = o.rect;
    return [
      { id: "nw", at: { x, y } },
      { id: "n", at: { x: x + w / 2, y } },
      { id: "ne", at: { x: x + w, y } },
      { id: "e", at: { x: x + w, y: y + h / 2 } },
      { id: "se", at: { x: x + w, y: y + h } },
      { id: "s", at: { x: x + w / 2, y: y + h } },
      { id: "sw", at: { x, y: y + h } },
      { id: "w", at: { x, y: y + h / 2 } },
    ];
  }
  return [];
}
