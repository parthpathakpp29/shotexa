/**
 * The comparison summary — the single factual record the on-screen panel, the PDF report and
 * the JSON export all read from. Only measured values go in it: percentages, counts, the
 * transform that was applied and the settings that produced them. There is no narrative and
 * no conclusion, because a pixel comparison does not support one.
 *
 * The JSON shape is versioned so QA and developer tooling can depend on it.
 */
import type { CompareAlignEstimate, CompareRegion, CompareSettings, CompareTextDiff, CompareVisualAnalysis } from "./types";
import { regionLabel } from "./analysis";

export const COMPARE_SUMMARY_SCHEMA = "shotexa.compare.summary";
export const COMPARE_SUMMARY_VERSION = 1;

export interface CompareFileFacts {
  name: string;
  width: number;
  height: number;
  bytes: number;
  type: string;
  /** null when it has not been checked. */
  transparent: boolean | null;
}

export interface CompareSummaryInput {
  a: CompareFileFacts;
  b: CompareFileFacts;
  settings: CompareSettings;
  alignment: CompareAlignEstimate | null;
  analysis: CompareVisualAnalysis | null;
  textDiff: CompareTextDiff | null;
  generatedAt?: number;
  title?: string;
}

export interface CompareSummary {
  schema: typeof COMPARE_SUMMARY_SCHEMA;
  version: number;
  title: string;
  generatedAt: string;
  tool: string;
  files: {
    a: CompareFileFacts & { aspectRatio: number };
    b: CompareFileFacts & { aspectRatio: number };
    mismatches: string[];
  };
  alignment: {
    mode: CompareSettings["alignment"]["mode"];
    status: CompareAlignEstimate["status"];
    x: number;
    y: number;
    scalePercent: number;
    score: number;
    confidence: CompareAlignEstimate["confidence"];
    method: string;
  };
  metric: {
    mode: CompareSettings["diff"]["metric"];
    description: string;
    colourTolerance: number;
    luminanceTolerance: number;
    deltaE: number;
  };
  analysis: { width: number; height: number; pixelsPerAnalysisPixel: number } | null;
  totals: {
    changedPercent: number;
    unchangedPercent: number;
    changedPixels: number;
    comparedPixels: number;
    totalPixels: number;
    ignoredPixels: number;
    changedRegions: number;
    regionsTruncated: boolean;
    ignoredRegions: number;
    textChanges: number;
    textAdded: number;
    textRemoved: number;
    textModified: number;
  };
  regions: {
    id: number;
    kind: CompareRegion["kind"];
    label: string;
    confidence: CompareRegion["confidence"];
    box: { x: number; y: number; width: number; height: number };
    changedPixels: number;
    percentOfCompared: number;
    sourceA: { x: number; y: number; w: number; h: number } | null;
    sourceB: { x: number; y: number; w: number; h: number } | null;
    movedBy?: { x: number; y: number; score: number };
  }[];
  textChanges: {
    id: string;
    kind: CompareTextDiff["changes"][number]["kind"];
    before?: string;
    after?: string;
    removedWords?: string[];
    addedWords?: string[];
    ocrConfidence: number;
  }[];
  ignoreRegions: { id: string; name: string; enabled: boolean; x: number; y: number; width: number; height: number }[];
  settings: {
    mode: CompareSettings["mode"];
    preset: CompareSettings["preset"];
    fit: CompareSettings["fit"];
    placement: CompareSettings["align"];
    colourTolerance: number;
    luminanceTolerance: number;
    deltaE: number;
    minRegionSize: number;
    mergeDistance: number;
    ignoreTiny: boolean;
    ignoreAntialiasing: boolean;
    ignoreNearIdenticalColour: boolean;
    ignoreTransparent: boolean;
    compareAlpha: boolean;
    ignoreColour: string | null;
    ignoreColourTolerance: number;
    detectMovement: boolean;
    heatmap: CompareSettings["heatmap"];
  };
}

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
};

const METRIC_DESCRIPTION = {
  pixel: "Largest absolute per-channel difference in 8-bit sRGB, with a separate luminance gate.",
  perceptual: "CIE76 delta-E*ab distance in CIELAB (sRGB, D65). A fixed colour-science formula; nothing is learned or inferred.",
} as const;

