/**
 * WorkspaceRuntime (architecture §22): Zustand store + AssetRegistry + WorkerBroker +
 * capabilities, and the operations that span them (ingest, previews, overlap hint, Smart
 * Stitch analysis/export, artifacts). Created once per WorkspaceProvider mount — screenshots
 * are never persisted; a full reload starts empty.
 */
import { readImageSize } from "@/core/image/image-size";
import { validateImageHeader } from "@/core/image/validate";
import { planStitchChain, type ChainPlan } from "@/core/stitch/chain";
import { rgbaToGray } from "@/core/stitch/gray";
import { HINT, likelyOverlap } from "@/core/stitch/overlap-hint";
import type { GrayImage } from "@/core/stitch/types";
import { WorkerJobError } from "@/workers/broker/worker-client";
import { AssetRegistry } from "./asset-registry";
import { detectCapabilities, timeSlicer, type Capabilities } from "./capabilities";
import { createWorkspaceStore, pairKey, selectJoinKeys, selectOriginals, type WorkspaceStore } from "./store";
import type { FileId, FileSource, ImageMime, Job, StitchPair, WorkspaceFile } from "./types";
import { browserWorkerFactories, WorkerBroker } from "./worker-broker";

export const PREVIEW = { maxWidth: 1024, maxPixels: 4_000_000 };

export interface IngestResult {
  added: FileId[];
  rejected: { name: string; code: string }[];
}

export interface StitchExportResult {
  id: FileId;
  width: number;
  height: number;
  bytes: number;
}

const EXT: Record<ImageMime, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const codeOf = (e: unknown) => (e instanceof WorkerJobError ? e.code : ((e as { code?: string })?.code ?? "INTERNAL"));
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

export interface WorkspaceRuntime {
  store: WorkspaceStore;
  registry: AssetRegistry;
  broker: WorkerBroker;
  caps: Capabilities;
  ingest(files: File[], source: FileSource): Promise<IngestResult>;
  removeFile(id: FileId): void;
  clear(): void;
  analyseStitch(): Promise<void>;
  stitchPlan(): ChainPlan | null;
  exportStitch(): Promise<StitchExportResult>;
  dispose(): void;
}

