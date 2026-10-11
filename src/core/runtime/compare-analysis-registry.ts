/**
 * Measured comparison results live here, beside the image Blobs and outside Zustand: a region
 * list can hold hundreds of boxes and a text diff hundreds of OCR lines, none of which belongs
 * in undoable logical state.
 *
 * Results are keyed by the pair of assets, and each cached measurement also records the inputs
 * it depended on — so an alignment is reused while the fitting is unchanged, and quietly
 * dropped the moment it stops being true.
 */
import type { CompareAlignEstimate, CompareSettings, CompareTextDiff, CompareVisualAnalysis } from "@/core/compare/types";

export type CompareReportKind = "pdf" | "zip" | "json";

export interface CompareReportRecord {
  kind: CompareReportKind;
  name: string;
  blob: Blob;
  createdAt: number;
}

interface Entry {
  alignKey: string | null;
  alignment: CompareAlignEstimate | null;
  textDiff: CompareTextDiff | null;
  visual: CompareVisualAnalysis | null;
  report: CompareReportRecord | null;
}

const blank = (): Entry => ({ alignKey: null, alignment: null, textDiff: null, visual: null, report: null });

/** Which two screenshots a measurement belongs to. */
export const comparePairKey = (a: string | null, b: string | null) => `${a ?? ""}|${b ?? ""}`;

/**
 * Everything an alignment measurement depends on. Sensitivity, ignore regions and the view
 * mode are deliberately absent: none of them changes where the screenshots sit.
 */
export const compareAlignKey = (settings: CompareSettings, a: { width: number; height: number }, b: { width: number; height: number }) =>
  [
    settings.a ?? "",
    settings.b ?? "",
    settings.fit,
    settings.align,
    settings.alignment.mode,
    `${a.width}x${a.height}`,
    `${b.width}x${b.height}`,
  ].join("|");

export class CompareAnalysisRegistry {
  private readonly entries = new Map<string, Entry>();

  private entry(pair: string): Entry {
    const current = this.entries.get(pair);
    if (current) return current;
    const next = blank();
    this.entries.set(pair, next);
    return next;
  }

  setAlignment(pair: string, alignKey: string, alignment: CompareAlignEstimate | null): void {
    const entry = this.entry(pair);
    entry.alignKey = alignKey;
    entry.alignment = alignment;
  }

  /** The cached estimate, but only while it still matches the inputs it was measured from. */
  alignment(pair: string, alignKey: string): CompareAlignEstimate | null {
    const entry = this.entries.get(pair);
    return entry && entry.alignKey === alignKey ? entry.alignment : null;
  }

  clearAlignment(pair: string): void {
    const entry = this.entries.get(pair);
    if (!entry) return;
    entry.alignKey = null;
    entry.alignment = null;
  }

  setTextDiff(pair: string, textDiff: CompareTextDiff | null): void {
    this.entry(pair).textDiff = textDiff;
  }

  textDiff(pair: string): CompareTextDiff | null {
    return this.entries.get(pair)?.textDiff ?? null;
  }

  /** The most recent visual measurement the preview produced, for the summary and the report. */
  setVisual(pair: string, visual: CompareVisualAnalysis | null): void {
    this.entry(pair).visual = visual;
  }

  visual(pair: string): CompareVisualAnalysis | null {
    return this.entries.get(pair)?.visual ?? null;
  }

  setReport(pair: string, report: CompareReportRecord | null): void {
    this.entry(pair).report = report;
  }

  report(pair: string): CompareReportRecord | null {
    return this.entries.get(pair)?.report ?? null;
  }

  /** Drop everything that mentions an asset — called when a file leaves the workspace. */
  removeAsset(assetId: string): void {
    for (const key of [...this.entries.keys()]) {
      const [a, b] = key.split("|");
      if (a === assetId || b === assetId) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): { pairs: number; alignments: number; textDiffs: number; reports: number } {
    const all = [...this.entries.values()];
    return {
      pairs: all.length,
      alignments: all.filter((entry) => !!entry.alignment).length,
      textDiffs: all.filter((entry) => !!entry.textDiff).length,
      reports: all.filter((entry) => !!entry.report).length,
    };
  }
}
