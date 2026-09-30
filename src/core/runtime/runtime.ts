/**
 * WorkspaceRuntime (architecture §22): Zustand store + AssetRegistry + WorkerBroker +
 * capabilities, and the operations that span them (ingest, previews, overlap hint, Smart
 * Stitch analysis/export, artifacts). Created once per WorkspaceProvider mount — screenshots
 * are never persisted; a full reload starts empty.
 */
import { readImageSize } from "@/core/image/image-size";
import { validateImageHeader } from "@/core/image/validate";
import type { MetadataCleanRun, MetadataInspectRun } from "@/core/metadata/run";
import { DEFAULT_OCR_CONFIG } from "@/config/ocr";
import type { OcrService } from "@/core/ocr/ocr-service";
import type { OcrResult } from "@/core/ocr/types";
import type { AnalysedSet, ShotexaPdfEngine } from "@/core/pdf/pdf-engine";
import type { PageSetup, PaginationPlan } from "@/core/pdf/types";
import { searchableSourceFromResult } from "@/core/pdf/searchable-text";
import type { CombinePlan } from "@/core/combine/types";
import { IDENTITY_TRANSFORM, isIdentity } from "@/core/image-transform/transform";
import type { SafeShareExportResult } from "@/core/redaction/types";
import { planStitchChain, type ChainPlan } from "@/core/stitch/chain";
import { rgbaToGray } from "@/core/stitch/gray";
import { HINT, likelyOverlap } from "@/core/stitch/overlap-hint";
import type { GrayImage } from "@/core/stitch/types";
import { WorkerJobError } from "@/workers/broker/worker-client";
import { AssetRegistry } from "./asset-registry";
import { OcrResultRegistry } from "./ocr-result-registry";
import { PdfAnalysisRegistry } from "./pdf-analysis-registry";
import { detectCapabilities, timeSlicer, type Capabilities } from "./capabilities";
import { createWorkspaceStore, pairKey, selectJoinKeys, selectOriginals, type WorkspaceStore } from "./store";
import { ocrLanguages, type FileId, type FileSource, type ImageMime, type Job, type OcrLanguageChoice, type PdfBreakEdit, type StitchPair, type WorkspaceDocument, type WorkspaceFile } from "./types";
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

export type CombineExportResult = StitchExportResult;

export interface EditorExportResult extends StitchExportResult {
  /** The unchanged asset the edit was made from. */
  sourceId: FileId;
}

export interface WorkspaceSafeShareResult extends Omit<SafeShareExportResult, "blob"> {
  id: FileId;
  bytes: number;
}

export interface WorkspaceMetadataCleanResult extends MetadataCleanRun {
  artifactId: FileId | null;
}

export interface WorkspaceOcrResult {
  resultId: string;
  result: OcrResult;
}

export interface WorkspacePdfResult {
  id: string;
  blob: Blob;
  bytes: number;
  pages: number;
  ms: number;
  path: "worker" | "main-thread";
}

const EXT: Record<ImageMime, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const codeOf = (e: unknown) => (e instanceof WorkerJobError ? e.code : ((e as { code?: string })?.code ?? "INTERNAL"));
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

export interface WorkspaceRuntime {
  store: WorkspaceStore;
  registry: AssetRegistry;
  ocrResults: OcrResultRegistry;
  pdfAnalyses: PdfAnalysisRegistry;
  broker: WorkerBroker;
  caps: Capabilities;
  ingest(files: File[], source: FileSource): Promise<IngestResult>;
  removeFile(id: FileId): void;
  clear(): void;
  analyseStitch(): Promise<void>;
  stitchPlan(): ChainPlan | null;
  exportStitch(): Promise<StitchExportResult>;
  exportCombine(inputIds: FileId[], plan: CombinePlan): Promise<CombineExportResult>;
  /** Render the asset's editor transform at full resolution into a new workspace artifact. */
  exportEdit(assetId?: FileId): Promise<EditorExportResult>;
  exportSafeShare(assetId?: FileId): Promise<WorkspaceSafeShareResult>;
  inspectMetadata(assetId?: FileId): Promise<MetadataInspectRun>;
  cleanMetadata(assetId?: FileId): Promise<WorkspaceMetadataCleanResult>;
  extractText(assetId?: FileId, language?: OcrLanguageChoice): Promise<WorkspaceOcrResult>;
  cancelOcr(assetId?: FileId): Promise<void>;
  planPdf(inputIds: FileId[], setup: PageSetup, smart: boolean, edits?: Record<FileId, PdfBreakEdit>): Promise<PaginationPlan>;
  pdfSafeYs(assetId: FileId): number[];
  exportPdf(inputIds: FileId[], plan: PaginationPlan): Promise<WorkspacePdfResult>;
  exportSearchablePdf(inputIds: FileId[], plan: PaginationPlan): Promise<WorkspacePdfResult>;
  cancelPdf(): void;
  dispose(): void;
}

