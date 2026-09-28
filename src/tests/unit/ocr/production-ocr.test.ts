import { describe, expect, it } from "vitest";
import { ocrTextBlob, ocrTextFilename } from "@/core/ocr/text-export";
import type { OcrResult } from "@/core/ocr/types";
import { OcrResultRegistry } from "@/core/runtime/ocr-result-registry";

const result = (text = "Local OCR text"): OcrResult => ({
  rawText: text,
  editedText: text,
  language: "eng",
  confidence: 0.95,
  blocks: [{ bbox: { x: 1, y: 2, w: 30, h: 12 }, confidence: 0.95, paragraphs: [{ bbox: { x: 1, y: 2, w: 30, h: 12 }, confidence: 0.95, lines: [{ text, bbox: { x: 1, y: 2, w: 30, h: 12 }, confidence: 0.95, words: [{ text, bbox: { x: 1, y: 2, w: 30, h: 12 }, confidence: 0.95 }] }] }] }],
  durationMs: 100,
  image: { width: 100, height: 100 },
  readingOrder: "auto",
  preprocessing: [],
  engine: { name: "test", version: "1" },
});

describe("production OCR result storage", () => {
  it("keeps structured layout in an opaque registry and replaces per-asset results", () => {
    const registry = new OcrResultRegistry();
    const first = registry.put("asset-a", result());
    expect(registry.get(first)?.blocks[0].paragraphs[0].lines[0].words).toHaveLength(1);
    const second = registry.put("asset-a", result("Corrected pass"));
    expect(second).not.toBe(first);
    expect(registry.get(first)).toBeUndefined();
    expect(registry.forAsset("asset-a")?.rawText).toBe("Corrected pass");
    registry.removeAsset("asset-a");
    expect(registry.stats()).toEqual({ results: 0 });
  });

  it("creates UTF-8 text downloads with a stable image-derived name", async () => {
    expect(ocrTextFilename("long.capture.PNG")).toBe("long.capture-text.txt");
    expect(ocrTextFilename(" ")).toBe("screenshot-text.txt");
    expect(ocrTextBlob("नमस्ते\nHello").type).toBe("text/plain;charset=utf-8");
    expect(await ocrTextBlob("नमस्ते\nHello").text()).toBe("नमस्ते\nHello");
  });
});
