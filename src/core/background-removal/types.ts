import type { OutputFormat } from "@/core/image-encode/formats";

export type BackgroundRemovalProvider = "webgpu" | "wasm";
export type MaskBrushMode = "restore" | "erase";
export type RemovalPreviewMode = "original" | "removed" | "split" | "checkerboard" | "mask";
export type EdgePreset = "natural" | "crisp" | "soft" | "product" | "portrait";

export interface MaskPoint { x: number; y: number; }
export interface MaskStroke {
  id: string;
  mode: MaskBrushMode;
  size: number;
  hardness: number;
  points: MaskPoint[];
}

export interface EdgeSettings {
  preset: EdgePreset;
  feather: number;
  shift: number;
  smooth: number;
}

export type RemovalBackground =
  | { kind: "transparent" }
  | { kind: "solid"; color: string }
  | { kind: "gradient" | "derived"; from: string; to: string; angle: number }
  | { kind: "blur-original"; blur: number }
  | { kind: "image" };

export interface SubjectPlacement {
  scale: number;
  x: number;
  y: number;
  padding: number;
  shadow: boolean;
}

export interface BackgroundRemovalSettings {
  edge: EdgeSettings;
  background: RemovalBackground;
  subject: SubjectPlacement;
  trim: boolean;
}

export interface SegmentationResult {
  mask: Uint8ClampedArray;
  width: number;
  height: number;
  provider: BackgroundRemovalProvider;
  model: "u2netp";
  modelBytes: number;
  modelLoadMs: number;
  inferenceMs: number;
  sessionReused: boolean;
}

export interface BackgroundRemovalRenderOptions {
  source: { width: number; height: number };
  mask: { data: Uint8ClampedArray; width: number; height: number };
  settings: BackgroundRemovalSettings;
  format: OutputFormat;
  quality?: number;
  backgroundImage?: Blob;
  createCanvas?: (width: number, height: number) => OffscreenCanvas | HTMLCanvasElement;
  signal?: { readonly aborted: boolean };
}

export interface BackgroundRemovalRenderResult {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

export type BackgroundRemovalErrorCode =
  | "BACKGROUND_MODEL_LOAD_FAILED"
  | "BACKGROUND_INFERENCE_FAILED"
  | "BACKGROUND_DECODE_FAILED"
  | "BACKGROUND_EXPORT_FAILED"
  | "BACKGROUND_JPEG_NEEDS_BACKGROUND"
  | "BACKGROUND_CUSTOM_IMAGE_MISSING"
  | "BACKGROUND_MASK_MISSING"
  | "BACKGROUND_CANCELLED"
  | "BACKGROUND_MEMORY_PRESSURE";

export class BackgroundRemovalError extends Error {
  constructor(readonly code: BackgroundRemovalErrorCode) { super(code); this.name = "BackgroundRemovalError"; }
}

export const EDGE_PRESETS: Record<EdgePreset, EdgeSettings> = {
  natural: { preset: "natural", feather: 1.5, shift: 0, smooth: 1 },
  crisp: { preset: "crisp", feather: 0, shift: -1, smooth: 0 },
  soft: { preset: "soft", feather: 3, shift: 0, smooth: 2 },
  product: { preset: "product", feather: 0.75, shift: -1, smooth: 1 },
  portrait: { preset: "portrait", feather: 2, shift: 1, smooth: 1 },
};

export const DEFAULT_BACKGROUND_REMOVAL: BackgroundRemovalSettings = {
  edge: EDGE_PRESETS.natural,
  background: { kind: "transparent" },
  subject: { scale: 1, x: 0, y: 0, padding: 0, shadow: false },
  trim: false,
};
