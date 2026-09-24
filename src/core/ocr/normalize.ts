import { IDENTITY, toOriginal, unionBox } from "./coords";
import type { BBox, OcrBlock, OcrLine, OcrResult, OcrTransform, ReadingOrder } from "./types";

/** Minimal structural view of Tesseract.js `blocks` output (opt-in `output: { blocks: true }`). */
interface TBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface TesseractBlock {
  bbox: TBox;
  confidence: number;
  blocktype?: string;
  paragraphs: {
    bbox: TBox;
    confidence: number;
    lines: {
      bbox: TBox;
      confidence: number;
      text: string;
      baseline?: { x0: number; y0: number; x1: number; y1: number; has_baseline?: boolean };
      words: { bbox: TBox; confidence: number; text: string }[];
    }[];
  }[];
}

export interface NormalizeOptions {
  transform?: OcrTransform;
  readingOrder?: ReadingOrder;
  preserveIndentation?: boolean;
  cleanup?: CleanupOptions;
}

/** Engine blocks → engine-neutral blocks in ORIGINAL pixel coordinates (0–1 confidences). */
export function normalizeTesseractBlocks(blocks: TesseractBlock[] | null | undefined, transform: OcrTransform = IDENTITY): OcrBlock[] {
  return (blocks ?? []).map((b) => ({
    bbox: toOriginal(b.bbox, transform),
    confidence: b.confidence / 100,
    kind: b.blocktype,
    paragraphs: b.paragraphs.map((p) => ({
      bbox: toOriginal(p.bbox, transform),
      confidence: p.confidence / 100,
      lines: p.lines
        .map((l) => {
          const words = l.words
            .filter((w) => w.text.trim() !== "")
            .map((w) => ({ text: w.text.trim(), bbox: toOriginal(w.bbox, transform), confidence: w.confidence / 100 }));
          const line: OcrLine = {
            text: words.map((w) => w.text).join(" "),
            bbox: toOriginal(l.bbox, transform),
            confidence: l.confidence / 100,
            words,
          };
          if (l.baseline && l.baseline.has_baseline !== false) {
            const b0 = toOriginal({ x0: l.baseline.x0, y0: l.baseline.y0, x1: l.baseline.x1, y1: l.baseline.y1 }, transform);
            line.baseline = { x0: b0.x, y0: b0.y, x1: b0.x + b0.w, y1: b0.y + b0.h };
          }
          return line;
        })
        .filter((l) => l.words.length > 0),
    })),
  }));
}

export function allLines(blocks: OcrBlock[]): OcrLine[] {
  return blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
}

/**
 * Reading order.
 * - "engine": Tesseract's block/paragraph order (column-aware, but can separate chat
 *   bubbles or table cells into column-wise blocks).
 * - "top-down": rows by vertical position, left→right within a row. Lines whose vertical
 *   extents overlap by > 50% of the smaller line height share a row.
 */
export function orderLines(blocks: OcrBlock[], order: ReadingOrder): OcrLine[] {
  const lines = allLines(blocks);
  if (order === "engine") return lines;
  if (order === "auto") return orderLines(blocks, chooseReadingOrder(blocks));
  const sorted = [...lines].sort((a, b) => a.bbox.y + a.bbox.h / 2 - (b.bbox.y + b.bbox.h / 2));
  const rows: OcrLine[][] = [];
  for (const l of sorted) {
    const row = rows.at(-1);
    const ref = row?.[0];
    if (ref) {
      const overlap = Math.min(ref.bbox.y + ref.bbox.h, l.bbox.y + l.bbox.h) - Math.max(ref.bbox.y, l.bbox.y);
      if (overlap > 0.5 * Math.min(ref.bbox.h, l.bbox.h)) {
        row.push(l);
        continue;
      }
    }
    rows.push([l]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.bbox.x - b.bbox.x));
}

/** Median character width, estimated from word boxes (monospace-friendly). */
export function estimateCharWidth(lines: OcrLine[]): number {
  const widths = lines.flatMap((l) => l.words.filter((w) => w.text.length >= 2).map((w) => w.bbox.w / w.text.length)).sort((a, b) => a - b);
  return widths.length ? widths[widths.length >> 1] : 0;
}

