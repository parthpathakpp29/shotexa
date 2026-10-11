import type { BBox, OcrResult, OcrWord } from "@/core/ocr/types";
import type { DetectedStructure, ExtractionConfidence, ExtractionRegion, KeyValueEntry, StructuredAnalysisInput, StructuredCell, StructuredExtraction, StructuredTable, StructuredTextBlock } from "./types";

type Row = { words: OcrWord[]; bbox: BBox; confidence: number };
type Segment = { text: string; bbox: BBox; confidence: number };
const right = (b: BBox) => b.x + b.w;
const bottom = (b: BBox) => b.y + b.h;
const union = (boxes: BBox[]): BBox => { const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y)); const r = Math.max(...boxes.map(right)); const d = Math.max(...boxes.map(bottom)); return { x, y, w: r - x, h: d - y }; };
const intersects = (a: BBox, b: BBox) => a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;
const median = (values: number[]) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const confidenceClass = (value: number, structural = 1): ExtractionConfidence => value * structural >= 0.82 ? "high" : value * structural >= 0.58 ? "medium" : "low";

function wordsInRegion(ocr: OcrResult, region: ExtractionRegion | null): OcrWord[] {
  return ocr.blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))).filter((word) => word.text.trim() && (!region || intersects(word.bbox, region)));
}

export function clusterWordsIntoRows(words: OcrWord[]): Row[] {
  const sorted = [...words].sort((a, b) => (a.bbox.y + a.bbox.h / 2) - (b.bbox.y + b.bbox.h / 2) || a.bbox.x - b.bbox.x);
  const rows: Row[] = [];
  for (const word of sorted) {
    const cy = word.bbox.y + word.bbox.h / 2;
    let row = rows.find((candidate) => Math.abs(candidate.bbox.y + candidate.bbox.h / 2 - cy) <= Math.max(candidate.bbox.h, word.bbox.h) * 0.55);
    if (!row) { row = { words: [], bbox: { ...word.bbox }, confidence: word.confidence }; rows.push(row); }
    row.words.push(word); row.words.sort((a, b) => a.bbox.x - b.bbox.x); row.bbox = union(row.words.map((item) => item.bbox)); row.confidence = row.words.reduce((sum, item) => sum + item.confidence, 0) / row.words.length;
  }
  return rows.sort((a, b) => a.bbox.y - b.bbox.y);
}

function segmentsFor(row: Row, medianHeight: number): Segment[] {
  const character = Math.max(3, median(row.words.map((word) => word.bbox.w / Math.max(1, word.text.length))));
  const threshold = Math.max(medianHeight * 0.9, character * 3.2, 10);
  const groups: OcrWord[][] = [];
  for (const word of row.words) { const current = groups.at(-1); const previous = current?.at(-1); if (!current || !previous || word.bbox.x - right(previous.bbox) > threshold) groups.push([word]); else current.push(word); }
  return groups.map((group) => ({ text: group.map((word) => word.text).join(" ").replace(/\s+([,.;:!?])/g, "$1"), bbox: union(group.map((word) => word.bbox)), confidence: group.reduce((sum, word) => sum + word.confidence, 0) / group.length }));
}

function tableGroups(rows: Row[], height: number): Row[][] {
  const groups: Row[][] = [];
  for (const row of rows) { const current = groups.at(-1); const previous = current?.at(-1); if (!current || !previous || row.bbox.y - bottom(previous.bbox) > height * 3.5) groups.push([row]); else current.push(row); }
  return groups.filter((group) => group.length >= 2);
}

