/**
 * stitchEngine — the only API React components use for Smart Stitch (architecture §26).
 * It hides OpenCV, workers and the protocol. Nothing here uploads anything: Blobs are
 * passed to same-origin workers by structured clone.
 */
import { createWorkerClient, type RunOptions } from "@/workers/broker/worker-client";
import type { WorkerOps } from "@/workers/protocol";
import type { StitchConfigOverrides } from "./config";
import type { StitchPlan } from "./types";

export type StitchAnalysisResult = WorkerOps["stitch.analyse"]["output"];

export interface StitchEngine {
  analyse(a: Blob, b: Blob, opts?: RunOptions & { config?: StitchConfigOverrides }): Promise<StitchAnalysisResult>;
  compose(a: Blob, b: Blob, plan: StitchPlan, opts?: RunOptions & { type?: "image/png" | "image/jpeg" | "image/webp"; quality?: number }): Promise<{ blob: Blob; ms: number }>;
  dispose(): void;
}

export function createStitchEngine(): StitchEngine {
  const vision = createWorkerClient(() => new Worker(new URL("../../workers/vision.worker.ts", import.meta.url), { type: "module", name: "shotexa-vision" }));
  const image = createWorkerClient(() => new Worker(new URL("../../workers/image.worker.ts", import.meta.url), { type: "module", name: "shotexa-image" }));
  return {
    analyse: (a, b, opts = {}) => vision.run("stitch.analyse", { a, b, config: opts.config }, opts),
    compose: (a, b, plan, opts = {}) => image.run("stitch.compose", { a, b, plan, type: opts.type ?? "image/png", quality: opts.quality }, opts),
    dispose() {
      vision.terminate();
      image.terminate();
    },
  };
}
