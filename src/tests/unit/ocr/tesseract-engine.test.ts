import { describe, expect, it, vi } from "vitest";
import { OcrError } from "@/core/ocr/errors";
import type { TesseractBlock } from "@/core/ocr/normalize";
import { TesseractEngine, type CreateWorker, type TesseractWorkerLike } from "@/core/ocr/tesseract-engine";

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

function block(): TesseractBlock {
  return {
    bbox: box(10, 10, 210, 60),
    confidence: 90,
    blocktype: "FLOWING_TEXT",
    paragraphs: [
      {
        bbox: box(10, 10, 210, 60),
        confidence: 90,
        lines: [
          {
            bbox: box(10, 10, 210, 30),
            confidence: 92,
            text: "Hello world\n",
            baseline: { x0: 10, y0: 28, x1: 210, y1: 28, has_baseline: true },
            words: [
              { bbox: box(10, 10, 90, 30), confidence: 95, text: "Hello" },
              { bbox: box(100, 10, 210, 30), confidence: 89, text: "world" },
            ],
          },
        ],
      },
    ],
  };
}

function fakeTesseract(opts: { recognizeDelay?: number; failRecognize?: Error; failCreate?: Error } = {}) {
  const calls = { create: 0, reinit: [] as string[], recognizeOutput: [] as unknown[], params: [] as unknown[], terminated: 0 };
  const createWorker: CreateWorker = vi.fn(async (langs: string) => {
    calls.create++;
    if (opts.failCreate) throw opts.failCreate;
    const w: TesseractWorkerLike = {
      async recognize(_img, _o, output) {
        calls.recognizeOutput.push(output);
        if (opts.failRecognize) throw opts.failRecognize;
        if (opts.recognizeDelay) await new Promise((r) => setTimeout(r, opts.recognizeDelay));
        return { data: { text: "Hello world", blocks: [block()], confidence: 90, rotateRadians: 0 } };
      },
      async setParameters(p) {
        calls.params.push(p);
      },
      async reinitialize(l) {
        calls.reinit.push(l);
      },
      async terminate() {
        calls.terminated++;
      },
    };
    void langs;
    return w;
  });
  return { createWorker, calls };
}

const input = { image: new Uint8Array([1, 2, 3]), original: { width: 400, height: 200 } };

