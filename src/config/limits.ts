/**
 * Large-image processing limits — PROVISIONAL, from Spike B
 * (docs/spikes/SPIKE_B_LARGE_IMAGE_MEMORY.md). Measured on one 8 GB Windows laptop with
 * Playwright Chromium/Firefox/WebKit(WinCairo). NOT validated on iOS/Android yet — tune with
 * real-device testing. These are Shotexa policy values, not browser guarantees.
 */
export const MiB = 1024 * 1024;

export interface ProcessingLimits {
  /** Soft working-set budget for ONE heavy job (decoded pixels + canvases + encode buffers). */
  softBudgetBytes: number;
  /** Tile height for tiled composition / streamed PNG. */
  tileHeight: number;
  /** Section height for split output (images or PDF pages). */
  splitSectionHeight: number;
  /**
   * Largest single canvas (pixel area) Shotexa will allocate. Chromium/Firefox allowed
   * 1440×65535 in tests, but iOS Safari historically caps canvas area at 16,777,216 px
   * (4096²); use that as the cross-browser ceiling until real-device testing says otherwise.
   */
  maxSingleCanvasArea: number;
  /** Hard height ceiling for one canvas (Chromium/Firefox fail silently/throw at 65,536). */
  maxSingleCanvasHeight: number;
  /**
   * Observed peak ≈ canvasBytes × factor + largest resident source (Spike B: 1.25–2.1×
   * across engines for tall single-canvas exports; 1.5 is the conservative middle).
   */
  singleCanvasPeakFactor: number;
  /** Format hard limits (pixels per side). Chromium silently crops WebP beyond 16,383. */
  formatMaxSide: { png: number; jpeg: number; webp: number };
}

export const DEFAULT_LIMITS: ProcessingLimits = {
  softBudgetBytes: 256 * MiB,
  tileHeight: 2048,
  splitSectionHeight: 4096,
  maxSingleCanvasArea: 16_777_216,
  maxSingleCanvasHeight: 65_535,
  singleCanvasPeakFactor: 1.5,
  formatMaxSide: { png: 2 ** 31 - 1, jpeg: 65_535, webp: 16_383 },
};

/**
 * Device-aware soft budget. `navigator.deviceMemory` (Chromium only, capped at 8) is a coarse
 * hint; iOS/Safari exposes nothing, so it gets a conservative default until measured.
 */
export function softBudgetFor(env: { deviceMemoryGiB?: number; isIOS?: boolean }): number {
  if (env.isIOS) return 160 * MiB;
  if (env.deviceMemoryGiB === undefined) return DEFAULT_LIMITS.softBudgetBytes;
  if (env.deviceMemoryGiB <= 2) return 128 * MiB;
  if (env.deviceMemoryGiB <= 4) return 192 * MiB;
  return 256 * MiB;
}
