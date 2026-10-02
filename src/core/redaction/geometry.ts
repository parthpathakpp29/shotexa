import type { ImageRect } from "./types";

export interface ViewportTransform {
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
}

export function clampRect(rect: ImageRect, width: number, height: number, minSize = 1): ImageRect {
  const x = Math.max(0, Math.min(width - minSize, rect.x));
  const y = Math.max(0, Math.min(height - minSize, rect.y));
  return {
    x,
    y,
    width: Math.max(minSize, Math.min(width - x, rect.width)),
    height: Math.max(minSize, Math.min(height - y, rect.height)),
  };
}

export function displayToImage(point: { x: number; y: number }, t: ViewportTransform) {
  return {
    x: (point.x / t.displayWidth) * t.imageWidth,
    y: (point.y / t.displayHeight) * t.imageHeight,
  };
}

export function imageToDisplay(rect: ImageRect, t: ViewportTransform): ImageRect {
  return {
    x: (rect.x / t.imageWidth) * t.displayWidth,
    y: (rect.y / t.imageHeight) * t.displayHeight,
    width: (rect.width / t.imageWidth) * t.displayWidth,
    height: (rect.height / t.imageHeight) * t.displayHeight,
  };
}

export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): ImageRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}
