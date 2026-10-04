/**
 * Curated Beautifier presets. Small, opinionated lists that match Shotexa's palette — not a
 * template library.
 */
import type { Size } from "@/core/image-transform/types";
import type { BeautifySettings, BeautifyShadowAdvanced, GradientAngle, OutputPreset, ShadowPreset } from "./types";

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

/** Geometry is stored as percentages of the composition's short side. */
export const SHADOW_PRESETS: Record<Exclude<ShadowPreset, "custom">, BeautifyShadowAdvanced> = {
  none: { x: 0, y: 0, blur: 0, spread: 0, opacity: 0 },
  soft: { x: 0, y: 1.2, blur: 4, spread: 0, opacity: 20 },
  float: { x: 0, y: 3.5, blur: 7, spread: 0.5, opacity: 26 },
  strong: { x: 0, y: 5, blur: 10, spread: 1, opacity: 36 },
  hard: { x: 2.5, y: 3.5, blur: 0, spread: 0.5, opacity: 48 },
  glow: { x: 0, y: 0, blur: 8, spread: 1, opacity: 30 },
};

export const SHADOW_LABELS: { value: ShadowPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "float", label: "Float" },
  { value: "strong", label: "Strong" },
  { value: "hard", label: "Hard" },
  { value: "glow", label: "Glow" },
  { value: "custom", label: "Custom" },
];

/** Largest corner radius, as a fraction of the screenshot's short side, at 100 %. */
export const MAX_RADIUS_RATIO = 0.08;

export const OUTPUT_PRESETS: { value: OutputPreset; label: string; ratio: number | null; fixed?: { width: number; height: number } }[] = [
  { value: "auto", label: "Auto", ratio: null },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:5", label: "4:5", ratio: 4 / 5 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "3:2", label: "3:2", ratio: 3 / 2 },
  { value: "1.91:1", label: "1.91:1", ratio: 1.91 },
  { value: "square-1080", label: "Square 1080", ratio: 1, fixed: { width: 1080, height: 1080 } },
  { value: "portrait-1080", label: "Portrait 1080", ratio: 1080 / 1350, fixed: { width: 1080, height: 1350 } },
  { value: "story-1080", label: "Tall 1080", ratio: 1080 / 1920, fixed: { width: 1080, height: 1920 } },
  { value: "landscape-1200", label: "Landscape 1200", ratio: 1200 / 630, fixed: { width: 1200, height: 630 } },
  { value: "landscape-1600", label: "Landscape 1600", ratio: 16 / 9, fixed: { width: 1600, height: 900 } },
  { value: "custom", label: "Custom", ratio: null },
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
  background: { kind: "gradient", color: "#f7f1e3", color2: "#e8dcc4", angle: 45, blur: 24, brightness: 72, saturation: 108 },
  padding: 12,
  radius: 50,
  shadow: "float",
  shadowAdvanced: { ...SHADOW_PRESETS.float },
  border: { kind: "none", width: 2, opacity: 60, color: "#ffffff" },
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  browser: { theme: "light", showAddress: true, address: DEFAULT_ADDRESS },
  phone: { theme: "dark", fit: "cover" },
  preset: "auto",
  customCanvas: { width: 1600, height: 900, lockAspect: true, aspectRatio: 16 / 9 },
  exportScale: 1,
  text: { title: "", subtitle: "", placement: "top", fontSize: 52, weight: 600, align: "center", color: "#1c1714", spacing: 12, maxWidth: 80 },
};

/** Sensible per-mode defaults, applied when the user switches mode. */
export const MODE_DEFAULTS: Record<BeautifySettings["mode"], Partial<BeautifySettings>> = {
  clean: { radius: 50, shadow: "float" },
  browser: { radius: 40, shadow: "float" },
  phone: { radius: 100, shadow: "strong" },
};

/** Curated recipes configure the ordinary controls; no preset has its own rendering path. */
export const STYLE_PRESETS: { id: string; label: string; settings: Partial<BeautifySettings> }[] = [
  { id: "clean", label: "Clean", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#f7f1e3", color2: "#f7f1e3" }, padding: 10, radius: 35, shadow: "soft", scale: 1, offsetX: 0, offsetY: 0 } },
  { id: "launch", label: "Launch", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#e5603b", color2: "#f2a65a", angle: 45 }, padding: 14, radius: 40, shadow: "strong", scale: 0.92, offsetX: 0, offsetY: 0 } },
  { id: "product", label: "Product", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#dbeafe", color2: "#93c5fd", angle: 90 }, padding: 12, radius: 35, shadow: "float", scale: 0.94, offsetX: 0, offsetY: 0 } },
  { id: "documentation", label: "Documentation", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#f3f1ee", color2: "#f3f1ee" }, padding: 8, radius: 20, shadow: "soft", scale: 1, offsetX: 0, offsetY: 0 } },
  { id: "glass", label: "Glass", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "screenshot", blur: 30, brightness: 64, saturation: 112 }, border: { kind: "glass", width: 3, opacity: 70, color: "#ffffff" }, padding: 14, radius: 55, shadow: "strong", scale: 0.9, offsetX: 0, offsetY: 0 } },
  { id: "dark", label: "Dark", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#1c1714", color2: "#3b332c", angle: 135 }, padding: 14, radius: 45, shadow: "strong", scale: 0.94, offsetX: 0, offsetY: 0 } },
  { id: "minimal", label: "Minimal", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#ffffff", color2: "#ffffff" }, padding: 6, radius: 12, shadow: "none", scale: 1, offsetX: 0, offsetY: 0 } },
  { id: "soft", label: "Soft", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#ede9fe", color2: "#c4b5fd", angle: 45 }, padding: 18, radius: 75, shadow: "soft", scale: 0.88, offsetX: 0, offsetY: 0 } },
  { id: "gradient", label: "Gradient", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#dcfce7", color2: "#93c5fd", angle: 135 }, padding: 16, radius: 50, shadow: "float", scale: 0.9, offsetX: 0, offsetY: 0 } },
  { id: "developer", label: "Developer", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#1c1714", color2: "#1c1714" }, browser: { theme: "dark", showAddress: true, address: DEFAULT_ADDRESS }, padding: 10, radius: 24, shadow: "hard", scale: 0.96, offsetX: 0, offsetY: 0 } },
];

/** A modest, deterministic starting point based only on source shape. */
export function autoLayout(settings: BeautifySettings, source: Size): BeautifySettings {
  const portrait = source.height > source.width * 1.15;
  const wide = source.width > source.height * 1.45;
  return {
    ...settings,
    preset: portrait ? "9:16" : wide ? "16:9" : "1:1",
    padding: portrait ? 10 : 14,
    scale: portrait ? 0.9 : 0.92,
    offsetX: 0,
    offsetY: 0,
    shadow: settings.mode === "phone" ? "strong" : "float",
  };
}
