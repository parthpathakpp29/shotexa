import vendorAssets from "@/config/vendor-assets.json";
import type { ImageRect } from "@/core/redaction/types";

export interface FaceSuggestion { rect: ImageRect; score: number }
type Ort = typeof import("onnxruntime-web/webgpu");
type Session = import("onnxruntime-web").InferenceSession;
// The 2023mar ONNX export has a fixed 1×3×640×640 input.
const SIZE = 640;
const STRIDES = [8, 16, 32] as const;
let cached: Promise<{ ort: Ort; session: Session }> | null = null;

export function faceScanAllowed(source: { width: number; height: number }, deviceMemoryGb?: number): boolean {
  const limit = deviceMemoryGb !== undefined && deviceMemoryGb <= 4 ? 12_000_000 : 25_000_000;
  return source.width > 0 && source.height > 0 && source.width * source.height <= limit;
}

function overlap(a: ImageRect, b: ImageRect): number {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = w * h;
  return intersection / Math.max(1, a.width * a.height + b.width * b.height - intersection);
}

/** Decode the official YuNet 2023mar stride heads; boxes are mapped back from the letterboxed model image. */
export function decodeYuNet(outputs: Record<string, { data: Float32Array }>, source: { width: number; height: number }, threshold = 0.72): FaceSuggestion[] {
  const scale = Math.min(SIZE / source.width, SIZE / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  const left = (SIZE - drawWidth) / 2;
  const top = (SIZE - drawHeight) / 2;
  const found: FaceSuggestion[] = [];
  for (const stride of STRIDES) {
    const cls = outputs[`cls_${stride}`]?.data;
    const obj = outputs[`obj_${stride}`]?.data;
    const bbox = outputs[`bbox_${stride}`]?.data;
    const cols = SIZE / stride;
    if (!cls || !obj || !bbox || cls.length < cols * cols || obj.length < cols * cols || bbox.length < cols * cols * 4) continue;
    for (let index = 0; index < cols * cols; index++) {
      const score = Math.sqrt(Math.max(0, Math.min(1, cls[index])) * Math.max(0, Math.min(1, obj[index])));
      if (score < threshold) continue;
      const col = index % cols, row = Math.floor(index / cols);
      const w = Math.exp(Math.min(12, bbox[index * 4 + 2])) * stride;
      const h = Math.exp(Math.min(12, bbox[index * 4 + 3])) * stride;
      const cx = (col + bbox[index * 4]) * stride;
      const cy = (row + bbox[index * 4 + 1]) * stride;
      // A small safety margin protects face edges and hair without swallowing nearby content.
      const x1 = Math.max(0, (cx - w * 0.62 - left) / scale);
      const y1 = Math.max(0, (cy - h * 0.62 - top) / scale);
      const x2 = Math.min(source.width, (cx + w * 0.62 - left) / scale);
      const y2 = Math.min(source.height, (cy + h * 0.62 - top) / scale);
      if (x2 - x1 >= 4 && y2 - y1 >= 4) found.push({ rect: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, score });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const kept: FaceSuggestion[] = [];
  for (const candidate of found) if (kept.length < 20 && kept.every((other) => overlap(other.rect, candidate.rect) < 0.3)) kept.push(candidate);
  return kept;
}

async function load(origin: string) {
  if (!cached) cached = (async () => {
    const ort = await import("onnxruntime-web/webgpu");
    ort.env.wasm.wasmPaths = {
      mjs: new URL(vendorAssets.faceDetection.runtimeModulePath, origin).href,
      wasm: new URL(vendorAssets.faceDetection.runtimeWasmPath, origin).href,
    };
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const session = await ort.InferenceSession.create(new URL(vendorAssets.faceDetection.modelPath, origin).href, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    return { ort, session };
  })().catch((error) => { cached = null; throw error; });
  return cached;
}

export async function detectFaces(image: Blob, origin: string, signal: { readonly aborted: boolean }, onStage?: (stage: string) => void): Promise<FaceSuggestion[]> {
  let bitmap: ImageBitmap | null = null;
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  try {
    if (signal.aborted) return [];
    onStage?.("Preparing face image…");
    bitmap = await createImageBitmap(image);
    const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
    const width = bitmap.width * scale, height = bitmap.height * scale;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("FACE_CANVAS_UNAVAILABLE");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bitmap, (SIZE - width) / 2, (SIZE - height) / 2, width, height);
    const pixels = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const data = new Float32Array(3 * SIZE * SIZE);
    // OpenCV YuNet uses unnormalized BGR input, NCHW layout.
    for (let index = 0; index < SIZE * SIZE; index++) {
      data[index] = pixels[index * 4 + 2];
      data[SIZE * SIZE + index] = pixels[index * 4 + 1];
      data[2 * SIZE * SIZE + index] = pixels[index * 4];
    }
    onStage?.("Loading local face model…");
    const { ort, session } = await load(origin);
    if (signal.aborted) return [];
    onStage?.("Finding faces…");
    const output = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, SIZE, SIZE]) });
    if (signal.aborted) return [];
    return decodeYuNet(output as Record<string, { data: Float32Array }>, { width: bitmap.width, height: bitmap.height });
  } finally {
    bitmap?.close();
    canvas.width = 0; canvas.height = 0;
  }
}
