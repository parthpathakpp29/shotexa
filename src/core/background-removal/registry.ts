import { applyStrokes } from "./mask";
import type { MaskStroke, SegmentationResult } from "./types";

interface Entry { result: SegmentationResult; strokes: MaskStroke[]; future: MaskStroke[]; }

export class BackgroundMaskRegistry {
  #entries = new Map<string, Entry>();

  put(assetId: string, result: SegmentationResult) { this.#entries.set(assetId, { result, strokes: [], future: [] }); }
  get(assetId: string) { return this.#entries.get(assetId); }
  commit(assetId: string, stroke: MaskStroke) { const entry = this.#entries.get(assetId); if (!entry || !stroke.points.length) return false; entry.strokes.push(stroke); entry.future = []; return true; }
  undo(assetId: string) { const entry = this.#entries.get(assetId); const stroke = entry?.strokes.pop(); if (!entry || !stroke) return false; entry.future.push(stroke); return true; }
  redo(assetId: string) { const entry = this.#entries.get(assetId); const stroke = entry?.future.pop(); if (!entry || !stroke) return false; entry.strokes.push(stroke); return true; }
  canUndo(assetId: string) { return !!this.#entries.get(assetId)?.strokes.length; }
  canRedo(assetId: string) { return !!this.#entries.get(assetId)?.future.length; }
  materialize(assetId: string) { const entry = this.#entries.get(assetId); return entry ? applyStrokes(entry.result.mask, entry.result.width, entry.result.height, entry.strokes) : null; }
  remove(assetId: string) { this.#entries.delete(assetId); }
  clear() { this.#entries.clear(); }
  stats() { let bytes = 0, strokes = 0; for (const entry of this.#entries.values()) { bytes += entry.result.mask.byteLength; strokes += entry.strokes.length + entry.future.length; } return { entries: this.#entries.size, bytes, strokes }; }
}
