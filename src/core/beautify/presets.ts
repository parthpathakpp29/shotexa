/**
 * Curated Beautifier presets. Small, opinionated lists that match Shotexa's palette — not a
 * template library.
 */
import type { Size } from "@/core/image-transform/types";
import { perspectiveForPreset } from "./perspective";
import { ANIMATION_PRESETS } from "./animation";
import type { BeautifySettings, BeautifyShadowAdvanced, GradientAngle, OutputPreset, ShadowPreset } from "./types";

export const BACKGROUND_PRESETS = [
  { id: "cream", label: "Cream", color: "#f7f1e3", color2: "#e8dcc4" },
  { id: "slate", label: "Slate", color: "#1c1714", color2: "#3b332c" },
  { id: "ember", label: "Ember", color: "#e5603b", color2: "#f2a65a" },
  { id: "sky", label: "Sky", color: "#dbeafe", color2: "#93c5fd" },
  { id: "moss", label: "Moss", color: "#dcfce7", color2: "#86efac" },
  { id: "plum", label: "Plum", color: "#ede9fe", color2: "#c4b5fd" },
  { id: "paper", label: "Paper", color: "#ffffff", color2: "#e5e7eb" },
  { id: "sunset", label: "Warm Sunset", color: "#ff8a65", color2: "#6d28d9" },
  { id: "midnight", label: "Midnight", color: "#090b18", color2: "#273469" },
  { id: "ocean", label: "Ocean", color: "#0f766e", color2: "#38bdf8" },
  { id: "aurora", label: "Aurora", color: "#22c55e", color2: "#6366f1" },
  { id: "lavender", label: "Lavender", color: "#f1e9ff", color2: "#a78bfa" },
  { id: "peach", label: "Peach", color: "#fff1e6", color2: "#fb923c" },
  { id: "graphite", label: "Graphite", color: "#111827", color2: "#4b5563" },
  { id: "neon", label: "Neon", color: "#12122b", color2: "#d946ef" },
  { id: "soft-blue", label: "Soft Blue", color: "#eff6ff", color2: "#60a5fa" },
  { id: "forest", label: "Forest", color: "#052e16", color2: "#4d7c0f" },
  { id: "rose", label: "Rose", color: "#fff1f2", color2: "#fb7185" },
  { id: "minimal-gray", label: "Minimal Gray", color: "#f8fafc", color2: "#cbd5e1" },
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
  none: { x: 0, y: 0, blur: 0, spread: 0, opacity: 0, color: "#14100c" },
  soft: { x: 0, y: 1.2, blur: 4, spread: 0, opacity: 20, color: "#14100c" },
  float: { x: 0, y: 3.5, blur: 7, spread: 0.5, opacity: 26, color: "#14100c" },
  strong: { x: 0, y: 5, blur: 10, spread: 1, opacity: 36, color: "#14100c" },
  deep: { x: 0, y: 7, blur: 13, spread: 1, opacity: 44, color: "#090706" },
  hard: { x: 2.5, y: 3.5, blur: 0, spread: 0.5, opacity: 48, color: "#14100c" },
  ambient: { x: 0, y: 2, blur: 14, spread: 2, opacity: 18, color: "#334155" },
  glow: { x: 0, y: 0, blur: 8, spread: 1, opacity: 30, color: "#ffffff" },
  studio: { x: 0, y: 5, blur: 12, spread: 0, opacity: 32, color: "#0f172a" },
};

