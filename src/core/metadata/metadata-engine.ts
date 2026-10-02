/**
 * MetadataEngine — the only metadata API UI code uses (architecture §26, §36).
 *
 *   inspect(file) → what was found          (no pixel decode)
 *   clean(file)   → cleaned Blob + report    (container-level; verified before returning)
 *   verify(blob)  → independent re-check     (optionally against the original)
 *
 * Runs in the existing Image Worker by default (malformed/huge metadata can't freeze the UI);
 * "main" runs the same code on the page (used by the spike to compare).
 */
import { createWorkerClient, type WorkerJobError } from "@/workers/broker/worker-client";
import { inspectBytes, verifyBytes } from "./engine-core";
import { MetadataError, type MetadataErrorCode } from "./errors";
import { runMetadataClean, runMetadataInspect, type MetadataCleanRun, type MetadataInspectRun } from "./run";
import type { MetadataPolicy, MetadataVerification } from "./types";

export interface MetadataEngineOptions {
  mode?: "worker" | "main";
}

export function createMetadataEngine(opts: MetadataEngineOptions = {}) {
  const mode = opts.mode ?? "worker";
  const worker = mode === "worker" ? createWorkerClient(() => new Worker(new URL("../../workers/image.worker.ts", import.meta.url), { type: "module", name: "shotexa-image" })) : null;
  const mapErr = (e: unknown): MetadataError => {
    if (e instanceof MetadataError) return e;
    const code = (e as WorkerJobError).code;
    if (typeof code === "string" && code.startsWith("METADATA_")) return new MetadataError(code as MetadataErrorCode);
    return new MetadataError("METADATA_PARSE_FAILED", String(code ?? e));
  };
  const nameOf = (f: Blob) => (f as File).name ?? "";

  return {
    mode,
    async inspect(file: Blob): Promise<MetadataInspectRun> {
      try {
        return worker ? await worker.run("metadata.inspect", { image: file, name: nameOf(file), type: file.type }) : await runMetadataInspect(file, nameOf(file), file.type);
      } catch (e) {
        throw mapErr(e);
      }
    },
    async clean(file: Blob, policy?: Partial<MetadataPolicy>): Promise<MetadataCleanRun> {
      try {
        return worker ? await worker.run("metadata.clean", { image: file, name: nameOf(file), type: file.type, policy }) : await runMetadataClean(file, nameOf(file), file.type, policy);
      } catch (e) {
        throw mapErr(e);
      }
    },
    /** Independent verification of any blob (e.g. a Redact/Safe Share export). Main thread: cheap, no decode. */
    async verify(output: Blob, o: { original?: Blob; policy?: Partial<MetadataPolicy> } = {}): Promise<MetadataVerification> {
      const out = new Uint8Array(await output.arrayBuffer());
      const orig = o.original ? new Uint8Array(await o.original.arrayBuffer()) : undefined;
      return verifyBytes(out, { original: orig, policy: o.policy });
    },
    /** Synchronous inspection of bytes already in memory (e.g. a fresh canvas export). */
    inspectBytes,
    dispose() {
      worker?.terminate();
    },
  };
}

export type ShotexaMetadataEngine = ReturnType<typeof createMetadataEngine>;
