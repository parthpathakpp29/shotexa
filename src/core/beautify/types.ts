/**
 * Screenshot Beautifier — logical model. Only small values live in the workspace store: a mode,
 * a background, a few numbers and the frame options. The composed pixels are produced at export
 * time from the ORIGINAL file and are never stored here.
 */
import type { Rect, Size } from "@/core/image-transform/types";

export type BeautifyMode =
  | "clean"
  | "browser"
  | "minimal-browser"
  | "mac-window"
  | "windows-window"
  | "phone"
  | "android-phone"
  | "tablet"
  | "laptop"
  | "monitor";
export type BackgroundKind = "solid" | "gradient" | "mesh" | "radial" | "aurora" | "soft-blur" | "noise" | "pattern" | "screenshot" | "custom-image";
/** Gradient direction, in degrees clockwise from "top to bottom". */
export type GradientAngle = 0 | 45 | 90 | 135;
export type ShadowPreset = "none" | "soft" | "float" | "strong" | "deep" | "hard" | "ambient" | "glow" | "studio" | "custom";
export type BorderKind = "none" | "solid" | "glass" | "frosted" | "inner" | "highlight";
export type CaptionPlacement = "top" | "bottom";
export type TextAlignment = "left" | "center" | "right";
export type FontWeight = 400 | 500 | 600 | 700;
export type ExportScale = 1 | 2 | 3 | 4;
export type FrameTheme = "light" | "dark";
/** How a screenshot that does not match the device opening is fitted. */
export type ScreenFit = "contain" | "cover";
export type OutputPreset =
  | "auto"
  | "1:1"
  | "4:5"
  | "4:3"
  | "9:16"
  | "16:9"
  | "3:2"
  | "1.91:1"
  | "2:1"
  | "square-1080"
  | "portrait-1080"
  | "story-1080"
  | "landscape-1200"
  | "landscape-1600"
  | "x-post"
  | "linkedin-post"
  | "youtube-thumbnail"
  | "open-graph"
  | "product-hunt"
  | "custom";

export type PerspectivePreset = "flat" | "tilt-left" | "tilt-right" | "perspective-left" | "perspective-right" | "floating" | "isometric-left" | "isometric-right" | "custom";
export type MultiLayout = "single" | "side-by-side" | "stacked" | "fan" | "three-column" | "overlap";
export type AnimationPreset = "none" | "fade-in" | "slide-up" | "zoom-in" | "float" | "slow-pan" | "parallax" | "tilt" | "rotate-3d" | "orbit";
export type AnimationEasing = "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
export type FontFamily = "system" | "humanist" | "geometric" | "serif" | "mono";

export interface BeautifyBackground {
  kind: BackgroundKind;
  /** Solid colour, or the gradient's first stop. */
  color: string;
  /** The gradient's second stop. */
  color2: string;
  angle: GradientAngle;
  /** Screenshot-background blur in output pixels before export scaling. */
  blur: number;
  /** 100 is unchanged; lower values dim the screenshot. */
  brightness: number;
  /** 100 is unchanged. Kept deliberately subtle in the UI. */
  saturation: number;
  /** Intensity of generated mesh/aurora/noise/pattern detail. */
  intensity?: number;
  /** Optional local workspace image. The Blob remains in AssetRegistry. */
  assetId?: string | null;
  pattern?: "dots" | "grid" | "diagonal";
}

export interface BeautifyBorder {
  kind: BorderKind;
  width: number;
  opacity: number;
  color: string;
  blur?: number;
  tint?: string;
}

export interface BeautifyShadowAdvanced {
  /** Percentages of the composition's short side. */
  x: number;
  y: number;
  blur: number;
  spread: number;
  opacity: number;
  color?: string;
}

export interface BeautifyText {
  eyebrow: string;
  title: string;
  subtitle: string;
  footer: string;
  placement: CaptionPlacement;
  family: FontFamily;
  fontSize: number;
  weight: FontWeight;
  align: TextAlignment;
  color: string;
  spacing: number;
  /** Width of the caption block as a percentage of the canvas. */
  maxWidth: number;
  lineHeight: number;
  letterSpacing: number;
}

export interface BeautifyPerspective {
  preset: PerspectivePreset;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  /** Camera distance. Higher values flatten the projection. */
  depth: number;
  /** Perspective origin in percentages of the composition. */
  originX: number;
  originY: number;
}

export interface BeautifyCompositionItem {
  assetId: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  radius: number;
}

export interface BeautifyComposition {
  layout: MultiLayout;
  assetIds: string[];
  selectedAssetId: string | null;
  spacing: number;
  items: Record<string, BeautifyCompositionItem>;
}

export interface BeautifyBranding {
  assetId: string | null;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  scale: number;
  opacity: number;
  margin: number;
}

export interface BeautifyAnimation {
  preset: AnimationPreset;
  duration: number;
  easing: AnimationEasing;
  direction: "left" | "right" | "up" | "down";
  intensity: number;
  loop: boolean;
}

