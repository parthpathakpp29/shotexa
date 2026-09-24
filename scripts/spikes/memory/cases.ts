/**
 * Spike B test matrix. Each case runs in a fresh browser context (fresh renderer).
 * Fixture names refer to .cache/spike-b (see generate-large-fixtures.ts).
 */
export interface Case {
  id: string;
  group: string;
  ctx: "worker" | "main";
  name: string;
  params: Record<string, unknown>;
  /** Only run on these browsers (default: all). */
  browsers?: string[];
  /** Terminate the worker right after the experiment (before the retained-memory tail). */
  recycleAfter?: boolean;
}

const T = (h: number, w = 1080, ext = "png") => `tall-${w}x${h}.${ext}`;
const phones = (n: number) => Array.from({ length: n }, (_, i) => `phone-1080x2400-${i % 4}.png`);
const phonesWide = (n: number) => Array.from({ length: n }, (_, i) => `phone-1440x3200-${i % 3}.png`);

const TALL = [
  { label: "1080x5000", file: T(5000) },
  { label: "1080x10000", file: T(10000) },
  { label: "1080x20000", file: T(20000) },
  { label: "1080x30000", file: T(30000) },
  { label: "1440x20000", file: T(20000, 1440) },
];

const FORMATS = [
  ["png", "image/png", undefined],
  ["jpeg", "image/jpeg", 0.9],
  ["webp", "image/webp", 0.9],
] as const;

