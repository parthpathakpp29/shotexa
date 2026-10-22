import { readImageSize } from "@/core/image/image-size";

export type RasterFormat = "png" | "jpg";
export const MAX_RASTER_PIXELS = 24_000_000;
export const mimeFor = (format: RasterFormat) => format === "png" ? "image/png" : "image/jpeg";

export function assertRasterSize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 16_384 || height > 16_384 || width * height > MAX_RASTER_PIXELS) {
    throw new Error("This image is too large for safe browser conversion. Try a smaller file or resolution.");
  }
}

export async function encodeCanvas(canvas: HTMLCanvasElement, format: RasterFormat, quality = 0.92): Promise<Blob> {
  const type = mimeFor(format);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob || blob.type !== type) throw new Error(`${format.toUpperCase()} export is unavailable in this browser.`);
  const actual = await readImageSize(blob);
  if (!actual || actual.width !== canvas.width || actual.height !== canvas.height) throw new Error("The browser could not encode the requested dimensions.");
  return blob;
}

export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._ -]/gu, "-").slice(0, 80) || "converted";
}