export const SHADOW_LABELS: { value: ShadowPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "float", label: "Float" },
  { value: "strong", label: "Strong" },
  { value: "deep", label: "Deep" },
  { value: "hard", label: "Hard" },
  { value: "ambient", label: "Ambient" },
  { value: "glow", label: "Glow" },
  { value: "studio", label: "Studio" },
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
  { value: "2:1", label: "2:1", ratio: 2 },
  { value: "square-1080", label: "Square 1080", ratio: 1, fixed: { width: 1080, height: 1080 } },
  { value: "portrait-1080", label: "Portrait 1080", ratio: 1080 / 1350, fixed: { width: 1080, height: 1350 } },
  { value: "story-1080", label: "Tall 1080", ratio: 1080 / 1920, fixed: { width: 1080, height: 1920 } },
  { value: "landscape-1200", label: "Landscape 1200", ratio: 1200 / 630, fixed: { width: 1200, height: 630 } },
  { value: "landscape-1600", label: "Landscape 1600", ratio: 16 / 9, fixed: { width: 1600, height: 900 } },
  { value: "x-post", label: "X / Twitter", ratio: 16 / 9, fixed: { width: 1600, height: 900 } },
  { value: "linkedin-post", label: "LinkedIn", ratio: 1200 / 627, fixed: { width: 1200, height: 627 } },
  { value: "youtube-thumbnail", label: "YouTube", ratio: 16 / 9, fixed: { width: 1280, height: 720 } },
  { value: "open-graph", label: "Open Graph", ratio: 1200 / 630, fixed: { width: 1200, height: 630 } },
  { value: "product-hunt", label: "Product Hunt", ratio: 1270 / 760, fixed: { width: 1270, height: 760 } },
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
  background: { kind: "gradient", color: "#f7f1e3", color2: "#e8dcc4", angle: 45, blur: 24, brightness: 72, saturation: 108, intensity: 55, assetId: null, pattern: "dots" },
  padding: 12,
  radius: 50,
  shadow: "float",
  shadowAdvanced: { ...SHADOW_PRESETS.float },
  border: { kind: "none", width: 2, opacity: 60, color: "#ffffff", blur: 12, tint: "#ffffff" },
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  browser: { theme: "light", showAddress: true, address: DEFAULT_ADDRESS, title: "", showControls: true, color: "#f3f1ee", thickness: 100 },
  phone: { theme: "dark", fit: "cover", color: "#1c1714", thickness: 100, shadow: true },
  preset: "auto",
  customCanvas: { width: 1600, height: 900, lockAspect: true, aspectRatio: 16 / 9 },
  exportScale: 1,
  text: { eyebrow: "", title: "", subtitle: "", footer: "", placement: "top", family: "system", fontSize: 52, weight: 600, align: "center", color: "#1c1714", spacing: 12, maxWidth: 80, lineHeight: 120, letterSpacing: 0 },
  perspective: perspectiveForPreset("flat"),
  composition: { layout: "single", assetIds: [], selectedAssetId: null, spacing: 6, items: {} },
  branding: { assetId: null, position: "bottom-right", scale: 18, opacity: 90, margin: 4 },
  animation: { ...ANIMATION_PRESETS.none },
};

/** Sensible per-mode defaults, applied when the user switches mode. */
export const MODE_DEFAULTS: Record<BeautifySettings["mode"], Partial<BeautifySettings>> = {
  clean: { radius: 50, shadow: "float" },
  browser: { radius: 40, shadow: "float" },
  phone: { radius: 100, shadow: "strong" },
  "minimal-browser": { radius: 28, shadow: "float" },
  "mac-window": { radius: 36, shadow: "studio" },
  "windows-window": { radius: 20, shadow: "studio" },
  "android-phone": { radius: 100, shadow: "deep" },
  tablet: { radius: 80, shadow: "deep" },
  laptop: { radius: 28, shadow: "studio" },
  monitor: { radius: 18, shadow: "studio" },
};

