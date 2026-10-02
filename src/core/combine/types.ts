import type { OutputFormat } from "@/core/image/output-strategy";

export type CombineLayout = "vertical" | "horizontal" | "grid";
export type CombineAlignment = "start" | "center" | "end";
export type CombineSizing = "original" | "match-width" | "match-height";
export type CombineGridColumns = "auto" | 2 | 3 | 4;
export type CombineBackground = "transparent" | "white" | "cream" | "dark";

export interface CombineSettings {
  layout: CombineLayout;
  gap: number;
  background: CombineBackground;
  alignment: CombineAlignment;
  sizing: CombineSizing;
  gridColumns: CombineGridColumns;
}

export interface CombineSource {
  width: number;
  height: number;
}

/** One original source, scaled uniformly and placed in output-image pixels. */
export interface CombinePlacement {
  source: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CombinePlan {
  width: number;
  height: number;
  placements: CombinePlacement[];
  /** Undefined means transparent for PNG/WebP; JPEG is composited on white. */
  background?: string;
  settings: CombineSettings;
}

export interface CombineComposeOptions {
  format: OutputFormat;
  quality?: number;
  signal?: { readonly aborted: boolean };
  createCanvas?: (width: number, height: number) => OffscreenCanvas | HTMLCanvasElement;
  yieldBetweenTiles?: () => Promise<void>;
  onProgress?: (progress: number) => void;
}

export interface CombineComposeResult {
  blob: Blob;
  width: number;
  height: number;
  strategy: "single-canvas" | "tiled-png";
  ms: number;
}