export function buildCompareSummary(input: CompareSummaryInput): CompareSummary {
  const { a, b, settings, analysis, textDiff } = input;
  const alignment = input.alignment;
  const mismatches: string[] = [];
  if (a.width !== b.width) mismatches.push(`Width differs: ${a.width} px and ${b.width} px`);
  if (a.height !== b.height) mismatches.push(`Height differs: ${a.height} px and ${b.height} px`);
  const ratioA = a.width / Math.max(1, a.height);
  const ratioB = b.width / Math.max(1, b.height);
  if (Math.abs(ratioA - ratioB) > 0.01) mismatches.push(`Aspect ratio differs: ${round(ratioA)} and ${round(ratioB)}`);
  if (a.type !== b.type) mismatches.push(`Format differs: ${a.type} and ${b.type}`);
  if (a.transparent !== null && b.transparent !== null && a.transparent !== b.transparent) {
    mismatches.push(`Transparency differs: ${a.transparent ? "A has alpha" : "A is opaque"}, ${b.transparent ? "B has alpha" : "B is opaque"}`);
  }

  return {
    schema: COMPARE_SUMMARY_SCHEMA,
    version: COMPARE_SUMMARY_VERSION,
    title: input.title ?? "Shotexa Visual Comparison Report",
    generatedAt: new Date(input.generatedAt ?? Date.now()).toISOString(),
    tool: "Shotexa Compare (local, in-browser)",
    files: {
      a: { ...a, aspectRatio: round(ratioA, 4) },
      b: { ...b, aspectRatio: round(ratioB, 4) },
      mismatches,
    },
    alignment: {
      mode: settings.alignment.mode,
      status: alignment?.status ?? (settings.alignment.mode === "off" ? "off" : "failed"),
      x: round(alignment?.dx ?? 0, 2),
      y: round(alignment?.dy ?? 0, 2),
      scalePercent: round((alignment?.scale ?? 1) * 100, 2),
      score: round(alignment?.score ?? 0, 3),
      confidence: alignment?.confidence ?? "low",
      method: alignment?.method ?? settings.alignment.mode,
    },
    metric: {
      mode: settings.diff.metric,
      description: METRIC_DESCRIPTION[settings.diff.metric],
      colourTolerance: settings.threshold,
      luminanceTolerance: settings.diff.luminanceTolerance,
      deltaE: settings.diff.deltaE,
    },
    analysis: analysis ? { width: analysis.width, height: analysis.height, pixelsPerAnalysisPixel: round(analysis.analysisScale, 4) } : null,
    totals: {
      changedPercent: round(analysis?.changedPercent ?? 0, 2),
      unchangedPercent: round(analysis?.unchangedPercent ?? 0, 2),
      changedPixels: analysis?.changedPixels ?? 0,
      comparedPixels: analysis?.comparedPixels ?? 0,
      totalPixels: analysis?.totalPixels ?? 0,
      ignoredPixels: analysis?.ignoredPixels ?? 0,
      changedRegions: analysis?.regions.length ?? 0,
      regionsTruncated: analysis?.regionsTruncated ?? false,
      ignoredRegions: settings.ignoreRegions.filter((region) => region.enabled).length,
      textChanges: textDiff?.changes.length ?? 0,
      textAdded: textDiff?.added ?? 0,
      textRemoved: textDiff?.removed ?? 0,
      textModified: textDiff?.changed ?? 0,
    },
    regions: (analysis?.regions ?? []).map((region) => ({
      id: region.id,
      kind: region.kind,
      label: regionLabel(region, analysis?.analysisScale ?? 1),
      confidence: region.confidence,
      box: { x: region.x, y: region.y, width: region.width, height: region.height },
      changedPixels: region.pixels,
      percentOfCompared: round(region.percent, 3),
      sourceA: region.sourceA,
      sourceB: region.sourceB,
      ...(region.movedBy
        ? { movedBy: { x: round(region.movedBy.dx * (analysis?.analysisScale ?? 1), 1), y: round(region.movedBy.dy * (analysis?.analysisScale ?? 1), 1), score: region.movedBy.score } }
        : {}),
    })),
    textChanges: (textDiff?.changes ?? []).map((change) => ({
      id: change.id,
      kind: change.kind,
      before: change.before,
      after: change.after,
      removedWords: change.removedWords,
      addedWords: change.addedWords,
      ocrConfidence: round(change.confidence, 3),
    })),
    ignoreRegions: settings.ignoreRegions.map((region) => ({
      id: region.id,
      name: region.name,
      enabled: region.enabled,
      x: round(region.x, 4),
      y: round(region.y, 4),
      width: round(region.width, 4),
      height: round(region.height, 4),
    })),
    settings: {
      mode: settings.mode,
      preset: settings.preset,
      fit: settings.fit,
      placement: settings.align,
      colourTolerance: settings.threshold,
      luminanceTolerance: settings.diff.luminanceTolerance,
      deltaE: settings.diff.deltaE,
      minRegionSize: settings.minRegionSize,
      mergeDistance: settings.mergeDistance,
      ignoreTiny: settings.ignoreTiny,
      ignoreAntialiasing: settings.diff.ignoreAntialiasing,
      ignoreNearIdenticalColour: settings.diff.ignoreNearIdenticalColour,
      ignoreTransparent: settings.diff.ignoreTransparent,
      compareAlpha: settings.diff.compareAlpha,
      ignoreColour: settings.diff.ignoreColour,
      ignoreColourTolerance: settings.diff.ignoreColourTolerance,
      detectMovement: settings.detectMovement,
      heatmap: settings.heatmap,
    },
  };
}

export function summaryToJson(summary: CompareSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

/** The short label/value list the summary panel and the PDF share, in one place. */
export function summaryRows(summary: CompareSummary): { label: string; value: string }[] {
  const rows = [
    { label: "Changed pixels", value: `${summary.totals.changedPercent.toFixed(1)}%` },
    { label: "Unchanged", value: `${summary.totals.unchangedPercent.toFixed(1)}%` },
    { label: "Changed regions", value: `${summary.totals.changedRegions}${summary.totals.regionsTruncated ? "+" : ""}` },
  ];
  if (summary.totals.textChanges > 0 || summary.totals.textAdded + summary.totals.textRemoved + summary.totals.textModified > 0) {
    rows.push(
      { label: "Text changes", value: String(summary.totals.textChanges) },
      { label: "Added text", value: String(summary.totals.textAdded) },
      { label: "Removed text", value: String(summary.totals.textRemoved) },
      { label: "Modified text", value: String(summary.totals.textModified) },
    );
  }
  if (summary.totals.ignoredRegions > 0) rows.push({ label: "Ignored regions", value: String(summary.totals.ignoredRegions) });
  return rows;
}
