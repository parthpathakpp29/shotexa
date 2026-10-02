import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { OcrResult } from "@/core/ocr/types";
import { DEFAULT_PAGINATION_CONFIG } from "@/core/pdf/config";
import { buildPlan } from "@/core/pdf/plan";
import { assemblePdf, type EncodedPage } from "@/core/pdf/render-pdf";
import { buildPdfTextRuns, searchableSourceFromResult } from "@/core/pdf/searchable-text";
import type { PageSetup } from "@/core/pdf/types";

const A4: PageSetup = { paper: "a4", orientation: "portrait", marginPt: 28 };

function result(lines: { text: string; x: number; y: number; w: number; h: number }[], language = "eng"): OcrResult {
  const ocrLines = lines.map((line) => ({
    text: line.text,
    bbox: { x: line.x, y: line.y, w: line.w, h: line.h },
    confidence: 0.95,
    words: [{ text: line.text, bbox: { x: line.x, y: line.y, w: line.w, h: line.h }, confidence: 0.95 }],
  }));
  return {
    rawText: lines.map((line) => line.text).join("\n"),
    editedText: "USER EDITS MUST NOT ENTER THE PDF LAYER",
    language,
    blocks: [{ bbox: { x: 0, y: 0, w: 100, h: 400 }, confidence: 0.95, paragraphs: [{ bbox: { x: 0, y: 0, w: 100, h: 400 }, confidence: 0.95, lines: ocrLines }] }],
    durationMs: 1,
    image: { width: 100, height: 400 },
    readingOrder: "top-down",
    preprocessing: [],
    engine: { name: "test", version: "1" },
  };
}

function imagePage(plan: ReturnType<typeof buildPlan>): EncodedPage {
  const png = new PNG({ width: 100, height: 400 });
  png.data.fill(255);
  return {
    slice: plan.pages[0],
    imageWidth: 100,
    imageHeight: 400,
    format: "png",
    tiles: [{ y0: 0, y1: 400, bytes: new Uint8Array(PNG.sync.write(png)) }],
  };
}

function contentText(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  return streams.map((stream) => stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1") : "").join("\n");
}

describe("searchable PDF geometry", () => {
  it("uses original structured OCR lines and ignores edited text", () => {
    const source = searchableSourceFromResult(0, result([
      { text: "Second page", x: 10, y: 250, w: 70, h: 12 },
      { text: "First page", x: 10, y: 20, w: 60, h: 12 },
    ]), "asset-a");
    expect(source.lines.map((line) => line.text)).toEqual(["First page", "Second page"]);
    expect(source.lines.some((line) => line.text.includes("USER EDITS"))).toBe(false);
  });

  it("maps lines through page slices, scale, margins and multiple images", () => {
    const plan = buildPlan([{ width: 100, height: 400 }, { width: 100, height: 200 }], A4, "fixed", DEFAULT_PAGINATION_CONFIG);
    const sources = [
      searchableSourceFromResult(0, result([{ text: "Alpha", x: 10, y: 20, w: 40, h: 10 }])),
      searchableSourceFromResult(1, { ...result([{ text: "Beta", x: 5, y: 50, w: 30, h: 10 }]), image: { width: 100, height: 200 } }),
    ];
    const runs = buildPdfTextRuns(plan, sources);
    expect(runs).toHaveLength(2);
    expect(runs[0].pageIndex).toBe(0);
    expect(runs[1].pageIndex).toBe(plan.pages.findIndex((page) => page.imageIndex === 1));
    expect(runs[0].x).toBeGreaterThanOrEqual(A4.marginPt);
    expect(runs[0].y).toBeGreaterThanOrEqual(A4.marginPt);
  });
});

describe("searchable PDF assembly", () => {
  it("embeds an invisible English + Hindi text layer with a Unicode ToUnicode map", async () => {
    const plan = buildPlan([{ width: 100, height: 400 }], A4, "fixed", DEFAULT_PAGINATION_CONFIG);
    const searchableText = [searchableSourceFromResult(0, result([
      { text: "Searchable receipt total", x: 5, y: 30, w: 85, h: 12 },
      { text: "नमस्ते भारत", x: 5, y: 70, w: 65, h: 14 },
    ], "eng+hin"))];
    const font = new Uint8Array(readFileSync("src/assets/fonts/Hind-Regular.ttf"));
    const blob = await assemblePdf([imagePage(plan)], 1, { setup: A4, imageFormat: "png", searchableText, searchableFontBytes: font }).catch((error) => {
      throw new Error(String((error as { detail?: string }).detail ?? error));
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const content = contentText(doc, 0);
    expect(content.match(/\b3\s+Tr\b/g)?.length).toBe(2);
    expect(content.match(/\bBT\b/g)?.length).toBe(2);
    const fonts = doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    expect(fonts?.values().length).toBe(1);
    const fontRef = fonts?.values()[0];
    const fontDict = fontRef instanceof PDFRef ? doc.context.lookup(fontRef, PDFDict) : undefined;
    expect(fontDict?.has(PDFName.of("ToUnicode"))).toBe(true);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const viewer = await pdfjs.getDocument({ data: bytes.slice(), useWorkerFetch: false }).promise;
    const extracted = (await viewer.getPage(1).then((page) => page.getTextContent())).items
      .map((item) => "str" in item ? item.str : "")
      .join(" ");
    expect(extracted).toContain("Searchable receipt total");
    expect(extracted).toContain("नमस्ते भारत");
    await viewer.destroy();
  });
});
