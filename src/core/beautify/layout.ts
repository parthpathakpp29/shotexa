/**
 * Beautifier composition maths — pure, so the preview, the export and the tests all agree.
 *
 *   screenshot → frame (none / browser window / phone shell) → scale and position → canvas
 *
 * Every number is in OUTPUT pixels. The preview draws the same layout multiplied by one scale
 * factor, so what is on screen is what is exported.
 */
import type { Rect, Size } from "@/core/image-transform/types";
import {
  BROWSER_CHROME_MAX,
  BROWSER_CHROME_MIN,
  BROWSER_CHROME_RATIO,
  DEFAULT_ADDRESS,
  FRAME_COLORS,
  MAX_PADDING,
  MAX_RADIUS_RATIO,
  MODE_DEFAULTS,
  outputPreset,
  PHONE_BEZEL_MAX,
  PHONE_BEZEL_MIN,
  PHONE_BEZEL_RATIO,
  PHONE_SCREEN_RATIO,
  SHADOW_BLUR,
  SHADOW_COLOR,
  SHADOW_COLOR_STRONG,
  SHADOW_OFFSET_RATIO,
} from "./presets";
import type { BeautifyLayout, BeautifyMode, BeautifySettings, FrameLayout, ScreenFit } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const round = (v: number) => Math.max(1, Math.round(v));

/** Phone screen radius as a fraction of the opening's width — round, but not a specific device. */
const PHONE_SCREEN_RADIUS_RATIO = 0.055;
const PHONE_NOTCH_WIDTH_RATIO = 0.3;
const PHONE_NOTCH_HEIGHT_RATIO = 0.028;

export function clampSettings(s: BeautifySettings): BeautifySettings {
  const colour = (c: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : fallback);
  return {
    ...s,
    padding: clamp(Math.round(s.padding), 0, MAX_PADDING),
    radius: clamp(Math.round(s.radius), 0, 100),
    scale: clamp(Math.round(s.scale * 100) / 100, 0.4, 1),
    offsetX: clamp(Math.round(s.offsetX * 100) / 100, -1, 1),
    offsetY: clamp(Math.round(s.offsetY * 100) / 100, -1, 1),
    background: { ...s.background, color: colour(s.background.color, "#f7f1e3"), color2: colour(s.background.color2, "#e8dcc4") },
    browser: { ...s.browser, address: s.browser.address.slice(0, 80) },
  };
}

/** Switch mode, applying that mode's sensible frame defaults. */
export const withMode = (s: BeautifySettings, mode: BeautifyMode): BeautifySettings => (mode === s.mode ? s : { ...s, ...MODE_DEFAULTS[mode], mode });

/** The browser window's chrome strip for a screenshot this wide. */
export const browserChrome = (width: number) => clamp(Math.round(width * BROWSER_CHROME_RATIO), BROWSER_CHROME_MIN, BROWSER_CHROME_MAX);

/**
 * The phone's screen opening for this screenshot, at 9:19.5.
 * `contain` → the smallest opening that holds the whole screenshot (it is letterboxed).
 * `cover`   → the largest opening inside the screenshot (its edges are cropped).
 * Either way the screenshot is drawn at its native resolution and never stretched.
 */
export function phoneOpening(source: Size, fit: ScreenFit): Size {
  const byWidth = { width: source.width, height: round(source.width / PHONE_SCREEN_RATIO) };
  if (fit === "contain") {
    if (byWidth.height >= source.height) return byWidth;
    return { width: round(source.height * PHONE_SCREEN_RATIO), height: source.height };
  }
  if (byWidth.height <= source.height) return byWidth;
  return { width: round(source.height * PHONE_SCREEN_RATIO), height: source.height };
}

export const phoneBezel = (opening: Size) => clamp(Math.round(opening.width * PHONE_BEZEL_RATIO), PHONE_BEZEL_MIN, PHONE_BEZEL_MAX);