export const CASES: Case[] = [
  // 1. Canvas limits
  ...(["dom", "offscreen"] as const).map((api) => ({
    id: `limits-main-${api}`,
    group: "limits",
    ctx: "main" as const,
    name: "canvasLimits",
    params: { api, widths: [1080, 1440], heights: [8192, 16383, 16384, 20000, 30000, 32767, 32768, 40000, 50000, 65535, 65536, 100000] },
  })),
  {
    id: "limits-worker-offscreen",
    group: "limits",
    ctx: "worker",
    name: "canvasLimits",
    params: { api: "offscreen", widths: [1080, 1440], heights: [8192, 16383, 16384, 20000, 30000, 32767, 32768, 40000, 50000, 65535, 65536, 100000] },
  },

  // 2. Decode behaviour
  ...TALL.map((t) => ({ id: `decode-full-${t.label}-png`, group: "decode", ctx: "worker" as const, name: "decode", params: { file: t.file, mode: "full", holdMs: 600 } })),
  { id: "decode-full-1080x20000-jpeg", group: "decode", ctx: "worker", name: "decode", params: { file: T(20000, 1080, "jpg"), mode: "full", holdMs: 600 } },
  { id: "decode-full-1080x30000-jpeg", group: "decode", ctx: "worker", name: "decode", params: { file: T(30000, 1080, "jpg"), mode: "full", holdMs: 600 } },
  { id: "decode-full-1080x16383-webp", group: "decode", ctx: "worker", name: "decode", params: { file: T(16383, 1080, "webp"), mode: "full", holdMs: 600 } },
  { id: "decode-full-1080x30000-png-main", group: "decode", ctx: "main", name: "decode", params: { file: T(30000), mode: "full", holdMs: 600 } },
  { id: "decode-thumb-1080x30000-png", group: "decode", ctx: "worker", name: "decode", params: { file: T(30000), mode: "thumb", thumbWidth: 240, holdMs: 600 } },
  { id: "decode-thumb-1440x20000-jpeg", group: "decode", ctx: "worker", name: "decode", params: { file: T(20000, 1440, "jpg"), mode: "thumb", thumbWidth: 240, holdMs: 600 } },
  { id: "decode-crop-1080x30000-png", group: "decode", ctx: "worker", name: "decode", params: { file: T(30000), mode: "crop", cropY: 14000, cropH: 2048, holdMs: 600 } },
  { id: "decode-crop-1080x30000-jpeg", group: "decode", ctx: "worker", name: "decode", params: { file: T(30000, 1080, "jpg"), mode: "crop", cropY: 14000, cropH: 2048, holdMs: 600 } },

  // 3. Resource lifecycle
  { id: "bitmaps-12x1080x10000-closed", group: "lifecycle", ctx: "worker", name: "bitmapLifecycle", params: { file: T(10000), count: 12, close: true } },
  { id: "bitmaps-12x1080x10000-leaked", group: "lifecycle", ctx: "worker", name: "bitmapLifecycle", params: { file: T(10000), count: 12, close: false } },
  // Chromium follow-up: is closed-bitmap memory reclaimed only on GC? (needs --expose-gc)
  { id: "bitmaps-12x1080x10000-closed-gc", group: "lifecycle", ctx: "worker", name: "bitmapLifecycle", params: { file: T(10000), count: 12, close: true, gc: true }, browsers: ["chromium"] },
  { id: "bitmaps-12x1080x10000-leaked-gc", group: "lifecycle", ctx: "worker", name: "bitmapLifecycle", params: { file: T(10000), count: 12, close: false, gc: true }, browsers: ["chromium"] },
  { id: "bitmaps-12x1080x10000-closed-recycle", group: "lifecycle", ctx: "worker", name: "bitmapLifecycle", params: { file: T(10000), count: 12, close: true }, recycleAfter: true },
  { id: "objecturls-20x10MiB-revoked", group: "lifecycle", ctx: "main", name: "objectUrlLifecycle", params: { count: 20, mib: 10, revoke: true } },
  { id: "objecturls-20x10MiB-kept", group: "lifecycle", ctx: "main", name: "objectUrlLifecycle", params: { count: 20, mib: 10, revoke: false } },

  // 4. Single-canvas export of tall images (the naive strategy) — worker
  ...TALL.flatMap((t) =>
    FORMATS.map(([f, type, quality]) => ({ id: `single-${t.label}-${f}`, group: "export-single", ctx: "worker" as const, name: "exportSingle", params: { files: [t.file], format: type, quality } })),
  ),
  // …and on the main thread (DOM canvas + toBlob) for stall comparison
  { id: "single-1080x20000-png-main", group: "export-single", ctx: "main", name: "exportSingle", params: { files: [T(20000)], format: "image/png" } },
  { id: "single-1080x30000-jpeg-main", group: "export-single", ctx: "main", name: "exportSingle", params: { files: [T(30000)], format: "image/jpeg", quality: 0.9 } },

  // 5. Tiled + streamed PNG (no full-size canvas)
  ...TALL.map((t) => ({ id: `tiled-${t.label}-png`, group: "export-tiled", ctx: "worker" as const, name: "exportTiledPng", params: { files: [t.file], tileHeight: 2048 } })),
  { id: "tiled-1080x30000-png-main", group: "export-tiled", ctx: "main", name: "exportTiledPng", params: { files: [T(30000)], tileHeight: 2048 } },

  // 6. Split output (sections) — also the PDF-page payload
  { id: "split-1080x30000-jpeg-4096", group: "export-split", ctx: "worker", name: "exportSplit", params: { files: [T(30000)], tileHeight: 4096, format: "image/jpeg", quality: 0.9 } },
  { id: "split-1440x20000-webp-4096", group: "export-split", ctx: "worker", name: "exportSplit", params: { files: [T(20000, 1440)], tileHeight: 4096, format: "image/webp", quality: 0.9 } },

  // 7. Multi-image composition
  { id: "multi-8x1080x2400-single-all", group: "multi", ctx: "worker", name: "exportSingle", params: { files: phones(8), format: "image/png" } },
  { id: "multi-8x1080x2400-single-seq", group: "multi", ctx: "worker", name: "exportSingle", params: { files: phones(8), format: "image/png", sequential: true } },
  { id: "multi-8x1080x2400-tiled", group: "multi", ctx: "worker", name: "exportTiledPng", params: { files: phones(8), tileHeight: 2048 } },
  { id: "multi-16x1080x2400-single-seq", group: "multi", ctx: "worker", name: "exportSingle", params: { files: phones(16), format: "image/png", sequential: true } },
  { id: "multi-16x1080x2400-tiled", group: "multi", ctx: "worker", name: "exportTiledPng", params: { files: phones(16), tileHeight: 2048 } },
  { id: "multi-12x1440x3200-single-seq", group: "multi", ctx: "worker", name: "exportSingle", params: { files: phonesWide(12), format: "image/png", sequential: true } },
  { id: "multi-12x1440x3200-tiled", group: "multi", ctx: "worker", name: "exportTiledPng", params: { files: phonesWide(12), tileHeight: 2048 } },
  { id: "multi-25x1080x2400-single-seq", group: "multi", ctx: "worker", name: "exportSingle", params: { files: phones(25), format: "image/png", sequential: true } },
  { id: "multi-25x1080x2400-tiled", group: "multi", ctx: "worker", name: "exportTiledPng", params: { files: phones(25), tileHeight: 2048 } },
  { id: "multi-2x1080x30000-tiled", group: "multi", ctx: "worker", name: "exportTiledPng", params: { files: [T(30000), T(30000)], tileHeight: 2048 } },

  // 8. toDataURL vs toBlob (main thread)
  { id: "dataurl-1080x20000", group: "dataurl", ctx: "main", name: "dataUrlVsBlob", params: { file: T(20000), method: "toDataURL" } },
  { id: "toblob-1080x20000", group: "dataurl", ctx: "main", name: "dataUrlVsBlob", params: { file: T(20000), method: "toBlob" } },

  // 9. OpenCV
  { id: "opencv-load", group: "opencv", ctx: "worker", name: "stitchAnalyse", params: { a: "", b: "", loadOnly: true } },
  { id: "opencv-analyse-2x1080x10000", group: "opencv", ctx: "worker", name: "stitchAnalyse", params: { a: "pair-1080x10000-a.png", b: "pair-1080x10000-b.png", expectedOffset: 7000 } },
  { id: "opencv-analyse-2x1080x2400", group: "opencv", ctx: "worker", name: "stitchAnalyse", params: { a: "phone-1080x2400-0.png", b: "phone-1080x2400-1.png" } },
];
