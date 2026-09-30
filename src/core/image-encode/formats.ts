/**
 * Output formats Shotexa encodes in the browser: PNG, JPEG and WebP — one table, used by every
 * export (Editor, Annotation, Split, Combine, Stitch, Compress, Convert).
 */
import type { OutputFormat } from "@/core/image/output-strategy";

export type { OutputFormat };
export type ImageMime = "image/png" | "image/jpeg" | "image/webp";

export const OUTPUT_FORMATS: readonly OutputFormat[] = ["png", "jpeg", "webp"];

export const FORMAT_MIME: Record<OutputFormat, ImageMime> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
export const FORMAT_EXT: Record<OutputFormat, string> = { png: "png", jpeg: "jpg", webp: "webp" };
export const FORMAT_LABEL: Record<OutputFormat, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP" };

export function formatOfMime(mime: string): OutputFormat | null {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpeg";
  if (mime === "image/webp") return "webp";
  return null;
}

/** JPEG and WebP take a quality; the browser's PNG encoder is lossless and has none. */
export const supportsQuality = (f: OutputFormat) => f !== "png";
/** JPEG cannot store transparency: transparent pixels must be painted onto a background. */
export const supportsAlpha = (f: OutputFormat) => f !== "jpeg";

/** Quality as the encoder expects it (0.5–1), or undefined for PNG. */
export function encoderQuality(format: OutputFormat, quality: number): number | undefined {
  if (!supportsQuality(format)) return undefined;
  return clampQuality(quality);
}

export const MIN_QUALITY = 0.5;
export const MAX_QUALITY = 1;
export const clampQuality = (q: number) => Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, Number.isFinite(q) ? Math.round(q * 100) / 100 : 0.8));

/** File name with the format's extension: `shot.png` → `shot.jpg`. */
export function withExtension(name: string, format: OutputFormat): string {
  return `${name.replace(/\.[^.]+$/, "")}.${FORMAT_EXT[format]}`;
}