function inferTable(group: Row[], tableIndex: number, height: number): StructuredTable | null {
  const segmented = group.map((row) => segmentsFor(row, height));
  const useful = segmented.filter((segments) => segments.length >= 2);
  if (useful.length < 2) return null;
  const tolerance = Math.max(14, height * 1.6);
  const anchors: number[] = [];
  for (const segments of useful) for (const segment of segments) { const found = anchors.findIndex((x) => Math.abs(x - segment.bbox.x) <= tolerance); if (found < 0) anchors.push(segment.bbox.x); else anchors[found] = (anchors[found] * 2 + segment.bbox.x) / 3; }
  anchors.sort((a, b) => a - b);
  const stable = anchors.filter((anchor) => useful.filter((segments) => segments.some((segment) => Math.abs(segment.bbox.x - anchor) <= tolerance)).length >= Math.max(2, Math.ceil(useful.length * 0.45))).slice(0, 12);
  if (stable.length < 2) return null;
  const builtRows = segmented.map((segments, rowIndex) => stable.map((anchor, columnIndex): StructuredCell => {
    const previous = stable[columnIndex - 1]; const next = stable[columnIndex + 1];
    const owned = segments.filter((segment) => { const center = segment.bbox.x + segment.bbox.w / 2; return center >= (previous === undefined ? -Infinity : (previous + anchor) / 2) && center < (next === undefined ? Infinity : (anchor + next) / 2); });
    const value = owned.map((segment) => segment.text).join(" "); const source = owned.map((segment) => segment.bbox); const ocrConfidence = owned.length ? owned.reduce((sum, segment) => sum + segment.confidence, 0) / owned.length : 0;
    return { id: `t${tableIndex + 1}-r${rowIndex + 1}-c${columnIndex + 1}`, value, source, confidence: value ? confidenceClass(ocrConfidence, source.length && Math.abs(source[0].x - anchor) <= tolerance ? 1 : 0.72) : "low" };
  }));
  const rows: StructuredCell[][] = [];
  for (const row of builtRows) {
    const populated = row.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell.value);
    const previous = rows.at(-1);
    if (previous && populated.length === 1) {
      const { cell, index } = populated[0]; const target = previous[index]; const priorBox = target.source.at(-1); const nextBox = cell.source[0];
      if (priorBox && nextBox && nextBox.y - bottom(priorBox) <= height * 1.1) { target.value = `${target.value}\n${cell.value}`; target.source.push(...cell.source); target.confidence = target.confidence === "low" || cell.confidence === "low" ? "low" : "medium"; continue; }
    }
    rows.push(row);
  }
  return { id: `table-${tableIndex + 1}`, name: `Table ${tableIndex + 1}`, header: true, rows };
}

function detectTables(rows: Row[]): StructuredTable[] {
  const height = Math.max(8, median(rows.map((row) => row.bbox.h)));
  const tables = tableGroups(rows, height).map((group, index) => inferTable(group, index, height)).filter((table): table is StructuredTable => !!table);
  if (!tables.length) { const table = inferTable(rows, 0, height); if (table) tables.push(table); }
  return tables;
}

function detectKeyValues(rows: Row[]): KeyValueEntry[] {
  const entries: KeyValueEntry[] = [];
  rows.forEach((row, index) => {
    const text = row.words.map((word) => word.text).join(" ").trim(); const colon = text.match(/^(.{1,48}?)\s*:\s*(.+)$/);
    if (colon) { entries.push({ id: `field-${entries.length + 1}`, key: colon[1].trim(), value: colon[2].trim(), source: [row.bbox], confidence: confidenceClass(row.confidence) }); return; }
    const segments = segmentsFor(row, Math.max(8, row.bbox.h));
    if (segments.length === 2 && segments[0].text.length <= 48) { entries.push({ id: `field-${entries.length + 1}`, key: segments[0].text.replace(/:$/, ""), value: segments[1].text, source: segments.map((segment) => segment.bbox), confidence: confidenceClass(row.confidence, 0.88) }); return; }
    const next = rows[index + 1]; if (next && text.length <= 36 && /[:?]$/.test(text) && next.bbox.x >= row.bbox.x - row.bbox.h) entries.push({ id: `field-${entries.length + 1}`, key: text.replace(/[:?]$/, ""), value: next.words.map((word) => word.text).join(" "), source: [row.bbox, next.bbox], confidence: confidenceClass((row.confidence + next.confidence) / 2, 0.78) });
  });
  return entries;
}

