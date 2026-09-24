/**
 * Browser OCR service — the only OCR API UI code uses (architecture §26, §32).
 *
 *   Blob ─► validate ─► [image worker: decode + OCR-only preprocessing + strips]
 *        ─► OcrEngine (Tesseract.js in its own dedicated worker, reused) ─► OcrResult
 *
 * Nothing leaves the device: models/cores are self-hosted static assets; images are
 * passed to same-origin workers only.
 */
import { DEFAULT_OCR_CONFIG, type OcrRuntimeConfig } from "@/config/ocr";
import vendorAssets from "@/config/vendor-assets.json";
import { readImageSize } from "@/core/image/image-size";
import { sniffImageType } from "@/core/image/validate";
import { createWorkerClient, WorkerJobError } from "@/workers/broker/worker-client";
import { OcrError } from "./errors";
import { buildResult } from "./normalize";
import type { PreparedImage } from "./prepare-image";
import type { PreprocessStep } from "./preprocess";
import { mergeStripResults, planOcrStrips } from "./strips";
import { TesseractEngine, type CreateWorker } from "./tesseract-engine";
import type { OcrLanguage, OcrResult, PageSegmentation, ReadingOrder } from "./types";

export interface ExtractOptions {
  languages?: OcrLanguage[];
  preprocessing?: "auto" | "none" | PreprocessStep[];
  readingOrder?: ReadingOrder;
  segmentation?: PageSegmentation;
  strips?: "auto" | "off" | "force";
  preserveIndentation?: boolean;
  signal?: AbortSignal;
  onProgress?: (fraction: number, stage: string) => void;
}

export interface ExtractResult extends OcrResult {
  timings: { validateMs: number; prepareMs: number; initMs: number; recogniseMs: number; totalMs: number };
  parts: number;
  /** Reasons the requested pipeline was reduced (e.g. no OffscreenCanvas). */
  fallbacks: string[];
}

export interface TesseractAssets {
  version: string;
  workerPath: string;
  corePath: string;
  langPath: string;
}

