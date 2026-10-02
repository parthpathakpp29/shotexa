import type { BatchResult } from "@/core/batch/types";

/** Encoded batch outputs live here, never in Zustand. Owns and revokes download URLs. */
export class BatchResultRegistry {
  private readonly results = new Map<string, BatchResult>();
  private readonly urls = new Map<string, string>();

  put(result: BatchResult): void {
    this.remove(result.id);
    this.results.set(result.id, result);
  }
  get(id: string): BatchResult | undefined { return this.results.get(id); }
  list(ids?: string[]): BatchResult[] {
    return ids ? ids.flatMap((id) => { const r = this.results.get(id); return r ? [r] : []; }) : [...this.results.values()];
  }
  objectUrl(id: string): string | undefined {
    const result = this.results.get(id);
    if (!result) return undefined;
    let url = this.urls.get(id);
    if (!url) { url = URL.createObjectURL(result.blob); this.urls.set(id, url); }
    return url;
  }
  remove(id: string): void {
    const url = this.urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(id);
    this.results.delete(id);
  }
  removeSource(sourceId: string): void {
    for (const result of this.results.values()) {
      if (result.sourceId === sourceId) this.remove(result.id);
    }
  }
  clear(): void { for (const id of [...this.results.keys()]) this.remove(id); }
  stats() { return { results: this.results.size, urls: this.urls.size, bytes: this.list().reduce((n, r) => n + r.bytes, 0) }; }
}
