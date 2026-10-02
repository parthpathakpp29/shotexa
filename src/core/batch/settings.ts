import { FORMAT_MIME, formatOfMime, withExtension, type OutputFormat } from "@/core/image-encode/formats";
import { encodedName } from "@/core/image-encode/settings";
import { IDENTITY_TRANSFORM, outputSize } from "@/core/image-transform/transform";
import type { ImageTransform } from "@/core/image-transform/types";
import type { BatchOperation, BatchSettings, BatchSource } from "./types";

export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  compress: { format: "same", quality: 0.8 },
  convert: { format: "webp", quality: 0.92, background: "#ffffff" },
  resize: {
    mode: "fit",
    width: 1920,
    height: 1080,
    percentage: 50,
    fitWidth: 1920,
    fitHeight: 1080,
    allowEnlarge: false,
    format: "same",
    quality: 0.92,
    background: "#ffffff",
  },
};

export function batchFormat(operation: BatchOperation, source: BatchSource, settings: BatchSettings): OutputFormat {
  const input = formatOfMime(source.type) ?? "png";
  if (operation === "compress") return settings.compress.format === "same" ? input : settings.compress.format;
  if (operation === "convert") return settings.convert.format;
  if (operation === "resize") return settings.resize.format === "same" ? input : settings.resize.format;
  return input;
}

export function resizeTransform(source: Pick<BatchSource, "width" | "height">, settings: BatchSettings["resize"]): ImageTransform {
  let scale = 1;
  if (settings.mode === "width") scale = settings.width / source.width;
  else if (settings.mode === "height") scale = settings.height / source.height;
  else if (settings.mode === "percentage") scale = settings.percentage / 100;
  else scale = Math.min(settings.fitWidth / source.width, settings.fitHeight / source.height);
  if (!settings.allowEnlarge) scale = Math.min(1, scale);
  scale = Math.max(1 / Math.max(source.width, source.height), scale);
  return scale === 1 ? IDENTITY_TRANSFORM : { ...IDENTITY_TRANSFORM, resize: { scaleX: scale, scaleY: scale } };
}

export function batchOutputName(operation: BatchOperation, sourceName: string, format: OutputFormat): string {
  if (operation === "compress") return encodedName("compress", sourceName, format);
  if (operation === "convert") return encodedName("convert", sourceName, format);
  if (operation === "privacy") return `privacy-clean-${sourceName.replace(/^privacy-clean-/, "")}`;
  return `resized-${withExtension(sourceName.replace(/^resized-/, ""), format)}`;
}

export function resizeOutput(source: BatchSource, settings: BatchSettings["resize"]) {
  const transform = resizeTransform(source, settings);
  return { transform, size: outputSize(transform, source) };
}

export function resultMime(format: OutputFormat) {
  return FORMAT_MIME[format];
}

