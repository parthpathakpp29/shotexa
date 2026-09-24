/// <reference lib="webworker" />
/**
 * Vision worker: owns OpenCV.js (lazy-loaded on first job) and stitch analysis.
 */
import { analyseStitch } from "@/core/stitch/analyse";
import { createOpenCvMatcher, type OpenCvLike } from "@/core/stitch/opencv-matcher";
import { createBitmapSource } from "@/core/stitch/sources";
import { StitchError } from "@/core/stitch/types";
import vendorAssets from "@/config/vendor-assets.json";
import { serveWorker, type WorkerErrorCode } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let cvPromise: Promise<OpenCvLike> | null = null;

function loadOpenCv(): Promise<OpenCvLike> {
  cvPromise ??= (async () => {
    // Self-hosted, versioned static asset (not bundled). Fetched only on the first stitch
    // job. The UMD build assigns `globalThis.cv` (a Promise resolving to the module).
    await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ new URL(vendorAssets.opencv.url, self.location.origin).href);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cv: any = (globalThis as any).cv;
    if (!cv) throw new Error("cv global missing");
    if (cv instanceof Promise) return (await cv) as OpenCvLike;
    if (cv.Mat) return cv as OpenCvLike;
    await new Promise<void>((resolve) => (cv.onRuntimeInitialized = () => resolve()));
    return cv as OpenCvLike;
  })().catch(() => {
    cvPromise = null;
    throw new StitchError("VISION_ENGINE_LOAD_FAILED");
  });
  return cvPromise;
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new StitchError("DECODE_FAILED");
  }
}

serveWorker(
  self,
  {
    "stitch.analyse": async ({ a, b, config }, ctx) => {
      const tLoad = performance.now();
      const matcher = createOpenCvMatcher(await loadOpenCv());
      const engineLoadMs = performance.now() - tLoad;
      ctx.progress(0.1, "engine");

      const tDecode = performance.now();
      const [bmA, bmB] = await Promise.all([decode(a), decode(b)]);
      const decodeMs = performance.now() - tDecode;
      try {
        const result = await analyseStitch(createBitmapSource(bmA), createBitmapSource(bmB), matcher, {
          config,
          signal: ctx.signal,
          onProgress: (p, stage) => ctx.progress(0.1 + p * 0.9, stage),
        });
        return { ...result, engineLoadMs: Math.round(engineLoadMs), decodeMs: Math.round(decodeMs) };
      } finally {
        bmA.close();
        bmB.close();
      }
    },
  },
  toCode,
);

function toCode(err: unknown): WorkerErrorCode {
  if (err instanceof StitchError) return err.code;
  if (err instanceof RangeError) return "MEMORY_PRESSURE";
  return "INTERNAL";
}
