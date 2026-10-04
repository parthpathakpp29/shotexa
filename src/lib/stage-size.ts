/**
 * Sizing for image stages (Screenshot Editor, Annotation): how wide to show an image, and how
 * big a canvas backing store to allocate for it.
 */
import type { Size } from "@/core/image-transform/types";

export type Zoom = "fit" | number;

const FIT_HEIGHT = 640;
/** Tall images still get a usable working width in Fit; the frame scrolls instead. */
const MIN_FIT_WIDTH = 320;
const MAX_BACKING_AREA = 16_000_000;

/** Fit a `size` into the frame: full width, no taller than FIT_HEIGHT, never uselessly thin. */
export function displayWidth(size: Size, frameWidth: number, zoom: Zoom): number {
  if (zoom !== "fit") return Math.max(1, Math.round(size.width * zoom));
  const byHeight = (FIT_HEIGHT * size.width) / size.height;
  return Math.max(1, Math.floor(Math.min(frameWidth, size.width, Math.max(byHeight, Math.min(MIN_FIT_WIDTH, frameWidth)))));
}

/** Backing-store size: sharp on high-DPR screens, never beyond the preview's own detail. */
export function backingSize(css: Size, detailWidth: number): Size {
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  let width = Math.max(1, Math.min(Math.round(css.width * dpr), Math.round(detailWidth)));
  let height = Math.max(1, Math.round((width * css.height) / css.width));
  const fit = Math.min(1, Math.sqrt(MAX_BACKING_AREA / (width * height)));
  width = Math.max(1, Math.floor(width * fit));
  height = Math.max(1, Math.floor(height * fit));
  return { width, height };
}

export const zoomIn = (z: Zoom): Zoom => (z === "fit" ? 0.5 : z === 0.5 ? 1 : z === 1 ? 2 : Math.min(8, z * 1.5));
export const zoomOut = (z: Zoom): Zoom => (z === "fit" ? "fit" : z <= 0.5 ? "fit" : z <= 1 ? 0.5 : z <= 2 ? 1 : Math.max(0.1, z / 1.5));
