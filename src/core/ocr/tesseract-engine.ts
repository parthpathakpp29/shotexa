/**
 * Tesseract.js implementation of OcrEngine — the ONLY module that talks to Tesseract.
 *
 * - Tesseract.js runs recognition in its own dedicated Web Worker (browser) or
 *   worker_thread (Node). This adapter keeps ONE worker and reuses it across jobs.
 * - `createWorker` is injected so the module is lazily loaded and testable.
 * - Jobs are serialised. Cancellation = terminate the worker (Tesseract has no per-job
 *   abort); the next job transparently re-initialises from cache.
 */
import { OcrError, toOcrError } from "./errors";
import { buildResult, normalizeTesseractBlocks, type CleanupOptions, type TesseractBlock } from "./normalize";
import type { OcrEngine, OcrInitOptions, OcrInput, OcrLanguage, OcrOptions, OcrResult, PageSegmentation } from "./types";

/** Structural subset of the tesseract.js API we depend on. */
export interface TesseractWorkerLike {
  recognize(
    image: unknown,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ): Promise<{ data: { text: string; blocks: TesseractBlock[] | null; confidence: number; rotateRadians?: number } }>;
  setParameters(params: Record<string, string>): Promise<unknown>;
  reinitialize(langs: string, oem?: number): Promise<unknown>;
  terminate(): Promise<unknown>;
}

export type CreateWorker = (
  langs: string,
  oem: number,
  options: Record<string, unknown>,
) => Promise<TesseractWorkerLike>;

export interface TesseractEngineConfig {
  createWorker: CreateWorker;
  /** Self-hosted asset locations (browser). Omit in Node except langPath. */
  workerPath?: string;
  corePath?: string;
  langPath: string;
  /** "write" caches decompressed models in IndexedDB (browser); "none" disables. */
  cacheMethod?: "write" | "readOnly" | "refresh" | "none";
  version: string;
  cleanup?: CleanupOptions;
  /**
   * Fail initialisation after this long (ms). Spike C: a missing core/model can make
   * Tesseract.js' createWorker never settle (the error is raised inside its worker).
   */
  initTimeoutMs?: number;
  /** Cheap reachability check for core/model assets before creating the worker (browser). */
  preflight?: (languages: string[]) => Promise<void>;
}

const PSM: Record<PageSegmentation, string> = { auto: "3", "single-column": "4", "single-block": "6", sparse: "11" };
const OEM_LSTM_ONLY = 1;

export class TesseractEngine implements OcrEngine {
  readonly name = "tesseract.js";
  private worker: TesseractWorkerLike | null = null;
  private langs = "";
  private queue: Promise<unknown> = Promise.resolve();
  private progress: OcrOptions["onProgress"] | null = null;
  private currentPsm = "";
  /** Number of worker (re)creations — exposed for diagnostics/benchmarks. */
  initCount = 0;

  constructor(private readonly cfg: TesseractEngineConfig) {}

  async initialise(options: OcrInitOptions = { languages: ["eng"] }): Promise<void> {
    const langs = [...options.languages].sort().join("+");
    if (this.worker && this.langs === langs) return;
    if (this.worker) {
      // Spike C: Tesseract.js `reinitialize()` leaks engine state across language switches
      // (after eng+hin → eng, rotated/vertical text went from 0.4% to 81% CER). A language
      // change therefore gets a FRESH worker; re-creating from cache costs ~1 s.
      await this.cancel();
    }
    if (this.cfg.preflight) await this.cfg.preflight(langs.split("+"));
    try {
      this.initCount++;
      const paths = Object.fromEntries(
        Object.entries({ workerPath: this.cfg.workerPath, corePath: this.cfg.corePath, langPath: this.cfg.langPath }).filter(([, v]) => v !== undefined),
      );
      const creating = this.cfg.createWorker(langs, OEM_LSTM_ONLY, {
        // Only pass defined paths: an explicit `undefined` overrides Tesseract's own defaults.
        ...paths,
        cacheMethod: this.cfg.cacheMethod ?? "write",
        // Load the worker script from our own origin (CSP-friendly, no blob: URLs).
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => this.progress?.(m.progress, m.status),
        // Errors still reject the pending promise; this only stops Tesseract re-throwing them
        // as uncaught exceptions on the page.
        errorHandler: () => {},
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // If the worker shows up late, don't leak it.
          void creating.then((w) => w.terminate()).catch(() => undefined);
          reject(new OcrError("OCR_ENGINE_LOAD_FAILED", "initialisation timed out"));
        }, this.cfg.initTimeoutMs ?? 120_000);
      });
      try {
        this.worker = await Promise.race([creating, timeout]);
      } finally {
        clearTimeout(timer);
      }
      this.langs = langs;
      this.currentPsm = "";
    } catch (e) {
      this.worker = null;
      const msg = String((e as Error)?.message ?? e);
      throw toOcrError(e, /traineddata|language/i.test(msg) ? "model" : "load");
    }
  }

  recognise(input: OcrInput, options: OcrOptions = {}): Promise<OcrResult> {
    const job = this.queue.then(() => this.run(input, options));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async run(input: OcrInput, options: OcrOptions): Promise<OcrResult> {
    if (options.signal?.aborted) throw new OcrError("OCR_CANCELLED");
    const languages = options.languages ?? (this.langs ? (this.langs.split("+") as OcrLanguage[]) : ["eng"]);
    await this.initialise({ languages });
    const worker = this.worker!;
    const onAbort = () => void this.cancel();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    this.progress = options.onProgress ?? null;
    const t0 = performance.now();
    try {
      const psm = PSM[options.segmentation ?? "auto"];
      if (psm !== this.currentPsm) {
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        this.currentPsm = psm;
      }
      // A terminated Tesseract worker may never settle its pending promise: race the abort.
      const aborted = new Promise<never>((_, reject) => {
        if (options.signal) options.signal.addEventListener("abort", () => reject(new OcrError("OCR_CANCELLED")), { once: true });
      });
      const { data } = await Promise.race([
        worker.recognize(
          input.image,
          options.autoRotate ? { rotateAuto: true } : {},
          // Granular layout output is OPT-IN in Tesseract.js: request it explicitly.
          { text: true, blocks: true },
        ),
        aborted,
      ]);
      if (options.signal?.aborted) throw new OcrError("OCR_CANCELLED");
      const blocks = normalizeTesseractBlocks(data.blocks, input.transform);
      return buildResult({
        blocks,
        language: this.langs,
        durationMs: performance.now() - t0,
        image: input.original,
        preprocessing: input.preprocessing ?? [],
        engine: { name: this.name, version: this.cfg.version },
        rotateRadians: data.rotateRadians,
        options: { readingOrder: options.readingOrder, preserveIndentation: options.preserveIndentation, cleanup: this.cfg.cleanup },
      });
    } catch (e) {
      if (options.signal?.aborted) throw new OcrError("OCR_CANCELLED");
      throw toOcrError(e, "recognise");
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      this.progress = null;
    }
  }

  /** Stop the running job by terminating the worker. Next job re-initialises. */
  async cancel(): Promise<void> {
    const w = this.worker;
    this.worker = null;
    this.langs = "";
    await w?.terminate().catch(() => undefined);
  }

  async terminate(): Promise<void> {
    await this.cancel();
  }

  get isLoaded(): boolean {
    return this.worker !== null;
  }
}
