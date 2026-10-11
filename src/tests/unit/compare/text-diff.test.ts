/**
 * V2.0F Compare Pro — OCR text diff. The real diff logic is exercised here; only the OCR
 * RESULT is synthetic, because recognising text is the OCR module's job and is covered by its
 * own suites. These fixtures are shaped exactly like what `OcrService` returns, including
 * word boxes in original screenshot pixels.
 */
import { describe, expect, it } from "vitest";
import { applyTextChanges, sourceBoxToAnalysis } from "@/core/compare/analysis";
import { place } from "@/core/compare/layout";
import { diffOcrText, diffTextLines, diffWords, normaliseText, ocrLines, resetTextChangeIds, similarity, textChangeBox, textChangeLines, tokenise } from "@/core/compare/text-diff";
import type { CompareVisualAnalysis } from "@/core/compare/types";
import type { OcrLine, OcrResult } from "@/core/ocr/types";

/** One OCR line with evenly spaced word boxes, as the engine would report them. */
function line(text: string, y: number, options: { x?: number; height?: number; wordWidth?: number; confidence?: number } = {}): OcrLine {
  const x = options.x ?? 40;
  const height = options.height ?? 20;
  const wordWidth = options.wordWidth ?? 60;
  const confidence = options.confidence ?? 0.93;
  const words = tokenise(text).map((word, index) => ({
    text: word,
    confidence,
    bbox: { x: x + index * (wordWidth + 8), y, w: wordWidth, h: height },
  }));
  const width = words.length ? words[words.length - 1].bbox.x + wordWidth - x : wordWidth;
  return { text, confidence, bbox: { x, y, w: width, h: height }, words };
}

function ocr(lines: OcrLine[], over: Partial<OcrResult> = {}): OcrResult {
  const text = lines.map((item) => item.text).join("\n");
  return {
    rawText: text,
    editedText: text,
    language: "eng",
    confidence: 0.93,
    blocks: [{ bbox: { x: 0, y: 0, w: 800, h: 600 }, confidence: 0.93, paragraphs: [{ bbox: { x: 0, y: 0, w: 800, h: 600 }, confidence: 0.93, lines }] }],
    durationMs: 10,
    image: { width: 800, height: 600 },
    readingOrder: "auto",
    preprocessing: [],
    engine: { name: "test", version: "0" },
    ...over,
  };
}

describe("tokenising what OCR read", () => {
  it("splits on whitespace only — punctuation stays attached to its word", () => {
    expect(tokenise("Start for free!")).toEqual(["Start", "for", "free!"]);
    expect(tokenise("  spaced   out \n lines ")).toEqual(["spaced", "out", "lines"]);
    expect(tokenise("")).toEqual([]);
    expect(tokenise("$1,299.00")).toEqual(["$1,299.00"]);
  });

  it("normalises whitespace but never case or punctuation", () => {
    expect(normaliseText(" Start   for \n free ")).toBe("Start for free");
    expect(normaliseText("Sign Up")).not.toBe(normaliseText("sign up"));
  });

  it("reads lines in order and drops empty ones", () => {
    const lines = ocrLines(ocr([line("Alpha", 10), line("   ", 40), line("Beta", 70)]));
    expect(lines.map((item) => item.normalised)).toEqual(["Alpha", "Beta"]);
    expect(lines[1].bbox.y).toBe(70);
    expect(ocrLines(null)).toEqual([]);
  });
});

describe("similarity", () => {
  it("is 1 for identical strings and small for unrelated ones", () => {
    expect(similarity("Start for free", "Start for free")).toBe(1);
    expect(similarity("Start for free", "Start free trial")).toBeGreaterThan(0.5);
    expect(similarity("Start for free", "Enterprise pricing and support")).toBeLessThan(0.4);
    expect(similarity("", "")).toBe(1);
  });
});

describe("word-level detail", () => {
  it("reports which words went and which arrived", () => {
    const result = diffWords("Start for free", "Start free trial");
    expect(result.removed).toEqual(["for"]);
    expect(result.added).toEqual(["trial"]);
  });

  it("handles a pure insertion and a pure deletion", () => {
    expect(diffWords("Download", "Download now").added).toEqual(["now"]);
    expect(diffWords("Download now", "Download").removed).toEqual(["now"]);
  });
});