export interface CustomCanvasSettings {
  width: number;
  height: number;
  lockAspect: boolean;
  /** Last locked width / height ratio, retained when either dimension changes. */
  aspectRatio: number;
}

export interface BrowserFrameSettings {
  theme: FrameTheme;
  showAddress: boolean;
  /** Shown in the address bar. Never filled in from the image's contents. */
  address: string;
  title?: string;
  showControls?: boolean;
  color?: string;
  thickness?: number;
}

export interface PhoneFrameSettings {
  theme: FrameTheme;
  fit: ScreenFit;
  color?: string;
  thickness?: number;
  shadow?: boolean;
}

export interface BeautifySettings {
  mode: BeautifyMode;
  background: BeautifyBackground;
  /** Padding around the composition, as a percentage (see `layout.ts`). */
  padding: number;
  /** Corner rounding, 0–100 % of the mode's maximum sensible radius. */
  radius: number;
  shadow: ShadowPreset;
  shadowAdvanced: BeautifyShadowAdvanced;
  border: BeautifyBorder;
  /** Size of the composition inside the canvas, 0.4–1. */
  scale: number;
  /** Position inside the free space, −1 … 1 (0 = centred). */
  offsetX: number;
  offsetY: number;
  browser: BrowserFrameSettings;
  phone: PhoneFrameSettings;
  preset: OutputPreset;
  customCanvas: CustomCanvasSettings;
  exportScale: ExportScale;
  text: BeautifyText;
  perspective: BeautifyPerspective;
  composition: BeautifyComposition;
  branding: BeautifyBranding;
  animation: BeautifyAnimation;
}

export interface BackgroundPaint {
  kind: BackgroundKind;
  color: string;
  color2: string;
  angle: GradientAngle;
  blur: number;
  brightness: number;
  saturation: number;
  intensity?: number;
  assetId?: string | null;
  pattern?: "dots" | "grid" | "diagonal";
}

export interface ShadowPaint {
  blur: number;
  offsetX: number;
  offsetY: number;
  spread: number;
  color: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface PerspectiveLayout {
  quad: readonly [Point, Point, Point, Point];
  bounds: Rect;
  active: boolean;
}

export interface BorderPaint {
  kind: Exclude<BorderKind, "none">;
  width: number;
  color: string;
}

export interface CaptionLayout extends BeautifyText {
  rect: Rect;
  subtitleSize: number;
}

export interface BrowserFrameLayout {
  kind: "browser";
  style: BeautifyMode;
  theme: FrameTheme;
  color: string;
  showControls: boolean;
  title: string;
  /** Height of the chrome strip above the screenshot. */
  chrome: number;
  /** Window-control dots, left to right. */
  dots: { cx: number; cy: number; r: number }[];
  /** Address pill, or null when it is hidden. */
  address: (Rect & { radius: number; text: string; fontSize: number }) | null;
}

export interface PhoneFrameLayout {
  kind: "phone";
  style: BeautifyMode;
  theme: FrameTheme;
  color: string;
  shadow: boolean;
  /** Shell thickness around the screen. */
  bezel: number;
  /** Rounded "camera" pill at the top of the screen. */
  notch: Rect & { radius: number };
}

export type FrameLayout = BrowserFrameLayout | PhoneFrameLayout;

/**
 * A complete composition in OUTPUT pixels. The preview and the export draw the same layout —
 * the preview simply multiplies it by a scale — so they cannot drift apart.
 */
export interface BeautifyLayout {
  canvas: Size;
  source: Size;
  background: BackgroundPaint;
  /** The framed composition (screenshot plus any frame) inside the canvas. */
  content: Rect;
  /** The rounded screen area: the device's opening, or the screenshot area in the other modes. */
  screen: Rect;
  /** Where the screenshot's pixels are drawn — inside `screen`, letterboxed by a contain fit. */
  image: Rect;
  /** The part of the source that is drawn (all of it unless the fit crops). */
  sourceRect: Rect;
  /** Corner radius of the content box. */
  radius: number;
  /** Corner radii applied to the screenshot: top-left, top-right, bottom-right, bottom-left. */
  screenRadii: readonly [number, number, number, number];
  shadow: ShadowPaint | null;
  border: BorderPaint | null;
  caption: CaptionLayout | null;
  frame: FrameLayout | null;
  /** Colour behind a letterboxed screenshot (contain fit). */
  screenBackground: string;
  /** `image.width / sourceRect.width` — 1 when the screenshot is drawn at native size. */
  zoom: number;
  perspective: PerspectiveLayout;
  composition: BeautifyComposition;
  branding: BeautifyBranding;
}

export interface BeautifyDrawResource {
  id: string;
  image: CanvasImageSource;
  imageScale: number;
  source: Size;
}

export type BeautifyErrorCode = "BEAUTIFY_TOO_LARGE" | "BEAUTIFY_INVALID";

export class BeautifyError extends Error {
  constructor(
    readonly code: BeautifyErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "BeautifyError";
  }
}
