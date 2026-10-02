/**
 * Smart Pagination row signals can be several hundred kilobytes per long screenshot.
 * Keep them beside Blobs/ImageBitmaps in the runtime layer, never in Zustand.
 */
import type { AnalysedSet } from "@/core/pdf/pdf-engine";

export type PdfImageAnalysis = AnalysedSet["images"][number];

export class PdfAnalysisRegistry {
  private readonly analyses = new Map<string, PdfImageAnalysis>();

  put(assetId: string, analysis: PdfImageAnalysis): void {
    this.analyses.set(assetId, analysis);
  }

  get(assetId: string): PdfImageAnalysis | undefined {
    return this.analyses.get(assetId);
  }

  hasSignals(assetId: string): boolean {
    return !!this.analyses.get(assetId)?.signals;
  }

  remove(assetId: string): void {
    this.analyses.delete(assetId);
  }

  clear(): void {
    this.analyses.clear();
  }

  stats(): { analyses: number } {
    return { analyses: this.analyses.size };
  }
}