describe("comparing two OCR results", () => {
  it("finds nothing between identical text", () => {
    resetTextChangeIds();
    const page = [line("Shotexa", 10), line("Start for free", 40), line("No account needed", 70)];
    const diff = diffOcrText(ocr(page), ocr(page));
    expect(diff.changes).toEqual([]);
    expect(diff.added + diff.removed + diff.changed).toBe(0);
    expect(diff.unchangedLines).toBe(3);
    expect(diff.languageA).toBe("eng");
    expect(diff.confidenceA).toBeCloseTo(0.93, 2);
  });

  it("reports a reworded line as one modified change, with the words that moved", () => {
    resetTextChangeIds();
    const diff = diffOcrText(ocr([line("Shotexa", 10), line("Start for free", 40)]), ocr([line("Shotexa", 10), line("Start free trial", 40)]));
    expect(diff.changed).toBe(1);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    const change = diff.changes[0];
    expect(change.kind).toBe("changed");
    expect(change.before).toBe("Start for free");
    expect(change.after).toBe("Start free trial");
    expect(change.removedWords).toEqual(["for"]);
    expect(change.addedWords).toEqual(["trial"]);
    expect(textChangeLines(change)).toEqual(["- Start for free", "+ Start free trial"]);
    expect(change.confidence).toBeGreaterThan(0.9);
  });

  it("reports added and removed lines separately", () => {
    resetTextChangeIds();
    const diff = diffOcrText(
      ocr([line("Shotexa", 10), line("Pricing", 40)]),
      ocr([line("Shotexa", 10), line("Pricing", 40), line("Enterprise", 70)]),
    );
    expect(diff.added).toBe(1);
    expect(diff.changes[0].kind).toBe("added");
    expect(diff.changes[0].after).toBe("Enterprise");
    expect(diff.changes[0].before).toBeUndefined();
    expect(diff.changes[0].regionsA).toEqual([]);

    const removed = diffOcrText(ocr([line("Shotexa", 10), line("Beta", 40)]), ocr([line("Shotexa", 10)]));
    expect(removed.removed).toBe(1);
    expect(removed.changes[0].kind).toBe("removed");
    expect(removed.changes[0].before).toBe("Beta");
    expect(removed.changes[0].regionsB).toEqual([]);
  });

  it("does not call a different wrapping a text change", () => {
    resetTextChangeIds();
    const narrow = ocr([line("Upload once and keep", 10), line("working between tools", 40)]);
    const wide = ocr([line("Upload once and keep working", 10), line("between tools", 40)]);
    const diff = diffTextLines(ocrLines(narrow), ocrLines(wide));
    expect(diff.changes).toEqual([]);
    expect(diff.unchangedLines).toBe(2);
  });

  it("still reports a real change inside re-wrapped text", () => {
    resetTextChangeIds();
    const before = ocr([line("Upload once and keep", 10), line("working between tools", 40)]);
    const after = ocr([line("Upload twice and keep", 10), line("working between tools", 40)]);
    const diff = diffTextLines(ocrLines(before), ocrLines(after));
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].removedWords).toEqual(["once"]);
    expect(diff.changes[0].addedWords).toEqual(["twice"]);
  });

  it("copes with one side having no text at all", () => {
    resetTextChangeIds();
    const empty = ocr([]);
    const some = ocr([line("Alpha", 10), line("Beta", 40)]);
    expect(diffOcrText(empty, some).added).toBe(2);
    expect(diffOcrText(some, empty).removed).toBe(2);
    expect(diffOcrText(empty, empty).changes).toEqual([]);
  });

  it("carries OCR's own confidence instead of hiding a doubtful reading", () => {
    resetTextChangeIds();
    const diff = diffOcrText(ocr([line("Start for free", 40, { confidence: 0.41 })]), ocr([line("Start free trial", 40, { confidence: 0.44 })]));
    expect(diff.changes[0].confidence).toBeGreaterThan(0.4);
    expect(diff.changes[0].confidence).toBeLessThan(0.5);
  });

  it("gives every change a distinct id", () => {
    resetTextChangeIds();
    const diff = diffOcrText(ocr([line("One", 10), line("Two", 40)]), ocr([line("Uno", 10), line("Dos", 40)]));
    expect(new Set(diff.changes.map((change) => change.id)).size).toBe(diff.changes.length);
  });
});

