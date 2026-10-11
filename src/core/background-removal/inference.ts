import vendorAssets from "@/config/vendor-assets.json";
import { BackgroundRemovalError, type BackgroundRemovalProvider, type SegmentationResult } from "./types";

const MODEL_BYTES = 4_574_861;
type Ort = typeof import("onnxruntime-web/webgpu");
type Session = import("onnxruntime-web").InferenceSession;
let cached: Promise<{ ort: Ort; session: Session; provider: BackgroundRemovalProvider; loadMs: number }> | null = null;

async function session(origin: string, onStage?: (stage: string) => void) {
  if (cached) return cached;
  cached = (async () => {
    onStage?.("Loading model…");
    const started = performance.now();
    const ort = await import("onnxruntime-web/webgpu");
    ort.env.wasm.wasmPaths = {
      mjs: new URL(vendorAssets.backgroundRemoval.runtimeModulePath, origin).href,
      wasm: new URL(vendorAssets.backgroundRemoval.runtimeWasmPath, origin).href,
    };
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const model = new URL(vendorAssets.backgroundRemoval.modelPath, origin).href;
    if ("gpu" in navigator) {
      try {
        const value = await ort.InferenceSession.create(model, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
        return { ort, session: value, provider: "webgpu" as const, loadMs: Math.round(performance.now() - started) };
      } catch { /* retry with the universal CPU backend */ }
    }
    const value = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    return { ort, session: value, provider: "wasm" as const, loadMs: Math.round(performance.now() - started) };
  })().catch(() => { cached = null; throw new BackgroundRemovalError("BACKGROUND_MODEL_LOAD_FAILED"); });
  return cached;
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

export async function segmentImage(image: Blob, origin: string, signal: { readonly aborted: boolean }, onStage?: (stage: string) => void, createCanvas: (width: number, height: number) => Canvas = (width, height) => new OffscreenCanvas(width, height)): Promise<SegmentationResult> {
  let bitmap: ImageBitmap | null = null;
  let canvas: Canvas | null = null;
  try {
    if (signal.aborted) throw new BackgroundRemovalError("BACKGROUND_CANCELLED");
    onStage?.("Preparing background remover…");
    bitmap = await createImageBitmap(image).catch(() => { throw new BackgroundRemovalError("BACKGROUND_DECODE_FAILED"); });
    const sessionReused = cached !== null;
    const loaded = await session(origin, onStage);
    if (signal.aborted) throw new BackgroundRemovalError("BACKGROUND_CANCELLED");
    onStage?.("Analyzing image…");
    const size = 320;
    canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new BackgroundRemovalError("BACKGROUND_MEMORY_PRESSURE");
    ctx.drawImage(bitmap, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    const data = new Float32Array(3 * size * size);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (let i = 0; i < size * size; i++) for (let channel = 0; channel < 3; channel++) data[channel * size * size + i] = (pixels[i * 4 + channel] / 255 - mean[channel]) / std[channel];
    const started = performance.now();
    const output = await loaded.session.run({ [loaded.session.inputNames[0]]: new loaded.ort.Tensor("float32", data, [1, 3, size, size]) });
    if (signal.aborted) throw new BackgroundRemovalError("BACKGROUND_CANCELLED");
    onStage?.("Preparing mask…");
    const values = output[loaded.session.outputNames[0]]?.data;
    if (!(values instanceof Float32Array) || values.length < size * size) throw new BackgroundRemovalError("BACKGROUND_INFERENCE_FAILED");
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < size * size; i++) { min = Math.min(min, values[i]); max = Math.max(max, values[i]); }
    const range = Math.max(1e-6, max - min);
    const mask = new Uint8ClampedArray(size * size);
    for (let i = 0; i < mask.length; i++) mask[i] = Math.max(0, Math.min(255, Math.round(((values[i] - min) / range) * 255)));
    return { mask, width: size, height: size, provider: loaded.provider, model: "u2netp", modelBytes: MODEL_BYTES, modelLoadMs: sessionReused ? 0 : loaded.loadMs, inferenceMs: Math.round(performance.now() - started), sessionReused };
  } catch (error) {
    if (error instanceof BackgroundRemovalError) throw error;
    throw new BackgroundRemovalError("BACKGROUND_INFERENCE_FAILED");
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export function disposeSegmentationSession() { cached = null; }
