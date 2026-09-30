/**
 * Screenshot Editor transform model. Everything here is small, serialisable, logical state:
 * the original image is never modified, and no pixels live in the workspace store.
 *
 * Deterministic order, applied at preview and at export alike:
 *   crop (source pixels) → rotate (clockwise quarter turns) → flip (visible frame) → resize
 */
import type { OutputFormat } from "@/core/image/output-strategy";

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;
export type AspectPreset = "free" | "original" | "1:1" | "4:3" | "16:9";
export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** The orientation part of a transform: a rotation followed by flips in the rotated frame. */
export interface Orientation {
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
}

export interface ImageTransform extends Orientation {
  /**
   * Integer crop in SOURCE pixels, or null for the whole image. Kept in source space so a
   * rotation or flip never invalidates it — the visible crop is derived on demand.
   */
  crop: Rect | null;
  /**
   * Output scale relative to the oriented crop, or null for natural size. Stored as a scale
   * rather than pixels so that cropping afterwards can never silently upscale the result.
   */
  resize: { scaleX: number; scaleY: number } | null;
  /** Width and height change together when resizing. */
  lockAspect: boolean;
  /** Ratio the crop box keeps while it is dragged, in the visible (oriented) frame. */
  cropAspect: AspectPreset;
}

export interface TransformExportOptions {
  /** Dimensions the transform was authored against (from the file header). */
  source: Size;
  format: OutputFormat;
  quality?: number;
  signal?: { readonly aborted: boolean };
  createCanvas?: (width: number, height: number) => OffscreenCanvas | HTMLCanvasElement;
  /** Called between tiles on the main-thread fallback to keep the page responsive. */
  yieldBetweenTiles?: () => Promise<void>;
  onProgress?: (progress: number) => void;
}

export interface TransformExportResult {
  blob: Blob;
  width: number;
  height: number;
  strategy: "single-canvas" | "tiled-png";
  ms: number;
}

export type EditorErrorCode =
  | "EDITOR_INVALID_TRANSFORM"
  | "EDITOR_DECODE_FAILED"
  | "EDITOR_SOURCE_MISMATCH"
  | "EDITOR_MEMORY_PRESSURE"
  | "EDITOR_EXPORT_TOO_LARGE"
  | "EDITOR_EXPORT_VERIFY_FAILED"
  | "EDITOR_CANCELLED";

export class EditorError extends Error {
  constructor(
    readonly code: EditorErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "EditorError";
  }
}