/** Curated recipes configure the ordinary controls; no preset has its own rendering path. */
export const STYLE_PRESETS: { id: string; label: string; settings: Partial<BeautifySettings> }[] = [
  { id: "clean", label: "Clean", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#f7f1e3", color2: "#f7f1e3" }, padding: 10, radius: 35, shadow: "soft", scale: 1, offsetX: 0, offsetY: 0 } },
  { id: "launch", label: "Launch", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#e5603b", color2: "#f2a65a", angle: 45 }, padding: 14, radius: 40, shadow: "strong", scale: 0.92, offsetX: 0, offsetY: 0 } },
  { id: "product", label: "Product", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#dbeafe", color2: "#93c5fd", angle: 90 }, padding: 12, radius: 35, shadow: "float", scale: 0.94, offsetX: 0, offsetY: 0 } },
  { id: "documentation", label: "Documentation", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#f3f1ee", color2: "#f3f1ee" }, padding: 8, radius: 20, shadow: "soft", scale: 1, offsetX: 0, offsetY: 0 } },
  { id: "glass", label: "Glass", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "screenshot", blur: 30, brightness: 64, saturation: 112 }, border: { ...DEFAULT_BEAUTIFY.border, kind: "glass", width: 3, opacity: 70, color: "#ffffff" }, padding: 14, radius: 55, shadow: "strong", scale: 0.9, offsetX: 0, offsetY: 0 } },
  { id: "dark", label: "Dark", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#1c1714", color2: "#3b332c", angle: 135 }, padding: 14, radius: 45, shadow: "strong", scale: 0.94, offsetX: 0, offsetY: 0 } },
  { id: "minimal", label: "Minimal", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#ffffff", color2: "#ffffff" }, padding: 6, radius: 12, shadow: "none", scale: 1, offsetX: 0, offsetY: 0 } },
  { id: "soft", label: "Soft", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#ede9fe", color2: "#c4b5fd", angle: 45 }, padding: 18, radius: 75, shadow: "soft", scale: 0.88, offsetX: 0, offsetY: 0 } },
  { id: "gradient", label: "Gradient", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#dcfce7", color2: "#93c5fd", angle: 135 }, padding: 16, radius: 50, shadow: "float", scale: 0.9, offsetX: 0, offsetY: 0 } },
  { id: "developer", label: "Developer", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#1c1714", color2: "#1c1714" }, browser: { ...DEFAULT_BEAUTIFY.browser, theme: "dark", showAddress: true, address: DEFAULT_ADDRESS }, padding: 10, radius: 24, shadow: "hard", scale: 0.96, offsetX: 0, offsetY: 0 } },
  { id: "product-launch", label: "Product Launch", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "mesh", color: "#ff8a65", color2: "#6d28d9", angle: 45 }, padding: 16, radius: 40, shadow: "studio", scale: 0.88, perspective: perspectiveForPreset("tilt-right") } },
  { id: "saas-hero", label: "SaaS Hero", settings: { mode: "minimal-browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "aurora", color: "#0f766e", color2: "#6366f1" }, padding: 18, radius: 42, shadow: "deep", scale: 0.86, perspective: perspectiveForPreset("perspective-left") } },
  { id: "social-post", label: "Social Post", settings: { mode: "clean", preset: "square-1080", background: { ...DEFAULT_BEAUTIFY.background, kind: "radial", color: "#fff1f2", color2: "#fb7185" }, padding: 12, radius: 60, shadow: "float", scale: 0.9 } },
  { id: "app-showcase", label: "App Showcase", settings: { mode: "phone", background: { ...DEFAULT_BEAUTIFY.background, kind: "aurora", color: "#090b18", color2: "#d946ef" }, padding: 16, shadow: "glow", scale: 0.82, perspective: perspectiveForPreset("floating") } },
  { id: "dark-glass", label: "Dark Glass", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "mesh", color: "#090b18", color2: "#273469" }, border: { ...DEFAULT_BEAUTIFY.border, kind: "frosted", width: 3, opacity: 72 }, padding: 16, radius: 55, shadow: "ambient", scale: 0.88 } },
  { id: "minimal-light", label: "Minimal Light", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#f8fafc", color2: "#f8fafc" }, padding: 9, radius: 18, shadow: "soft", scale: 0.96, perspective: perspectiveForPreset("flat") } },
  { id: "gradient-pro", label: "Gradient Pro", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "mesh", color: "#0f766e", color2: "#38bdf8" }, padding: 15, radius: 36, shadow: "studio", scale: 0.9 } },
  { id: "floating-pro", label: "Floating", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "soft-blur", color: "#f1e9ff", color2: "#60a5fa" }, padding: 18, radius: 55, shadow: "deep", scale: 0.82, perspective: perspectiveForPreset("floating") } },
  { id: "3d-tilt", label: "3D Tilt", settings: { mode: "browser", background: { ...DEFAULT_BEAUTIFY.background, kind: "gradient", color: "#111827", color2: "#4b5563", angle: 135 }, padding: 18, radius: 34, shadow: "deep", scale: 0.82, perspective: perspectiveForPreset("isometric-right") } },
  { id: "device-showcase", label: "Device Showcase", settings: { mode: "phone", background: { ...DEFAULT_BEAUTIFY.background, kind: "mesh", color: "#dbeafe", color2: "#a78bfa" }, padding: 16, shadow: "studio", scale: 0.84, perspective: perspectiveForPreset("perspective-right") } },
  { id: "before-after", label: "Before / After", settings: { mode: "clean", background: { ...DEFAULT_BEAUTIFY.background, kind: "solid", color: "#f8fafc", color2: "#f8fafc" }, padding: 10, radius: 30, shadow: "soft", composition: { ...DEFAULT_BEAUTIFY.composition, layout: "side-by-side" } } },
  { id: "feature-announcement", label: "Feature Announcement", settings: { mode: "browser", preset: "landscape-1600", background: { ...DEFAULT_BEAUTIFY.background, kind: "aurora", color: "#6d28d9", color2: "#ff8a65" }, padding: 14, radius: 38, shadow: "studio", scale: 0.88, perspective: perspectiveForPreset("tilt-left") } },
];

export const TEXT_PRESETS: { id: string; label: string; text: Partial<BeautifySettings["text"]> }[] = [
  { id: "product-launch", label: "Product Launch", text: { family: "geometric", weight: 700, fontSize: 64, lineHeight: 110, letterSpacing: -1, align: "center", placement: "top" } },
  { id: "documentation", label: "Documentation", text: { family: "humanist", weight: 600, fontSize: 48, lineHeight: 125, letterSpacing: 0, align: "left", placement: "top" } },
  { id: "social", label: "Social", text: { family: "geometric", weight: 700, fontSize: 72, lineHeight: 105, letterSpacing: -1.5, align: "center", placement: "top" } },
  { id: "developer", label: "Developer", text: { family: "mono", weight: 600, fontSize: 46, lineHeight: 130, letterSpacing: 0, align: "left", placement: "top" } },
  { id: "minimal", label: "Minimal", text: { family: "system", weight: 500, fontSize: 44, lineHeight: 125, letterSpacing: 0.5, align: "center", placement: "bottom" } },
  { id: "announcement", label: "Announcement", text: { family: "humanist", weight: 700, fontSize: 68, lineHeight: 110, letterSpacing: -0.5, align: "center", placement: "top" } },
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
