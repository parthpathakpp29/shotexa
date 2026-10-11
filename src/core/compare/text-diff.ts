/**
 * OCR text diff — "what visible text changed", from the existing OCR infrastructure.
 *
 * Nothing here recognises text: both sides come from `OcrResult`s produced by the one OCR
 * service (and reused from its cache when they are already there). This module only compares
 * them, and it compares exactly what OCR read — never a corrected or guessed reading.
 *
 * How it works:
 *   1. Lines are taken in OCR's reading order, with their boxes in ORIGINAL screenshot pixels.
 *   2. If both screenshots contain the same words in the same order, there is no text change
 *      to report — the text was only re-wrapped. That case is answered before anything else.
 *   3. Otherwise the two line sequences are aligned (banded Levenshtein, with a substitution
 *      cost derived from how similar the two lines are, so a reworded line pairs up as one
 *      "changed" item instead of a removal plus an addition).
 *   4. A changed line is diffed again at word level, so the result can say which words went
 *      and which arrived, and can highlight just those words in each screenshot.
 *
 * Confidence is OCR's own mean word confidence for the lines involved. Low-confidence
 * readings are reported with that number attached, never silently dropped.
 */
import type { BBox, OcrLine, OcrResult } from "@/core/ocr/types";
import { unionBox } from "@/core/ocr/coords";
import type { CompareTextChange, CompareTextChangeKind, CompareTextDiff } from "./types";

/** Band for the line alignment: lines never pair across more than this much reordering. */
const ALIGN_BAND = 60;
/** A substitution is only considered when the two lines are at least this similar. */
const MIN_LINE_SIMILARITY = 0.4;
/** At most this many changed-word boxes are used before falling back to the whole line. */
const MAX_WORD_BOXES = 6;

export interface TextLine {
  index: number;
  text: string;
  /** Whitespace-collapsed, NFC. Case and punctuation are preserved: both are real changes. */
  normalised: string;
  bbox: BBox;
  confidence: number;
  words: { text: string; normalised: string; bbox: BBox; confidence: number }[];
}

/** Split a line into comparable tokens. Whitespace only — punctuation stays with its word. */
export function tokenise(text: string): string[] {
  return text
    .normalize("NFC")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export const normaliseText = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

/** Every OCR line, in reading order, with geometry in original screenshot pixels. */
export function ocrLines(result: OcrResult | null | undefined): TextLine[] {
  if (!result) return [];
  const lines: OcrLine[] = [];
  for (const block of result.blocks) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) lines.push(line);
  return lines
    .map((line, index) => ({
      index,
      text: line.text,
      normalised: normaliseText(line.text),
      bbox: line.bbox,
      confidence: line.confidence,
      words: line.words.map((word) => ({ text: word.text, normalised: normaliseText(word.text), bbox: word.bbox, confidence: word.confidence })),
    }))
    .filter((line) => line.normalised.length > 0);
}

/** Levenshtein distance between two short strings. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const width = b.length + 1;
  let previous = new Uint32Array(width);
  let current = new Uint32Array(width);
  for (let j = 0; j < width; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j < width; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length];
}

/** 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  // A large length gap already caps the similarity below the substitution floor, so the
  // (quadratic) distance is not worth computing for obviously unrelated lines.
  if (Math.abs(a.length - b.length) / longest > 1 - MIN_LINE_SIMILARITY) return 0;
  return 1 - distance(a, b) / longest;
}

type Op = { kind: "equal" | "replace"; a: number; b: number } | { kind: "delete"; a: number } | { kind: "insert"; b: number };

/**
 * Banded sequence alignment over normalised strings. Deletions and insertions cost 1; a
 * substitution costs `2 * (1 - similarity)` plus a hair, so a pair that is less than half
 * similar is reported as a removal and an addition instead of a rewording.
 */
