/**
 * Curated Beautifier presets. Small, opinionated lists that match Shotexa's palette — not a
 * template library.
 */
import type { BeautifySettings, GradientAngle, OutputPreset, ShadowPreset } from "./types";

export const BACKGROUND_PRESETS = [
  { id: "cream", label: "Cream", color: "#f7f1e3", color2: "#e8dcc4" },
  { id: "slate", label: "Slate", color: "#1c1714", color2: "#3b332c" },
  { id: "ember", label: "Ember", color: "#e5603b", color2: "#f2a65a" },
  { id: "sky", label: "Sky", color: "#dbeafe", color2: "#93c5fd" },
  { id: "moss", label: "Moss", color: "#dcfce7", color2: "#86efac" },
  { id: "plum", label: "Plum", color: "#ede9fe", color2: "#c4b5fd" },
  { id: "paper", label: "Paper", color: "#ffffff", color2: "#e5e7eb" },
] as const;

export const GRADIENT_ANGLES: { value: GradientAngle; label: string }[] = [
  { value: 0, label: "Down" },
  { value: 45, label: "Down right" },
  { value: 90, label: "Right" },
  { value: 135, label: "Up right" },
];

/** Padding as a fraction of the composition's short side (see `layout.ts`). */
export const PADDING_PRESETS = [
  { id: "none", label: "None", value: 0 },
  { id: "small", label: "Small", value: 6 },
  { id: "medium", label: "Medium", value: 12 },
  { id: "large", label: "Large", value: 20 },
] as const;

export const MAX_PADDING = 40;

/** Blur as a fraction of the composition's short side; the offset follows it. */
export const SHADOW_BLUR: Record<ShadowPreset, number> = { none: 0, soft: 0.02, medium: 0.045, strong: 0.08 };
export const SHADOW_OFFSET_RATIO = 0.35;
export const SHADOW_COLOR = "rgba(20, 16, 12, 0.28)";
export const SHADOW_COLOR_STRONG = "rgba(20, 16, 12, 0.38)";

export const SHADOW_LABELS: { value: ShadowPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

/** Largest corner radius, as a fraction of the screenshot's short side, at 100 %. */
export const MAX_RADIUS_RATIO = 0.08;

export const OUTPUT_PRESETS: { value: OutputPreset; label: string; ratio: number | null; fixed?: { width: number; height: number } }[] = [
  { value: "auto", label: "Auto", ratio: null },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "square-1080", label: "Square 1080", ratio: 1, fixed: { width: 1080, height: 1080 } },
  { value: "landscape-1200", label: "Landscape 1200", ratio: 1200 / 630, fixed: { width: 1200, height: 630 } },
];

export const outputPreset = (value: OutputPreset) => OUTPUT_PRESETS.find((p) => p.value === value) ?? OUTPUT_PRESETS[0];

/** Browser chrome height, as a fraction of the screenshot width (clamped in `layout.ts`). */
export const BROWSER_CHROME_RATIO = 0.055;
export const BROWSER_CHROME_MIN = 28;
export const BROWSER_CHROME_MAX = 120;
/** Phone screens are 9:19.5 — a modern proportion, not a specific device. */
export const PHONE_SCREEN_RATIO = 9 / 19.5;
export const PHONE_BEZEL_RATIO = 0.035;
export const PHONE_BEZEL_MIN = 8;
export const PHONE_BEZEL_MAX = 90;

export const FRAME_COLORS = {
  light: { shell: "#f3f1ee", edge: "#d9d4cc", chrome: "#f7f5f2", bar: "#ffffff", barEdge: "#e2ddd4", text: "#6b6259", screen: "#ffffff" },
  dark: { shell: "#1c1714", edge: "#000000", chrome: "#2a2420", bar: "#3a332d", barEdge: "#4a423a", text: "#c9c0b5", screen: "#000000" },
} as const;

/** Window-control dots: generic, never a specific operating system's buttons. */
export const WINDOW_DOTS = ["#e5726a", "#e8bf69", "#86c982"] as const;

export const DEFAULT_ADDRESS = "example.com";

export const DEFAULT_BEAUTIFY: BeautifySettings = {
  mode: "clean",
  background: { kind: "gradient", color: "#f7f1e3", color2: "#e8dcc4", angle: 45 },
  padding: 12,
  radius: 50,
  shadow: "medium",
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  browser: { theme: "light", showAddress: true, address: DEFAULT_ADDRESS },
  phone: { theme: "dark", fit: "cover" },
  preset: "auto",
};

/** Sensible per-mode defaults, applied when the user switches mode. */
export const MODE_DEFAULTS: Record<BeautifySettings["mode"], Partial<BeautifySettings>> = {
  clean: { radius: 50, shadow: "medium" },
  browser: { radius: 40, shadow: "medium" },
  phone: { radius: 100, shadow: "strong" },
};
