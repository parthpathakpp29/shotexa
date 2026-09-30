/**
 * Annotation object helpers: defaults, list edits, step numbering, path simplification and
 * the drag-session primitive. Pure functions — every edit returns a new list, so any change is
 * one `{ before, after }` step in the workspace undo history.
 */
import type { Size } from "@/core/image-transform/types";
import type { AnnotationObject, AnnotationStyle, Point, StepAnnotation } from "./types";

export const ANNOTATION_COLORS = [
  { value: "#e5383b", label: "Red" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#16a34a", label: "Green" },
  { value: "#2563eb", label: "Blue" },
  { value: "#1c1714", label: "Ink" },
  { value: "#ffffff", label: "White" },
] as const;

export const HIGHLIGHT_COLORS = [
  { value: "#ffe14d", label: "Yellow" },
  { value: "#86efac", label: "Green" },
  { value: "#f9a8d4", label: "Pink" },
  { value: "#93c5fd", label: "Blue" },
] as const;

export const DEFAULT_STYLE: AnnotationStyle = {
  color: ANNOTATION_COLORS[0].value,
  highlightColor: HIGHLIGHT_COLORS[0].value,
  highlightOpacity: 0.5,
  strokeWidth: null,
  fontSize: null,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Automatic sizes, in output pixels, proportional to the image — a 6 px stroke that suits a
 * phone screenshot would vanish on a 4K capture.
 */
export function autoSizes(out: Size) {
  const short = Math.min(out.width, out.height);
  return {
    stroke: clamp(Math.round(short / 200), 3, 48),
    font: clamp(Math.round(short / 26), 16, 240),
    radius: clamp(Math.round(short / 38), 14, 160),
  };
}

export function newAnnotationId(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ——— List edits ———

export const addObject = (list: AnnotationObject[], o: AnnotationObject) => [...list, o];

export const updateObject = (list: AnnotationObject[], o: AnnotationObject) => list.map((x) => (x.id === o.id ? o : x));

export const removeObject = (list: AnnotationObject[], id: string) => list.filter((x) => x.id !== id);

/** Bring to front: drawn last, hit-tested first. */
export const bringToFront = (list: AnnotationObject[], id: string) => {
  const o = list.find((x) => x.id === id);
  return o ? [...list.filter((x) => x.id !== id), o] : list;
};

// ——— Step numbering ———

const steps = (list: AnnotationObject[]) => list.filter((o): o is StepAnnotation => o.type === "step");

/**
 * Next marker number: one more than the highest, not the count. Deleting "2" from 1, 2, 3
 * never silently renumbers the markers the user already placed, and the next one is 4.
 */
export function nextStepNumber(list: AnnotationObject[]): number {
  return steps(list).reduce((max, s) => Math.max(max, s.n), 0) + 1;
}

/** True when markers are no longer exactly 1…N (after a delete, or a duplicate edit). */
export function stepsNeedRenumber(list: AnnotationObject[]): boolean {
  const ns = steps(list)
    .map((s) => s.n)
    .sort((a, b) => a - b);
  return ns.some((n, i) => n !== i + 1);
}

/** Explicit, undoable renumber to 1…N, keeping the current order (ties: placement order). */
export function renumberSteps(list: AnnotationObject[]): AnnotationObject[] {
  const ordered = steps(list)
    .map((s, index) => ({ s, index }))
    .sort((a, b) => a.s.n - b.s.n || a.index - b.index);
  const numbers = new Map(ordered.map(({ s }, i) => [s.id, i + 1]));
  return list.map((o) => (o.type === "step" ? { ...o, n: numbers.get(o.id)! } : o));
}

// ——— Freehand paths ———

function perpendicular(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!len) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Ramer–Douglas–Peucker: drop points that deviate less than `epsilon` from the line. */
function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let index = -1;
    let max = 0;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicular(points[i], points[start], points[end]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== -1 && max > epsilon) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export const MAX_PATH_POINTS = 800;
/** RDP is O(n²) in the worst case; never feed it more than this, whatever the input. */
const MAX_RDP_INPUT = MAX_PATH_POINTS * 4;

/** Drop points closer than `min` to the last kept point — linear, and removes jitter. */
function radialFilter(points: Point[], min: number): Point[] {
  if (points.length < 3) return points;
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = kept[kept.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= min) kept.push(points[i]);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

/** Evenly thin an oversized path, keeping both ends. */
function subsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/**
 * Simplify a drawn path. The error tolerance is below a pixel, so the stroke looks the same.
 * Cost is strictly bounded — a linear pre-filter, a capped input, ONE simplification pass —
 * so even a pathological scribble cannot freeze the page. Anything still over the cap (only
 * noise-like input gets there) is thinned evenly.
 */
export function simplifyPath(points: Point[], epsilon = 0.6): Point[] {
  const round = (p: Point) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  // Drop exact repeats first (a stationary pointer reports the same position many times).
  const unique = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  const input = subsample(radialFilter(unique, epsilon), MAX_RDP_INPUT);
  return subsample(rdp(input, epsilon), MAX_PATH_POINTS).map(round);
}

// ——— Drag sessions ———

/**
 * The latest value of an in-progress drag, readable synchronously.
 *
 * Pointer-up must commit what the pointer last reported — never the value from the last
 * *rendered* frame. On a slow device a fast drag outruns rendering; committing render state
 * made the Screenshot Editor crop jump back and let Safe Share drop a region entirely.
 */
export class DragSession<T> {
  #latest: T | null = null;
  #active = false;

  begin(initial: T | null = null): void {
    this.#active = true;
    this.#latest = initial;
  }

  update(value: T): void {
    if (this.#active) this.#latest = value;
  }

  get active(): boolean {
    return this.#active;
  }

  get latest(): T | null {
    return this.#latest;
  }

  /** End the gesture, returning the latest value exactly once. */
  commit(): T | null {
    const value = this.#active ? this.#latest : null;
    this.#active = false;
    this.#latest = null;
    return value;
  }

  cancel(): void {
    this.#active = false;
    this.#latest = null;
  }
}