interface Natural {
  /** The framed composition at its natural size. */
  size: Size;
  /** The rounded screen area inside it. */
  screen: Rect;
  /** Where the screenshot's pixels go inside `screen`. */
  image: Rect;
  /** The part of the source drawn there. */
  sourceRect: Rect;
}

/** The composition before any padding, scaling or positioning. */
export function naturalComposition(s: BeautifySettings, source: Size): Natural {
  const whole = { x: 0, y: 0, width: source.width, height: source.height };
  if (s.mode === "browser") {
    const chrome = browserChrome(source.width);
    const area = { ...whole, y: chrome };
    return { size: { width: source.width, height: source.height + chrome }, screen: area, image: area, sourceRect: whole };
  }
  if (s.mode === "phone") {
    const opening = phoneOpening(source, s.phone.fit);
    const bezel = phoneBezel(opening);
    const size = { width: opening.width + bezel * 2, height: opening.height + bezel * 2 };
    const screen = { x: bezel, y: bezel, width: opening.width, height: opening.height };
    if (s.phone.fit === "contain") {
      // The whole screenshot, centred on the screen; the rest of the screen stays visible.
      const image = {
        x: bezel + Math.round((opening.width - source.width) / 2),
        y: bezel + Math.round((opening.height - source.height) / 2),
        width: source.width,
        height: source.height,
      };
      return { size, screen, image, sourceRect: whole };
    }
    // Cover: the opening is filled by a centred crop of the screenshot.
    const sourceRect = {
      x: Math.round((source.width - opening.width) / 2),
      y: Math.round((source.height - opening.height) / 2),
      width: opening.width,
      height: opening.height,
    };
    return { size, screen, image: screen, sourceRect };
  }
  return { size: { width: source.width, height: source.height }, screen: whole, image: whole, sourceRect: whole };
}

/** The canvas the current preset asks for, and the padding kept clear around the composition. */
export function canvasFor(s: BeautifySettings, base: Size): { canvas: Size; pad: number } {
  const fraction = clamp(s.padding, 0, MAX_PADDING) / 100;
  const preset = outputPreset(s.preset);
  if (preset.fixed) {
    const canvas = { ...preset.fixed };
    return { canvas, pad: Math.round(fraction * Math.min(canvas.width, canvas.height)) };
  }
  const pad = Math.round(fraction * Math.min(base.width, base.height));
  const auto = { width: base.width + pad * 2, height: base.height + pad * 2 };
  if (preset.ratio === null) return { canvas: auto, pad };
  // A ratio preset only ever grows the canvas, so the composition is never cropped.
  const canvas = auto.width / auto.height < preset.ratio ? { width: round(auto.height * preset.ratio), height: auto.height } : { width: auto.width, height: round(auto.width / preset.ratio) };
  return { canvas, pad };
}

function frameLayout(s: BeautifySettings, content: Rect, screen: Rect, k: number): FrameLayout | null {
  if (s.mode === "browser") {
    const chrome = Math.round(browserChrome(screen.width / k) * k);
    const r = Math.max(2, Math.round(chrome * 0.14));
    const gap = r * 3.2;
    const cy = content.y + chrome / 2;
    const dots = [0, 1, 2].map((i) => ({ cx: content.x + chrome * 0.62 + i * gap, cy, r }));
    const left = content.x + chrome * 0.62 + 2 * gap + r * 3.4;
    const barHeight = Math.max(6, Math.round(chrome * 0.52));
    const address = s.browser.showAddress
      ? {
          x: left,
          y: Math.round(cy - barHeight / 2),
          width: Math.max(10, content.x + content.width - left - Math.round(chrome * 0.62)),
          height: barHeight,
          radius: barHeight / 2,
          text: s.browser.address.trim() || DEFAULT_ADDRESS,
          fontSize: Math.max(5, Math.round(barHeight * 0.52)),
        }
      : null;
    return { kind: "browser", theme: s.browser.theme, chrome, dots, address };
  }
  if (s.mode === "phone") {
    const bezel = Math.round(Math.min(screen.x - content.x, screen.y - content.y));
    const width = Math.round(screen.width * PHONE_NOTCH_WIDTH_RATIO);
    const height = Math.max(3, Math.round(screen.width * PHONE_NOTCH_HEIGHT_RATIO));
    const notch = { x: Math.round(screen.x + (screen.width - width) / 2), y: Math.round(screen.y + height * 0.6), width, height, radius: height / 2 };
    return { kind: "phone", theme: s.phone.theme, bezel, notch };
  }
  return null;
}

