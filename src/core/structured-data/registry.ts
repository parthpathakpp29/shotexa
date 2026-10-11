import type { StructuredExtraction } from "./types";
export class StructuredResultRegistry {
  private readonly byAsset = new Map<string, StructuredExtraction>();
  put(result: StructuredExtraction): StructuredExtraction { this.byAsset.set(result.assetId, result); return result; }
  forAsset(assetId: string): StructuredExtraction | undefined { return this.byAsset.get(assetId); }
  removeAsset(assetId: string): void { this.byAsset.delete(assetId); }
  clear(): void { this.byAsset.clear(); }
  stats(): { results: number } { return { results: this.byAsset.size }; }
}
