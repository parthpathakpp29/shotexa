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
 *
 * Automatic alignment is applied ON TOP of that placement, as one uniform scale and one
 * offset in cell pixels, folded into B's destination rectangle. Because the preview and the
 * export both build the layout from the same settings and the same estimate, they place and
 * compare identical pixels — the only difference between them is resolution.
 */
import type { Rect, Size } from "@/core/image-transform/types";
import { DEFAULT_BACKGROUND, DEFAULT_COMPARE } from "./presets";
import type {
  CompareAlign,
  CompareAlignEstimate,
  CompareAlignMode,
  CompareAppliedAlignment,
  CompareFit,
  CompareIgnoreRegion,
  CompareLayout,
  ComparePlacement,
  CompareSettings,
} from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const round = (v: number) => Math.max(1, Math.round(v));
const ALIGN_MODES: CompareAlignMode[] = ["off", "translate", "translate-scale", "auto"];
const PRESET_IDS = new Set(["visual-qa", "pixel-perfect", "design-review", "text-review", "loose"]);
const hex = (value: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback);

/** Ignore regions are capped so the settings object stays small and undo stays cheap. */
export const MAX_IGNORE_REGIONS = 24;

export function clampIgnoreRegion(region: CompareIgnoreRegion): CompareIgnoreRegion {
  const x = clamp(region.x, 0, 1);
  const y = clamp(region.y, 0, 1);
  return {
    id: region.id,
    name: (region.name ?? "").slice(0, 60),
    x,
    y,
    width: clamp(region.width, 0.001, 1 - x),
    height: clamp(region.height, 0.001, 1 - y),
    enabled: region.enabled !== false,
  };
}

export function clampSettings(s: CompareSettings): CompareSettings {
  const d = { ...DEFAULT_COMPARE.diff, ...s.diff };
  const heat = { ...DEFAULT_COMPARE.heatmap, ...s.heatmap };
  const alignment = { ...DEFAULT_COMPARE.alignment, ...s.alignment };
  return {
    ...s,
    divider: clamp(Math.round(s.divider), 0, 100),
    opacity: clamp(Math.round(s.opacity * 100) / 100, 0, 1),
    threshold: clamp(Math.round(s.threshold), 0, 120),
    minRegionSize: clamp(Math.round(s.minRegionSize), 1, 50_000),
    mergeDistance: clamp(Math.round(s.mergeDistance), 0, 100),
    flickerSpeed: s.flickerSpeed === 250 || s.flickerSpeed === 1000 ? s.flickerSpeed : 500,
    gap: clamp(Math.round(s.gap), 0, 20),
    background: hex(s.background, DEFAULT_BACKGROUND),
    alignment: {
      mode: ALIGN_MODES.includes(alignment.mode) ? alignment.mode : "off",
      dx: clamp(Math.round(alignment.dx), -4000, 4000),
      dy: clamp(Math.round(alignment.dy), -4000, 4000),
      scale: clamp(Math.round(alignment.scale * 10000) / 10000, 0.5, 2),
    },
    diff: {
      metric: d.metric === "perceptual" ? "perceptual" : "pixel",
      luminanceTolerance: clamp(Math.round(d.luminanceTolerance), 0, 120),
      deltaE: clamp(Math.round(d.deltaE * 10) / 10, 0.1, 25),
      ignoreAntialiasing: !!d.ignoreAntialiasing,
      ignoreNearIdenticalColour: !!d.ignoreNearIdenticalColour,
      ignoreTransparent: !!d.ignoreTransparent,
      compareAlpha: !!d.compareAlpha,
      ignoreColour: d.ignoreColour && /^#[0-9a-f]{6}$/i.test(d.ignoreColour) ? d.ignoreColour.toLowerCase() : null,
      ignoreColourTolerance: clamp(Math.round(d.ignoreColourTolerance), 0, 120),
    },
    heatmap: {
      intensity: clamp(Math.round(heat.intensity), 25, 200),
      threshold: clamp(Math.round(heat.threshold), 0, 100),
      changedOnly: !!heat.changedOnly,
      dimUnchanged: clamp(Math.round(heat.dimUnchanged), 0, 100),
      legend: heat.legend !== false,
    },
    ignoreRegions: (s.ignoreRegions ?? []).slice(0, MAX_IGNORE_REGIONS).map(clampIgnoreRegion),
    preset: s.preset && PRESET_IDS.has(s.preset) ? s.preset : null,
    detectMovement: s.detectMovement !== false,
  };
}

/** The shared comparison cell: large enough to hold either screenshot at its natural size. */
export const compareCell = (a: Size, b: Size): Size => ({ width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) });

