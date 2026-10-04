/** Compare Screenshots — defaults and the small option lists the inspector offers. */
import type { CompareAlign, CompareFit, CompareMode, CompareSettings } from "./types";

export const DEFAULT_BACKGROUND = "#f3f1ee";

export const COMPARE_MODES: { value: CompareMode; label: string; hint: string }[] = [
  { value: "side-by-side", label: "Side by side", hint: "Both screenshots next to each other." },
  { value: "slider", label: "Before / after", hint: "Drag the divider to wipe between them." },
  { value: "overlay", label: "Overlay", hint: "After on top of before — good for spotting things that moved." },
  { value: "difference", label: "Difference", hint: "Highlights the pixels that changed. Nothing is interpreted for you." },
  { value: "heatmap", label: "Heatmap", hint: "Maps larger deterministic pixel differences from cool to hot colours." },
];

export const FIT_OPTIONS: { value: CompareFit; label: string }[] = [
  { value: "contain", label: "Fit" },
  { value: "cover", label: "Fill" },
  { value: "actual", label: "Actual" },
];

export const ALIGN_OPTIONS: { value: CompareAlign; label: string }[] = [
  { value: "center", label: "Centre" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
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
};

/** Result file names — never an internal asset id. */
export const COMPARE_NAMES: Record<CompareMode, string> = {
  "side-by-side": "compare-side-by-side",
  slider: "compare-before-after",
  overlay: "compare-overlay",
  difference: "compare-difference",
  heatmap: "compare-heatmap",
};