describe("geometry", () => {
  it("a modified line points at the words that changed, on both sides", () => {
    resetTextChangeIds();
    const diff = diffOcrText(ocr([line("Start for free", 40)]), ocr([line("Start free trial", 40)]));
    const change = diff.changes[0];
    expect(change.regionsA).toHaveLength(1);
    expect(change.regionsB).toHaveLength(1);
    // "for" is the second word in A; "trial" is the third in B.
    expect(change.regionsA[0].x).toBe(40 + 68);
    expect(change.regionsB[0].x).toBe(40 + 2 * 68);
    expect(textChangeBox(change, "a")).toEqual(change.regionsA[0]);
    expect(textChangeBox({ ...change, regionsA: [] }, "a")).toBeNull();
  });

  it("falls back to the whole line when too many words changed", () => {
    resetTextChangeIds();
    // Ten words, every one of them altered slightly: the lines still pair up as one
    // rewording, but there are far too many changed words to highlight individually.
    const before = line("11 22 33 44 55 66 77 88 99 10", 40);
    const after = line("12 23 34 45 56 67 78 89 90 11", 40);
    const diff = diffTextLines([{ ...ocrLines(ocr([before]))[0] }], [{ ...ocrLines(ocr([after]))[0] }]);
    expect(diff.changes[0].regionsA).toHaveLength(1);
    expect(diff.changes[0].regionsA[0]).toEqual(before.bbox);
  });

  it("maps a text box into the comparison space through the same placement as the pixels", () => {
    const cell = { width: 1600, height: 1200 };
    const placement = place({ width: 800, height: 600 }, cell, "contain", "center");
    const rect = sourceBoxToAnalysis({ x: 100, y: 50, w: 60, h: 20 }, placement, 2);
    // Drawn at 2x in the cell, then read at an analysis scale of 2 cell px per analysis px.
    expect(rect).toEqual({ x: 100, y: 50, width: 60, height: 20 });
  });

  it("marks the changed regions a text change falls inside as text changes", () => {
    resetTextChangeIds();
    const diff = diffOcrText(ocr([line("Start for free", 40)]), ocr([line("Start free trial", 40)]));
    const cell = { width: 800, height: 600 };
    const placement = place({ width: 800, height: 600 }, cell, "contain", "center");
    const analysis: CompareVisualAnalysis = {
      changedPixels: 500,
      comparedPixels: 10_000,
      totalPixels: 10_000,
      ignoredPixels: 0,
      changedPercent: 5,
      unchangedPercent: 95,
      width: 800,
      height: 600,
      metric: "pixel",
      analysisScale: 1,
      regionsTruncated: false,
      regions: [
        { id: 1, x: 100, y: 38, width: 200, height: 24, pixels: 400, percent: 4, kind: "visual", confidence: "high", sourceA: null, sourceB: null },
        { id: 2, x: 600, y: 400, width: 40, height: 40, pixels: 100, percent: 1, kind: "visual", confidence: "high", sourceA: null, sourceB: null },
      ],
    };
    const mapped = applyTextChanges(analysis, diff, { a: placement, b: placement });
    expect(mapped.regions[0].kind).toBe("text");
    expect(mapped.regions[0].textChangeIds).toEqual([diff.changes[0].id]);
    // A region nowhere near the text is left exactly as it was measured.
    expect(mapped.regions[1].kind).toBe("visual");
    expect(mapped.regions[1].textChangeIds).toBeUndefined();
  });

  it("never overrides stronger structural evidence with a text label", () => {
    resetTextChangeIds();
    const diff = diffOcrText(ocr([line("Start for free", 40)]), ocr([line("Start free trial", 40)]));
    const cell = { width: 800, height: 600 };
    const placement = place({ width: 800, height: 600 }, cell, "contain", "center");
    const analysis: CompareVisualAnalysis = {
      changedPixels: 400,
      comparedPixels: 10_000,
      totalPixels: 10_000,
      ignoredPixels: 0,
      changedPercent: 4,
      unchangedPercent: 96,
      width: 800,
      height: 600,
      metric: "pixel",
      analysisScale: 1,
      regionsTruncated: false,
      regions: [{ id: 1, x: 100, y: 38, width: 200, height: 24, pixels: 400, percent: 4, kind: "added", confidence: "high", sourceA: null, sourceB: null }],
    };
    const mapped = applyTextChanges(analysis, diff, { a: placement, b: placement });
    expect(mapped.regions[0].kind).toBe("added");
    expect(mapped.regions[0].textChangeIds).toHaveLength(1);
  });
});
