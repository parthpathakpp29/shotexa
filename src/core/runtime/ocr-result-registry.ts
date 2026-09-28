/**
 * Heavy OCR output lives beside image Blobs, outside Zustand. A result can contain
 * thousands of word/line boxes, so the store keeps only its opaque id and editable text.
 */
import type { OcrResult } from "@/core/ocr/types";

export class OcrResultRegistry {
  private readonly results = new Map<string, OcrResult>();
  private readonly byAsset = new Map<string, string>();

  put(assetId: string, result: OcrResult): string {
    this.removeAsset(assetId);
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ocr${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    this.results.set(id, result);
    this.byAsset.set(assetId, id);
    return id;
  }

  get(id: string | null | undefined): OcrResult | undefined {
    return id ? this.results.get(id) : undefined;
  }

  forAsset(assetId: string): OcrResult | undefined {
    return this.get(this.byAsset.get(assetId));
  }

  removeAsset(assetId: string): void {
    const id = this.byAsset.get(assetId);
    if (id) this.results.delete(id);
    this.byAsset.delete(assetId);
  }

  clear(): void {
    this.results.clear();
    this.byAsset.clear();
  }

  stats(): { results: number } {
    return { results: this.results.size };
  }
}
