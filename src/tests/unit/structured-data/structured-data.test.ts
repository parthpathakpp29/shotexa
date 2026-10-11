import { describe, expect, it } from "vitest";
import { analyseStructuredData } from "@/core/structured-data/analyse";
import { entriesToJson, escapeDelimited, extractionToMarkdown, normalizeJsonKey, tableToDelimited, tableToJson, tableToMarkdown, uniqueJsonKeys } from "@/core/structured-data/export";
import { StructuredResultRegistry } from "@/core/structured-data/registry";
import { createXlsx } from "@/core/structured-data/xlsx";
import type { OcrLine, OcrResult, OcrWord } from "@/core/ocr/types";

function line(values: { text: string; x: number; confidence?: number }[], y: number): OcrLine {
  const words: OcrWord[] = values.map(({ text, x, confidence = .95 }) => ({ text, bbox: { x, y, w: Math.max(12, text.length * 8), h: 20 }, confidence }));
  const x = Math.min(...words.map((word) => word.bbox.x)); const right = Math.max(...words.map((word) => word.bbox.x + word.bbox.w));
  return { text: words.map((word) => word.text).join(" "), bbox: { x, y, w: right - x, h: 20 }, confidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length, words };
}
function ocr(lines: OcrLine[]): OcrResult { return { rawText: lines.map((item) => item.text).join("\n"), editedText: lines.map((item) => item.text).join("\n"), language: "eng", confidence: .95, blocks: [{ bbox: { x: 0, y: 0, w: 800, h: 1200 }, confidence: .95, paragraphs: [{ bbox: { x: 0, y: 0, w: 800, h: 1200 }, confidence: .95, lines }] }], durationMs: 1, image: { width: 800, height: 1200 }, readingOrder: "auto", preprocessing: [], engine: { name: "synthetic", version: "1" } }; }
const tableLines = () => [line([{ text: "Product", x: 10 }, { text: "Price", x: 220 }, { text: "Revenue", x: 360 }], 10), line([{ text: "Starter", x: 10 }, { text: "$10", x: 220 }, { text: "$4,200", x: 360 }], 45), line([{ text: "Pro", x: 10 }, { text: "$29", x: 220 }, { text: "$8,100", x: 360 }], 80)];
const analyze = (lines: OcrLine[], mode: Parameters<typeof analyseStructuredData>[0]["options"] = {}) => analyseStructuredData({ assetId: "asset", ocr: ocr(lines), options: mode });

describe("structured table analysis", () => {
  it("detects an aligned table and preserves currency strings", () => { const result = analyze(tableLines()); expect(result.detected).toBe("table"); expect(result.tables[0].rows.map((row) => row.map((cell) => cell.value))).toEqual([["Product", "Price", "Revenue"], ["Starter", "$10", "$4,200"], ["Pro", "$29", "$8,100"]]); });
  it("detects borderless tables from repeated x alignment", () => expect(analyze(tableLines()).confidence).toBe("high"));
  it("handles uneven column widths", () => { const lines = tableLines(); lines[1].words[0].bbox.w = 150; expect(analyze(lines).tables[0].rows[1][0].value).toBe("Starter"); });
  it("folds a wrapped single-cell line into the preceding table cell", () => { const lines = tableLines(); lines.splice(2, 0, line([{ text: "plan", x: 10 }], 67)); const result = analyze(lines); expect(result.tables[0].rows[1][0].value).toBe("Starter\nplan"); expect(result.tables[0].rows[1][0].source).toHaveLength(2); });
  it("keeps missing cells empty and uncertain", () => { const lines = tableLines(); lines[2].words.splice(1, 1); const row = analyze(lines).tables[0].rows[2]; expect(row.some((cell) => cell.value === "" && cell.confidence === "low")).toBe(true); });
  it("marks the first extracted row as a header by default", () => expect(analyze(tableLines()).tables[0].header).toBe(true));
  it("preserves decimals and numeric-looking strings", () => { const lines = tableLines(); lines[1].words[1].text = "001.50"; expect(analyze(lines).tables[0].rows[1][1].value).toBe("001.50"); });
  it("keeps source mapping on every populated cell", () => expect(analyze(tableLines()).tables[0].rows.flat().every((cell) => cell.source.length)).toBe(true));
  it("limits extraction to a selected region without cropping the OCR input", () => { const result = analyze([...tableLines(), line([{ text: "Sidebar", x: 650 }], 10)], { region: { x: 0, y: 0, w: 600, h: 150 } }); expect(result.plainText).not.toContain("Sidebar"); expect(result.region).toEqual({ x: 0, y: 0, w: 600, h: 150 }); });
  it("separates tables with a large vertical gap", () => { const lines = [...tableLines(), ...tableLines().map((item) => ({ ...item, bbox: { ...item.bbox, y: item.bbox.y + 400 }, words: item.words.map((word) => ({ ...word, bbox: { ...word.bbox, y: word.bbox.y + 400 } })) }))]; expect(analyze(lines).tables).toHaveLength(2); });
  it("honours a manual plain-text override", () => expect(analyze(tableLines(), { mode: "plain" }).detected).toBe("plain"));
});

