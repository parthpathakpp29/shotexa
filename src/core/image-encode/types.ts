/**
 * Compress / Convert — shared encoding types. Settings are a few values; encoded Blobs live
 * outside the store until the user saves them as workspace artifacts.
 */
import type { OutputFormat } from "./formats";

export type EncodeTool = "compress" | "convert";

export interface EncodeSettings {
  /**
   * Compress: `"same"` keeps the input's format (never changed without the user's choice).
   * Convert: `"auto"` = the natural target for the input (PNG → JPEG, JPEG/WebP → PNG).
   */
  format: OutputFormat | "same" | "auto";
  /** JPEG/WebP quality, 0.5–1. Ignored for PNG. */
  quality: number;
  /** Colour painted under transparent pixels when the output is JPEG. */
  background: string;
}

export interface EncodeOptions {
  source: { width: number; height: number };
  format: OutputFormat;
  quality: number;
  background: string;
  /** Also measure one alternative (for a factual "WebP would be X" hint). */
  probe?: { format: OutputFormat; quality: number };
  createCanvas?: (width: number, height: number) => OffscreenCanvas | HTMLCanvasElement;
  yieldBetweenTiles?: () => Promise<void>;
  signal?: { readonly aborted: boolean };
  onProgress?: (progress: number) => void;
}

export interface EncodeResult {
  blob: Blob;
  width: number;
  height: number;
  format: OutputFormat;
  strategy: "single-canvas" | "tiled-png";
  ms: number;
  /** Size the probe format would produce, when it was measured. */
  probe?: { format: OutputFormat; quality: number; bytes: number };
}

export type EncodeErrorCode =
  | "ENCODE_DECODE_FAILED"
  | "ENCODE_SOURCE_MISMATCH"
  | "ENCODE_FORMAT_TOO_LARGE"
  | "ENCODE_TOO_LARGE"
  | "ENCODE_MEMORY_PRESSURE"
  | "ENCODE_VERIFY_FAILED"
  | "ENCODE_CANCELLED";

export class EncodeError extends Error {
  constructor(
    readonly code: EncodeErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "EncodeError";
  }
}
