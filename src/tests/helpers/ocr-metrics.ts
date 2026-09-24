/**
 * OCR accuracy metrics for the Spike C benchmark.
 *
 * Normalisation (documented in the report, applied identically to truth and OCR):
 *  - strict:  NFC, emoji removed (Tesseract has no emoji model — counted separately),
 *             all whitespace runs → one space, trimmed. Case and punctuation preserved.
 *  - lenient: strict + curly quotes → straight, en/em dashes → "-", "…" → "...".
 * Nothing else is forgiven: case, punctuation, symbols and digits count as errors.
 */
import { iou } from "@/core/ocr/coords";
import type { BBox, OcrLine } from "@/core/ocr/types";

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu;

export function normStrict(s: string): string {
  return s.normalize("NFC").replace(EMOJI, "").replace(/\s+/g, " ").trim();
}
export function normLenient(s: string): string {
  return normStrict(s).replace(/[“”„″]/g, '"').replace(/[‘’‚′]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...");
}

/** Levenshtein distance with alignment ops over arrays (chars or words). */
export function align<T>(a: T[], b: T[]): { distance: number; ops: ("=" | "S" | "D" | "I")[]; pairs: [number, number][] } {
  const n = a.length;
  const m = b.length;
  const W = m + 1;
  const d = new Uint32Array((n + 1) * W);
  for (let i = 0; i <= n; i++) d[i * W] = i;
  for (let j = 0; j <= m; j++) d[j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i * W + j] = Math.min(d[(i - 1) * W + j] + 1, d[i * W + j - 1] + 1, d[(i - 1) * W + j - 1] + c);
    }
  }
  const ops: ("=" | "S" | "D" | "I")[] = [];
  const pairs: [number, number][] = []; // (index in a, index in b or -1)
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i * W + j] === d[(i - 1) * W + j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.push(a[i - 1] === b[j - 1] ? "=" : "S");
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (i > 0 && d[i * W + j] === d[(i - 1) * W + j] + 1) {
      ops.push("D");
      pairs.push([i - 1, -1]);
      i--;
    } else {
      ops.push("I");
      j--;
    }
  }
  return { distance: d[n * W + m], ops: ops.reverse(), pairs: pairs.reverse() };
}

export function cer(truth: string, ocr: string): number {
  const t = [...truth];
  if (!t.length) return ocr.length ? 1 : 0;
  return align(t, [...ocr]).distance / t.length;
}

export function wer(truth: string, ocr: string): number {
  const t = truth.split(" ").filter(Boolean);
  if (!t.length) return 0;
  return align(t, ocr.split(" ").filter(Boolean)).distance / t.length;
}

/** Order-independent word recall/precision (multiset). */
export function bagOfWords(truth: string, ocr: string) {
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const w of s.split(" ").filter(Boolean)) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  };
  const t = count(truth);
  const o = count(ocr);
  let hit = 0;
  let tTotal = 0;
  let oTotal = 0;
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [w, c] of t) {
    tTotal += c;
    const k = Math.min(c, o.get(w) ?? 0);
    hit += k;
    for (let i = k; i < c; i++) missing.push(w);
  }
  for (const [w, c] of o) {
    oTotal += c;
    for (let i = Math.min(c, t.get(w) ?? 0); i < c; i++) extra.push(w);
  }
  return { recall: tTotal ? hit / tTotal : 1, precision: oTotal ? hit / oTotal : 1, missing, extra };
}

export const SYMBOLS = new Set([..."{}[]()<>=/\\_-+*&|!?:;.,'\"`%#$@~^"]);

/** Accuracy on symbol/punctuation characters of the truth, via the character alignment. */
export function symbolAccuracy(truth: string, ocr: string) {
  const t = [...truth];
  const o = [...ocr];
  const { pairs } = align(t, o);
  let total = 0;
  let ok = 0;
  const perSymbol: Record<string, { total: number; ok: number }> = {};
  for (const [ti, oi] of pairs) {
    const ch = t[ti];
    if (!SYMBOLS.has(ch)) continue;
    total++;
    const good = oi >= 0 && o[oi] === ch;
    if (good) ok++;
    perSymbol[ch] ??= { total: 0, ok: 0 };
    perSymbol[ch].total++;
    if (good) perSymbol[ch].ok++;
  }
  return { total, accuracy: total ? ok / total : 1, perSymbol };
}

export interface LineMetrics {
  exact: number;
  near: number;
  missing: number;
  hallucinated: number;
  total: number;
  /** Fraction of consecutive truth-line pairs whose matched OCR lines keep their order. */
  orderScore: number;
  hallucinatedLines: string[];
  missingLines: string[];
}

