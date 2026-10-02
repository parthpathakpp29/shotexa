/**
 * Capability detection (architecture §41). WebKit/WinCairo has no OffscreenCanvas (Spike B),
 * so worker canvas work falls back to the main thread in small, yielding steps.
 */
export interface Capabilities {
  offscreenCanvas: boolean;
  compressionStream: boolean;
  createImageBitmapResize: boolean;
}

export function detectCapabilities(): Capabilities {
  const g = globalThis as Record<string, unknown>;
  return {
    offscreenCanvas: typeof g.OffscreenCanvas !== "undefined",
    compressionStream: typeof g.CompressionStream !== "undefined",
    createImageBitmapResize: typeof g.createImageBitmap === "function",
  };
}

/** Yield to the event loop only after `budgetMs` of work (keeps main-thread fallbacks responsive). */
export function timeSlicer(budgetMs = 24) {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < budgetMs) return;
    await new Promise<void>((r) => setTimeout(r, 0));
    since = performance.now();
  };
}
