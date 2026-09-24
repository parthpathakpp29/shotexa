/**
 * PdfEngine — the only PDF API UI code uses (architecture §26). Analysis and generation run
 * in the document worker; re-planning after manual edits is pure and instant on the main
 * thread (signals are kept here, a few hundred KB).
 * Browsers without OffscreenCanvas (e.g. Playwright WebKit on Windows): page crops are encoded
 * on the main thread with a DOM canvas, one page at a time with yields; pdf-lib still runs in
 * the worker.
 */
import { DEFAULT_LIMITS } from "@/config/limits";
import { createWorkerClient, type WorkerJobError } from "@/workers/broker/worker-client";
import { analyseImage, safeYs } from "./analyse-image";
import { fromBitmap, timeSlicer } from "./decode";
import { resolvePaginationConfig, type PaginationConfigOverrides } from "./config";
import { PdfError, type PdfErrorCode } from "./errors";
import { buildPlan } from "./plan";
import { renderPages, type EncodedPage } from "./render-pdf";
import type { RowSignals } from "./signals";
import type { OcrLineBox, PageSetup, PaginationMode, PaginationPlan, PdfCreateInput } from "./types";

export interface AnalysedSet {
  images: { width: number; height: number; signals: RowSignals; safeYs: number[] }[];
  decodeMs: number;
  signalMs: number;
  wallMs: number;
  path: "worker" | "main-thread";
  decoders: string[];
}

/**
 * Recycle the document worker after a job that decoded more than this many pixels: decoded
 * image memory is not always returned promptly after `close()`, and a second full decode in
 * the same worker (analyse → export) stacks on top of it (Spike B/D).
 */
const RECYCLE_AFTER_PX = 8_000_000;

/** Smaller bands on the page thread: each band's encode is one uninterruptible task. */
const MAIN_THREAD_TILE_ROWS = 512;

const hasOffscreen = () => typeof OffscreenCanvas !== "undefined";
const domCanvas = (w: number, h: number) => Object.assign(document.createElement("canvas"), { width: w, height: h });

export function createPdfEngine(overrides?: PaginationConfigOverrides) {
  const cfg = resolvePaginationConfig(overrides);
  const worker = createWorkerClient(() => new Worker(new URL("../../workers/document.worker.ts", import.meta.url), { type: "module", name: "shotexa-document" }));
  // No OffscreenCanvas: decode in the worker (transferred bitmap), canvas work on the page in
  // small bands with yields — one image at a time so only one decoded image is resident.
  const workerDecode = async (image: Blob) => fromBitmap((await worker.run("pdf.decode", { image })).bitmap);
  const analyseOnPage = async (images: Blob[]) => {
    const out = [];
    for (const b of images) out.push(await analyseImage(b, cfg, domCanvas, workerDecode));
    return out;
  };
  const mapErr = (e: unknown): PdfError => {
    if (e instanceof PdfError) return e;
    const code = (e as WorkerJobError).code;
    if (code === "CANCELLED") return new PdfError("PDF_CANCELLED");
    if (typeof code === "string" && code.startsWith("PDF_")) return new PdfError(code as PdfErrorCode);
    return new PdfError("PDF_EXPORT_FAILED", String(code ?? e));
  };

  return {
    config: cfg,

    /** Decode + signals for each screenshot (worker, or main thread without OffscreenCanvas). */
    async analyse(images: Blob[], opts: { signal?: AbortSignal; onProgress?: (p: number, s?: string) => void } = {}): Promise<AnalysedSet> {
      const t0 = performance.now();
      try {
        const res = hasOffscreen()
          ? (await worker.run("pdf.analyse", { images, config: overrides }, opts)).images
          : await analyseOnPage(images);
        if (res.reduce((s, r) => s + r.width * r.height, 0) > RECYCLE_AFTER_PX) worker.terminate();
        return {
          images: res.map((r) => ({ width: r.width, height: r.height, signals: r.signals, safeYs: safeYs(r.signals, cfg) })),
          decodeMs: res.reduce((s, r) => s + r.decodeMs, 0),
          signalMs: res.reduce((s, r) => s + r.signalMs, 0),
          wallMs: performance.now() - t0,
          path: hasOffscreen() ? "worker" : "main-thread",
          decoders: res.map((r) => r.decoder),
        };
      } catch (e) {
        throw mapErr(e);
      }
    },

    /** Pure, instant: (re)build breaks + page slices, keeping manual breaks as anchors. */
    plan(set: AnalysedSet, setup: PageSetup, mode: PaginationMode, extra: { ocrLines?: (OcrLineBox[] | undefined)[]; manual?: (number[] | undefined)[]; frozen?: (number[] | undefined)[] } = {}): PaginationPlan {
      return buildPlan(
        set.images.map((im, i) => ({ width: im.width, height: im.height, signals: mode === "fixed" ? undefined : im.signals, ocrLines: extra.ocrLines?.[i], manualBreaks: extra.manual?.[i], fixedBreaks: extra.frozen?.[i] })),
        setup,
        mode,
        cfg,
      );
    },

    async createPdf(
      input: PdfCreateInput,
      opts: { signal?: AbortSignal; onProgress?: (p: number, s?: string) => void } = {},
    ): Promise<{ blob: Blob; ms: number; pages: number; path: "worker" | "main-thread"; tileRows: number }> {
      const slices = input.plan.pages;
      const px = input.plan.images.reduce((s, i) => s + i.width * i.height, 0);
      try {
        if (hasOffscreen()) {
          const r = await worker.run(
            "pdf.create",
            { images: input.images, slices, setup: input.plan.setup, imageFormat: input.imageFormat, jpegQuality: input.jpegQuality, title: input.title },
            opts,
          );
          return { ...r, path: "worker", tileRows: DEFAULT_LIMITS.tileHeight };
        }
        const t = performance.now();
        const pages: EncodedPage[] = [];
        for await (const p of renderPages(input.images, slices, {
          setup: input.plan.setup,
          imageFormat: input.imageFormat,
          jpegQuality: input.jpegQuality,
          signal: opts.signal,
          makeCanvas: domCanvas,
          decode: workerDecode,
          afterTile: timeSlicer(), // yield between bands: keep the page responsive
          tileRows: MAIN_THREAD_TILE_ROWS,
        })) {
          pages.push(p);
          opts.onProgress?.((0.8 * pages.length) / slices.length, `encode ${pages.length}/${slices.length}`);
        }
        const r = await worker.run("pdf.create", { slices, setup: input.plan.setup, imageFormat: input.imageFormat, pages }, opts);
        return { ...r, ms: Math.round(performance.now() - t), path: "main-thread", tileRows: MAIN_THREAD_TILE_ROWS };
      } catch (e) {
        throw mapErr(e);
      } finally {
        if (px > RECYCLE_AFTER_PX) worker.terminate();
      }
    },

    dispose() {
      worker.terminate();
    },
  };
}

export type ShotexaPdfEngine = ReturnType<typeof createPdfEngine>;
