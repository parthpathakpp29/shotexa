/**
 * AssetRegistry — heavy runtime resources, OUTSIDE Zustand (architecture §22):
 * original/artifact Blobs, downscaled preview ImageBitmaps and object URLs.
 *
 * Lifecycle rules (Spike B): close bitmaps and revoke object URLs as soon as an asset is
 * removed or replaced; never hold full-resolution decoded pixels here.
 */
import type { FileId } from "./types";

export class AssetRegistry {
  #blobs = new Map<FileId, Blob>();
  #previews = new Map<FileId, ImageBitmap>();
  #urls = new Map<FileId, string>();

  put(id: FileId, blob: Blob): void {
    this.remove(id);
    this.#blobs.set(id, blob);
  }

  blob(id: FileId): Blob | undefined {
    return this.#blobs.get(id);
  }

  has(id: FileId): boolean {
    return this.#blobs.has(id);
  }

  setPreview(id: FileId, bitmap: ImageBitmap): void {
    if (!this.#blobs.has(id)) {
      bitmap.close(); // asset removed while its preview was being generated
      return;
    }
    this.#previews.get(id)?.close();
    this.#previews.set(id, bitmap);
  }

  preview(id: FileId): ImageBitmap | undefined {
    return this.#previews.get(id);
  }

  /** Lazily created object URL for downloads/`<img>`; revoked on remove. */
  objectUrl(id: FileId): string | undefined {
    const blob = this.#blobs.get(id);
    if (!blob) return undefined;
    let url = this.#urls.get(id);
    if (!url) {
      url = URL.createObjectURL(blob);
      this.#urls.set(id, url);
    }
    return url;
  }

  remove(id: FileId): void {
    this.#previews.get(id)?.close();
    this.#previews.delete(id);
    const url = this.#urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.#urls.delete(id);
    this.#blobs.delete(id);
  }

  clear(): void {
    for (const id of [...this.#blobs.keys()]) this.remove(id);
  }

  /** Diagnostics for tests (counts only — never contents). */
  stats() {
    let bytes = 0;
    for (const b of this.#blobs.values()) bytes += b.size;
    return { blobs: this.#blobs.size, previews: this.#previews.size, urls: this.#urls.size, bytes };
  }
}
