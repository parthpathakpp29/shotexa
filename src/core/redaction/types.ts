import type { FileId } from "@/core/runtime/types";

export type RedactionMode = "blur" | "pixelate" | "blackout";

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Logical, source-pixel operation. No raster data belongs in workspace history. */
export interface Redaction {
  id: string;
  assetId: FileId;
  mode: RedactionMode;
  rect: ImageRect;
  /** Blur radius or pixel block size in source-image pixels. */
  intensity: number;
}

export interface RedactionSession {
  byAsset: Record<FileId, Redaction[]>;
  selectedId: string | null;
  mode: RedactionMode;
  blurIntensity: number;
  pixelateIntensity: number;
}

export interface SafeShareVerification {
  redactionsFlattened: boolean;
  privacyMetadataRemoved: boolean;
  outputVerified: boolean;
  dimensionsMatch: boolean;
  formatMatch: boolean;
}

export interface SafeShareExportResult {
  blob: Blob;
  width: number;
  height: number;
  verification: SafeShareVerification;
  removedCategories: string[];
  ms: { render: number; clean: number; verifyDecode: number; total: number };
}

export type RedactionErrorCode =
  | "REDACTION_DECODE_FAILED"
  | "REDACTION_RENDER_FAILED"
  | "REDACTION_EXPORT_FAILED"
  | "REDACTION_MEMORY_PRESSURE"
  | "REDACTION_CANCELLED"
  | "REDACTION_INVALID_RECT"
  | "REDACTION_VERIFY_FAILED";

export class RedactionError extends Error {
  constructor(
    public readonly code: RedactionErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "RedactionError";
  }
}
