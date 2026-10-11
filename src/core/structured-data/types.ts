import type { BBox, OcrResult } from "@/core/ocr/types";

export type StructuredMode = "auto" | "table" | "key-value" | "code" | "document" | "plain";
export type DetectedStructure = Exclude<StructuredMode, "auto">;
export type ExtractionConfidence = "high" | "medium" | "low";
export type ExtractionRegion = BBox;
export interface SourceMapped { source: ExtractionRegion[]; confidence: ExtractionConfidence; }
export interface StructuredCell extends SourceMapped { id: string; value: string; }
export interface StructuredTable { id: string; name: string; header: boolean; rows: StructuredCell[][]; }
export interface KeyValueEntry extends SourceMapped { id: string; key: string; value: string; }
export interface StructuredTextBlock extends SourceMapped { id: string; kind: "heading" | "paragraph" | "bullet" | "numbered" | "code"; text: string; }
export interface StructuredExtraction {
  id: string; assetId: string; requestedMode: StructuredMode; detected: DetectedStructure;
  confidence: ExtractionConfidence; region: ExtractionRegion | null; tables: StructuredTable[];
  entries: KeyValueEntry[]; blocks: StructuredTextBlock[]; plainText: string;
  likelyLanguage?: "JavaScript" | "JSON" | "SQL" | "YAML" | "Shell";
  uncertainCount: number; createdAt: number;
}
export interface StructuredAnalysisOptions { mode?: StructuredMode; region?: ExtractionRegion | null; }
export interface StructuredAnalysisInput { assetId: string; ocr: OcrResult; options?: StructuredAnalysisOptions; }
export type StructuredExportFormat = "csv" | "tsv" | "json" | "markdown" | "xlsx" | "txt";
