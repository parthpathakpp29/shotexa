/**
 * Workspace logical model (architecture §21). Only small, serialisable values live here:
 * no Blobs, ImageBitmaps, ImageData or raster snapshots (those are in the AssetRegistry).
 */
import type { ToolId } from "@/config/tools";
import type { Redaction } from "@/core/redaction/types";
import type { OcrLanguage } from "@/core/ocr/types";
import type { PageBreak, PaginationPlan, PaperSize } from "@/core/pdf/types";
import type { CombineSettings } from "@/core/combine/types";
import type { ImageTransform } from "@/core/image-transform/types";

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
  kind: "preview" | "overlap-check" | "stitch-analyse" | "stitch-export" | "combine-export" | "editor-export" | "redaction-export" | "metadata-inspect" | "metadata-clean" | "ocr" | "pdf-analyse" | "pdf-export";
  status: JobStatus;
  progress: number | null;
  /** Controlled error code only (never raw messages). */
  error?: string;
}

export type OcrLanguageChoice = "eng" | "eng+hin";

/** Small, serialisable OCR UI state. Structured blocks/boxes live in OcrResultRegistry. */
export interface OcrAssetState {
  status: "idle" | "running" | "done" | "failed" | "cancelled";
  language: OcrLanguageChoice;
  resultId: string | null;
  editedText: string;
  progress: number | null;
  stage?: string;
  error?: string;
  confidence?: number;
  durationMs?: number;
}

export interface OcrSession {
  language: OcrLanguageChoice;
  byAsset: Record<FileId, OcrAssetState>;
}

/** A non-image output kept in the workspace without putting its Blob in Zustand. */
export interface WorkspaceDocument {
  id: string;
  name: string;
  type: "application/pdf";
  bytes: number;
  pageCount: number;
  sourceIds: FileId[];
  producedBy: "pdf" | "searchable-pdf";
  addedAt: number;
}

/** Lightweight manual pagination state. Row signals stay in PdfAnalysisRegistry. */
export interface PdfBreakEdit {
  manual: number[];
  /** Deleting a break freezes the remaining layout so it is not immediately recreated. */
  frozen?: number[];
}

export interface PdfSession {
  paper: PaperSize;
  marginPt: number;
  smart: boolean;
  imageFormat: "jpeg" | "png";
  jpegQuality: number;
  inputIds: FileId[];
  status: "idle" | "analysing" | "ready" | "exporting" | "failed" | "cancelled";
  progress: number | null;
  stage?: string;
  error?: string;
  plan: PaginationPlan | null;
  selectedBreak: { assetId: FileId; y: number } | null;
  edits: Record<FileId, PdfBreakEdit>;
  lastDocumentId: string | null;
}

export const ocrLanguages = (choice: OcrLanguageChoice): OcrLanguage[] => choice.split("+") as OcrLanguage[];

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

/** Lightweight Combine controls; the calculated placement plan and pixels stay outside Zustand. */
export type CombineSession = CombineSettings;

/**
 * Screenshot Editor state: one logical transform per asset (crop, rotation, flips, resize).
 * No pixels and no raster snapshots — the source asset is never modified before export.
 */
export interface EditorSession {
  byAsset: Record<FileId, ImageTransform>;
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
  | { type: "STITCH_SET_OFFSET"; pair: string; from: number; to: number; at: number }
  | { type: "ADD_REDACTION"; redaction: Redaction }
  | { type: "DELETE_REDACTION"; redaction: Redaction }
  | { type: "UPDATE_REDACTION"; before: Redaction; after: Redaction; at: number }
  | { type: "CLEAR_REDACTIONS"; assetId: FileId; redactions: Redaction[] }
  | { type: "COMBINE_SET_SETTINGS"; before: CombineSettings; after: CombineSettings }
  | { type: "PDF_SET_BREAKS"; assetId: FileId; before: PdfBreakEdit; after: PdfBreakEdit; at: number }
  /** Any editor change — crop, resize, rotate, flip or reset — as a small before/after snapshot. */
  | { type: "EDIT_SET_TRANSFORM"; assetId: FileId; before: ImageTransform; after: ImageTransform; at: number };

/** Breaks are serialisable and small enough for the command model. */
export type { PageBreak };
