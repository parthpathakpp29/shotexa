import { describe, expect, it } from "vitest";
import { composeTransforms, imageBoxToPdf, iou, toOriginal } from "@/core/ocr/coords";
import { toOcrError } from "@/core/ocr/errors";
import { buildResult, cleanText, estimateCharWidth, indentLines, isNoiseLine, orderLines } from "@/core/ocr/normalize";
import {
  applyPreprocessing,
  autoContrast,
  binarize,
  choosePreprocessing,
  DEFAULT_PREPROCESS_POLICY,
  estimateLineHeight,
  imageStats,
  otsuThreshold,
  toGray,
  upscale,
  type Gray,
  type ImageStats,
} from "@/core/ocr/preprocess";
import { mergeStripResults, planOcrStrips } from "@/core/ocr/strips";
import type { OcrBlock, OcrLine, OcrResult } from "@/core/ocr/types";
import { bagOfWords, cer, lineMetrics, normLenient, normStrict, symbolAccuracy, wer } from "../../helpers/ocr-metrics";

const line = (text: string, x: number, y: number, w = 100, h = 20, confidence = 0.9): OcrLine => ({
  text,
  bbox: { x, y, w, h },
  confidence,
  words: text.split(" ").map((t, i, all) => ({ text: t, bbox: { x: x + (i * w) / all.length, y, w: w / all.length - 4, h }, confidence })),
});
const blocksOf = (...groups: OcrLine[][]): OcrBlock[] =>
  groups.map((lines) => ({ bbox: { x: 0, y: 0, w: 1, h: 1 }, confidence: 0.9, paragraphs: [{ bbox: { x: 0, y: 0, w: 1, h: 1 }, confidence: 0.9, lines }] }));

describe("coordinate transforms", () => {
  it("maps recognised-image boxes to original pixels", () => {
    expect(toOriginal({ x0: 20, y0: 40, x1: 60, y1: 80 }, { scale: 2, offsetX: 10, offsetY: 1000 })).toEqual({ x: 20, y: 1020, w: 20, h: 20 });
  });
  it("composes upscale-inside-strip transforms", () => {
    const strip = { scale: 1, offsetX: 0, offsetY: 2000 };
    const up = { scale: 2, offsetX: 0, offsetY: 0 };
    const t = composeTransforms(up, strip);
    expect(toOriginal({ x0: 100, y0: 100, x1: 200, y1: 140 }, t)).toEqual({ x: 50, y: 2050, w: 50, h: 20 });
  });
  it("maps image boxes to PDF points with a bottom-left origin", () => {
    const p = { pageWidth: 595, pageHeight: 842, imageX: 20, imageY: 20, imageWidth: 540, imageHeight: 800, pixelWidth: 1080, pixelHeight: 1600 };
    expect(imageBoxToPdf({ x: 0, y: 0, w: 1080, h: 16 }, p)).toEqual({ x: 20, y: 812, w: 540, h: 8 });
  });
  it("computes IoU", () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 })).toBeCloseTo(1 / 3);
  });
});

describe("reading order", () => {
  // Engine returned the right-hand chat bubbles as a separate block after the left ones.
  const left = [line("Hi there", 10, 100), line("How are you", 10, 300)];
  const right = [line("Hello", 300, 200), line("Great thanks", 300, 400)];
  it("engine order follows blocks", () => {
    expect(orderLines(blocksOf(left, right), "engine").map((l) => l.text)).toEqual(["Hi there", "How are you", "Hello", "Great thanks"]);
  });
  it("top-down order interleaves by vertical position", () => {
    expect(orderLines(blocksOf(left, right), "top-down").map((l) => l.text)).toEqual(["Hi there", "Hello", "How are you", "Great thanks"]);
  });
  it("top-down keeps same-row items left to right (label + value)", () => {
    const rows = blocksOf([line("On", 400, 52, 30, 18)], [line("Wi-Fi", 20, 50, 60, 20)]);
    expect(orderLines(rows, "top-down").map((l) => l.text)).toEqual(["Wi-Fi", "On"]);
  });
});