describe("key/value, code and document classification", () => {
  it("extracts colon syntax", () => { const result = analyze([line([{ text: "Name:", x: 10 }, { text: "Parth", x: 100 }, { text: "Pathak", x: 160 }], 10), line([{ text: "Plan:", x: 10 }, { text: "Pro", x: 100 }], 45)], { mode: "key-value" }); expect(result.entries.map((entry) => [entry.key, entry.value])).toEqual([["Name", "Parth Pathak"], ["Plan", "Pro"]]); });
  it("extracts label/value columns without colons", () => { const result = analyze([line([{ text: "Status", x: 10 }, { text: "Active", x: 250 }], 10), line([{ text: "Plan", x: 10 }, { text: "Pro", x: 250 }], 45)], { mode: "key-value" }); expect(result.entries).toHaveLength(2); });
  it("supports label-above-value geometry", () => { const result = analyze([line([{ text: "Customer ID:", x: 10 }], 10), line([{ text: "CUST-0001", x: 10 }], 38)], { mode: "key-value" }); expect(result.entries[0]).toMatchObject({ key: "Customer ID", value: "CUST-0001" }); });
  it("detects code using syntax and indentation", () => { const result = analyze([line([{ text: "const", x: 10 }, { text: "answer", x: 70 }, { text: "=", x: 150 }, { text: "42;", x: 180 }], 10), line([{ text: "console.log(answer);", x: 30 }], 42)]); expect(result.detected).toBe("code"); });
  it("reports a language only when syntax supports it", () => { const result = analyze([line([{ text: "const", x: 10 }, { text: "answer", x: 70 }, { text: "=", x: 150 }, { text: "42;", x: 180 }], 10), line([{ text: "console.log(answer);", x: 30 }], 42)]); expect(result.likelyLanguage).toBe("JavaScript"); expect(analyze([line([{ text: "hello", x: 10 }], 10)]).likelyLanguage).toBeUndefined(); });
  it("detects document lists", () => { const result = analyze([line([{ text: "Release Notes", x: 10 }], 10), line([{ text: "-", x: 10 }, { text: "Faster", x: 35 }], 45), line([{ text: "-", x: 10 }, { text: "Private", x: 35 }], 80)]); expect(result.detected).toBe("document"); });
  it("falls back to plain for one unstructured line", () => expect(analyze([line([{ text: "Hello world", x: 10 }], 10)]).detected).toBe("plain"));
  it("marks low OCR confidence output as uncertain", () => { const result = analyze([line([{ text: "Maybe", x: 10, confidence: .3 }], 10)], { mode: "plain" }); expect(result.uncertainCount).toBe(1); });
});

describe("structured exporters", () => {
  const table = () => analyze(tableLines()).tables[0];
  it("escapes CSV commas, quotes and line breaks", () => { expect(escapeDelimited('A, "B"\nC', ",")).toBe('"A, ""B""\nC"'); });
  it("exports CRLF CSV", () => expect(tableToDelimited(table())).toContain("Product,Price,Revenue\r\nStarter,$10,\"$4,200\""));
  it("exports TSV without quoting commas", () => expect(tableToDelimited(table(), "\t")).toContain("$4,200"));
  it("normalizes readable JSON keys", () => expect(normalizeJsonKey("Total Revenue ($)", 0)).toBe("total_revenue"));
  it("resolves duplicate JSON headers deterministically", () => expect(uniqueJsonKeys(["Total", "Total", ""])).toEqual(["total", "total_2", "column_3"]));
  it("preserves strings by default in table JSON", () => { const parsed = JSON.parse(tableToJson(table())); expect(parsed[0]).toEqual({ product: "Starter", price: "$10", revenue: "$4,200" }); });
  it("only infers conservative primitive values when requested", () => { const value = table(); value.rows[1][1].value = "001"; const parsed = JSON.parse(tableToJson(value, true)); expect(parsed[0].price).toBe("001"); });
  it("exports key/value JSON", () => { const result = analyze([line([{ text: "Plan:", x: 10 }, { text: "Pro", x: 100 }], 10)], { mode: "key-value" }); expect(entriesToJson(result.entries)).toContain('"plan": "Pro"'); });
  it("escapes Markdown table pipes", () => { const value = table(); value.rows[1][0].value = "A | B"; expect(tableToMarkdown(value)).toContain("A \\| B"); });
  it("exports document headings and lists", () => { const result = analyze([line([{ text: "Release Notes", x: 10 }], 10), line([{ text: "-", x: 10 }, { text: "Private", x: 35 }], 45)], { mode: "document" }); expect(extractionToMarkdown(result)).toContain("# Release Notes"); expect(extractionToMarkdown(result)).toContain("- Private"); });
  it("preserves code lines in a document as fenced Markdown", () => { const result = analyze([line([{ text: "Guide", x: 10 }], 10), line([{ text: "const", x: 10 }, { text: "ready", x: 80 }, { text: "=", x: 150 }, { text: "true;", x: 180 }], 45)], { mode: "document" }); expect(extractionToMarkdown(result)).toContain("```\nconst ready = true;\n```"); });
  it("generates a valid ZIP-based XLSX with local strings", async () => { const blob = await createXlsx([table()]); const bytes = new Uint8Array(await blob.arrayBuffer()); expect(blob.type).toContain("spreadsheetml"); expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK"); });
});

describe("structured result cleanup", () => {
  it("replaces per-asset results and releases them", () => { const registry = new StructuredResultRegistry(); const one = analyze(tableLines()); registry.put(one); registry.put({ ...one, id: "replacement" }); expect(registry.stats()).toEqual({ results: 1 }); registry.removeAsset("asset"); expect(registry.stats()).toEqual({ results: 0 }); });
});
