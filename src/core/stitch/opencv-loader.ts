/**
 * Lazy OpenCV.js loader for workers. The library is a self-hosted, versioned static asset
 * (see scripts/copy-vendor-assets.mjs) loaded with a bundler-ignored dynamic import.
 * The UMD build assigns `globalThis.cv` (a Promise resolving to the module).
 */
import vendorAssets from "@/config/vendor-assets.json";
import type { OpenCvLike } from "./opencv-matcher";
import { StitchError } from "./types";

let cvPromise: Promise<OpenCvLike> | null = null;

export function loadOpenCv(origin: string): Promise<OpenCvLike> {
  cvPromise ??= (async () => {
    await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ new URL(vendorAssets.opencv.url, origin).href);
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