/** Leading spaces from each line's x offset relative to the left-most line (code screenshots). */
export function indentLines(lines: OcrLine[]): string[] {
  const cw = estimateCharWidth(lines);
  if (!cw || lines.length === 0) return lines.map((l) => l.text);
  const minX = Math.min(...lines.map((l) => l.bbox.x));
  return lines.map((l) => " ".repeat(Math.max(0, Math.round((l.bbox.x - minX) / cw))) + l.text);
}

export interface CleanupOptions {
  /** Map “ ” ‘ ’ to straight quotes (engine often "beautifies" straight quotes). */
  straightenQuotes?: boolean;
  /** Drop low-confidence lines made only of punctuation/box-drawing noise (UI borders, icons). */
  dropNoiseLines?: boolean;
  /** Noise threshold for dropNoiseLines (0–1). */
  noiseConfidence?: number;
}

const LIGATURES: Record<string, string> = { "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl" };

export function isNoiseLine(line: OcrLine, minConfidence: number): boolean {
  return !/[\p{L}\p{N}]/u.test(line.text) && line.confidence < minConfidence;
}

/** Text cleanup for the editable result. Never changes blocks/boxes. */
export function cleanText(text: string, opts: CleanupOptions = {}): string {
  let t = text.normalize("NFC").replace(/[ﬁﬂﬀﬃﬄ]/g, (c) => LIGATURES[c]);
  if (opts.straightenQuotes) t = t.replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'");
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

export function buildResult(args: {
  blocks: OcrBlock[];
  language: string;
  durationMs: number;
  image: { width: number; height: number };
  preprocessing: string[];
  engine: { name: string; version: string };
  rotateRadians?: number;
  options?: NormalizeOptions;
}): OcrResult {
  const o = args.options ?? {};
  const order = o.readingOrder ?? "engine";
  const noiseConf = o.cleanup?.noiseConfidence ?? 0.6;
  let lines = orderLines(args.blocks, order);
  if (o.cleanup?.dropNoiseLines) lines = lines.filter((l) => !isNoiseLine(l, noiseConf));
  const texts = o.preserveIndentation ? indentLines(lines) : lines.map((l) => l.text);
  const rawText = texts.join("\n");
  const words = lines.flatMap((l) => l.words);
  return {
    rawText,
    editedText: cleanText(rawText, o.cleanup),
    language: args.language,
    confidence: words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : undefined,
    blocks: args.blocks,
    durationMs: args.durationMs,
    image: args.image,
    readingOrder: order,
    preprocessing: args.preprocessing,
    rotateRadians: args.rotateRadians,
    engine: args.engine,
  };
}

export function lineBoxes(blocks: OcrBlock[]): BBox[] {
  return allLines(blocks).map((l) => l.bbox);
}

export { unionBox };


const yOverlap = (a: BBox, b: BBox) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5 * Math.min(a.h, b.h);
const xDisjoint = (a: BBox, b: BBox) => a.x + a.w <= b.x || b.x + b.w <= a.x;

/**
 * Spike C reading-order selector. Tesseract's block order is right for side-by-side PROSE
 * (multi-column articles, rotated text) but splits label/value rows, table cells and
 * line-number gutters into separate column blocks; top-down rows fix those.
 * Rule: keep engine order if two x-disjoint, vertically overlapping blocks both contain a
 * line of ≥ proseWords words; otherwise use top-down.
 */
export function chooseReadingOrder(blocks: OcrBlock[], proseWords = 6): "engine" | "top-down" {
  const info = blocks.map((b) => {
    const lines = b.paragraphs.flatMap((p) => p.lines);
    return { box: unionBox(lines.map((l) => l.bbox)), prose: lines.some((l) => l.words.length >= proseWords) };
  });
  for (let i = 0; i < info.length; i++)
    for (let j = i + 1; j < info.length; j++) {
      const a = info[i];
      const b = info[j];
      if (a.prose && b.prose && xDisjoint(a.box, b.box) && yOverlap(a.box, b.box)) return "engine";
    }
  return "top-down";
}