describe("TesseractEngine (adapter contract)", () => {
  it("creates one worker and reuses it across jobs; explicitly requests block output", async () => {
    const t = fakeTesseract();
    const engine = new TesseractEngine({ createWorker: t.createWorker, langPath: "/lang", version: "test" });
    await engine.initialise({ languages: ["eng"] });
    const r1 = await engine.recognise(input);
    const r2 = await engine.recognise(input);
    expect(t.calls.create).toBe(1);
    expect(t.calls.recognizeOutput).toEqual([{ text: true, blocks: true }, { text: true, blocks: true }]);
    expect(r1.rawText).toBe("Hello world");
    expect(r2.engine).toEqual({ name: "tesseract.js", version: "test" });
    expect(t.calls.params).toEqual([{ tessedit_pageseg_mode: "3" }]); // set once, cached
  });

  it("maps boxes back to original coordinates via the transform and keeps layout separate from edited text", async () => {
    const t = fakeTesseract();
    const engine = new TesseractEngine({ createWorker: t.createWorker, langPath: "/lang", version: "t" });
    const r = await engine.recognise({ ...input, transform: { scale: 2, offsetX: 0, offsetY: 100 } });
    const w = r.blocks[0].paragraphs[0].lines[0].words[0];
    expect(w.bbox).toEqual({ x: 5, y: 105, w: 40, h: 10 });
    expect(w.confidence).toBeCloseTo(0.95);
    expect(r.blocks[0].paragraphs[0].lines[0].baseline).toEqual({ x0: 5, y0: 114, x1: 105, y1: 114 });
    r.editedText = "user edit";
    expect(r.blocks[0].paragraphs[0].lines[0].text).toBe("Hello world");
  });

  it("switches languages with a fresh worker (reinitialize leaks state — Spike C)", async () => {
    const t = fakeTesseract();
    const engine = new TesseractEngine({ createWorker: t.createWorker, langPath: "/lang", version: "t" });
    await engine.recognise(input, { languages: ["eng"] });
    await engine.recognise(input, { languages: ["hin", "eng"] });
    await engine.recognise(input, { languages: ["eng", "hin"] }); // same set, any order → reuse
    expect(t.calls.create).toBe(2);
    expect(t.calls.terminated).toBe(1);
    expect(t.calls.reinit).toEqual([]);
  });

  it("serialises jobs", async () => {
    const t = fakeTesseract({ recognizeDelay: 30 });
    const engine = new TesseractEngine({ createWorker: t.createWorker, langPath: "/lang", version: "t" });
    const order: number[] = [];
    await Promise.all([engine.recognise(input).then(() => order.push(1)), engine.recognise(input).then(() => order.push(2))]);
    expect(order).toEqual([1, 2]);
  });

  it("cancels by terminating the worker; the next job re-initialises", async () => {
    const t = fakeTesseract({ recognizeDelay: 200 });
    const engine = new TesseractEngine({ createWorker: t.createWorker, langPath: "/lang", version: "t" });
    const ac = new AbortController();
    const job = engine.recognise(input, { signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await expect(job).rejects.toMatchObject({ code: "OCR_CANCELLED" });
    expect(t.calls.terminated).toBe(1);
    expect(engine.isLoaded).toBe(false);
    await engine.recognise(input);
    expect(t.calls.create).toBe(2);
  });

  it("rejects immediately when already aborted", async () => {
    const t = fakeTesseract();
    const engine = new TesseractEngine({ createWorker: t.createWorker, langPath: "/lang", version: "t" });
    const ac = new AbortController();
    ac.abort();
    await expect(engine.recognise(input, { signal: ac.signal })).rejects.toBeInstanceOf(OcrError);
    expect(t.calls.create).toBe(0);
  });

  it("maps third-party failures to controlled codes", async () => {
    const load = new TesseractEngine({ createWorker: fakeTesseract({ failCreate: new Error("NetworkError when attempting to fetch resource") }).createWorker, langPath: "/l", version: "t" });
    await expect(load.initialise()).rejects.toMatchObject({ code: "OCR_ENGINE_LOAD_FAILED" });
    const model = new TesseractEngine({ createWorker: fakeTesseract({ failCreate: new Error("Failed to load eng.traineddata") }).createWorker, langPath: "/l", version: "t" });
    await expect(model.initialise()).rejects.toMatchObject({ code: "OCR_MODEL_LOAD_FAILED" });
    const oom = new TesseractEngine({ createWorker: fakeTesseract({ failRecognize: new Error("Cannot enlarge memory arrays") }).createWorker, langPath: "/l", version: "t" });
    await expect(oom.recognise(input)).rejects.toMatchObject({ code: "OCR_OUT_OF_MEMORY" });
    const decode = new TesseractEngine({ createWorker: fakeTesseract({ failRecognize: new Error("Error attempting to read image.") }).createWorker, langPath: "/l", version: "t" });
    await expect(decode.recognise(input)).rejects.toMatchObject({ code: "OCR_DECODE_FAILED" });
  });

  it("maps page segmentation options to Tesseract PSM values", async () => {
    const t = fakeTesseract();
    const engine = new TesseractEngine({ createWorker: t.createWorker, langPath: "/lang", version: "t" });
    await engine.recognise(input, { segmentation: "sparse" });
    await engine.recognise(input, { segmentation: "single-column" });
    expect(t.calls.params).toEqual([{ tessedit_pageseg_mode: "11" }, { tessedit_pageseg_mode: "4" }]);
  });
});

describe("TesseractEngine initialisation safety", () => {
  it("times out a createWorker that never settles and terminates the late worker", async () => {
    let resolveLate: (w: TesseractWorkerLike) => void = () => {};
    const terminated = vi.fn(async () => undefined);
    const createWorker: CreateWorker = () => new Promise((r) => (resolveLate = r));
    const engine = new TesseractEngine({ createWorker, langPath: "/l", version: "t", initTimeoutMs: 30 });
    await expect(engine.initialise()).rejects.toMatchObject({ code: "OCR_ENGINE_LOAD_FAILED" });
    resolveLate({ terminate: terminated } as unknown as TesseractWorkerLike);
    await new Promise((r) => setTimeout(r, 0));
    expect(terminated).toHaveBeenCalled();
  });

  it("runs the preflight before creating a worker and surfaces its controlled code", async () => {
    const t = fakeTesseract();
    const engine = new TesseractEngine({
      createWorker: t.createWorker,
      langPath: "/l",
      version: "t",
      preflight: async () => {
        throw new OcrError("OCR_MODEL_LOAD_FAILED");
      },
    });
    await expect(engine.initialise()).rejects.toMatchObject({ code: "OCR_MODEL_LOAD_FAILED" });
    expect(t.calls.create).toBe(0);
  });
});