export function createOcrService(opts: { config?: OcrRuntimeConfig; assets?: TesseractAssets } = {}) {
  const config = opts.config ?? DEFAULT_OCR_CONFIG;
  const assets = opts.assets ?? vendorAssets.tesseract;
  const imageWorker = createWorkerClient(() => new Worker(new URL("../../workers/image.worker.ts", import.meta.url), { type: "module", name: "shotexa-image" }));
  let engine: TesseractEngine | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let current: AbortController | null = null;

  const getEngine = async () => {
    if (engine) return engine;
    // Separate chunk: Tesseract.js API code loads only on OCR intent.
    const { createWorker } = (await import("tesseract.js")) as unknown as { createWorker: CreateWorker };
    engine = new TesseractEngine({
      createWorker,
      workerPath: assets.workerPath,
      corePath: assets.corePath,
      langPath: assets.langPath,
      cacheMethod: "write",
      version: assets.version,
      initTimeoutMs: config.initTimeoutMs,
      preflight,
    });
    return engine;
  };

  /** HEAD-check self-hosted assets once per session so a 404 fails fast with a controlled code. */
  const checked = new Set<string>();
  const preflight = async (languages: string[]) => {
    const head = async (url: string, code: "OCR_ENGINE_LOAD_FAILED" | "OCR_MODEL_LOAD_FAILED") => {
      if (checked.has(url)) return;
      const ok = await fetch(url, { method: "HEAD" }).then((r) => r.ok, () => false);
      if (!ok) throw new OcrError(code, url);
      checked.add(url);
    };
    await head(assets.workerPath, "OCR_ENGINE_LOAD_FAILED");
    await head(`${assets.corePath}/tesseract-core-lstm.wasm.js`, "OCR_ENGINE_LOAD_FAILED");
    for (const l of languages) await head(`${assets.langPath}/${l}.traineddata.gz`, "OCR_MODEL_LOAD_FAILED");
  };

  const scheduleIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void engine?.terminate(), config.idleTerminateMs);
  };

  async function prepare(blob: Blob, width: number, height: number, o: ExtractOptions, fallbacks: string[], signal: AbortSignal): Promise<PreparedImage> {
    const wantStrips = o.strips === "force" || ((o.strips ?? "auto") === "auto" && height > config.stripThresholdPx);
    const steps = o.preprocessing ?? "auto";
    const trivial = { parts: [{ image: blob, scale: 1, y: 0, height }], steps: [] as PreprocessStep[], stats: null as never, width, height, decodeMs: 0, prepMs: 0, encodeMs: 0 };
    if (steps === "none" && !wantStrips) return trivial;
    if (typeof OffscreenCanvas === "undefined") {
      // e.g. Playwright WebKit (WinCairo): no OffscreenCanvas → no worker preprocessing.
      fallbacks.push("NO_OFFSCREEN_CANVAS");
      return trivial;
    }
    const strips = wantStrips ? planOcrStrips(height, config.stripHeightPx, config.stripOverlapPx).map((s) => ({ y: s.y, height: s.height })) : undefined;
    try {
      return await imageWorker.run("ocr.prepare", { image: blob, steps: steps === "none" ? [] : steps, strips }, { signal });
    } catch (e) {
      const code = (e as WorkerJobError).code;
      if (code === "CANCELLED") throw new OcrError("OCR_CANCELLED");
      if (code === "OCR_DECODE_FAILED") throw new OcrError("OCR_DECODE_FAILED");
      if (code === "OCR_OUT_OF_MEMORY" || code === "MEMORY_PRESSURE") throw new OcrError("OCR_OUT_OF_MEMORY");
      throw new OcrError("OCR_RECOGNITION_FAILED", String(code));
    }
  }

  return {
    /** Pre-load engine + models (e.g. when the OCR tool opens), without recognising. */
    async warmup(languages: OcrLanguage[] = ["eng"]) {
      const t = performance.now();
      await (await getEngine()).initialise({ languages });
      scheduleIdle();
      return performance.now() - t;
    },

    async extract(blob: Blob, o: ExtractOptions = {}): Promise<ExtractResult> {
      const t0 = performance.now();
      current?.abort();
      const ac = new AbortController();
      current = ac;
      o.signal?.addEventListener("abort", () => ac.abort(), { once: true });
      if (idleTimer) clearTimeout(idleTimer);
      const fallbacks: string[] = [];
      const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
      const size = sniffImageType(head) ? await readImageSize(blob) : null;
      if (!size) throw new OcrError("OCR_DECODE_FAILED", "unsupported or corrupt image header");
      const validateMs = performance.now() - t0;

      const t1 = performance.now();
      o.onProgress?.(0.02, "preparing");
      const prepared = await prepare(blob, size.width, size.height, o, fallbacks, ac.signal);
      const prepareMs = performance.now() - t1;

      const t2 = performance.now();
      const eng = await getEngine();
      await eng.initialise({ languages: o.languages ?? ["eng"] }).catch((e) => {
        throw e instanceof OcrError ? e : new OcrError("OCR_ENGINE_LOAD_FAILED");
      });
      const initMs = performance.now() - t2;

      const t3 = performance.now();
      const n = prepared.parts.length;
      const results = [];
      for (const [i, part] of prepared.parts.entries()) {
        const r = await eng.recognise(
          { image: part.image, original: { width: size.width, height: size.height }, transform: { scale: part.scale, offsetX: 0, offsetY: part.y }, preprocessing: prepared.steps },
          {
            languages: o.languages,
            segmentation: o.segmentation,
            readingOrder: o.readingOrder ?? "auto",
            preserveIndentation: o.preserveIndentation,
            signal: ac.signal,
            onProgress: (p, stage) => o.onProgress?.(0.05 + (0.95 * (i + (stage === "recognizing text" ? p : 0))) / n, stage),
          },
        );
        results.push(r);
      }
      const recogniseMs = performance.now() - t3;

      let result: OcrResult = results[0];
      if (n > 1) {
        const strips = planOcrStrips(size.height, config.stripHeightPx, config.stripOverlapPx);
        const merged = mergeStripResults(results.map((r, i) => ({ strip: strips[i], result: r })), size);
        result = buildResult({
          blocks: merged.blocks,
          language: results[0].language,
          durationMs: merged.durationMs,
          image: size,
          preprocessing: prepared.steps,
          engine: results[0].engine,
          options: { readingOrder: o.readingOrder ?? "auto", preserveIndentation: o.preserveIndentation },
        });
      }
      if (current === ac) current = null;
      // Large jobs grow the engine's WASM heap permanently: recycle the worker afterwards.
      const recognisedPixels = prepared.parts.reduce((sum, p) => sum + size.width * p.scale * p.height * p.scale, 0);
      if (recognisedPixels >= config.recycleAfterPixels) await eng.terminate();
      else scheduleIdle();
      o.onProgress?.(1, "done");
      return { ...result, timings: { validateMs, prepareMs, initMs, recogniseMs, totalMs: performance.now() - t0 }, parts: n, fallbacks };
    },

    /** Cancel the running job (terminates the OCR worker; next job re-initialises from cache). */
    async cancel() {
      current?.abort();
      current = null;
      await engine?.cancel();
    },

    async dispose() {
      if (idleTimer) clearTimeout(idleTimer);
      current?.abort();
      await engine?.terminate();
      engine = null;
      imageWorker.terminate();
    },

    get engineLoaded() {
      return engine?.isLoaded ?? false;
    },
  };
}

export type OcrService = ReturnType<typeof createOcrService>;
