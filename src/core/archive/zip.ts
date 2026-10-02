import type { BatchResult } from "@/core/batch/types";
import { MAX_BATCH_OUTPUT_BYTES } from "@/core/batch/types";
import { uniqueOutputNames } from "@/core/batch/naming";

export class ArchiveError extends Error {
  constructor(readonly code: "ZIP_EMPTY" | "ZIP_TOO_LARGE" | "ZIP_CREATE_FAILED", detail?: string) {
    super(detail ?? code);
    this.name = "ArchiveError";
  }
}

export async function createBatchZip(results: BatchResult[]): Promise<{ blob: Blob; names: string[] }> {
  if (!results.length) throw new ArchiveError("ZIP_EMPTY");
  const total = results.reduce((n, r) => n + r.bytes, 0);
  if (total > MAX_BATCH_OUTPUT_BYTES) throw new ArchiveError("ZIP_TOO_LARGE");
  const names = uniqueOutputNames(results.map((r) => r.outputName));
  try {
    // Kept out of the homepage and batch route until Download ZIP is actually requested.
    const { downloadZip } = await import("client-zip");
    const entries = results.map((r, i) => ({ name: names[i], input: r.blob, size: r.blob.size, lastModified: new Date(0) }));
    const metadata = entries.map(({ name, size }) => ({ name, size }));
    return { blob: await downloadZip(entries, { metadata }).blob(), names };
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError("ZIP_CREATE_FAILED", error instanceof Error ? error.message : undefined);
  }
}
