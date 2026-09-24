/**
 * REJECTED reading-order heuristics from Spike C, kept for reproducibility of the report
 * (see docs/spikes/SPIKE_C_OCR.md §Reading order). Not used by production code.
 */
import { unionBox } from "../../../src/core/ocr/coords";
import type { BBox, OcrBlock, OcrLine } from "../../../src/core/ocr/types";

const rowOverlap = (a: BBox, b: BBox) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5 * Math.min(a.h, b.h);
const wordCount = (l: OcrLine) => l.words.length;
const isNumericOnly = (l: OcrLine) => /^[\d.,:]+$/.test(l.text.replace(/\s+/g, ""));

/**
 * Engine order, but lines from "fragment blocks" (every line ≤ maxWords words: settings values,
 * table cells, badges, line-number gutters) are moved next to the line they share a row with.
 * Text fragments attach to the nearest row-mate on their LEFT; numeric-only fragments (line
 * numbers) attach to the row-mate on their RIGHT. Rows are emitted left→right.
 */
export function attachRowFragments(blocks: OcrBlock[], maxWords = 5): OcrLine[] {
  const entries = blocks.flatMap((b, bi) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ l, bi }))));
  const fragmentBlock = new Set(
    blocks.map((_, bi) => bi).filter((bi) => {
      const ls = entries.filter((e) => e.bi === bi);
      return ls.length > 0 && ls.every((e) => wordCount(e.l) <= maxWords);
    }),
  );
  const parent = new Map<number, number>(); // entry index → host entry index
  entries.forEach((e, i) => {
    if (!fragmentBlock.has(e.bi)) return;
    const numeric = isNumericOnly(e.l);
    let best = -1;
    let bestGap = Infinity;
    entries.forEach((h, j) => {
      if (h.bi === e.bi || !rowOverlap(h.l.bbox, e.l.bbox)) return;
      const gap = numeric ? h.l.bbox.x - (e.l.bbox.x + e.l.bbox.w) : e.l.bbox.x - (h.l.bbox.x + h.l.bbox.w);
      if (gap >= -2 && gap < bestGap) {
        bestGap = gap;
        best = j;
      }
    });
    if (best >= 0) parent.set(i, best);
  });
  // Resolve chains (A→B→C) to their root; break cycles by keeping the first.
  const root = (i: number) => {
    const seen = new Set<number>();
    while (parent.has(i) && !seen.has(i)) {
      seen.add(i);
      i = parent.get(i)!;
    }
    return i;
  };
  const groups = new Map<number, number[]>();
  entries.forEach((_, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  });
  const out: OcrLine[] = [];
  const emitted = new Set<number>();
  entries.forEach((_, i) => {
    const r = root(i);
    if (emitted.has(r)) return;
    emitted.add(r);
    for (const k of groups.get(r)!.sort((a, b) => entries[a].l.bbox.x - entries[b].l.bbox.x)) out.push(entries[k].l);
  });
  return out;
}

/**
 * EXPERIMENTAL (Spike C): split lines the engine merged across a wide gap (card grids,
 * feature columns) and order the resulting columns column-major inside each block.
 */
export function splitColumns(blocks: OcrBlock[], gapFactor = 2.5): OcrLine[] {
  const out: OcrLine[] = [];
  for (const b of blocks) {
    const segs: OcrLine[] = [];
    for (const p of b.paragraphs)
      for (const l of p.lines) {
        let cur: OcrLine["words"] = [];
        const flush = () => {
          if (!cur.length) return;
          const bbox = unionBox(cur.map((w) => w.bbox));
          segs.push({ ...l, text: cur.map((w) => w.text).join(" "), bbox, words: cur });
          cur = [];
        };
        l.words.forEach((w, i) => {
          const prev = l.words[i - 1];
          if (prev && w.bbox.x - (prev.bbox.x + prev.bbox.w) > gapFactor * l.bbox.h) flush();
          cur.push(w);
        });
        flush();
      }
    // Cluster segment x-starts into columns (within one line height).
    const cols: { x: number; segs: OcrLine[] }[] = [];
    for (const s of segs) {
      const c = cols.find((k) => Math.abs(k.x - s.bbox.x) < s.bbox.h * 1.5);
      if (c) c.segs.push(s);
      else cols.push({ x: s.bbox.x, segs: [s] });
    }
    if (cols.length > 1 && cols.every((c) => c.segs.length >= 2)) {
      cols.sort((a, b) => a.x - b.x);
      for (const c of cols) out.push(...c.segs.sort((a, b) => a.bbox.y - b.bbox.y));
    } else out.push(...segs);
  }
  return out;
}
