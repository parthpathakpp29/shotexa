/**
 * OCR runtime policy — PROVISIONAL, from Spike C (docs/spikes/SPIKE_C_OCR.md).
 * Tune with real-device testing; keep numbers here, never inline in engines/UI.
 */
export interface OcrRuntimeConfig {
  /**
   * Screenshots taller than this are recognised in overlapping strips. Spike C: full-image
   * OCR of 1080×10000 worked in all engines; strips gave identical accuracy with mixed
   * speed/memory results, so they are a safety valve for very long captures only.
   */
  stripThresholdPx: number;
  stripHeightPx: number;
  stripOverlapPx: number;
  /** Terminate the OCR worker after this much inactivity (frees its WASM heap). */
  idleTerminateMs: number;
  /**
   * Recycle the worker after a job that RECOGNISED at least this many pixels (after
   * upscaling). Tesseract's WASM heap never shrinks: Spike C saw +262 MiB retained after a
   * 4.1 M px job and +36 MiB after recycling.
   */
  recycleAfterPixels: number;
  /** Give up initialising the engine after this long (slow networks download ~4.3 MB). */
  initTimeoutMs: number;
}

export const DEFAULT_OCR_CONFIG: OcrRuntimeConfig = {
  stripThresholdPx: 8000,
  stripHeightPx: 2000,
  stripOverlapPx: 240,
  idleTerminateMs: 60_000,
  recycleAfterPixels: 4_000_000,
  initTimeoutMs: 120_000,
};
