import type { Size } from "@/core/image-transform/types";
import { backgroundFromPixels } from "./auto-background";
import { autoLayout, SHADOW_PRESETS } from "./presets";
import type { BeautifySettings } from "./types";

export interface AutoDesignDecision {
  settings: BeautifySettings;
  screenshotIsDark: boolean;
  averageLuminance: number;
}

export function relativeLuminance(red: number, green: number, blue: number): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return channel(red) * 0.2126 + channel(green) * 0.7152 + channel(blue) * 0.0722;
}

export function averagePixelLuminance(data: Uint8ClampedArray): number {
  let total = 0;
  let weight = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0) continue;
    total += relativeLuminance(data[index], data[index + 1], data[index + 2]) * alpha;
    weight += alpha;
  }
  return weight ? total / weight : 1;
}

/** Deterministic local styling. It samples pixels only; it does not inspect text or call a model. */
export function autoDesignFromPixels(settings: BeautifySettings, source: Size, data: Uint8ClampedArray): AutoDesignDecision {
  const sampled = backgroundFromPixels(data);
  const averageLuminance = averagePixelLuminance(data);
  const screenshotIsDark = averageLuminance < 0.34;
  const laidOut = autoLayout(settings, source);
  return {
    screenshotIsDark,
    averageLuminance,
    settings: {
      ...laidOut,
      background: { ...laidOut.background, kind: "mesh", ...sampled, intensity: 48 },
      padding: source.height > source.width * 1.15 ? 11 : 15,
      radius: source.width < 500 ? 36 : 48,
      shadow: screenshotIsDark ? "ambient" : "studio",
      shadowAdvanced: { ...(screenshotIsDark ? SHADOW_PRESETS.ambient : SHADOW_PRESETS.studio) },
      border: { ...laidOut.border, kind: screenshotIsDark ? "highlight" : "none", opacity: 45 },
      text: { ...laidOut.text, color: screenshotIsDark ? "#ffffff" : "#111827" },
    },
  };
}

