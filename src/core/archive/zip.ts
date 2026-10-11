import type { BatchResult } from "@/core/batch/types";
import { MAX_BATCH_OUTPUT_BYTES } from "@/core/batch/types";
import { uniqueOutputNames } from "@/core/batch/naming";

export class ArchiveError extends Error {
  constructor(readonly code: "ZIP_EMPTY" | "ZIP_TOO_LARGE" | "ZIP_CREATE_FAILED", detail?: string) {
    super(detail ?? code);
    this.name = "ArchiveError";
  }
}

export interface ArchiveEntry {
  name: string;
  input: Blob | string;
  size?: number;
}

/** Generic local ZIP creation shared by Batch and workflow packages. */
export async function createZip(entries: ArchiveEntry[]): Promise<{ blob: Blob; names: string[] }> {
  if (!entries.length) throw new ArchiveError("ZIP_EMPTY");
  const normalised = entries.map((entry) => {
    const input = typeof entry.input === "string" ? new Blob([entry.input], { type: "text/plain;charset=utf-8" }) : entry.input;
    return { name: entry.name, input, size: entry.size ?? input.size, lastModified: new Date(0) };
  });
  const total = normalised.reduce((sum, entry) => sum + entry.size, 0);
  if (total > MAX_BATCH_OUTPUT_BYTES) throw new ArchiveError("ZIP_TOO_LARGE");
  const names = uniqueOutputNames(normalised.map((entry) => entry.name));
  try {
    const { downloadZip } = await import("client-zip");
    const files = normalised.map((entry, index) => ({ ...entry, name: names[index] }));
    const metadata = files.map(({ name, size }) => ({ name, size }));
    return { blob: await downloadZip(files, { metadata }).blob(), names };
  } catch (error) {
    throw new ArchiveError("ZIP_CREATE_FAILED", error instanceof Error ? error.message : undefined);
  }
}

export async function createBatchZip(results: BatchResult[]): Promise<{ blob: Blob; names: string[] }> {
  if (!results.length) throw new ArchiveError("ZIP_EMPTY");
  const total = results.reduce((n, r) => n + r.bytes, 0);
  if (total > MAX_BATCH_OUTPUT_BYTES) throw new ArchiveError("ZIP_TOO_LARGE");
  const names = uniqueOutputNames(results.map((r) => r.outputName));
  return createZip(results.map((result, index) => ({ name: names[index], input: result.blob, size: result.blob.size })));
}
