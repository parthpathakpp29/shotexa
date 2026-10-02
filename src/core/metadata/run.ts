/**
 * Blob-level metadata runs (same code in the Image Worker and on the main thread):
 * read bytes once → validate (extension + MIME + magic) → inspect / clean / verify.
 * Never decodes pixels. Timings are local diagnostics.
 */
import { cleanBytes, inspectBytes, validateMetadataInput, verifyBytes } from "./engine-core";
import { MetadataError } from "./errors";
import type { MetadataCleanResult, MetadataInspection, MetadataPolicy, MetadataVerification } from "./types";

export interface MetadataInspectRun {
  inspection: MetadataInspection;
  ms: { read: number; inspect: number };
}

export interface MetadataCleanRun {
  /** Cleaned file, or null when nothing needed removing (use the original). */
  output: Blob | null;
  changed: boolean;
  before: MetadataInspection;
  removed: MetadataCleanResult["removed"];
  rewritten: MetadataCleanResult["rewritten"];
  preserved: MetadataCleanResult["preserved"];
  verification: MetadataVerification;
  inputBytes: number;
  outputBytes: number;
  ms: { read: number; clean: number; verify: number; total: number };
}

const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

async function read(image: Blob, name = "", type = image.type): Promise<Uint8Array> {
  const head = new Uint8Array(await image.slice(0, 16).arrayBuffer());
  validateMetadataInput(name, type, head);
  return new Uint8Array(await image.arrayBuffer());
}

export async function runMetadataInspect(image: Blob, name?: string, type?: string): Promise<MetadataInspectRun> {
  const t0 = performance.now();
  const bytes = await read(image, name, type);
  const t1 = performance.now();
  const inspection = inspectBytes(bytes);
  return { inspection, ms: { read: t1 - t0, inspect: performance.now() - t1 } };
}

export async function runMetadataClean(image: Blob, name?: string, type?: string, policy?: Partial<MetadataPolicy>): Promise<MetadataCleanRun> {
  const t0 = performance.now();
  const bytes = await read(image, name, type);
  const t1 = performance.now();
  const r = cleanBytes(bytes, policy);
  const t2 = performance.now();
  // Mandatory: the output is re-parsed and checked against the original (payload, dimensions,
  // preserved elements) before it is handed back. A failing output is never returned.
  const verification = verifyBytes(r.output, { original: bytes, policy });
  const t3 = performance.now();
  if (!verification.passed) throw new MetadataError(verification.outputValid ? "METADATA_VERIFICATION_FAILED" : "METADATA_OUTPUT_INVALID", verification.problems.join("; "));
  return {
    output: r.changed ? new Blob([r.output as Uint8Array<ArrayBuffer>], { type: MIME[r.before.format] }) : null,
    changed: r.changed,
    before: r.before,
    removed: r.removed,
    rewritten: r.rewritten,
    preserved: r.preserved,
    verification,
    inputBytes: bytes.length,
    outputBytes: r.output.length,
    ms: { read: t1 - t0, clean: t2 - t1, verify: t3 - t2, total: t3 - t0 },
  };
}
