import { DEFAULT_BEAUTIFY } from "./presets";
import { perspectiveForPreset } from "./perspective";
import { STUDIO_ART } from "./studio-art";
import type { BeautifySettings, BeautifyText } from "./types";

type Background = BeautifySettings["background"];
export type StudioBackground = { id: string; label: string; category: string; description: string; background: Background };
export type StudioTemplate = { id: string; label: string; use: string; category: string; description: string; settings: Partial<BeautifySettings>; textStyle?: Partial<BeautifyText>; starterCopy?: Pick<BeautifyText, "eyebrow" | "title"> };

const entries: Omit<StudioBackground, "background">[] = [
  { id: "orbit-ink", label: "Orbit Ink", category: "Cosmic", description: "Violet light and orbital lines" },
  { id: "nebula-glow", label: "Nebula Glow", category: "Cosmic", description: "Magenta ribbons in deep space" },
  { id: "prism-haze", label: "Prism Haze", category: "Abstract", description: "Refracted shapes on a cool sky" },
  { id: "copper-flow", label: "Copper Flow", category: "Editorial", description: "Sculpted copper arches" },
  { id: "paper-sun", label: "Paper Sun", category: "Editorial", description: "Warm paper and quiet linework" },
  { id: "moss-light", label: "Moss Light", category: "Nature", description: "Botanical shapes in forest light" },
  { id: "sage-mist", label: "Sage Mist", category: "Nature", description: "Soft atmospheric sage" },
  { id: "frosted-blue", label: "Frosted Blue", category: "Glass", description: "Translucent glass in daylight" },
  { id: "gallery-white", label: "Gallery White", category: "Minimal", description: "Warm gallery wall and fine frames" },
  { id: "soft-lilac", label: "Soft Lilac", category: "Soft", description: "Lilac waves and rose light" },
  { id: "nocturne", label: "Nocturne", category: "Dark", description: "Architectural light on charcoal" },
  { id: "stage-sand", label: "Stage Sand", category: "Studio", description: "Golden studio horizon" },
  { id: "ember-theatre", label: "Ember Theatre", category: "Dark", description: "Sinuous ember light" },
  { id: "citrus-bloom", label: "Citrus Bloom", category: "Abstract", description: "Sunlit citrus petals" },
  { id: "blueprint", label: "Blueprint", category: "Studio", description: "Technical grid and teal light" },
  { id: "peach-veil", label: "Peach Veil", category: "Soft", description: "Layered silk-like folds" },
  { id: "chrome-night", label: "Chrome Night", category: "Dark", description: "Midnight metallic ellipses" },
  { id: "ultramarine", label: "Ultramarine", category: "Cosmic", description: "Ocean-blue concentric light" },
];

/** Artwork IDs are shared with the renderer, making selection deterministic and export-safe. */
export const STUDIO_BACKGROUNDS: StudioBackground[] = entries.map((entry) => {
  const art = STUDIO_ART.find((candidate) => candidate.id === entry.id)!;
  return { ...entry, background: { ...DEFAULT_BEAUTIFY.background, kind: "studio", studioId: entry.id, color: art.colors[0], color2: art.colors[2] } };
});

const background = (id: string) => STUDIO_BACKGROUNDS.find((entry) => entry.id === id)!.background;
const flat = perspectiveForPreset("flat");

