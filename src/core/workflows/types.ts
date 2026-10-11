import type { OutputFormat } from "@/core/image-encode/formats";
import type { OutputPreset } from "@/core/beautify/types";
import type { CompareAlignMode, CompareMode, ComparePresetId } from "@/core/compare/types";

export type WorkflowRecipeId = "safe-share" | "product-screenshot" | "bug-report" | "documentation-pack" | "web-ready" | "visual-qa-report" | `custom:${string}`;
export type WorkflowCategory = "protect" | "create" | "document" | "optimise" | "custom";
export type WorkflowIcon = "shield" | "sparkles" | "bug" | "book" | "globe" | "wand" | "compare";

export type WorkflowAction =
  | "input"
  | "privacy-scan"
  | "privacy-review"
  | "redact-review"
  | "annotation-review"
  | "remove-background"
  | "beautify"
  | "resize"
  | "ocr"
  | "compare"
  | "compare-text-diff"
  | "compare-report"
  | "structured-extract"
  | "export-csv"
  | "export-xlsx"
  | "export-json"
  | "export-markdown"
  | "privacy-clean"
  | "metadata-remove"
  | "compress"
  | "convert"
  | "watermark"
  | "pdf"
  | "package-bug-report"
  | "package-documentation"
  | "export";

export interface WorkflowStepConfigMap {
  input: { multiple?: boolean };
  "privacy-scan": { preset?: "developer" | "customer-support" | "finance" | "social-sharing" | "maximum"; includeLowConfidence?: boolean; detectBarcodes?: boolean };
  "privacy-review": Record<string, never>;
  "redact-review": { mode?: "blackout" | "blur" | "pixelate" };
  "annotation-review": { notes?: string };
  "remove-background": { trim?: boolean; padding?: number };
  beautify: { preset: string; canvas?: OutputPreset; format?: OutputFormat; quality?: number };
  resize: { width?: number; height?: number; lockAspect?: boolean };
  ocr: { language?: "eng" | "eng+hin"; allInputs?: boolean };
  /** Compare two inputs with the existing Compare Pro engine — never a second copy of it. */
  compare: { preset?: ComparePresetId; mode?: CompareMode; alignment?: CompareAlignMode };
  "compare-text-diff": Record<string, never>;
  "compare-report": { format?: "pdf" | "zip" | "json" };
  "structured-extract": { mode?: "auto" | "table" | "key-value" | "code" | "document" | "plain" };
  "export-csv": { filename?: string; delimiter?: "," | ";" | "\t" };
  "export-xlsx": { filename?: string; allTables?: boolean };
  "export-json": { filename?: string; inferTypes?: boolean };
  "export-markdown": { filename?: string };
  "privacy-clean": { requireRedactions?: boolean };
  "metadata-remove": Record<string, never>;
  compress: { format?: OutputFormat | "same"; quality?: number; targetBytes?: number | null };
  convert: { format: OutputFormat; quality?: number; background?: string };
  watermark: { assetId?: string; position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center"; opacity?: number; scale?: number };
  pdf: { paper?: "a4" | "letter" | "fit"; smart?: boolean; searchable?: boolean };
  "package-bug-report": { includeText?: boolean; notes?: string; title?: string };
  "package-documentation": { includeMarkdown?: boolean; includeImages?: boolean; captions?: Record<string, string> };
  export: { filename?: string };
}

type StepFor<A extends WorkflowAction> = {
  id: string;
  name: string;
  description: string;
  action: A;
  config: WorkflowStepConfigMap[A];
  optional?: boolean;
  review?: boolean;
  destructive?: boolean;
  enabled?: boolean;
};

export type WorkflowStepDefinition = { [A in WorkflowAction]: StepFor<A> }[WorkflowAction];

export interface WorkflowRecipe {
  id: WorkflowRecipeId;
  name: string;
  description: string;
  icon: WorkflowIcon;
  category: WorkflowCategory;
  input: { min: number; max?: number; accepts: readonly ["image/png", "image/jpeg", "image/webp"]; label: string };
  steps: WorkflowStepDefinition[];
  output: { kind: "image" | "images" | "pdf" | "zip"; filename: string };
  estimatedOperations?: number;
  builtIn?: boolean;
}

export type WorkflowRunStatus = "idle" | "running" | "waiting-review" | "failed" | "cancelled" | "completed";
export type WorkflowStepStatus = "pending" | "running" | "review" | "completed" | "skipped" | "failed" | "cancelled";

export interface WorkflowStepState {
  id: string;
  status: WorkflowStepStatus;
  progress: number | null;
  error?: string;
}

export interface WorkflowExecutionState {
  recipeId: WorkflowRecipeId;
  status: WorkflowRunStatus;
  currentIndex: number;
  progress: number;
  steps: WorkflowStepState[];
  error?: string;
}

export interface WorkflowStepResult {
  assetIds?: string[];
  outputIds?: string[];
  data?: Record<string, string>;
  checks?: string[];
}

export interface WorkflowExecutionContext {
  runId: string;
  originalAssetIds: string[];
  assetIds: string[];
  outputIds: string[];
  data: Record<string, string>;
  checks: string[];
  signal: AbortSignal;
  reportProgress(progress: number): void;
}

export interface WorkflowStepAdapter {
  execute(step: WorkflowStepDefinition, context: WorkflowExecutionContext): Promise<WorkflowStepResult>;
  cancel?(): void | Promise<void>;
}

export type WorkflowAdapterMap = Partial<Record<WorkflowAction, WorkflowStepAdapter>>;

export interface StoredCustomRecipe {
  version: 1;
  recipe: WorkflowRecipe;
}

export interface WorkflowOutput {
  id: string;
  name: string;
  type: string;
  bytes: number;
  createdAt: number;
}

export interface WorkflowSessionSummary {
  id: string;
  recipeId: WorkflowRecipeId;
  recipeName: string;
  status: "completed" | "cancelled" | "failed";
  startedAt: number;
  updatedAt: number;
  assetIds: string[];
  outputIds: string[];
  checks: string[];
}
