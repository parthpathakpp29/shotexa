/**
 * The canonical comparison space — pure maths shared by the preview, the export and the tests.
 *
 * Both screenshots are fitted into one CELL, whose size is the larger of the two in each
 * direction. Neither image is ever stretched: each keeps its aspect ratio and is placed
 * deterministically by the fit and alignment settings.
 *
 *   contain — scale to fit entirely inside the cell (a smaller screenshot is enlarged so the
 *             two are compared at the same displayed size); any leftover shows the background.
 *   cover   — scale to fill the cell; the overflow is cropped, following the alignment.
 *   actual  — natural pixels, no scaling; the rest of the cell shows the background.
 *
 * Side by side puts two cells next to each other with a gap; the other modes share one cell.
 */
import type { Size } from "@/core/image-transform/types";
import { DEFAULT_BACKGROUND } from "./presets";
import type { CompareAlign, CompareFit, CompareLayout, ComparePlacement, CompareSettings } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const round = (v: number) => Math.max(1, Math.round(v));

export function clampSettings(s: CompareSettings): CompareSettings {
  return {
    ...s,
    divider: clamp(Math.round(s.divider), 0, 100),
    opacity: clamp(Math.round(s.opacity * 100) / 100, 0, 1),
    threshold: clamp(Math.round(s.threshold), 0, 120),
    minRegionSize: clamp(Math.round(s.minRegionSize), 1, 50_000),
    mergeDistance: clamp(Math.round(s.mergeDistance), 0, 100),
    flickerSpeed: s.flickerSpeed === 250 || s.flickerSpeed === 1000 ? s.flickerSpeed : 500,
    gap: clamp(Math.round(s.gap), 0, 20),
    background: /^#[0-9a-f]{6}$/i.test(s.background) ? s.background.toLowerCase() : DEFAULT_BACKGROUND,
  };
}

/** The shared comparison cell: large enough to hold either screenshot at its natural size. */
export const compareCell = (a: Size, b: Size): Size => ({ width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) });

/** Fraction of the leftover space that goes before the image, for one axis. */
function offsetFraction(align: CompareAlign, axis: "x" | "y"): number {
  if (axis === "x") return align === "left" ? 0 : align === "right" ? 1 : 0.5;
  return align === "top" ? 0 : align === "bottom" ? 1 : 0.5;
}

/** Place one screenshot inside a cell. Never stretches: one scale for both axes. */
export function place(image: Size, cell: Size, fit: CompareFit, align: CompareAlign): ComparePlacement {
  const fx = offsetFraction(align, "x");
  const fy = offsetFraction(align, "y");
  if (fit === "cover") {
    // Fill the cell, cropping what does not fit — the crop follows the alignment.
    const scale = Math.max(cell.width / image.width, cell.height / image.height);
    const source = {
      width: Math.min(image.width, round(cell.width / scale)),
      height: Math.min(image.height, round(cell.height / scale)),
      x: 0,
      y: 0,
    };
    source.x = Math.round((image.width - source.width) * fx);
    source.y = Math.round((image.height - source.height) * fy);
    return { dest: { x: 0, y: 0, width: cell.width, height: cell.height }, source, zoom: cell.width / source.width };
  }
  const scale = fit === "actual" ? 1 : Math.min(cell.width / image.width, cell.height / image.height);
  const width = Math.min(cell.width, round(image.width * scale));
  const height = Math.min(cell.height, round(image.height * scale));
  return {
    dest: { x: Math.round((cell.width - width) * fx), y: Math.round((cell.height - height) * fy), width, height },
    source: { x: 0, y: 0, width: image.width, height: image.height },
    zoom: width / image.width,
  };
}

const shift = (p: ComparePlacement, dx: number, dy: number): ComparePlacement => ({ ...p, dest: { ...p.dest, x: p.dest.x + dx, y: p.dest.y + dy } });

export interface CompareInput {
  size: Size;
  name: string;
}

/** The whole comparison, in canvas pixels. */
export function compareLayout(settings: CompareSettings, a: CompareInput, b: CompareInput): CompareLayout {
  const s = clampSettings(settings);
  const cell = compareCell(a.size, b.size);
  const sideBySide = s.mode === "side-by-side";
  const gap = sideBySide ? Math.round((s.gap / 100) * Math.min(cell.width, cell.height)) : 0;
  const canvas = sideBySide ? { width: cell.width * 2 + gap, height: cell.height } : { ...cell };
  const cellA = { x: 0, y: 0, width: cell.width, height: cell.height };
  const cellB = sideBySide ? { x: cell.width + gap, y: 0, width: cell.width, height: cell.height } : cellA;
  return {
    canvas,
    cell,
    cellA,
    cellB,
    a: place(a.size, cell, s.fit, s.align),
    b: shift(place(b.size, cell, s.fit, s.align), cellB.x, cellB.y),
    mode: s.mode,
    divider: Math.round((canvas.width * s.divider) / 100),
    opacity: s.opacity,
    threshold: s.threshold,
    minRegionSize: s.minRegionSize,
    mergeDistance: s.mergeDistance,
    ignoreTiny: s.ignoreTiny,
    background: s.background,
    labels: s.labels ? { a: "Before", b: "After" } : null,
  };
}

/** The exported image's size, without building the rest of the layout. */
export function compareSize(settings: CompareSettings, a: Size, b: Size): Size {
  return compareLayout(settings, { size: a, name: "" }, { size: b, name: "" }).canvas;
}

/** Divider percentage from a pointer position over the preview (0–100). */
export const dividerFromX = (x: number, width: number) => clamp(Math.round((x / Math.max(1, width)) * 100), 0, 100);