describe("text cleanup and indentation", () => {
  it("normalises ligatures/whitespace and optionally straightens quotes", () => {
    expect(cleanText("\n\nﬁnal  \nline“s”\n\n\n\nend\n")).toBe("final\nline“s”\n\nend");
    expect(cleanText("say “hi” it’s", { straightenQuotes: true })).toBe(`say "hi" it's`);
  });
  it("flags only low-confidence non-alphanumeric lines as noise", () => {
    expect(isNoiseLine(line("|| —", 0, 0, 50, 20, 0.3), 0.6)).toBe(true);
    expect(isNoiseLine(line("}", 0, 0, 10, 20, 0.9), 0.6)).toBe(false);
    expect(isNoiseLine(line("OK", 0, 0, 10, 20, 0.1), 0.6)).toBe(false);
  });
  it("rebuilds indentation from x positions", () => {
    const ls = [line("if (a) {", 100, 0, 80), line("b();", 120, 20, 40), line("}", 100, 40, 10)];
    expect(estimateCharWidth(ls)).toBeGreaterThan(0);
    const out = indentLines(ls);
    expect(out[0].startsWith("if")).toBe(true);
    expect(out[1].match(/^ +/)?.[0].length).toBeGreaterThan(0);
    expect(out[2]).toBe("}");
  });
  it("keeps raw engine text separate from the editable text", () => {
    const r = buildResult({
      blocks: blocksOf([line("ﬁle ready", 0, 0)]),
      language: "eng",
      durationMs: 1,
      image: { width: 10, height: 10 },
      preprocessing: [],
      engine: { name: "x", version: "1" },
    });
    expect(r.rawText).toBe("ﬁle ready");
    expect(r.editedText).toBe("file ready");
    expect(r.confidence).toBeCloseTo(0.9);
  });
});

function grayOf(w: number, h: number, f: (x: number, y: number) => number): Gray {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y);
  return { width: w, height: h, data };
}
const rgbaOf = (g: Gray) => {
  const d = new Uint8Array(g.width * g.height * 4);
  g.data.forEach((v, i) => d.set([v, v, v, 255], i * 4));
  return { width: g.width, height: g.height, data: d };
};

describe("preprocessing (non-destructive)", () => {
  const text = grayOf(200, 120, (x, y) => (y % 30 < 12 && x % 7 < 3 ? 140 : 190)); // low-contrast "text" bands
  it("does not mutate the source pixels", () => {
    const src = rgbaOf(text);
    const before = src.data.slice();
    applyPreprocessing(src, ["contrast", "binarize", "upscale2"]);
    expect(Buffer.compare(Buffer.from(before), Buffer.from(src.data))).toBe(0);
  });
  it("auto-contrast stretches to the full range", () => {
    const out = autoContrast(text);
    expect(Math.min(...out.data)).toBe(0);
    expect(Math.max(...out.data)).toBe(255);
  });
  it("Otsu separates a bimodal image", () => {
    const t = otsuThreshold(text);
    expect(t).toBeGreaterThanOrEqual(140);
    expect(t).toBeLessThan(190);
    expect(new Set(binarize(text).data)).toEqual(new Set([0, 255]));
  });
  it("upscales dimensions and reports the transform scale", () => {
    expect(upscale(text, 1.5)).toMatchObject({ width: 300, height: 180 });
    expect(applyPreprocessing(rgbaOf(text), ["upscale2"]).scale).toBe(2);
    expect(toGray(rgbaOf(text)).data[0]).toBe(text.data[0]);
  });
  it("estimates text line height from row bands", () => {
    expect(estimateLineHeight(text)).toBe(12);
  });
  it("chooses steps from image stats", () => {
    const base: ImageStats = { width: 1000, height: 800, meanLuma: 230, contrastRange: 200, darkFraction: 0.05, medianLineHeight: 30 };
    expect(choosePreprocessing(base)).toEqual([]);
    expect(choosePreprocessing({ ...base, medianLineHeight: 12 })).toEqual(["upscale2"]);
    // Contrast/invert are disabled by default (Spike C: no benefit) but remain configurable.
    expect(choosePreprocessing({ ...base, contrastRange: 40 })).toEqual([]);
    expect(choosePreprocessing({ ...base, contrastRange: 40 }, { ...DEFAULT_PREPROCESS_POLICY, contrastBelowRange: 90 })).toContain("contrast");
    expect(choosePreprocessing({ ...base, medianLineHeight: 24 })).toEqual([]); // DPR 2–3 text: never upscale
    expect(choosePreprocessing({ ...base, medianLineHeight: 12, width: 1080, height: 10000 })).not.toContain("upscale2");
    expect(imageStats(rgbaOf(text)).contrastRange).toBe(50);
  });
});

