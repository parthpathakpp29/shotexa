/** Compare Screenshots — defaults and the small option lists the inspector offers. */
import type {
  CompareAlign,
  CompareAlignMode,
  CompareFit,
  CompareMetric,
  CompareMode,
  ComparePresetId,
  CompareSettings,
} from "./types";

export const DEFAULT_BACKGROUND = "#f3f1ee";

export const COMPARE_MODES: { value: CompareMode; label: string; hint: string }[] = [
  { value: "side-by-side", label: "Side by side", hint: "Both screenshots next to each other." },
  { value: "slider", label: "Before / after", hint: "Drag the divider to wipe between them." },
  { value: "overlay", label: "Overlay", hint: "After on top of before — good for spotting things that moved." },
  { value: "difference", label: "Difference", hint: "Highlights the pixels that changed, and groups them into changed regions." },
  { value: "heatmap", label: "Heatmap", hint: "Maps the measured change strength from cool to hot, with a legend." },
];

export const FIT_OPTIONS: { value: CompareFit; label: string }[] = [
  { value: "contain", label: "Fit" },
  { value: "cover", label: "Fill" },
  { value: "actual", label: "Actual" },
];

export const ALIGN_OPTIONS: { value: CompareAlign; label: string }[] = [
  { value: "center", label: "Centre" },
  { value: "top-left", label: "Top left" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export const ALIGN_MODES: { value: CompareAlignMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Compare the screenshots exactly where the fitting puts them." },
  { value: "translate", label: "Translation", hint: "Measure one x / y offset and shift After onto Before." },
  { value: "translate-scale", label: "Translation + scale", hint: "Measure an offset plus one uniform scale. Never a non-uniform stretch." },
  { value: "auto", label: "Auto", hint: "Measure both and keep whichever matched better." },
];

export const METRIC_OPTIONS: { value: CompareMetric; label: string; hint: string }[] = [
  { value: "pixel", label: "Pixel", hint: "Per-channel RGB difference against the colour tolerance." },
  { value: "perceptual", label: "Perceptual", hint: "CIE76 delta-E*ab colour distance in CIELAB (sRGB, D65). A fixed colour-science formula — no model, nothing learned." },
];

export const BACKGROUND_OPTIONS = [
  { value: "#f3f1ee", label: "Paper" },
  { value: "#ffffff", label: "White" },
  { value: "#1c1714", label: "Ink" },
] as const;

/** Difference rendering: a dark base, a ghost of "before", and a warm highlight where it changed. */
export const DIFF_BASE: readonly [number, number, number] = [18, 16, 15];
export const DIFF_HIGHLIGHT: readonly [number, number, number] = [255, 92, 60];
/** How much of "before" shows through in unchanged areas. */
export const DIFF_GHOST = 0.25;
/** Minimum highlight strength for a pixel that is over the threshold. */
export const DIFF_MIN_STRENGTH = 0.35;

/** CIE76 delta-E*ab that colour science treats as the just-noticeable difference. */
export const JND_DELTA_E = 2.3;

/**
 * Analysis resolution cap for automatic alignment. Large enough that an ordinary screenshot
 * is measured at (or close to) its own pixels — the offset is only ever as precise as this
 * resolution — while still small enough that a match costs milliseconds.
 */
export const ALIGN_ANALYSIS_WIDTH = 512;
/** Candidate uniform scales tried for "translation + scale", coarse then refined. */
export const ALIGN_SCALE_RANGE = { min: 0.9, max: 1.1 } as const;
/** An alignment below this normalised cross-correlation is reported as failed, not applied. */
export const ALIGN_MIN_SCORE = 0.55;
/** Movement detection only accepts a match at least this similar. */
export const MOVEMENT_MIN_SCORE = 0.92;

export const DEFAULT_COMPARE: CompareSettings = {
  a: null,
  b: null,
  mode: "slider",
  fit: "contain",
  align: "center",
  divider: 50,
  opacity: 0.5,
  threshold: 12,
  minRegionSize: 24,
  mergeDistance: 6,
  ignoreTiny: true,
  flicker: false,
  flickerSpeed: 500,
  gap: 2,
  labels: true,
  background: DEFAULT_BACKGROUND,
  alignment: { mode: "off", dx: 0, dy: 0, scale: 1 },
  diff: {
    metric: "pixel",
    luminanceTolerance: 12,
    deltaE: JND_DELTA_E,
    ignoreAntialiasing: false,
    ignoreNearIdenticalColour: false,
    ignoreTransparent: false,
    compareAlpha: false,
    ignoreColour: null,
    ignoreColourTolerance: 12,
  },
  heatmap: { intensity: 100, threshold: 0, changedOnly: false, dimUnchanged: 100, legend: true },
  ignoreRegions: [],
  preset: null,
  detectMovement: true,
};

/**
 * Presets only move the real controls — there is no hidden behaviour behind them. Each one
 * lists exactly what it sets, so the inspector can show it and the report can record it.
 */
export interface ComparePreset {
  id: ComparePresetId;
  label: string;
  description: string;
  /** Deep-merged over the current settings (the chosen screenshots are never touched). */
  settings: {
    mode?: CompareMode;
    threshold?: number;
    minRegionSize?: number;
    mergeDistance?: number;
    ignoreTiny?: boolean;
    detectMovement?: boolean;
    alignment?: Partial<CompareSettings["alignment"]>;
    diff?: Partial<CompareSettings["diff"]>;
    heatmap?: Partial<CompareSettings["heatmap"]>;
  };
}

export const COMPARE_PRESETS: ComparePreset[] = [
  {
    id: "visual-qa",
    label: "Visual QA",
    description: "Auto alignment, perceptual difference, tiny changes ignored, changed-region analysis and the heatmap legend. Text diff stays optional.",
    settings: {
      mode: "difference",
      threshold: 14,
      minRegionSize: 24,
      mergeDistance: 8,
      ignoreTiny: true,
      detectMovement: true,
      alignment: { mode: "auto", dx: 0, dy: 0, scale: 1 },
      diff: { metric: "perceptual", deltaE: 2.3, ignoreAntialiasing: true, ignoreNearIdenticalColour: false },
      heatmap: { legend: true, changedOnly: false, threshold: 0 },
    },
  },
  {
    id: "pixel-perfect",
    label: "Pixel Perfect",
    description: "Every non-identical pixel counts. No alignment, no anti-aliasing allowance, no minimum region size.",
    settings: {
      mode: "difference",
      threshold: 0,
      minRegionSize: 1,
      mergeDistance: 0,
      ignoreTiny: false,
      detectMovement: false,
      alignment: { mode: "off", dx: 0, dy: 0, scale: 1 },
      diff: { metric: "pixel", luminanceTolerance: 0, ignoreAntialiasing: false, ignoreNearIdenticalColour: false },
      heatmap: { legend: true, threshold: 0 },
    },
  },
  {
    id: "design-review",
    label: "Design Review",
    description: "Aligned, perceptual, with larger merged regions — spacing and layout shifts rather than single pixels.",
    settings: {
      mode: "difference",
      threshold: 18,
      minRegionSize: 60,
      mergeDistance: 16,
      ignoreTiny: true,
      detectMovement: true,
      alignment: { mode: "translate-scale", dx: 0, dy: 0, scale: 1 },
      diff: { metric: "perceptual", deltaE: 3, ignoreAntialiasing: true, ignoreNearIdenticalColour: true },
      heatmap: { legend: true, changedOnly: true, dimUnchanged: 70 },
    },
  },
  {
    id: "text-review",
    label: "Text Review",
    description: "Tuned for copy changes: aligned, sensitive to small marks, tight region merging. Run Analyse text changes next.",
    settings: {
      mode: "difference",
      threshold: 8,
      minRegionSize: 8,
      mergeDistance: 4,
      ignoreTiny: false,
      detectMovement: false,
      alignment: { mode: "translate", dx: 0, dy: 0, scale: 1 },
      diff: { metric: "pixel", luminanceTolerance: 8, ignoreAntialiasing: true, ignoreNearIdenticalColour: false },
      heatmap: { legend: true, threshold: 0 },
    },
  },
  {
    id: "loose",
    label: "Loose Comparison",
    description: "Only sizeable, clearly visible differences. Useful on screenshots from different devices or renderers.",
    settings: {
      mode: "difference",
      threshold: 40,
      minRegionSize: 150,
      mergeDistance: 24,
      ignoreTiny: true,
      detectMovement: true,
      alignment: { mode: "auto", dx: 0, dy: 0, scale: 1 },
      diff: { metric: "perceptual", deltaE: 6, ignoreAntialiasing: true, ignoreNearIdenticalColour: true },
      heatmap: { legend: true, changedOnly: true, dimUnchanged: 60, threshold: 10 },
    },
  },
];

/** Apply a preset over the current settings. Returns a new object; A and B are preserved. */
export function applyComparePreset(current: CompareSettings, id: ComparePresetId): CompareSettings {
  const preset = COMPARE_PRESETS.find((item) => item.id === id);
  if (!preset) return current;
  const patch = preset.settings;
  return {
    ...current,
    ...patch,
    alignment: { ...current.alignment, ...patch.alignment },
    diff: { ...current.diff, ...patch.diff },
    heatmap: { ...current.heatmap, ...patch.heatmap },
    preset: id,
  };
}

/** Result file names — never an internal asset id. */
export const COMPARE_NAMES: Record<CompareMode, string> = {
  "side-by-side": "compare-side-by-side",
  slider: "compare-before-after",
  overlay: "compare-overlay",
  difference: "compare-difference",
  heatmap: "compare-heatmap",
};

export const COMPARE_REPORT_NAMES = {
  pdf: "comparison-report.pdf",
  zip: "comparison-report.zip",
  json: "comparison-summary.json",
} as const;