/** Fraction of the leftover space that goes before the image, for one axis. */
function offsetFraction(align: CompareAlign, axis: "x" | "y"): number {
  if (axis === "x") return align === "left" || align === "top-left" ? 0 : align === "right" ? 1 : 0.5;
  return align === "top" || align === "top-left" ? 0 : align === "bottom" ? 1 : 0.5;
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

/**
 * Compose the measured estimate with the user's manual nudge. A measurement that failed is
 * ignored entirely (the comparison simply runs unaligned) — a bad transform is worse than none.
 */
export function appliedAlignment(settings: CompareSettings, estimate?: CompareAlignEstimate | null): CompareAppliedAlignment {
  const manual = clampSettings(settings).alignment;
  if (manual.mode === "off") return { mode: "off", dx: 0, dy: 0, scale: 1 };
  const measured = estimate && (estimate.status === "aligned" || estimate.status === "identity") ? estimate : null;
  const scale = clamp((measured?.scale ?? 1) * manual.scale, 0.5, 2);
  return {
    mode: manual.mode,
    dx: (measured?.dx ?? 0) + manual.dx,
    dy: (measured?.dy ?? 0) + manual.dy,
    scale,
  };
}

/** Apply an alignment transform to a placement, in cell coordinates. */
export function alignPlacement(p: ComparePlacement, alignment: CompareAppliedAlignment): ComparePlacement {
  if (alignment.mode === "off" || (alignment.dx === 0 && alignment.dy === 0 && alignment.scale === 1)) return p;
  const width = Math.max(1, p.dest.width * alignment.scale);
  const height = Math.max(1, p.dest.height * alignment.scale);
  return {
    ...p,
    dest: { x: p.dest.x * alignment.scale + alignment.dx, y: p.dest.y * alignment.scale + alignment.dy, width, height },
    zoom: width / Math.max(1, p.source.width),
  };
}

/** Enabled ignore regions as rectangles in the shared cell's pixels. */
export function ignoreRects(settings: CompareSettings, cell: Size): Rect[] {
  return clampSettings(settings)
    .ignoreRegions.filter((region) => region.enabled)
    .map((region) => ({
      x: region.x * cell.width,
      y: region.y * cell.height,
      width: Math.max(1, region.width * cell.width),
      height: Math.max(1, region.height * cell.height),
    }));
}

export interface CompareInput {
  size: Size;
  name: string;
}

/** The whole comparison, in canvas pixels. */
export function compareLayout(settings: CompareSettings, a: CompareInput, b: CompareInput, estimate?: CompareAlignEstimate | null): CompareLayout {
  const s = clampSettings(settings);
  const cell = compareCell(a.size, b.size);
  const sideBySide = s.mode === "side-by-side";
  const gap = sideBySide ? Math.round((s.gap / 100) * Math.min(cell.width, cell.height)) : 0;
  const canvas = sideBySide ? { width: cell.width * 2 + gap, height: cell.height } : { ...cell };
  const cellA = { x: 0, y: 0, width: cell.width, height: cell.height };
  const cellB = sideBySide ? { x: cell.width + gap, y: 0, width: cell.width, height: cell.height } : cellA;
  const alignment = appliedAlignment(s, estimate);
  return {
    canvas,
    cell,
    cellA,
    cellB,
    a: place(a.size, cell, s.fit, s.align),
    b: shift(alignPlacement(place(b.size, cell, s.fit, s.align), alignment), cellB.x, cellB.y),
    mode: s.mode,
    divider: Math.round((canvas.width * s.divider) / 100),
    opacity: s.opacity,
    threshold: s.threshold,
    minRegionSize: s.minRegionSize,
    mergeDistance: s.mergeDistance,
    ignoreTiny: s.ignoreTiny,
    background: s.background,
    labels: s.labels ? { a: "Before", b: "After" } : null,
    alignment,
    diff: s.diff,
    heatmap: s.heatmap,
    ignoreRegions: ignoreRects(s, cell),
    detectMovement: s.detectMovement,
  };
}

/** The exported image's size, without building the rest of the layout. */
export function compareSize(settings: CompareSettings, a: Size, b: Size): Size {
  return compareLayout(settings, { size: a, name: "" }, { size: b, name: "" }).canvas;
}

/** Divider percentage from a pointer position over the preview (0-100). */
export const dividerFromX = (x: number, width: number) => clamp(Math.round((x / Math.max(1, width)) * 100), 0, 100);

/** Do these two screenshots differ in a way the user should be told about? */
export function sizeMismatch(a: Size, b: Size): { width: boolean; height: boolean; aspect: boolean } {
  const ratioA = a.width / Math.max(1, a.height);
  const ratioB = b.width / Math.max(1, b.height);
  return { width: a.width !== b.width, height: a.height !== b.height, aspect: Math.abs(ratioA - ratioB) > 0.01 };
}