export function alignSequences(a: string[], b: string[], band = ALIGN_BAND): Op[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const INF = Number.POSITIVE_INFINITY;
  const cost = new Float64Array(width * (n + 1)).fill(INF);
  const from = new Uint8Array(width * (n + 1));
  const inBand = (i: number, j: number) => Math.abs(i - j) <= band + Math.abs(n - m);
  cost[0] = 0;
  for (let j = 1; j <= m; j++) if (inBand(0, j)) { cost[j] = j; from[j] = 2; }
  for (let i = 1; i <= n; i++) {
    const row = i * width;
    const prev = (i - 1) * width;
    if (inBand(i, 0)) { cost[row] = i; from[row] = 1; }
    for (let j = 1; j <= m; j++) {
      if (!inBand(i, j)) continue;
      let best = INF;
      let choice = 0;
      const deletion = cost[prev + j] + 1;
      if (deletion < best) { best = deletion; choice = 1; }
      const insertion = cost[row + j - 1] + 1;
      if (insertion < best) { best = insertion; choice = 2; }
      const same = a[i - 1] === b[j - 1];
      const sim = same ? 1 : similarity(a[i - 1], b[j - 1]);
      if (same || sim >= MIN_LINE_SIMILARITY) {
        const substitution = cost[prev + j - 1] + (same ? 0 : 2 * (1 - sim) + 0.001);
        if (substitution < best) { best = substitution; choice = same ? 3 : 4; }
      }
      cost[row + j] = best;
      from[row + j] = choice;
    }
  }

  const ops: Op[] = [];
  let i = n;
  let j = m;
  let guard = n + m + 2;
  while ((i > 0 || j > 0) && guard-- > 0) {
    const choice = from[i * width + j];
    if (choice === 3 || choice === 4) {
      ops.push({ kind: choice === 3 ? "equal" : "replace", a: i - 1, b: j - 1 });
      i--;
      j--;
    } else if (choice === 1 || (choice === 0 && j === 0)) {
      ops.push({ kind: "delete", a: i - 1 });
      i--;
    } else {
      ops.push({ kind: "insert", b: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

/** Word-level detail for one reworded line. */
export function diffWords(before: string, after: string): { removed: string[]; added: string[]; removedIndices: number[]; addedIndices: number[] } {
  const a = tokenise(before);
  const b = tokenise(after);
  const ops = alignSequences(a, b, Math.max(16, Math.max(a.length, b.length)));
  const removed: string[] = [];
  const added: string[] = [];
  const removedIndices: number[] = [];
  const addedIndices: number[] = [];
  for (const op of ops) {
    if (op.kind === "delete") {
      removed.push(a[op.a]);
      removedIndices.push(op.a);
    } else if (op.kind === "insert") {
      added.push(b[op.b]);
      addedIndices.push(op.b);
    } else if (op.kind === "replace") {
      removed.push(a[op.a]);
      added.push(b[op.b]);
      removedIndices.push(op.a);
      addedIndices.push(op.b);
    }
  }
  return { removed, added, removedIndices, addedIndices };
}

const meanConfidence = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

function wordBoxes(line: TextLine | undefined, indices: number[]): BBox[] {
  if (!line) return [];
  if (!indices.length || indices.length > MAX_WORD_BOXES) return [line.bbox];
  const boxes = indices.map((index) => line.words[index]?.bbox).filter((box): box is BBox => !!box);
  return boxes.length ? boxes : [line.bbox];
}

let counter = 0;
const changeId = () => `tc${(++counter).toString(36)}`;

/** Reset the change-id counter — tests only, so ids are stable within a run. */
export function resetTextChangeIds(): void {
  counter = 0;
}

export interface TextDiffOptions {
  languageA?: string;
  languageB?: string;
  confidenceA?: number;
  confidenceB?: number;
  startedAt?: number;
}

/** Compare the visible text of two OCR results. Pure: no engine, no network, no cache. */
export function diffTextLines(linesA: TextLine[], linesB: TextLine[], options: TextDiffOptions = {}): CompareTextDiff {
  const started = options.startedAt ?? 0;
  const base = {
    languageA: options.languageA ?? "",
    languageB: options.languageB ?? "",
    confidenceA: options.confidenceA,
    confidenceB: options.confidenceB,
    durationMs: started ? Math.max(0, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started)) : 0,
  };

  // Re-wrapped but otherwise identical text is not a text change, and saying it is would be
  // a false positive on every responsive screenshot pair.
  const wordsA = linesA.flatMap((line) => tokenise(line.normalised));
  const wordsB = linesB.flatMap((line) => tokenise(line.normalised));
  if (wordsA.length > 0 && wordsA.length === wordsB.length && wordsA.every((word, index) => word === wordsB[index])) {
    return { changes: [], added: 0, removed: 0, changed: 0, unchangedLines: Math.min(linesA.length, linesB.length), ...base };
  }

  const ops = alignSequences(
    linesA.map((line) => line.normalised),
    linesB.map((line) => line.normalised),
  );
  const changes: CompareTextChange[] = [];
  let unchangedLines = 0;
  for (const op of ops) {
    if (op.kind === "equal") {
      unchangedLines++;
      continue;
    }
    if (op.kind === "delete") {
      const line = linesA[op.a];
      changes.push({
        id: changeId(),
        kind: "removed",
        before: line.text,
        removedWords: tokenise(line.normalised),
        regionsA: [line.bbox],
        regionsB: [],
        confidence: Math.round(meanConfidence(line.words.map((word) => word.confidence)) * 1000) / 1000 || line.confidence,
      });
      continue;
    }
    if (op.kind === "insert") {
      const line = linesB[op.b];
      changes.push({
        id: changeId(),
        kind: "added",
        after: line.text,
        addedWords: tokenise(line.normalised),
        regionsA: [],
        regionsB: [line.bbox],
        confidence: Math.round(meanConfidence(line.words.map((word) => word.confidence)) * 1000) / 1000 || line.confidence,
      });
      continue;
    }
    const lineA = linesA[op.a];
    const lineB = linesB[op.b];
    const words = diffWords(lineA.normalised, lineB.normalised);
    changes.push({
      id: changeId(),
      kind: "changed",
      before: lineA.text,
      after: lineB.text,
      removedWords: words.removed,
      addedWords: words.added,
      regionsA: wordBoxes(lineA, words.removedIndices),
      regionsB: wordBoxes(lineB, words.addedIndices),
      confidence: Math.round(meanConfidence([...lineA.words, ...lineB.words].map((word) => word.confidence)) * 1000) / 1000,
    });
  }

  const count = (kind: CompareTextChangeKind) => changes.filter((change) => change.kind === kind).length;
  return { changes, added: count("added"), removed: count("removed"), changed: count("changed"), unchangedLines, ...base };
}

/** Compare two OCR results directly. */
export function diffOcrText(a: OcrResult, b: OcrResult, startedAt?: number): CompareTextDiff {
  return diffTextLines(ocrLines(a), ocrLines(b), {
    languageA: a.language,
    languageB: b.language,
    confidenceA: a.confidence,
    confidenceB: b.confidence,
    startedAt,
  });
}

/** One changed item as plain text, so the diff never depends on colour alone. */
export function textChangeLines(change: CompareTextChange): string[] {
  const out: string[] = [];
  if (change.before !== undefined) out.push(`- ${change.before}`);
  if (change.after !== undefined) out.push(`+ ${change.after}`);
  return out;
}

/** The union of a change's boxes on one side, for centring the view on it. */
export function textChangeBox(change: CompareTextChange, side: "a" | "b"): BBox | null {
  const boxes = side === "a" ? change.regionsA : change.regionsB;
  return boxes.length ? unionBox(boxes) : null;
}
