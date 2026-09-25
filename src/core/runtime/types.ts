/**
 * Workspace logical model (architecture §21). Only small, serialisable values live here:
 * no Blobs, ImageBitmaps, ImageData or raster snapshots (those are in the AssetRegistry).
 */
import type { ToolId } from "@/config/tools";

export type FileId = string;
export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export type FileSource = "picker" | "drop" | "paste" | "sample" | "artifact";

export interface WorkspaceFile {
  id: FileId;
  name: string;
  type: ImageMime;
  bytes: number;
  width: number;
  height: number;
  source: FileSource;
  /** "artifact" = produced by a Shotexa tool (e.g. a stitched image). */
  kind: "original" | "artifact";
  derivedFrom?: FileId[];
  producedBy?: ToolId;
  addedAt: number;
  /** Bumped when the preview bitmap in the AssetRegistry is ready/replaced. */
  previewVersion: number;
}

export type JobStatus = "running" | "done" | "failed" | "cancelled";
export interface Job {
  id: string;
  kind: "preview" | "overlap-check" | "stitch-analyse" | "stitch-export";
  status: JobStatus;
  progress: number | null;
  /** Controlled error code only (never raw messages). */
  error?: string;
}

export type ConfidenceClass = "high" | "medium" | "low";

/** Result + user state of one adjacent pair (screenshot a above screenshot b). */
export interface StitchPair {
  key: string;
  a: FileId;
  b: FileId;
  status: "pending" | "analysing" | "ready" | "failed";
  /** Automatic offset of b's row 0 in a's coordinates (full-res px). */
  autoOffset: number;
  /** Current offset (auto or manually adjusted). */
  offset: number;
  confidence: ConfidenceClass;
  /** False when no reliable overlap was found (placed end to end). */
  matched: boolean;
  bands: { top: number; bottom: number };
  error?: string;
}

export type StitchViewMode = "normal" | "overlay" | "difference";

export interface StitchSession {
  pairs: Record<string, StitchPair>;
  viewMode: StitchViewMode;
  /** Index of the join being edited (0 = between screenshot 1 and 2). */
  activeJoin: number;
  manualMode: boolean;
}

export type ExportFormat = "png" | "jpeg" | "webp";
export interface ExportSettings {
  format: ExportFormat;
  quality: number;
}

export interface OverlapHint {
  status: "idle" | "checking" | "likely" | "unlikely";
  /** Pair keys found likely to overlap. */
  pairs: string[];
  dismissed: boolean;
}

/** Undoable operations (command history, architecture §23). */
export type Operation =
  | { type: "REORDER"; from: number; to: number }
  | { type: "STITCH_SET_OFFSET"; pair: string; from: number; to: number; at: number };
