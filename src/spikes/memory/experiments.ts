/**
 * Spike B experiment library. Each experiment runs unchanged in a worker or on the main
 * thread (DOM canvas where applicable) and returns plain JSON metrics. Memory itself is
 * sampled from outside (OS process tree) by scripts/spikes/memory/run.ts; experiments
 * emit phase marks (epoch ms) so samples can be attributed to phases.
 */
import { createPngStreamEncoder } from "@/core/export/png-stream-encoder";
import { readImageSize } from "@/core/image/image-size";
import { composeTiles, createBlobBitmapProvider, type ComposePlan } from "@/core/image/tiled-compose";
import { analyseStitch } from "@/core/stitch/analyse";
import { loadOpenCv } from "@/core/stitch/opencv-loader";
import { createOpenCvMatcher } from "@/core/stitch/opencv-matcher";
import { createBitmapSource } from "@/core/stitch/sources";

export type ExecContext = "worker" | "main";
export type Format = "image/png" | "image/jpeg" | "image/webp";

export interface Phase {
  name: string;
  t: number;
}

export interface ExperimentOutput {
  ok: boolean;
  error?: string;
  ms: number;
  phases: Phase[];
  [k: string]: unknown;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Any2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

interface Env {
  ctx: ExecContext;
  origin: string;
  phase(name: string): void;
}

const MiB = 1024 * 1024;

async function fetchBlob(env: Env, file: string): Promise<Blob> {
  const res = await fetch(new URL(`/__spikeb/${file}`, env.origin));
  if (!res.ok) throw new Error(`fixture ${file}: HTTP ${res.status}`);
  return res.blob();
}

function makeCanvas(env: Env, api: "dom" | "offscreen", w: number, h: number): AnyCanvas {
  if (api === "dom") {
    if (env.ctx !== "main") throw new Error("DOM canvas only on main thread");
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

function free(c: AnyCanvas | null) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

async function encode(c: AnyCanvas, type: Format, quality?: number): Promise<Blob | null> {
  if ("convertToBlob" in c) return c.convertToBlob({ type, quality });
  return new Promise((resolve) => (c as HTMLCanvasElement).toBlob(resolve, type, quality));
}

/** Read one pixel from the bottom of a bitmap so lazily-decoding browsers materialise it. */
function touch(env: Env, bm: ImageBitmap) {
  const probe = makeCanvas(env, env.ctx === "main" ? "dom" : "offscreen", 1, 1);
  (probe.getContext("2d") as Any2D).drawImage(bm, 0, bm.height - 1, 1, 1, 0, 0, 1, 1);
  free(probe);
}

/** Screenshots are opaque: an alpha of 0 at the far corner means the canvas silently failed. */
function cornerAlpha(ctx: Any2D, w: number, h: number): number {
  return ctx.getImageData(w - 1, h - 1, 1, 1).data[3];
}

async function verifyBlob(blob: Blob | null, w: number, h: number, type: Format) {
  if (!blob) return { blobType: null, bytes: 0, verified: false, encW: null, encH: null };
  const size = await readImageSize(blob);
  return {
    blobType: blob.type,
    bytes: blob.size,
    encW: size?.width ?? null,
    encH: size?.height ?? null,
    // Correct only if the encoder produced the requested format AND the full size.
    verified: blob.type === type && size?.width === w && size?.height === h,
  };
}

function stackPlan(sizes: { width: number; height: number }[]): ComposePlan {
  let dy = 0;
  const segments = sizes.map((s, i) => {
    const seg = { source: i, sy: 0, height: s.height, dy };
    dy += s.height;
    return seg;
  });
  return { width: Math.max(...sizes.map((s) => s.width)), height: dy, segments, background: "#ffffff" };
}

async function sizesOf(blobs: Blob[]) {
  return Promise.all(
    blobs.map(async (b) => {
      const s = await readImageSize(b);
      if (!s) throw new Error("unreadable fixture header");
      return { width: s.width, height: s.height };
    }),
  );
}

// ---------------------------------------------------------------------------

export const experiments = {
  /** Warm-up: spins up the worker/page so its fixed cost is inside the baseline. */
  async noop() {
    return {};
  },

  /** Which canvas sizes actually work (allocation + draw + readback at the far corner)? */
  async canvasLimits(env: Env, p: { api: "dom" | "offscreen"; widths: number[]; heights: number[] }) {
    const rows: { width: number; height: number; ok: boolean; reason?: string; ms: number }[] = [];
    for (const width of p.widths) {
      for (const height of p.heights) {
        const t = performance.now();
        let c: AnyCanvas | null = null;
        try {
          c = makeCanvas(env, p.api, width, height);
          if (c.width !== width || c.height !== height) throw new Error(`size clamped to ${c.width}x${c.height}`);
          const ctx = c.getContext("2d") as Any2D | null;
          if (!ctx) throw new Error("getContext returned null");
          ctx.fillStyle = "#f00";
          ctx.fillRect(width - 1, height - 1, 1, 1);
          const px = ctx.getImageData(width - 1, height - 1, 1, 1).data;
          if (px[0] !== 255 || px[3] !== 255) throw new Error(`readback ${Array.from(px).join(",")}`);
          rows.push({ width, height, ok: true, ms: Math.round(performance.now() - t) });
        } catch (e) {
          rows.push({ width, height, ok: false, reason: String((e as Error).message ?? e).slice(0, 160), ms: Math.round(performance.now() - t) });
        } finally {
          free(c);
        }
      }
    }
    return { rows };
  },

  /** Decode behaviour: full, thumbnail (resizeWidth) or crop (sx/sy/sw/sh). */
  async decode(env: Env, p: { file: string; mode: "full" | "thumb" | "crop"; thumbWidth?: number; cropY?: number; cropH?: number; holdMs?: number }) {
    const blob = await fetchBlob(env, p.file);
    const size = await readImageSize(blob);
    env.phase("decode");
    const t = performance.now();
    let bm: ImageBitmap;
    if (p.mode === "thumb") {
      bm = await createImageBitmap(blob, { resizeWidth: p.thumbWidth ?? 240, resizeQuality: "medium" });
    } else if (p.mode === "crop") {
      bm = await createImageBitmap(blob, 0, p.cropY ?? 0, size!.width, p.cropH ?? 2048);
    } else {
      bm = await createImageBitmap(blob);
    }
    const decodeMs = performance.now() - t;
    const result = { srcW: size?.width, srcH: size?.height, bmW: bm.width, bmH: bm.height, decodeMs: Math.round(decodeMs), decodedMiB: +((bm.width * bm.height * 4) / MiB).toFixed(1), encodedKiB: Math.round(blob.size / 1024) };
    // Draw a pixel from the bottom to force the bitmap to be materialised (lazy decoders).
    touch(env, bm);
    env.phase("hold");
    if (p.holdMs) await new Promise((r) => setTimeout(r, p.holdMs));
    bm.close();
    env.phase("closed");
    return result;
  },

  /** Decode N times WITHOUT close() vs WITH close() — does leaking bitmaps retain memory? */
  async bitmapLifecycle(env: Env, p: { file: string; count: number; close: boolean; gc?: boolean }) {
    const blob = await fetchBlob(env, p.file);
    const kept: ImageBitmap[] = [];
    const gc = (globalThis as { gc?: () => void }).gc;
    env.phase("decoding");
    for (let i = 0; i < p.count; i++) {
      const bm = await createImageBitmap(blob);
      touch(env, bm);
      if (p.close) bm.close();
      else kept.push(bm);
      if (p.gc) gc?.();
    }
    env.phase("settle");
    if (p.gc) gc?.();
    await new Promise((r) => setTimeout(r, 1500));
    (globalThis as { __leak?: unknown }).__leak = kept; // keep reachable until the page closes
    return { decoded: p.count, closed: p.close, gcAvailable: typeof gc === "function" && !!p.gc };
  },

  /** Blob + object URL lifecycle: are unrevoked URLs retaining Blob memory? */
  async objectUrlLifecycle(env: Env, p: { count: number; mib: number; revoke: boolean }) {
    env.phase("create");
    const urls: string[] = [];
    for (let i = 0; i < p.count; i++) {
      const bytes = new Uint8Array(p.mib * MiB);
      for (let j = 0; j < bytes.length; j += 4096) bytes[j] = (i + j) & 0xff;
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      urls.push(url);
    }
    if (p.revoke) urls.forEach((u) => URL.revokeObjectURL(u));
    env.phase("settle");
    await new Promise((r) => setTimeout(r, 2000));
    return { created: p.count, mibEach: p.mib, revoked: p.revoke };
  },

  /**
   * Single-canvas composition + export (the naive strategy).
   * `sequential`: decode → draw → close one source at a time; otherwise decode all first.
   */
  async exportSingle(env: Env, p: { files: string[]; format: Format; quality?: number; api?: "dom" | "offscreen"; sequential?: boolean }) {
    const blobs = await Promise.all(p.files.map((f) => fetchBlob(env, f)));
    const plan = stackPlan(await sizesOf(blobs));
    const api = p.api ?? (env.ctx === "main" ? "dom" : "offscreen");
    let canvas: AnyCanvas | null = null;
    const bitmaps: ImageBitmap[] = [];
    try {
      env.phase("decode+draw");
      if (!p.sequential) for (const b of blobs) bitmaps.push(await createImageBitmap(b));
      canvas = makeCanvas(env, api, plan.width, plan.height);
      const ctx = canvas.getContext("2d") as Any2D | null;
      if (!ctx) throw new Error("getContext returned null");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, plan.width, plan.height);
      for (const [i, s] of plan.segments.entries()) {
        const bm = p.sequential ? await createImageBitmap(blobs[i]) : bitmaps[i];
        ctx.drawImage(bm, 0, s.dy);
        if (p.sequential) bm.close();
      }
      const alpha = cornerAlpha(ctx, plan.width, plan.height);
      bitmaps.forEach((b) => b.close());
      bitmaps.length = 0;
      env.phase("encode");
      const t = performance.now();
      const blob = await encode(canvas, p.format, p.quality);
      const encodeMs = Math.round(performance.now() - t);
      free(canvas);
      canvas = null;
      env.phase("verify");
      const v = await verifyBlob(blob, plan.width, plan.height, p.format);
      return { outW: plan.width, outH: plan.height, canvasMiB: +((plan.width * plan.height * 4) / MiB).toFixed(1), cornerAlpha: alpha, encodeMs, ...v, ok: v.verified && alpha === 255 };
    } finally {
      bitmaps.forEach((b) => b.close());
      free(canvas);
    }
  },

  /** Tiled + sequential composition into ONE streamed PNG (no full-size canvas). */
  async exportTiledPng(env: Env, p: { files: string[]; tileHeight: number }) {
    const blobs = await Promise.all(p.files.map((f) => fetchBlob(env, f)));
    const plan = stackPlan(await sizesOf(blobs));
    const provider = createBlobBitmapProvider(blobs);
    const enc = createPngStreamEncoder(plan.width, plan.height);
    env.phase("compose+encode");
    let readMs = 0;
    let tiles = 0;
    try {
      await composeTiles(plan, provider, {
        tileHeight: p.tileHeight,
        createCanvas: env.ctx === "main" ? (w, h) => makeCanvas(env, "dom", w, h) : undefined,
        onTile: async ({ ctx, height }) => {
          const t = performance.now();
          const img = ctx.getImageData(0, 0, plan.width, height);
          readMs += performance.now() - t;
          tiles++;
          await enc.writeRows(img.data, height);
        },
      });
      const blob = await enc.finish();
      env.phase("verify");
      const v = await verifyBlob(blob, plan.width, plan.height, "image/png");
      return { outW: plan.width, outH: plan.height, tiles, tileMiB: +((plan.width * p.tileHeight * 4) / MiB).toFixed(1), readbackMs: Math.round(readMs), peakDecodedMiB: +(provider.stats().peakDecodedBytes / MiB).toFixed(1), ...v, ok: v.verified };
    } catch (e) {
      enc.abort();
      throw e;
    }
  },

  /** Tiled + sequential composition into N separate images (split output / PDF page payload). */
  async exportSplit(env: Env, p: { files: string[]; tileHeight: number; format: Format; quality?: number }) {
    const blobs = await Promise.all(p.files.map((f) => fetchBlob(env, f)));
    const plan = stackPlan(await sizesOf(blobs));
    const provider = createBlobBitmapProvider(blobs);
    const parts: Blob[] = [];
    let allVerified = true;
    env.phase("compose+encode");
    await composeTiles(plan, provider, {
      tileHeight: p.tileHeight,
      createCanvas: env.ctx === "main" ? (w, h) => makeCanvas(env, "dom", w, h) : undefined,
      onTile: async ({ canvas, height }) => {
        const b = await encode(canvas, p.format, p.quality);
        const v = await verifyBlob(b, plan.width, height, p.format);
        allVerified &&= v.verified;
        if (b) parts.push(b);
      },
    });
    return { outW: plan.width, outH: plan.height, parts: parts.length, bytes: parts.reduce((s, b) => s + b.size, 0), peakDecodedMiB: +(provider.stats().peakDecodedBytes / MiB).toFixed(1), verified: allVerified, ok: allVerified };
  },

  /** toDataURL vs toBlob on the same canvas (main thread only). */
  async dataUrlVsBlob(env: Env, p: { file: string; method: "toDataURL" | "toBlob" }) {
    const blob = await fetchBlob(env, p.file);
    const bm = await createImageBitmap(blob);
    const c = makeCanvas(env, "dom", bm.width, bm.height) as HTMLCanvasElement;
    c.getContext("2d")!.drawImage(bm, 0, 0);
    bm.close();
    env.phase("encode");
    const t = performance.now();
    let chars = 0;
    let bytes = 0;
    if (p.method === "toDataURL") chars = c.toDataURL("image/png").length;
    else bytes = (await encode(c, "image/png"))?.size ?? 0;
    const ms = Math.round(performance.now() - t);
    free(c);
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    return { method: p.method, encodeMs: ms, dataUrlMiB: +(chars / MiB).toFixed(1), blobMiB: +(bytes / MiB).toFixed(1), jsHeapMiB: heap ? +(heap / MiB).toFixed(1) : null };
  },

  /** OpenCV load + Smart Stitch analysis on tall inputs; reports WASM linear memory. */
  async stitchAnalyse(env: Env, p: { a: string; b: string; expectedOffset?: number; loadOnly?: boolean }) {
    if (env.ctx !== "worker") throw new Error("worker only");
    const memories = captureWasmMemories();
    env.phase("load-opencv");
    const t0 = performance.now();
    const cv = await loadOpenCv(env.origin);
    const loadMs = Math.round(performance.now() - t0);
    const wasmAfterLoad = wasmMiB(memories);
    if (p.loadOnly) return { loadMs, wasmAfterLoadMiB: wasmAfterLoad };
    const [ba, bb] = await Promise.all([fetchBlob(env, p.a), fetchBlob(env, p.b)]);
    env.phase("decode");
    const [A, B] = await Promise.all([createImageBitmap(ba), createImageBitmap(bb)]);
    env.phase("analyse");
    try {
      const r = await analyseStitch(createBitmapSource(A), createBitmapSource(B), createOpenCvMatcher(cv));
      return {
        loadMs,
        wasmAfterLoadMiB: wasmAfterLoad,
        wasmAfterAnalyseMiB: wasmMiB(memories),
        offsetY: r.offsetY,
        expectedOffset: p.expectedOffset ?? null,
        confidence: +r.confidence.toFixed(3),
        confidenceClass: r.confidenceClass,
        timings: r.timings,
        ok: p.expectedOffset === undefined || r.offsetY === p.expectedOffset,
      };
    } finally {
      A.close();
      B.close();
    }
  },
};

export type ExperimentName = keyof typeof experiments;

// --- WASM memory capture (OpenCV does not export its heap views) -------------------
const captured: WebAssembly.Memory[] = [];
let patched = false;
function captureWasmMemories() {
  if (patched) return captured;
  patched = true;
  const grab = (r: unknown) => {
    const inst = (r as { instance?: WebAssembly.Instance }).instance ?? (r as WebAssembly.Instance);
    const mem = Object.values(inst?.exports ?? {}).find((x) => x instanceof WebAssembly.Memory) as WebAssembly.Memory | undefined;
    if (mem) captured.push(mem);
    return r;
  };
  const wa = WebAssembly as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const k of ["instantiate", "instantiateStreaming"]) {
    const orig = wa[k]?.bind(WebAssembly);
    if (orig) wa[k] = (...a: unknown[]) => orig(...a).then(grab);
  }
  return captured;
}
function wasmMiB(mems: WebAssembly.Memory[]) {
  return +(mems.reduce((s, m) => s + m.buffer.byteLength, 0) / MiB).toFixed(1);
}

/** Runs an experiment with timing, phase marks and error capture. */
export async function runExperiment(ctx: ExecContext, origin: string, name: ExperimentName, params: unknown): Promise<ExperimentOutput> {
  const phases: Phase[] = [{ name: "start", t: Date.now() }];
  const env: Env = { ctx, origin, phase: (n) => phases.push({ name: n, t: Date.now() }) };
  const t = performance.now();
  try {
    const fn = experiments[name] as (env: Env, p: unknown) => Promise<Record<string, unknown>>;
    const out = await fn(env, params);
    phases.push({ name: "end", t: Date.now() });
    return { ok: true, ...out, ms: Math.round(performance.now() - t), phases };
  } catch (e) {
    phases.push({ name: "end", t: Date.now() });
    const err = e as Error;
    return { ok: false, error: `${err?.name ?? "Error"}: ${String(err?.message ?? e).slice(0, 200)}`, ms: Math.round(performance.now() - t), phases };
  }
}
