/// <reference lib="webworker" />
/**
 * Vision worker: owns OpenCV.js (lazy-loaded on first job) and stitch analysis.
 */
import { analyseStitch } from "@/core/stitch/analyse";
import { loadOpenCv } from "@/core/stitch/opencv-loader";
import { createOpenCvMatcher } from "@/core/stitch/opencv-matcher";
import { createBitmapSource, createGraySource } from "@/core/stitch/sources";
import { StitchError } from "@/core/stitch/types";
import { serveWorker, type WorkerErrorCode } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new StitchError("DECODE_FAILED");
  }
}

async function engine() {
  const t = performance.now();
  const matcher = createOpenCvMatcher(await loadOpenCv(self.location.origin));
  return { matcher, engineLoadMs: Math.round(performance.now() - t) };
}

serveWorker(
  self,
  {
    "stitch.analyse": async ({ a, b, config }, ctx) => {
      const { matcher, engineLoadMs } = await engine();
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
        return { ...result, engineLoadMs, decodeMs: Math.round(decodeMs) };
      } finally {
        bmA.close();
        bmB.close();
      }
    },
    "stitch.analyseGray": async ({ a, b, config }, ctx) => {
      const { matcher, engineLoadMs } = await engine();
      ctx.progress(0.1, "engine");
      const result = await analyseStitch(createGraySource(a), createGraySource(b), matcher, {
        config,
        signal: ctx.signal,
        onProgress: (p, stage) => ctx.progress(0.1 + p * 0.9, stage),
      });
      return { ...result, engineLoadMs, decodeMs: 0 };
    },
  },
  toCode,
);

function toCode(err: unknown): WorkerErrorCode {
  if (err instanceof StitchError) return err.code;
  if (err instanceof RangeError) return "MEMORY_PRESSURE";
  return "INTERNAL";
}
