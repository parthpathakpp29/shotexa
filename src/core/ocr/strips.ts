/**
 * Long-screenshot OCR in overlapping horizontal strips (bounded memory, Spike B budgets).
 * Each strip is recognised separately with an OcrTransform offset; lines in the overlap
 * are kept only from the strip whose "own" region contains the line centre, so every
 * line comes from a strip in which it is fully visible (overlap ≥ 2 × max line height).
 */
import { unionBox } from "./coords";
import type { OcrBlock, OcrResult } from "./types";

export interface Strip {
  y: number;
  height: number;
  /** Original-image rows this strip is authoritative for: [ownFrom, ownTo). */
  ownFrom: number;
  ownTo: number;
}

export function planOcrStrips(height: number, stripHeight: number, overlap: number): Strip[] {
  if (height <= stripHeight) return [{ y: 0, height, ownFrom: 0, ownTo: height }];
  const strips: Strip[] = [];
  const stride = stripHeight - overlap;
  for (let y = 0; ; y += stride) {
    const h = Math.min(stripHeight, height - y);
    strips.push({ y, height: h, ownFrom: 0, ownTo: 0 });
    if (y + h >= height) break;
  }
  for (let i = 0; i < strips.length; i++) {
    const s = strips[i];
    const prev = strips[i - 1];
    const next = strips[i + 1];
    // Boundary = middle of the overlap with the neighbour.
    s.ownFrom = prev ? Math.round((s.y + prev.y + prev.height) / 2) : 0;
    s.ownTo = next ? Math.round((next.y + s.y + s.height) / 2) : height;
  }
  return strips;
}

/** Merge per-strip results (already in ORIGINAL coordinates) into one result. */
export function mergeStripResults(parts: { strip: Strip; result: OcrResult }[], image: { width: number; height: number }): Pick<OcrResult, "blocks" | "durationMs" | "confidence"> {
  const blocks: OcrBlock[] = [];
  let duration = 0;
  for (const { strip, result } of parts) {
    duration += result.durationMs;
    for (const b of result.blocks) {
      const paragraphs = b.paragraphs
        .map((p) => ({
          ...p,
          lines: p.lines.filter((l) => {
            const cy = l.bbox.y + l.bbox.h / 2;
            return cy >= strip.ownFrom && cy < strip.ownTo;
          }),
        }))
        .filter((p) => p.lines.length > 0)
        .map((p) => ({ ...p, bbox: unionBox(p.lines.map((l) => l.bbox)) }));
      if (paragraphs.length) blocks.push({ ...b, paragraphs, bbox: unionBox(paragraphs.map((p) => p.bbox)) });
    }
  }
  const words = blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
  void image;
  return {
    blocks,
    durationMs: duration,
    confidence: words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : undefined,
  };
}
