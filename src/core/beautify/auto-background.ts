/**
 * Deterministic, local colour sampling for Beautifier's “from screenshot” background action.
 * The caller supplies a tiny preview sample; no source pixels or canvas are retained here.
 */
export interface SampledBackground {
  color: string;
  color2: string;
}

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((value) => clamp(value).toString(16).padStart(2, "0")).join("")}`;

/**
 * Produces two related, gentle stops from sampled RGBA pixels. More colourful opaque pixels
 * have slightly more influence, so a broad neutral UI does not hide the screenshot's accent.
 */
export function backgroundFromPixels(data: Uint8ClampedArray): SampledBackground {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0) continue;
    const max = Math.max(data[index], data[index + 1], data[index + 2]);
    const min = Math.min(data[index], data[index + 1], data[index + 2]);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const pixelWeight = alpha * (1 + saturation * 0.65);
    red += data[index] * pixelWeight;
    green += data[index + 1] * pixelWeight;
    blue += data[index + 2] * pixelWeight;
    weight += pixelWeight;
  }
  if (weight === 0) return { color: "#f7f1e3", color2: "#e8dcc4" };
  const r = red / weight;
  const g = green / weight;
  const b = blue / weight;
  // Keep the card legible: one light, one darker related stop, not an exact screenshot clone.
  return {
    color: hex(r + (255 - r) * 0.68, g + (255 - g) * 0.68, b + (255 - b) * 0.68),
    color2: hex(r * 0.58, g * 0.58, b * 0.58),
  };
}