/** The whole composition, in output pixels. */
export function beautifyLayout(settings: BeautifySettings, source: Size): BeautifyLayout {
  const s = clampSettings(settings);
  const natural = naturalComposition(s, source);
  const base = natural.size;
  const { canvas, pad } = canvasFor(s, base);
  // Fit the composition inside the padded canvas, then apply the user's scale.
  const fit = Math.min((canvas.width - pad * 2) / base.width, (canvas.height - pad * 2) / base.height);
  const k = Math.max(0.01, fit) * s.scale;
  const content = {
    x: 0,
    y: 0,
    width: Math.min(canvas.width, round(base.width * k)),
    height: Math.min(canvas.height, round(base.height * k)),
  };
  // Position inside the free space: offset 0 centres, ±1 reaches an edge, never past it.
  const freeX = Math.max(0, canvas.width - content.width);
  const freeY = Math.max(0, canvas.height - content.height);
  content.x = clamp(Math.round((freeX / 2) * (1 + s.offsetX)), 0, freeX);
  content.y = clamp(Math.round((freeY / 2) * (1 + s.offsetY)), 0, freeY);

  const place = (r: typeof natural.screen) => ({
    x: content.x + Math.round(r.x * k),
    y: content.y + Math.round(r.y * k),
    width: round(r.width * k),
    height: round(r.height * k),
  });
  const screen = place(natural.screen);
  const image = place(natural.image);

  const radiusFraction = (s.mode === "phone" ? 100 : s.radius) / 100;
  const shortContent = Math.min(content.width, content.height);
  const shortScreen = Math.min(screen.width, screen.height);
  let radius = Math.round(radiusFraction * MAX_RADIUS_RATIO * shortContent);
  let screenRadii: readonly [number, number, number, number] = [radius, radius, radius, radius];
  if (s.mode === "browser") {
    // The window is rounded; the screenshot keeps the window's bottom corners and squares off
    // against the chrome strip above it.
    screenRadii = [0, 0, radius, radius];
  } else if (s.mode === "phone") {
    const screenRadius = Math.round(PHONE_SCREEN_RADIUS_RATIO * screen.width);
    const bezel = Math.round(Math.min(screen.x - content.x, screen.y - content.y));
    radius = screenRadius + bezel;
    screenRadii = [screenRadius, screenRadius, screenRadius, screenRadius];
  }

  const blur = Math.round(SHADOW_BLUR[s.shadow] * shortContent);
  const shadow = s.shadow === "none" || blur <= 0 ? null : { blur, offsetY: Math.round(blur * SHADOW_OFFSET_RATIO), color: s.shadow === "strong" ? SHADOW_COLOR_STRONG : SHADOW_COLOR };

  return {
    canvas,
    background: { ...s.background },
    content,
    screen,
    image,
    sourceRect: natural.sourceRect,
    radius: Math.min(radius, Math.floor(shortContent / 2)),
    screenRadii: screenRadii.map((r) => Math.min(r, Math.floor(shortScreen / 2))) as unknown as readonly [number, number, number, number],
    shadow,
    frame: frameLayout(s, content, screen, k),
    screenBackground: s.mode === "phone" ? FRAME_COLORS[s.phone.theme].screen : FRAME_COLORS.light.screen,
    zoom: image.width / natural.sourceRect.width,
  };
}

/** The exported image's size, without building the rest of the layout. */
export const beautifySize = (settings: BeautifySettings, source: Size): Size => canvasFor(clampSettings(settings), naturalComposition(clampSettings(settings), source).size).canvas;
