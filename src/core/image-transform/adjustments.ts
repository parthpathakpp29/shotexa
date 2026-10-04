import { IDENTITY_TRANSFORM } from "./transform";
import type { ImageTransform } from "./types";

export type FilterPreset = "original" | "bw" | "warm" | "cool" | "high-contrast" | "soft";

export const FILTER_PRESETS: { value: FilterPreset; label: string; adjustments: ImageTransform["adjustments"] }[] = [
  { value: "original", label: "Original", adjustments: { ...IDENTITY_TRANSFORM.adjustments } },
  { value: "bw", label: "B&W", adjustments: { ...IDENTITY_TRANSFORM.adjustments, contrast: 10, grayscale: 100 } },
  { value: "warm", label: "Warm", adjustments: { ...IDENTITY_TRANSFORM.adjustments, saturation: 8, warmth: 32 } },
  { value: "cool", label: "Cool", adjustments: { ...IDENTITY_TRANSFORM.adjustments, saturation: 4, warmth: -28 } },
  { value: "high-contrast", label: "High contrast", adjustments: { ...IDENTITY_TRANSFORM.adjustments, contrast: 28, saturation: 10 } },
  { value: "soft", label: "Soft", adjustments: { ...IDENTITY_TRANSFORM.adjustments, brightness: 5, contrast: -18, saturation: -8 } },
];
