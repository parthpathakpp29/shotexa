/**
 * V2.0F Compare Pro — the summary, the machine-readable JSON and the PDF report.
 *
 * The summary is the single record the panel, the PDF and the JSON all read, so the tests
 * pin its schema, its determinism and the fact that it never states more than was measured.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";
import { applyComparePreset, COMPARE_PRESETS, COMPARE_REPORT_NAMES, DEFAULT_COMPARE } from "@/core/compare/presets";
import { createCompareReportPdf, createCompareReportZip } from "@/core/compare/report";
import { buildCompareSummary, COMPARE_SUMMARY_SCHEMA, COMPARE_SUMMARY_VERSION, summaryRows, summaryToJson, type CompareSummaryInput } from "@/core/compare/summary";
import type { CompareSettings, CompareTextDiff, CompareVisualAnalysis } from "@/core/compare/types";

const settings = (over: Partial<CompareSettings> = {}): CompareSettings => ({ ...DEFAULT_COMPARE, a: "a", b: "b", mode: "difference", ...over });

const analysis = (over: Partial<CompareVisualAnalysis> = {}): CompareVisualAnalysis => ({
  changedPixels: 7800,
  comparedPixels: 100_000,
  totalPixels: 120_000,
  ignoredPixels: 20_000,
  changedPercent: 7.8,
  unchangedPercent: 92.2,
  width: 400,
  height: 300,
  metric: "perceptual",
  analysisScale: 2,
  regionsTruncated: false,
  regions: [
    { id: 1, x: 10, y: 20, width: 80, height: 50, pixels: 4000, percent: 4, kind: "added", confidence: "high", sourceA: null, sourceB: { x: 20, y: 40, w: 160, h: 100 } },
    { id: 2, x: 200, y: 100, width: 40, height: 40, pixels: 1200, percent: 1.2, kind: "moved", confidence: "medium", sourceA: null, sourceB: null, movedBy: { dx: 0, dy: 9, score: 0.96 }, pairedWith: 3 },
  ],
  ...over,
});

const textDiff = (): CompareTextDiff => ({
  changes: [
    { id: "t1", kind: "changed", before: "Start for free", after: "Start free trial", removedWords: ["for"], addedWords: ["trial"], regionsA: [{ x: 10, y: 10, w: 50, h: 12 }], regionsB: [{ x: 10, y: 10, w: 60, h: 12 }], confidence: 0.91 },
    { id: "t2", kind: "added", after: "New badge", addedWords: ["New", "badge"], regionsA: [], regionsB: [{ x: 40, y: 80, w: 70, h: 12 }], confidence: 0.74 },
    { id: "t3", kind: "removed", before: "Beta", removedWords: ["Beta"], regionsA: [{ x: 90, y: 120, w: 30, h: 12 }], regionsB: [], confidence: 0.88 },
  ],
  added: 1,
  removed: 1,
  changed: 1,
  unchangedLines: 12,
  languageA: "eng",
  languageB: "eng",
  confidenceA: 0.9,
  confidenceB: 0.91,
  durationMs: 1234,
});

const input = (over: Partial<CompareSummaryInput> = {}): CompareSummaryInput => ({
  a: { name: "before.png", width: 400, height: 300, bytes: 12_345, type: "image/png", transparent: false },
  b: { name: "after.webp", width: 420, height: 300, bytes: 9_876, type: "image/webp", transparent: true },
  settings: settings(),
  alignment: { status: "aligned", dx: 3.2, dy: -1.4, scale: 0.994, score: 0.97, confidence: "high", method: "translate-scale", analysisScale: 2 },
  analysis: analysis(),
  textDiff: textDiff(),
  generatedAt: Date.UTC(2026, 9, 9, 12, 0, 0),
  ...over,
});

function tinyPng(width = 8, height = 6): Blob {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) png.data.set([x * 20, y * 30, 120, 255], (y * width + x) * 4);
  return new Blob([PNG.sync.write(png) as unknown as Uint8Array<ArrayBuffer>], { type: "image/png" });
}

describe("the comparison summary", () => {
  it("is schema-tagged and versioned, so tooling can depend on it", () => {
    const summary = buildCompareSummary(input());
    expect(summary.schema).toBe(COMPARE_SUMMARY_SCHEMA);
    expect(summary.schema).toBe("shotexa.compare.summary");
    expect(summary.version).toBe(COMPARE_SUMMARY_VERSION);
    expect(summary.generatedAt).toBe("2026-10-09T12:00:00.000Z");
    expect(summary.title).toBe("Shotexa Visual Comparison Report");
  });

  it("is deterministic for the same input", () => {
    expect(summaryToJson(buildCompareSummary(input()))).toBe(summaryToJson(buildCompareSummary(input())));
  });

  it("records exactly what was measured", () => {
    const summary = buildCompareSummary(input());
    expect(summary.totals).toMatchObject({
      changedPercent: 7.8,
      unchangedPercent: 92.2,
      changedPixels: 7800,
      comparedPixels: 100_000,
      ignoredPixels: 20_000,
      changedRegions: 2,
      textChanges: 3,
      textAdded: 1,
      textRemoved: 1,
      textModified: 1,
    });
    expect(summary.alignment).toMatchObject({ status: "aligned", x: 3.2, y: -1.4, scalePercent: 99.4, score: 0.97, method: "translate-scale" });
    expect(summary.analysis).toEqual({ width: 400, height: 300, pixelsPerAnalysisPixel: 2 });
  });

  it("names every mismatch between the two files, and says nothing when there is none", () => {
    const summary = buildCompareSummary(input());
    expect(summary.files.mismatches.join(" ")).toContain("Width differs: 400 px and 420 px");
    expect(summary.files.mismatches.join(" ")).toContain("Format differs");
    expect(summary.files.mismatches.join(" ")).toContain("Transparency differs");
    const same = buildCompareSummary(
      input({
        b: { name: "after.png", width: 400, height: 300, bytes: 9_876, type: "image/png", transparent: false },
      }),
    );
    expect(same.files.mismatches).toEqual([]);
  });

  it("describes the metric it used without calling it anything it is not", () => {
    const perceptual = buildCompareSummary(input({ settings: settings({ diff: { ...DEFAULT_COMPARE.diff, metric: "perceptual" } }) }));
    expect(perceptual.metric.mode).toBe("perceptual");
    expect(perceptual.metric.description).toContain("CIE76");
    expect(perceptual.metric.description).not.toMatch(/AI/i);
    const pixel = buildCompareSummary(input({ settings: settings({ diff: { ...DEFAULT_COMPARE.diff, metric: "pixel" } }) }));
    expect(pixel.metric.description).toContain("per-channel");
    expect(pixel.metric.description).not.toMatch(/AI/i);
  });

  it("converts a measured movement into comparison pixels", () => {
    const summary = buildCompareSummary(input());
    expect(summary.regions[1].movedBy).toEqual({ x: 0, y: 18, score: 0.96 });
    expect(summary.regions[1].label).toBe("Moved about 18 px down");
  });

  it("states nothing at all when nothing has been measured yet", () => {
    const summary = buildCompareSummary(input({ analysis: null, textDiff: null, alignment: null, settings: settings({ alignment: { mode: "off", dx: 0, dy: 0, scale: 1 } }) }));
    expect(summary.analysis).toBeNull();
    expect(summary.totals.changedPercent).toBe(0);
    expect(summary.totals.changedRegions).toBe(0);
    expect(summary.regions).toEqual([]);
    expect(summary.textChanges).toEqual([]);
    expect(summary.alignment.status).toBe("off");
  });

  it("records every setting that produced the result", () => {
    const summary = buildCompareSummary(input({ settings: applyComparePreset(settings(), "design-review") }));
    expect(summary.settings.preset).toBe("design-review");
    expect(summary.settings).toMatchObject({ ignoreAntialiasing: true, ignoreNearIdenticalColour: true, detectMovement: true });
    expect(summary.settings.minRegionSize).toBe(60);
  });

  it("offers the same rows the panel shows", () => {
    const rows = summaryRows(buildCompareSummary(input()));
    expect(rows.map((row) => row.label)).toEqual(["Changed pixels", "Unchanged", "Changed regions", "Text changes", "Added text", "Removed text", "Modified text"]);
    expect(rows[0].value).toBe("7.8%");
    // No text diff and no ignore regions: those rows are simply absent.
    const minimal = summaryRows(buildCompareSummary(input({ textDiff: null })));
    expect(minimal.map((row) => row.label)).toEqual(["Changed pixels", "Unchanged", "Changed regions"]);
  });

  it("counts only the ignore regions that are actually applied", () => {
    const withIgnores = settings({
      ignoreRegions: [
        { id: "a", name: "Timestamp", x: 0, y: 0, width: 0.2, height: 0.1, enabled: true },
        { id: "b", name: "Avatar", x: 0.5, y: 0.5, width: 0.1, height: 0.1, enabled: false },
      ],
    });
    const summary = buildCompareSummary(input({ settings: withIgnores }));
    expect(summary.totals.ignoredRegions).toBe(1);
    expect(summary.ignoreRegions).toHaveLength(2);
    expect(summary.ignoreRegions[1].enabled).toBe(false);
    expect(summaryRows(summary).some((row) => row.label === "Ignored regions")).toBe(true);
  });
});

describe("presets", () => {
  it("only move the real controls, and keep the chosen screenshots", () => {
    for (const preset of COMPARE_PRESETS) {
      const applied = applyComparePreset(settings({ a: "keep-a", b: "keep-b" }), preset.id);
      expect(applied.a).toBe("keep-a");
      expect(applied.b).toBe("keep-b");
      expect(applied.preset).toBe(preset.id);
    }
    const qa = applyComparePreset(settings(), "visual-qa");
    expect(qa.alignment.mode).toBe("auto");
    expect(qa.diff.metric).toBe("perceptual");
    expect(qa.ignoreTiny).toBe(true);
    expect(qa.heatmap.legend).toBe(true);
    const pixel = applyComparePreset(settings(), "pixel-perfect");
    expect(pixel.threshold).toBe(0);
    expect(pixel.alignment.mode).toBe("off");
    expect(pixel.diff.ignoreAntialiasing).toBe(false);
  });
});

describe("the PDF report", () => {
  it("is a real PDF, titled, with a page for every section it was given", async () => {
    const summary = buildCompareSummary(input());
    const blob = await createCompareReportPdf({
      summary,
      images: { before: tinyPng(), after: tinyPng(), difference: tinyPng(12, 9), heatmap: tinyPng(12, 9) },
    });
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getTitle()).toBe("Shotexa Visual Comparison Report");
    // Summary, before/after, difference views, regions, text changes.
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(5);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
  });

  it("works with no images and nothing measured", async () => {
    const blob = await createCompareReportPdf({ summary: buildCompareSummary(input({ analysis: null, textDiff: null })) });
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("refuses to pretend it was cancelled successfully", async () => {
    await expect(createCompareReportPdf({ summary: buildCompareSummary(input()), signal: { aborted: true } })).rejects.toMatchObject({ code: "COMPARE_CANCELLED" });
  });
});

describe("the report package", () => {
  it("contains only the files that were actually generated", async () => {
    const summary = buildCompareSummary(input());
    const full = await createCompareReportZip({ summary, images: { before: tinyPng(), after: tinyPng(), difference: tinyPng(), heatmap: tinyPng() } });
    expect(full.names).toEqual(["before.png", "after.png", "difference.png", "heatmap.png", "report.pdf", "summary.json"]);
    expect(full.blob.size).toBeGreaterThan(1000);

    const partial = await createCompareReportZip({ summary, images: { before: tinyPng() } });
    expect(partial.names).toEqual(["before.png", "report.pdf", "summary.json"]);

    const bare = await createCompareReportZip({ summary });
    expect(bare.names).toEqual(["report.pdf", "summary.json"]);
  });

  it("uses stable, descriptive names", () => {
    expect(COMPARE_REPORT_NAMES).toEqual({ pdf: "comparison-report.pdf", zip: "comparison-report.zip", json: "comparison-summary.json" });
  });
});
