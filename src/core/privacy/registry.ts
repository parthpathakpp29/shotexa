import type { PrivacyScanResult } from "./types";

export class PrivacyScanRegistry {
  private readonly results = new Map<string, PrivacyScanResult>();
  private readonly byAsset = new Map<string, string>();

  put(result: PrivacyScanResult): string {
    this.removeAsset(result.assetId);
    this.results.set(result.id, result);
    this.byAsset.set(result.assetId, result.id);
    return result.id;
  }
  get(id: string | null | undefined): PrivacyScanResult | undefined { return id ? this.results.get(id) : undefined; }
  forAsset(assetId: string): PrivacyScanResult | undefined { return this.get(this.byAsset.get(assetId)); }
  update(assetId: string, mutate: (result: PrivacyScanResult) => PrivacyScanResult): PrivacyScanResult | undefined {
    const result = this.forAsset(assetId); if (!result) return undefined;
    const next = mutate(result); this.results.set(next.id, next); return next;
  }
  removeAsset(assetId: string): void { const id = this.byAsset.get(assetId); if (id) this.results.delete(id); this.byAsset.delete(assetId); }
  clear(): void { this.results.clear(); this.byAsset.clear(); }
  stats(): { results: number } { return { results: this.results.size }; }
}