export function createWorkspaceRuntime(opts: { broker?: WorkerBroker; caps?: Capabilities } = {}): WorkspaceRuntime {
  const registry = new AssetRegistry();
  const store = createWorkspaceStore((id) => registry.remove(id));
  const broker = opts.broker ?? new WorkerBroker(browserWorkerFactories());
  const caps = opts.caps ?? detectCapabilities();
  const proxies = new Map<FileId, GrayImage>();
  let pasteCount = 0;
  let previewChain: Promise<void> = Promise.resolve();
  let disposed = false;

  const job = (id: string, kind: Job["kind"], status: Job["status"], progress: number | null = null, error?: string) =>
    store.getState().upsertJob({ id, kind, status, progress, error });

  /** Downscaled preview via the Image Worker (full decode off the main thread); page fallback. */
  async function makePreview(id: FileId) {
    const blob = registry.blob(id);
    if (!blob || disposed) return;
    let bitmap: ImageBitmap;
    try {
      bitmap = (await broker.run("image", "image.preview", { image: blob, ...PREVIEW })).bitmap;
    } catch {
      const f = store.getState().files[id];
      if (!f) return;
      const s = Math.min(1, PREVIEW.maxWidth / f.width, Math.sqrt(PREVIEW.maxPixels / (f.width * f.height)));
      bitmap = await createImageBitmap(blob, { resizeWidth: Math.max(1, Math.round(f.width * s)), resizeHeight: Math.max(1, Math.round(f.height * s)), resizeQuality: "high" });
    }
    if (disposed || !store.getState().files[id]) {
      bitmap.close();
      return;
    }
    registry.setPreview(id, bitmap);
    proxies.delete(id);
    store.getState().markPreview(id);
  }

  /** Tiny greyscale proxy (for the overlap hint) from the preview bitmap. */
  function proxyOf(id: FileId): GrayImage | null {
    const cached = proxies.get(id);
    if (cached) return cached;
    const bm = registry.preview(id);
    if (!bm) return null;
    const w = HINT.width;
    const h = Math.max(1, Math.round((bm.height * w) / bm.width));
    const canvas: OffscreenCanvas | HTMLCanvasElement = caps.offscreenCanvas ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.drawImage(bm, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    canvas.width = 0;
    const data = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
    const g = { width: w, height: h, data };
    proxies.set(id, g);
    return g;
  }

  /**
   * Full-resolution greyscale decoded on the page, for browsers whose workers can't read
   * pixels (no OffscreenCanvas — WebKit/WinCairo, Spike B). 1 byte per pixel is transferred.
   */
  async function pageGray(blob: Blob): Promise<GrayImage> {
    const bm = await createImageBitmap(blob);
    const canvas = Object.assign(document.createElement("canvas"), { width: bm.width, height: bm.height });
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw Object.assign(new Error("canvas"), { code: "MEMORY_PRESSURE" });
      ctx.drawImage(bm, 0, 0);
      return rgbaToGray(ctx.getImageData(0, 0, bm.width, bm.height).data, bm.width, bm.height);
    } finally {
      bm.close();
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  async function checkOverlap() {
    const s = store.getState();
    const originals = selectOriginals(s);
    if (originals.length < 2 || s.overlapHint.dismissed || s.overlapHint.status !== "idle") return;
    if (originals.some((f) => !registry.preview(f.id))) return; // wait for previews
    store.getState().setOverlapHint({ status: "checking" });
    job("overlap", "overlap-check", "running");
    const likely: string[] = [];
    for (let i = 0; i + 1 < originals.length; i++) {
      const a = proxyOf(originals[i].id);
      const b = proxyOf(originals[i + 1].id);
      if (a && b && likelyOverlap(a, b).likely) likely.push(pairKey(originals[i].id, originals[i + 1].id));
      await new Promise((r) => setTimeout(r, 0));
    }
    store.getState().setOverlapHint({ status: likely.length ? "likely" : "unlikely", pairs: likely });
    job("overlap", "overlap-check", "done");
  }

  async function ingest(files: File[], source: FileSource): Promise<IngestResult> {
    const rejected: IngestResult["rejected"] = [];
    const metas: WorkspaceFile[] = [];
    for (const file of files) {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const v = validateImageHeader(file.name, file.type, head); // extension + MIME + magic bytes
      if (!v.ok) {
        rejected.push({ name: file.name || "Pasted image", code: v.code });
        continue;
      }
      const size = await readImageSize(file); // header only — no decode
      if (!size) {
        rejected.push({ name: file.name || "Pasted image", code: "UNREADABLE" });
        continue;
      }
      const id = newId();
      const name = source === "paste" || !file.name ? `Pasted screenshot ${++pasteCount}.${EXT[v.type]}` : file.name;
      registry.put(id, file);
      metas.push({ id, name, type: v.type, bytes: file.size, width: size.width, height: size.height, source, kind: "original", addedAt: Date.now(), previewVersion: 0 });
    }
    if (metas.length) store.getState().addFiles(metas);
    // Previews one at a time (each is a full decode transiently — Spike B), then the hint.
    for (const m of metas) {
      previewChain = previewChain.then(async () => {
        job(`preview:${m.id}`, "preview", "running");
        try {
          await makePreview(m.id);
          job(`preview:${m.id}`, "preview", "done");
        } catch {
          job(`preview:${m.id}`, "preview", "failed", null, "DECODE_FAILED");
        }
      });
    }
    previewChain = previewChain.then(() => checkOverlap());
    await previewChain;
    return { added: metas.map((m) => m.id), rejected };
  }

  async function analyseStitch() {
    const keys = selectJoinKeys(store.getState());
    for (const [i, key] of keys.entries()) {
      const s = store.getState();
      const existing = s.stitch.pairs[key];
      if (existing && (existing.status === "ready" || existing.status === "analysing")) continue;
      const [a, b] = key.split("|");
      const base: StitchPair = { key, a, b, status: "analysing", autoOffset: s.files[a].height, offset: s.files[a].height, confidence: "low", matched: false, bands: { top: 0, bottom: 0 } };
      s.setPair(base);
      job(`analyse:${key}`, "stitch-analyse", "running", i / keys.length);
      try {
        const r = caps.offscreenCanvas
          ? await broker.run("vision", "stitch.analyse", { a: registry.blob(a)!, b: registry.blob(b)! })
          : await broker.run("vision", "stitch.analyseGray", { a: await pageGray(registry.blob(a)!), b: await pageGray(registry.blob(b)!) });
        if (!store.getState().files[a] || !store.getState().files[b]) continue; // removed meanwhile
        store.getState().setPair({
          ...base,
          status: "ready",
          autoOffset: r.offsetY,
          offset: r.offsetY,
          confidence: r.status === "matched" ? r.confidenceClass : "low",
          matched: r.status === "matched",
          bands: r.bands,
        });
        job(`analyse:${key}`, "stitch-analyse", "done", 1);
      } catch (e) {
        store.getState().setPair({ ...base, status: "failed", error: codeOf(e) });
        job(`analyse:${key}`, "stitch-analyse", "failed", null, codeOf(e));
      }
    }
  }

  function stitchPlan(): ChainPlan | null {
    const s = store.getState();
    const originals = selectOriginals(s);
    const keys = selectJoinKeys(s);
    if (originals.length < 2) return null;
    const pairs = keys.map((k) => s.stitch.pairs[k]);
    if (pairs.some((p) => !p || p.status !== "ready")) return null;
    return planStitchChain(
      originals.map((f) => ({ width: f.width, height: f.height })),
      pairs.map((p) => ({ offsetY: p.offset, bands: p.bands })),
    );
  }

  async function exportStitch(): Promise<StitchExportResult> {
    const s = store.getState();
    const plan = stitchPlan();
    if (!plan) throw Object.assign(new Error("not ready"), { code: "STITCH_NOT_READY" });
    const originals = selectOriginals(s);
    const images = originals.map((f) => registry.blob(f.id)!);
    const sources = originals.map((f) => ({ width: f.width, height: f.height }));
    const { format, quality } = s.exportSettings;
    const jobId = `export:${Date.now()}`;
    job(jobId, "stitch-export", "running", 0);
    // Never keep the OpenCV runtime alive during composition (Spike B).
    broker.release("vision");
    try {
      // The main-thread fallback is imported on demand so page bundles never ship the encoder.
      const composePlan = { width: plan.width, height: plan.height, segments: plan.segments };
      const result = caps.offscreenCanvas
        ? await broker.run("image", "stitch.composeChain", { images, plan: composePlan, sources, format, quality }, { onProgress: (p) => job(jobId, "stitch-export", "running", p) })
        : await (await import("@/core/stitch/compose-chain")).composeChain(images, composePlan, {
            format,
            quality,
            sources,
            createCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }),
            yieldBetweenTiles: timeSlicer(),
            onProgress: (p) => job(jobId, "stitch-export", "running", p),
          });
      // Large outputs: recycle the worker so decoded memory is returned (Spike B/D).
      if (plan.width * plan.height > 16_000_000) broker.release("image");
      const id = newId();
      const mime: ImageMime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
      registry.put(id, result.blob);
      store.getState().addArtifact({
        id,
        name: `stitched-screenshot.${EXT[mime]}`,
        type: mime,
        bytes: result.blob.size,
        width: result.width,
        height: result.height,
        source: "artifact",
        kind: "artifact",
        derivedFrom: originals.map((f) => f.id),
        producedBy: "stitch",
        addedAt: Date.now(),
        previewVersion: 0,
      });
      job(jobId, "stitch-export", "done", 1);
      previewChain = previewChain.then(() => makePreview(id)).catch(() => undefined);
      return { id, width: result.width, height: result.height, bytes: result.blob.size };
    } catch (e) {
      job(jobId, "stitch-export", "failed", null, codeOf(e));
      throw Object.assign(new Error(codeOf(e)), { code: codeOf(e) });
    }
  }

  // Reordering changes which screenshots are adjacent: re-run the (cheap) overlap hint.
  const unsubscribe = store.subscribe((next, prev) => {
    if (next.order !== prev.order && next.overlapHint.status === "idle") void checkOverlap();
  });

  return {
    store,
    registry,
    broker,
    caps,
    ingest,
    removeFile: (id) => {
      proxies.delete(id);
      store.getState().removeFile(id);
      void checkOverlap();
    },
    clear: () => {
      proxies.clear();
      store.getState().clear();
    },
    analyseStitch,
    stitchPlan,
    exportStitch,
    dispose() {
      disposed = true;
      unsubscribe();
      store.getState().clear();
      registry.clear();
      broker.dispose();
    },
  };
}

/** Save a registry asset through a temporary link; the object URL is owned by the registry. */
export function downloadAsset(runtime: WorkspaceRuntime, id: FileId): void {
  const f = runtime.store.getState().files[id];
  const url = runtime.registry.objectUrl(id);
  if (!f || !url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
