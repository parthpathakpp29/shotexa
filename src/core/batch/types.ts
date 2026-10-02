import type { OutputFormat } from "@/core/image-encode/formats";

export type BatchOperation = "compress" | "convert" | "privacy" | "resize";
export type BatchStatus = "idle" | "running" | "completed" | "cancelled";
export type BatchItemStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type ResizeMode = "width" | "height" | "percentage" | "fit";

export interface BatchSettings {
  compress: { format: OutputFormat | "same"; quality: number };
  convert: { format: OutputFormat; quality: number; background: string };
  resize: {
    mode: ResizeMode;
    width: number;
    height: number;
    percentage: number;
    fitWidth: number;
    fitHeight: number;
    allowEnlarge: boolean;
    format: OutputFormat | "same";
    quality: number;
    background: string;
  };
}

export interface BatchItemState {
  assetId: string;
  status: BatchItemStatus;
  error?: string;
  resultId?: string;
}

/** Lightweight, serialisable UI state only. Output Blobs live in BatchResultRegistry. */
export interface BatchSession {
  selectedIds: string[];
  operation: BatchOperation;
  settings: BatchSettings;
  status: BatchStatus;
  currentIndex: number | null;
  items: Record<string, BatchItemState>;
  addedToWorkspace: boolean;
}

export interface BatchSource {
  id: string;
  name: string;
  type: "image/png" | "image/jpeg" | "image/webp";
  bytes: number;
  width: number;
  height: number;
}

export interface BatchResult {
  id: string;
  sourceId: string;
  sourceName: string;
  outputName: string;
  blob: Blob;
  bytes: number;
  originalBytes: number;
  type: "image/png" | "image/jpeg" | "image/webp";
  format: OutputFormat;
  width: number;
  height: number;
  operation: BatchOperation;
  changed?: boolean;
}

export const MAX_BATCH_FILES = 50;
/** Archive creation is refused before a second multi-hundred-MiB Blob is buffered. */
/** `.blob()` briefly coexists with encoded outputs, so keep the archive input conservative. */
export const MAX_BATCH_OUTPUT_BYTES = 96 * 1024 * 1024;
export const MAX_BATCH_INPUT_BYTES = 512 * 1024 * 1024;