const CODE = /(?:=>|\b(?:const|let|var|function|class|import|export|SELECT|FROM|WHERE|INSERT|UPDATE)\b|^[\s]*[{}[\]#>$]|:\s*["'{\d]|\w+\([^)]*\)\s*[{;]?)/im;
function classify(rows: Row[], tables: StructuredTable[], entries: KeyValueEntry[], text: string): DetectedStructure {
  const multiColumn = rows.filter((row) => segmentsFor(row, Math.max(8, row.bbox.h)).length >= 2).length;
  if (tables.length && multiColumn >= Math.max(2, rows.length * 0.45)) return "table";
  if (entries.length >= Math.max(2, rows.length * 0.45)) return "key-value";
  const left = Math.min(...rows.map((row) => row.bbox.x)); const indented = rows.filter((row) => row.bbox.x > left + Math.max(12, row.bbox.h)).length;
  if (CODE.test(text) && (indented > 0 || /[{};]|\$ |>>>|ERROR|WARN/m.test(text))) return "code";
  if (rows.some((row) => /^\s*(?:[-*•]|\d+[.)])\s/.test(row.words.map((word) => word.text).join(" "))) || rows.length >= 3) return "document";
  return "plain";
}
function blocks(rows: Row[], detected: DetectedStructure): StructuredTextBlock[] { const left = Math.min(...rows.map((row) => row.bbox.x)); return rows.map((row, index) => { let text = row.words.map((word) => word.text).join(" ").trim(); let kind: StructuredTextBlock["kind"] = "paragraph"; if (detected === "code" || CODE.test(text)) { kind = "code"; if (detected === "code") text = `${" ".repeat(Math.max(0, Math.round((row.bbox.x - left) / Math.max(4, row.bbox.h * .45))))}${text}`; } else if (/^[-*•]\s/.test(text)) kind = "bullet"; else if (/^\d+[.)]\s/.test(text)) kind = "numbered"; else if (text.length < 64 && (index === 0 || /^[A-Z][A-Za-z\s]+$/.test(text))) kind = "heading"; return { id: `block-${index + 1}`, kind, text, source: [row.bbox], confidence: confidenceClass(row.confidence) }; }); }
function likelyLanguage(text: string): StructuredExtraction["likelyLanguage"] { try { JSON.parse(text); return "JSON"; } catch { /* deterministic syntax checks continue */ } if (/\b(?:const|let|var|function|import|export|console\.)\b|=>/.test(text)) return "JavaScript"; if (/\b(?:SELECT|FROM|WHERE|INSERT|UPDATE|CREATE TABLE)\b/i.test(text)) return "SQL"; if (/^\s*[\w.-]+:\s+\S+/m.test(text)) return "YAML"; if (/^\s*(?:\$|>|#)\s+\w+/m.test(text)) return "Shell"; return undefined; }

export function analyseStructuredData({ assetId, ocr, options = {} }: StructuredAnalysisInput): StructuredExtraction {
  const requestedMode = options.mode ?? "auto"; const region = options.region ?? null; const rows = clusterWordsIntoRows(wordsInRegion(ocr, region));
  const plainText = rows.map((row) => row.words.map((word) => word.text).join(" ").replace(/\s+([,.;:!?])/g, "$1")).join("\n"); const tables = detectTables(rows); const entries = detectKeyValues(rows);
  const automatic = rows.length ? classify(rows, tables, entries, plainText) : "plain"; const detected = requestedMode === "auto" ? automatic : requestedMode; const textBlocks = blocks(rows, detected);
  const values = detected === "table" ? tables.flatMap((table) => table.rows.flat()).map((cell) => cell.confidence) : detected === "key-value" ? entries.map((entry) => entry.confidence) : textBlocks.map((block) => block.confidence);
  const uncertainCount = values.filter((value) => value === "low").length; const high = values.filter((value) => value === "high").length; const confidence: ExtractionConfidence = !values.length ? "low" : high / values.length >= 0.72 ? "high" : uncertainCount / values.length >= 0.35 ? "low" : "medium";
  return { id: `structured-${assetId}-${Date.now().toString(36)}`, assetId, requestedMode, detected, confidence, region, tables, entries, blocks: textBlocks, plainText, likelyLanguage: detected === "code" ? likelyLanguage(plainText) : undefined, uncertainCount, createdAt: Date.now() };
}