/** Match each truth line to its best OCR line (lenient CER). */
export function lineMetrics(truthLines: string[], ocrLines: string[], nearCer = 0.05, missCer = 0.5): LineMetrics {
  const T = truthLines.map(normLenient).filter(Boolean);
  const O = ocrLines.map(normLenient).filter(Boolean);
  const usedO = new Set<number>();
  const match: number[] = [];
  let exact = 0;
  let near = 0;
  let missing = 0;
  const missingLines: string[] = [];
  for (const t of T) {
    let best = -1;
    let bestCer = Infinity;
    for (let j = 0; j < O.length; j++) {
      if (usedO.has(j)) continue;
      if (Math.abs(O[j].length - t.length) > t.length * 0.8 + 3) continue;
      const c = cer(t, O[j]);
      if (c < bestCer) {
        bestCer = c;
        best = j;
      }
    }
    if (best >= 0 && bestCer <= missCer) {
      usedO.add(best);
      match.push(best);
      if (bestCer === 0) exact++;
      else if (bestCer <= nearCer) near++;
    } else {
      match.push(-1);
      missing++;
      missingLines.push(t);
    }
  }
  const matched = match.filter((m) => m >= 0);
  let inOrder = 0;
  for (let i = 1; i < matched.length; i++) if (matched[i] > matched[i - 1]) inOrder++;
  const hallucinatedLines = O.filter((_, j) => !usedO.has(j));
  return {
    exact,
    near,
    missing,
    hallucinated: hallucinatedLines.length,
    total: T.length,
    orderScore: matched.length > 1 ? inOrder / (matched.length - 1) : 1,
    hallucinatedLines,
    missingLines,
  };
}

/** Word-box accuracy: greedy match of identical words by IoU. */
export function boxMetrics(truth: { text: string; box: [number, number, number, number] }[], ocrLines: OcrLine[]) {
  const ocrWords = ocrLines.flatMap((l) => l.words);
  const used = new Set<number>();
  const ious: number[] = [];
  const xIous: number[] = [];
  let centreInside = 0;
  for (const tw of truth) {
    const tb: BBox = { x: tw.box[0], y: tw.box[1], w: tw.box[2], h: tw.box[3] };
    let best = -1;
    let bestIou = 0;
    for (let j = 0; j < ocrWords.length; j++) {
      if (used.has(j) || normLenient(ocrWords[j].text) !== normLenient(tw.text)) continue;
      const v = iou(tb, ocrWords[j].bbox);
      if (v > bestIou) {
        bestIou = v;
        best = j;
      }
    }
    if (best >= 0) {
      used.add(best);
      ious.push(bestIou);
      const ob = ocrWords[best].bbox;
      const ix = Math.max(0, Math.min(tb.x + tb.w, ob.x + ob.w) - Math.max(tb.x, ob.x));
      xIous.push(ix / (Math.max(tb.x + tb.w, ob.x + ob.w) - Math.min(tb.x, ob.x) || 1));
      const cx = ob.x + ob.w / 2;
      const cy = ob.y + ob.h / 2;
      if (cx >= tb.x && cx <= tb.x + tb.w && cy >= tb.y && cy <= tb.y + tb.h) centreInside++;
    }
  }
  ious.sort((a, b) => a - b);
  return {
    matchedWords: ious.length,
    meanIou: ious.length ? ious.reduce((s, v) => s + v, 0) / ious.length : 0,
    medianIou: ious.length ? ious[ious.length >> 1] : 0,
    fractionIouAbove05: ious.length ? ious.filter((v) => v >= 0.5).length / ious.length : 0,
    /** Horizontal-extent IoU: what matters for placing invisible PDF text. */
    meanXIou: xIous.length ? xIous.reduce((s, v) => s + v, 0) / xIous.length : 0,
    /** Fraction of matched OCR word centres inside the true word box. */
    centreInsideRate: ious.length ? centreInside / ious.length : 0,
    /** Fraction of truth words found with identical text (the rest can't be box-scored). */
    truthWords: truth.length,
  };
}

export interface BoxedLine {
  text: string;
  bbox: BBox;
}

/** Join lines that share a visual row (vertical overlap > 50% of the smaller height), left→right. */
export function toRows(lines: BoxedLine[]): string[] {
  const sorted = [...lines].sort((a, b) => a.bbox.y + a.bbox.h / 2 - (b.bbox.y + b.bbox.h / 2));
  const rows: BoxedLine[][] = [];
  for (const l of sorted) {
    const row = rows.at(-1);
    const ref = row?.[0];
    if (ref && Math.min(ref.bbox.y + ref.bbox.h, l.bbox.y + l.bbox.h) - Math.max(ref.bbox.y, l.bbox.y) > 0.5 * Math.min(ref.bbox.h, l.bbox.h)) row!.push(l);
    else rows.push([l]);
  }
  return rows.map((r) => r.sort((a, b) => a.bbox.x - b.bbox.x).map((l) => l.text).join(" "));
}

/**
 * Row-level line accuracy: truth and OCR are both regrouped into visual rows before
 * matching, so "Date: 2026-03-14 … Time: 08:42" counts once whether the engine joined
 * or split it. Order-independent (reading order is scored separately).
 */
export function rowMetrics(truth: BoxedLine[], ocr: BoxedLine[]) {
  const m = lineMetrics(toRows(truth), toRows(ocr));
  return { exact: m.exact, near: m.near, missing: m.missing, hallucinated: m.hallucinated, total: m.total, missingRows: m.missingLines.slice(0, 6), hallucinatedRows: m.hallucinatedLines.slice(0, 6) };
}
