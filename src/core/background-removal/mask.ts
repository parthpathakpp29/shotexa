import type { EdgeSettings, MaskStroke } from "./types";

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export function maskBounds(mask: Uint8ClampedArray, width: number, height: number, threshold = 8) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x] > threshold) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function extrema(input: Uint8ClampedArray, width: number, height: number, radius: number, max: boolean) {
  if (radius < 1) return new Uint8ClampedArray(input);
  const out = new Uint8ClampedArray(input.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = max ? 0 : 255;
    for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) {
      value = max ? Math.max(value, input[yy * width + xx]) : Math.min(value, input[yy * width + xx]);
    }
    out[y * width + x] = value;
  }
  return out;
}

export function blurMask(input: Uint8ClampedArray, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.round(radius));
  if (!r) return new Uint8ClampedArray(input);
  const tmp = new Float32Array(input.length);
  const out = new Uint8ClampedArray(input.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += input[y * width + Math.max(0, Math.min(width - 1, x))];
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / (r * 2 + 1);
      sum += input[y * width + Math.min(width - 1, x + r + 1)] - input[y * width + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.max(0, Math.min(height - 1, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = clampByte(sum / (r * 2 + 1));
      sum += tmp[Math.min(height - 1, y + r + 1) * width + x] - tmp[Math.max(0, y - r) * width + x];
    }
  }
  return out;
}

export function refineMask(input: Uint8ClampedArray, width: number, height: number, edge: EdgeSettings) {
  let out = new Uint8ClampedArray(input);
  const shift = Math.round(edge.shift);
  if (shift) out = extrema(out, width, height, Math.abs(shift), shift > 0);
  if (edge.smooth > 0) {
    out = blurMask(out, width, height, edge.smooth);
    for (let i = 0; i < out.length; i++) {
      const t = out[i] / 255;
      out[i] = clampByte((t * t * (3 - 2 * t)) * 255);
    }
  }
  if (edge.feather > 0) out = blurMask(out, width, height, edge.feather);
  return out;
}

export function applyStroke(mask: Uint8ClampedArray, width: number, height: number, stroke: MaskStroke): void {
  const radius = Math.max(1, stroke.size / 2);
  const points = stroke.points.length === 1 ? stroke.points : stroke.points.flatMap((point, index) => {
    if (!index) return [point];
    const previous = stroke.points[index - 1];
    const dx = (point.x - previous.x) * width, dy = (point.y - previous.y) * height;
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(1, radius / 2)));
    return Array.from({ length: count }, (_, i) => ({ x: previous.x + (point.x - previous.x) * ((i + 1) / count), y: previous.y + (point.y - previous.y) * ((i + 1) / count) }));
  });
  for (const point of points) {
    const cx = point.x * width, cy = point.y * height;
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius) continue;
      const featherStart = radius * Math.max(0, Math.min(1, stroke.hardness));
      const opacity = distance <= featherStart ? 1 : 1 - (distance - featherStart) / Math.max(0.001, radius - featherStart);
      const index = y * width + x;
      mask[index] = stroke.mode === "restore" ? Math.max(mask[index], clampByte(opacity * 255)) : Math.min(mask[index], clampByte((1 - opacity) * 255));
    }
  }
}

export function applyStrokes(base: Uint8ClampedArray, width: number, height: number, strokes: readonly MaskStroke[]) {
  const out = new Uint8ClampedArray(base);
  for (const stroke of strokes) applyStroke(out, width, height, stroke);
  return out;
}

/** Pure alpha multiplication used by tests and non-canvas consumers. RGB is preserved. */
export function applyMaskAlpha(rgba: Uint8ClampedArray, mask: Uint8ClampedArray) {
  if (rgba.length !== mask.length * 4) throw new RangeError("Mask and pixel dimensions do not match");
  const out = new Uint8ClampedArray(rgba);
  for (let index = 0; index < mask.length; index++) out[index * 4 + 3] = clampByte(out[index * 4 + 3] * mask[index] / 255);
  return out;
}