export function createWorkspaceRuntime(opts: { broker?: WorkerBroker; caps?: Capabilities; createOcrService?: () => Promise<OcrService>; ocrTimeoutMs?: number } = {}): WorkspaceRuntime {
  const registry = new AssetRegistry();
  const ocrResults = new OcrResultRegistry();
  const pdfAnalyses = new PdfAnalysisRegistry();
  const store = createWorkspaceStore((id) => {
    registry.remove(id);
    ocrResults.removeAsset(id);
    pdfAnalyses.remove(id);
  });
  const broker = opts.broker ?? new WorkerBroker(browserWorkerFactories());
  const caps = opts.caps ?? detectCapabilities();
  const proxies = new Map<FileId, GrayImage>();
  let pasteCount = 0;
  let previewChain: Promise<void> = Promise.resolve();
  let disposed = false;
  let ocrService: OcrService | null = null;
  let activeOcrAsset: FileId | null = null;
  let activeOcrAbort: AbortController | null = null;
  let pdfEngine: ShotexaPdfEngine | null = null;
  let activePdfAbort: AbortController | null = null;

  const getOcrService = async () => {
    if (ocrService) return ocrService;
    ocrService = opts.createOcrService
      ? await opts.createOcrService()
      : (await import("@/core/ocr/ocr-service")).createOcrService();
    return ocrService;
  };

  const getPdfEngine = async () => {
    if (pdfEngine) return pdfEngine;
    const { createPdfEngine } = await import("@/core/pdf/pdf-engine");
    // Spike D: 10% upward search plus at most 5% page shrink had the best equal-page-count result.
    pdfEngine = createPdfEngine({ windowUp: 0.1, windowDown: 0.05 });
    return pdfEngine;
  };

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

  async function exportCombine(inputIds: FileId[], plan: CombinePlan): Promise<CombineExportResult> {
    if (inputIds.length < 2 || plan.placements.length !== inputIds.length) throw Object.assign(new Error("Invalid composition"), { code: "COMBINE_INVALID_LAYOUT" });
    const s = store.getState();
    const inputs = inputIds.map((id) => s.files[id]);
    const images = inputIds.map((id) => registry.blob(id));
    if (inputs.some((file) => !file) || images.some((blob) => !blob)) throw Object.assign(new Error("Missing source"), { code: "DECODE_FAILED" });
    const { format, quality } = s.exportSettings;
    const jobId = `combine:${Date.now()}`;
    job(jobId, "combine-export", "running", 0);
    try {
      const result = caps.offscreenCanvas
        ? await broker.run("image", "combine.compose", { images: images as Blob[], plan, format, quality }, { onProgress: (progress) => job(jobId, "combine-export", "running", progress) })
        : await (await import("@/core/combine/compose")).composeCombine(images as Blob[], plan, {
            format,
            quality,
            createCanvas: (width, height) => Object.assign(document.createElement("canvas"), { width, height }),
            yieldBetweenTiles: timeSlicer(),
            onProgress: (progress) => job(jobId, "combine-export", "running", progress),
          });
      if (result.width * result.height > 16_000_000) broker.release("image");
      const mime: ImageMime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
      const id = newId();
      registry.put(id, result.blob);
      store.getState().addArtifact({
        id,
        name: `combined-screenshots.${EXT[mime]}`,
        type: mime,
        bytes: result.blob.size,
        width: result.width,
        height: result.height,
        source: "artifact",
        kind: "artifact",
        derivedFrom: [...inputIds],
        producedBy: "combine",
        addedAt: Date.now(),
        previewVersion: 0,
      });
      job(jobId, "combine-export", "done", 1);
      previewChain = previewChain.then(() => makePreview(id)).catch(() => undefined);
      return { id, width: result.width, height: result.height, bytes: result.blob.size };
    } catch (error) {
      const code = codeOf(error);
      job(jobId, "combine-export", "failed", null, code);
      throw Object.assign(new Error(code), { code });
    }
  }

  async function exportEdit(assetId?: FileId): Promise<EditorExportResult> {
    const { id: sourceId, file, blob } = selected(assetId);
    const s = store.getState();
    const transform = s.editor.byAsset[sourceId] ?? IDENTITY_TRANSFORM;
    // Nothing changed: exporting would only re-encode the original.
    if (isIdentity(transform)) throw Object.assign(new Error("No edits"), { code: "EDITOR_INVALID_TRANSFORM" });
    const source = { width: file.width, height: file.height };
    const { format, quality } = s.exportSettings;
    const jobId = `editor:${Date.now()}`;
    job(jobId, "editor-export", "running", 0);
    try {
      const onProgress = (progress: number) => job(jobId, "editor-export", "running", progress);
      const result = caps.offscreenCanvas
        ? await broker.run("image", "transform.export", { image: blob, transform, source, format, quality }, { onProgress })
        : await (await import("@/core/image-transform/render")).renderTransform(blob, transform, {
            source,
            format,
            quality,
            createCanvas: (width, height) => Object.assign(document.createElement("canvas"), { width, height }),
            yieldBetweenTiles: timeSlicer(),
            onProgress,
          });
      // Large outputs: recycle the worker so decoded memory is returned (Spike B).
      if (result.width * result.height > 16_000_000) broker.release("image");
      const mime: ImageMime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
      const base = file.name.replace(/\.[^.]+$/, "").replace(/^edited-/, "");
      const id = newId();
      registry.put(id, result.blob);
      // A new artifact: the source asset and its blob are left exactly as they were.
      store.getState().addArtifact({
        id,
        name: `edited-${base}.${EXT[mime]}`,
        type: mime,
        bytes: result.blob.size,
        width: result.width,
        height: result.height,
        source: "artifact",
        kind: "artifact",
        derivedFrom: [sourceId],
        producedBy: "editor",
        addedAt: Date.now(),
        previewVersion: 0,
      });
      job(jobId, "editor-export", "done", 1);
      previewChain = previewChain.then(() => makePreview(id)).catch(() => undefined);
      return { id, width: result.width, height: result.height, bytes: result.blob.size, sourceId };
    } catch (error) {
      const code = codeOf(error);
      job(jobId, "editor-export", "failed", null, code);
      throw Object.assign(new Error(code), { code });
    }
  }

  function selected(assetId?: FileId) {
    const id = assetId ?? store.getState().selectedId;
    const file = id ? store.getState().files[id] : undefined;
    const blob = id ? registry.blob(id) : undefined;
    if (!id || !file || !blob) throw Object.assign(new Error("No image selected"), { code: "DECODE_FAILED" });
    return { id, file, blob };
  }

  function registerArtifact(blob: Blob, baseName: string, sourceId: FileId, producedBy: "safe-share" | "blur" | "metadata", width: number, height: number): FileId {
    const id = newId();
    const mime = blob.type as ImageMime;
    registry.put(id, blob);
    store.getState().addArtifact({
      id,
      name: baseName,
      type: mime,
      bytes: blob.size,
      width,
      height,
      source: "artifact",
      kind: "artifact",
      derivedFrom: [sourceId],
      producedBy,
      addedAt: Date.now(),
      previewVersion: 0,
    });
    previewChain = previewChain.then(() => makePreview(id)).catch(() => undefined);
    return id;
  }

  async function exportSafeShare(assetId?: FileId): Promise<WorkspaceSafeShareResult> {
    const { id: sourceId, blob } = selected(assetId);
    const s = store.getState();
    const operations = s.redaction.byAsset[sourceId] ?? [];
    if (!operations.length) throw Object.assign(new Error("Add a redaction first"), { code: "REDACTION_INVALID_RECT" });
    const { format, quality } = s.exportSettings;
    const jobId = `redaction:${Date.now()}`;
    job(jobId, "redaction-export", "running", 0);
    try {
      const result = caps.offscreenCanvas
        ? await broker.run("image", "redaction.export", { image: blob, operations, format, quality }, { onProgress: (p) => job(jobId, "redaction-export", "running", p) })
        : await (await import("@/core/redaction/render")).renderSafeShare(blob, operations, {
            format,
            quality,
            createCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }),
            onProgress: (p) => job(jobId, "redaction-export", "running", p),
          });
      if (result.width * result.height > 16_000_000) broker.release("image");
      const mime: ImageMime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
      const producedBy = s.activeTool === "blur" ? "blur" : "safe-share";
      const { blob: outputBlob, ...rest } = result;
      const artifactId = registerArtifact(outputBlob, `safe-copy.${EXT[mime]}`, sourceId, producedBy, result.width, result.height);
      job(jobId, "redaction-export", "done", 1);
      return { ...rest, id: artifactId, bytes: outputBlob.size };
    } catch (e) {
      const code = codeOf(e);
      job(jobId, "redaction-export", "failed", null, code);
      throw Object.assign(new Error(code), { code });
    }
  }

  async function inspectMetadata(assetId?: FileId): Promise<MetadataInspectRun> {
    const { id, file, blob } = selected(assetId);
    job(`metadata:${id}`, "metadata-inspect", "running", 0);
    try {
      const result = await broker.run("image", "metadata.inspect", { image: blob, name: file.name, type: file.type });
      job(`metadata:${id}`, "metadata-inspect", "done", 1);
      return result;
    } catch (e) {
      job(`metadata:${id}`, "metadata-inspect", "failed", null, codeOf(e));
      throw e;
    }
  }

  async function cleanMetadata(assetId?: FileId): Promise<WorkspaceMetadataCleanResult> {
    const { id: sourceId, file, blob } = selected(assetId);
    const jobId = `metadata-clean:${sourceId}`;
    job(jobId, "metadata-clean", "running", 0);
    try {
      const result = await broker.run("image", "metadata.clean", { image: blob, name: file.name, type: file.type });
      let artifactId: FileId | null = null;
      if (result.changed && result.output) {
        const cleanName = `privacy-clean-${file.name.replace(/^privacy-clean-/, "")}`;
        artifactId = registerArtifact(result.output, cleanName, sourceId, "metadata", result.before.width, result.before.height);
      }
      job(jobId, "metadata-clean", "done", 1);
      return { ...result, artifactId };
    } catch (e) {
      job(jobId, "metadata-clean", "failed", null, codeOf(e));
      throw e;
    }
  }

  async function extractText(assetId?: FileId, language?: OcrLanguageChoice): Promise<WorkspaceOcrResult> {
    const { id, blob } = selected(assetId);
    const choice = language ?? store.getState().ocr.language;
    if (activeOcrAsset) await cancelOcr(activeOcrAsset);
    activeOcrAsset = id;
    const abort = new AbortController();
    activeOcrAbort = abort;
    store.getState().beginOcr(id, choice);
    const jobId = `ocr:${id}`;
    job(jobId, "ocr", "running", 0);
    // Avoid retaining another large WASM heap while Tesseract is active.
    broker.release("vision");
    broker.release("document");
    let service: OcrService | null = null;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      service = await getOcrService();
      timer = setTimeout(() => {
        timedOut = true;
        abort.abort();
        void service?.cancel();
    }, opts.ocrTimeoutMs ?? DEFAULT_OCR_CONFIG.recognitionTimeoutMs);
      const result = await service.extract(blob, {
        languages: ocrLanguages(choice),
        preprocessing: "auto",
        readingOrder: "auto",
        strips: "auto",
        signal: abort.signal,
        onProgress: (progress, stage) => {
          if (activeOcrAsset !== id) return;
          store.getState().setOcrProgress(id, progress, stage);
          job(jobId, "ocr", "running", progress);
        },
      });
      if (timedOut) throw Object.assign(new Error("OCR_TIMEOUT"), { code: "OCR_TIMEOUT" });
      const resultId = ocrResults.put(id, result);
      store.getState().completeOcr(id, {
        resultId,
        editedText: result.editedText,
        confidence: result.confidence,
        durationMs: result.timings.totalMs,
      });
      job(jobId, "ocr", "done", 1);
      return { resultId, result };
    } catch (error) {
      const code = timedOut ? "OCR_TIMEOUT" : codeOf(error);
      if (code === "OCR_CANCELLED") {
        store.getState().cancelOcr(id);
        job(jobId, "ocr", "cancelled", null, code);
      } else {
        store.getState().failOcr(id, code);
        job(jobId, "ocr", "failed", null, code);
      }
      throw Object.assign(new Error(code), { code });
    } finally {
      if (timer) clearTimeout(timer);
      if (activeOcrAsset === id) {
        activeOcrAsset = null;
        activeOcrAbort = null;
      }
    }
  }

  async function cancelOcr(assetId?: FileId): Promise<void> {
    const id = assetId ?? activeOcrAsset;
    if (!id) return;
    store.getState().cancelOcr(id);
    job(`ocr:${id}`, "ocr", "cancelled", null, "OCR_CANCELLED");
    if (activeOcrAsset === id) {
      activeOcrAbort?.abort();
      activeOcrAbort = null;
      activeOcrAsset = null;
    }
    await ocrService?.cancel();
  }

  async function planPdf(inputIds: FileId[], setup: PageSetup, smart: boolean, edits: Record<FileId, PdfBreakEdit> = {}): Promise<PaginationPlan> {
    if (!inputIds.length) throw Object.assign(new Error("No screenshots selected"), { code: "PDF_INVALID_BREAKS" });
    const engine = await getPdfEngine();
    const s = store.getState();
    const files = inputIds.map((id) => s.files[id]).filter((f): f is WorkspaceFile => !!f);
    if (files.length !== inputIds.length) throw Object.assign(new Error("Missing screenshot"), { code: "PDF_DECODE_FAILED" });
    const missing = smart ? files.filter((f) => !pdfAnalyses.hasSignals(f.id)) : [];
    if (missing.length) {
      const abort = new AbortController();
      activePdfAbort?.abort();
      activePdfAbort = abort;
      store.getState().setPdfStatus("analysing", 0, "Finding better page breaks");
      job("pdf:analyse", "pdf-analyse", "running", 0);
      try {
        const analysed = await engine.analyse(
          missing.map((f) => registry.blob(f.id)!),
          {
            signal: abort.signal,
            onProgress: (progress, stage) => {
              if (activePdfAbort !== abort) return;
              store.getState().setPdfStatus("analysing", progress, stage ?? "Finding better page breaks");
              job("pdf:analyse", "pdf-analyse", "running", progress);
            },
          },
        );
        if (abort.signal.aborted || activePdfAbort !== abort) {
          throw Object.assign(new Error("PDF_CANCELLED"), { code: "PDF_CANCELLED" });
        }
        missing.forEach((file, index) => pdfAnalyses.put(file.id, analysed.images[index]));
        job("pdf:analyse", "pdf-analyse", "done", 1);
      } catch (error) {
        const code = codeOf(error);
        const cancelled = code === "PDF_CANCELLED" || code === "CANCELLED";
        if (activePdfAbort === abort) {
          store.getState().setPdfStatus(cancelled ? "cancelled" : "failed", null, undefined, cancelled ? "PDF_CANCELLED" : code);
          job("pdf:analyse", "pdf-analyse", cancelled ? "cancelled" : "failed", null, code);
        }
        throw Object.assign(new Error(code), { code });
      } finally {
        if (activePdfAbort === abort) activePdfAbort = null;
      }
    }

    const analysedSet: AnalysedSet = {
      images: files.map((file) => {
        const cached = pdfAnalyses.get(file.id);
        return cached ?? { width: file.width, height: file.height, safeYs: [] };
      }),
      decodeMs: 0,
      signalMs: 0,
      wallMs: 0,
      path: "worker",
      decoders: [],
    };
    return engine.plan(analysedSet, setup, smart ? "visual" : "fixed", {
      manual: files.map((file) => edits[file.id]?.manual),
      frozen: files.map((file) => edits[file.id]?.frozen),
    });
  }

  function pdfSafeYs(assetId: FileId): number[] {
    return pdfAnalyses.get(assetId)?.safeYs ?? [];
  }

  async function runPdfExport(inputIds: FileId[], plan: PaginationPlan, searchable: boolean): Promise<WorkspacePdfResult> {
    if (!inputIds.length || !plan.pages.length) throw Object.assign(new Error("No PDF pages"), { code: "PDF_INVALID_BREAKS" });
    const engine = await getPdfEngine();
    const s = store.getState();
    const blobs = inputIds.map((id) => registry.blob(id));
    if (blobs.some((blob) => !blob)) throw Object.assign(new Error("Missing screenshot"), { code: "PDF_DECODE_FAILED" });
    const abort = new AbortController();
    activePdfAbort?.abort();
    activePdfAbort = abort;
    store.getState().setPdfStatus("exporting", 0, "Preparing pages");
    job("pdf:export", "pdf-export", "running", 0);
    broker.release("vision");
    try {
      const searchableText = searchable
        ? inputIds.map((id, imageIndex) => {
            const result = ocrResults.forAsset(id);
            if (!result) throw Object.assign(new Error("OCR required"), { code: "PDF_OCR_REQUIRED" });
            return searchableSourceFromResult(imageIndex, result, id);
          })
        : undefined;
      const result = await engine.createPdf(
        {
          images: blobs as Blob[],
          plan,
          imageFormat: s.pdf.imageFormat,
          jpegQuality: s.pdf.jpegQuality,
          title: searchable ? "Shotexa searchable screenshots" : "Shotexa screenshots",
          searchableText,
        },
        {
          signal: abort.signal,
          onProgress: (progress, stage) => {
            if (activePdfAbort !== abort) return;
            store.getState().setPdfStatus("exporting", progress, stage ?? "Creating PDF");
            job("pdf:export", "pdf-export", "running", progress);
          },
        },
      );
      if (abort.signal.aborted || activePdfAbort !== abort) {
        throw Object.assign(new Error("PDF_CANCELLED"), { code: "PDF_CANCELLED" });
      }
      const id = newId();
      const document: WorkspaceDocument = {
        id,
        name: searchable ? "shotexa-searchable-screenshots.pdf" : "shotexa-screenshots.pdf",
        type: "application/pdf",
        bytes: result.blob.size,
        pageCount: result.pages,
        sourceIds: [...inputIds],
        producedBy: searchable ? "searchable-pdf" : "pdf",
        addedAt: Date.now(),
      };
      registry.put(id, result.blob);
      store.getState().addDocument(document);
      store.getState().setPdfStatus("ready", 1, "PDF ready");
      job("pdf:export", "pdf-export", "done", 1);
      return { id, blob: result.blob, bytes: result.blob.size, pages: result.pages, ms: result.ms, path: result.path };
    } catch (error) {
      const code = codeOf(error);
      const cancelled = code === "PDF_CANCELLED" || code === "CANCELLED";
      if (activePdfAbort === abort) {
        store.getState().setPdfStatus(cancelled ? "cancelled" : "failed", null, undefined, cancelled ? "PDF_CANCELLED" : code);
        job("pdf:export", "pdf-export", cancelled ? "cancelled" : "failed", null, code);
      }
      throw Object.assign(new Error(code), { code });
    } finally {
      if (activePdfAbort === abort) activePdfAbort = null;
    }
  }

  const exportPdf = (inputIds: FileId[], plan: PaginationPlan) => runPdfExport(inputIds, plan, false);
  const exportSearchablePdf = (inputIds: FileId[], plan: PaginationPlan) => runPdfExport(inputIds, plan, true);

  function cancelPdf(): void {
    activePdfAbort?.abort();
    activePdfAbort = null;
    // A hard stop bounds cancellation latency during an uninterruptible image decode.
    pdfEngine?.dispose();
    pdfEngine = null;
    store.getState().setPdfStatus("cancelled", null, undefined, "PDF_CANCELLED");
  }

  // Reordering changes which screenshots are adjacent: re-run the (cheap) overlap hint.
  const unsubscribe = store.subscribe((next, prev) => {
    if (next.order !== prev.order && next.overlapHint.status === "idle") void checkOverlap();
  });

  return {
    store,
    registry,
    ocrResults,
    pdfAnalyses,
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
    exportCombine,
    exportEdit,
    exportSafeShare,
    inspectMetadata,
    cleanMetadata,
    extractText,
    cancelOcr,
    planPdf,
    pdfSafeYs,
    exportPdf,
    exportSearchablePdf,
    cancelPdf,
    dispose() {
      disposed = true;
      unsubscribe();
      store.getState().clear();
      registry.clear();
      ocrResults.clear();
      pdfAnalyses.clear();
      void ocrService?.dispose();
      ocrService = null;
      pdfEngine?.dispose();
      pdfEngine = null;
      broker.dispose();
    },
  };
}

/** Save a registry asset through a temporary link; the object URL is owned by the registry. */
export function downloadAsset(runtime: WorkspaceRuntime, id: FileId): void {
  const state = runtime.store.getState();
  const f = state.files[id] ?? state.documents[id];
  const url = runtime.registry.objectUrl(id);
  if (!f || !url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