/** The canonical layout and renderer own every recipe. User copy and workspace assets persist. */
export const STUDIO_TEMPLATES: StudioTemplate[] = [
  { id: "orbit-launch", label: "Orbit Launch", use: "SaaS launch", category: "Launch", description: "A hero browser, restrained camera tilt, and cosmic light.", settings: { mode: "browser", background: background("orbit-ink"), padding: 6, radius: 34, shadow: "deep", scale: 1, offsetX: 0, offsetY: 0, perspective: perspectiveForPreset("floating"), preset: "landscape-1600" } },
  { id: "copper-editorial", label: "Copper Story", use: "Editorial post", category: "Social", description: "Warm sculptural arches, expressive type, and a centered image.", settings: { mode: "clean", background: background("copper-flow"), padding: 7, radius: 34, shadow: "studio", scale: 1, offsetX: 0, offsetY: -0.55, perspective: flat, preset: "square-1080" }, textStyle: { color: "#fff0da", family: "serif", placement: "top", fontSize: 62, weight: 500 }, starterCopy: { eyebrow: "PRODUCT STORY", title: "A closer look." } },
  { id: "prism-product", label: "Prism Product", use: "Product showcase", category: "Launch", description: "An airy, luminous product stage.", settings: { mode: "minimal-browser", background: background("prism-haze"), padding: 7, radius: 28, shadow: "float", scale: 1, offsetX: 0, offsetY: 0, perspective: flat, preset: "landscape-1600" } },
  { id: "sage-document", label: "Sage Docs", use: "Documentation", category: "Professional", description: "Calm contrast for docs and instructional pages.", settings: { mode: "browser", background: background("sage-mist"), padding: 6, radius: 20, shadow: "soft", scale: 1, offsetX: 0, offsetY: 0, perspective: flat, preset: "landscape-1600" } },
  { id: "frosted-app", label: "Frosted App", use: "Mobile app", category: "Devices", description: "A phone composition with soft blue glass.", settings: { mode: "phone", background: background("frosted-blue"), padding: 7, radius: 78, shadow: "deep", scale: 0.97, offsetX: 0, offsetY: 0, perspective: flat, preset: "portrait-1080", phone: { ...DEFAULT_BEAUTIFY.phone, fit: "contain" } } },
  { id: "gallery-portfolio", label: "Gallery", use: "Portfolio", category: "Professional", description: "An understated gallery print with generous detail.", settings: { mode: "clean", background: background("gallery-white"), padding: 7, radius: 16, shadow: "studio", scale: 1, offsetX: 0, offsetY: 0, perspective: flat, preset: "landscape-1600" } },
  { id: "nocturne-code", label: "Nocturne Code", use: "Developer work", category: "Professional", description: "Dark architectural light around a crisp window.", settings: { mode: "browser", background: background("nocturne"), padding: 6, radius: 22, shadow: "deep", scale: 1, offsetX: 0, offsetY: 0, perspective: flat, preset: "landscape-1600", browser: { ...DEFAULT_BEAUTIFY.browser, theme: "dark" } } },
  { id: "stage-presentation", label: "Stage Slides", use: "Presentation", category: "Professional", description: "A warm, composed presentation canvas.", settings: { mode: "clean", background: background("stage-sand"), padding: 9, radius: 26, shadow: "float", scale: 1, offsetX: 0, offsetY: 0, perspective: flat, preset: "landscape-1600" } },
  { id: "blueprint-demo", label: "Blueprint Demo", use: "Developer launch", category: "Launch", description: "Technical lines and a prominent product view.", settings: { mode: "minimal-browser", background: background("blueprint"), padding: 6, radius: 24, shadow: "deep", scale: 1, offsetX: 0, offsetY: 0, perspective: perspectiveForPreset("tilt-left"), preset: "landscape-1600", browser: { ...DEFAULT_BEAUTIFY.browser, theme: "dark" } } },
  { id: "paper-feature", label: "Paper Feature", use: "Feature story", category: "Social", description: "Editorial paper, a sun disc, and clean framing.", settings: { mode: "clean", background: background("paper-sun"), padding: 8, radius: 18, shadow: "studio", scale: 1, offsetX: 0, offsetY: -0.15, perspective: flat, preset: "portrait-1080" }, textStyle: { color: "#3d261d", family: "serif", placement: "top", fontSize: 60, weight: 500 }, starterCopy: { eyebrow: "FEATURED", title: "The work, in focus." } },
  { id: "lilac-creative", label: "Lilac Motion", use: "Creative studio", category: "Social", description: "Playful waves with a gently floating image.", settings: { mode: "clean", background: background("soft-lilac"), padding: 8, radius: 48, shadow: "float", scale: 1, offsetX: 0, offsetY: 0, perspective: perspectiveForPreset("floating"), preset: "square-1080" } },
  { id: "chrome-night", label: "Chrome Night", use: "Premium product", category: "Launch", description: "Metallic rings and cinematic dark contrast.", settings: { mode: "browser", background: background("chrome-night"), padding: 6, radius: 28, shadow: "deep", scale: 1, offsetX: 0, offsetY: 0, perspective: perspectiveForPreset("tilt-right"), preset: "landscape-1600", browser: { ...DEFAULT_BEAUTIFY.browser, theme: "dark" } } },
];

export function resolveStudioTemplate(template: StudioTemplate, current: BeautifySettings, source?: { width: number; height: number }): Partial<BeautifySettings> {
  // A landscape app screenshot belongs in a wide frame. The phone treatment is reserved for
  // portrait sources, where it can display the entire screen without a large black letterbox.
  const widePhoneSource = template.settings.mode === "phone" && source && source.width / source.height > 0.8;
  const stockCopy = STUDIO_TEMPLATES.some((entry) => entry.starterCopy?.title === current.text.title && entry.starterCopy?.eyebrow === current.text.eyebrow);
  const text = { ...current.text, ...(stockCopy ? { title: "", eyebrow: "" } : {}), color: ["orbit-ink", "nocturne", "blueprint", "chrome-night", "copper-flow"].includes(template.settings.background?.studioId ?? "") ? "#f8f6f1" : "#1c1714", family: "system" as const, placement: "top" as const, ...template.textStyle };
  if (template.starterCopy && (!current.text.title.trim() && !current.text.eyebrow.trim() || stockCopy)) {
    text.eyebrow = template.starterCopy.eyebrow;
    text.title = template.starterCopy.title;
  }
  return {
    ...template.settings,
    ...(widePhoneSource ? { mode: "minimal-browser" as const, preset: "landscape-1600" as const, scale: 1, padding: 7, radius: 28 } : {}),
    border: { ...DEFAULT_BEAUTIFY.border },
    browser: template.settings.browser ?? { ...DEFAULT_BEAUTIFY.browser },
    phone: template.settings.phone ?? { ...DEFAULT_BEAUTIFY.phone, fit: "contain" },
    text,
  };
}