describe("long-screenshot strips", () => {
  it("covers the image and partitions ownership without gaps", () => {
    const strips = planOcrStrips(10_000, 2000, 240);
    expect(strips[0].y).toBe(0);
    expect(strips.at(-1)!.y + strips.at(-1)!.height).toBe(10_000);
    for (let i = 1; i < strips.length; i++) {
      expect(strips[i].ownFrom).toBe(strips[i - 1].ownTo);
      expect(strips[i].y).toBeLessThan(strips[i - 1].y + strips[i - 1].height); // overlap
    }
    expect(strips[0].ownFrom).toBe(0);
    expect(strips.at(-1)!.ownTo).toBe(10_000);
  });
  it("de-duplicates lines seen twice in the overlap", () => {
    const strips = planOcrStrips(3000, 2000, 400); // strip0 0–2000, strip1 1000–3000, boundary 1500
    const mk = (lines: OcrLine[]): OcrResult =>
      ({ blocks: blocksOf(lines), durationMs: 10 }) as unknown as OcrResult;
    const merged = mergeStripResults(
      [
        { strip: strips[0], result: mk([line("A", 0, 100), line("B", 0, 1400), line("C cut", 0, 1990, 100, 20)]) },
        { strip: strips[1], result: mk([line("B", 0, 1400), line("C", 0, 1990), line("D", 0, 2500)]) },
      ],
      { width: 100, height: 3000 },
    );
    expect(orderLines(merged.blocks, "top-down").map((l) => l.text)).toEqual(["A", "B", "C", "D"]);
    expect(merged.durationMs).toBe(20);
  });
});

describe("error mapping", () => {
  it("never passes raw messages as the code", () => {
    expect(toOcrError(new Error("RuntimeError: memory access out of bounds"), "recognise").code).toBe("OCR_OUT_OF_MEMORY");
    expect(toOcrError(new DOMException("aborted", "AbortError"), "recognise").code).toBe("OCR_CANCELLED");
    expect(toOcrError(new Error("404 eng.traineddata.gz"), "load").code).toBe("OCR_MODEL_LOAD_FAILED");
    expect(toOcrError(new Error("importScripts failed"), "load").code).toBe("OCR_ENGINE_LOAD_FAILED");
    expect(toOcrError(new Error("weird"), "recognise").code).toBe("OCR_RECOGNITION_FAILED");
    expect(toOcrError(new Error("secret text"), "recognise").message).toBe("OCR_RECOGNITION_FAILED");
  });
});

describe("benchmark metrics", () => {
  it("CER/WER and normalisation", () => {
    expect(cer("abcd", "abxd")).toBe(0.25);
    expect(wer("the quick fox", "the quack fox")).toBeCloseTo(1 / 3);
    expect(normStrict("Hi 👍  there\n")).toBe("Hi there");
    expect(normLenient("“x” – y…")).toBe('"x" - y...');
  });
  it("bag of words finds missing and extra words", () => {
    expect(bagOfWords("a b c", "a c d")).toMatchObject({ missing: ["b"], extra: ["d"] });
  });
  it("line metrics detect reading-order swaps", () => {
    const m = lineMetrics(["one line", "two line", "three line"], ["one line", "three line", "two line"]);
    expect(m.exact).toBe(3);
    expect(m.orderScore).toBe(0.5);
  });
  it("symbol accuracy counts mis-read symbols", () => {
    expect(symbolAccuracy("a => b;", "a -> b;")).toMatchObject({ total: 3, accuracy: 2 / 3 });
  });
});
