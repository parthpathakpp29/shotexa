/**
 * Decide HOW to produce a (possibly very tall) output before allocating anything.
 * Pure: depends only on dimensions, format, capabilities and limits, so it is testable
 * and can drive UI copy ("This image is very tall — download as PNG or split into N parts").
 */
import { DEFAULT_LIMITS, type ProcessingLimits } from "@/config/limits";

export type OutputFormat = "png" | "jpeg" | "webp";

export interface OutputRequest {
  width: number;
  height: number;
  format: OutputFormat;
  /** Decoded bytes of the largest single source that must be resident at once. */
  largestSourceBytes: number;
}

export interface Capabilities {
  offscreenCanvas: boolean;
  compressionStream: boolean;
}

export type OutputStrategy =
  | { kind: "single-canvas" }
  | { kind: "tiled-png"; tileHeight: number }
  | { kind: "split"; format: OutputFormat; sectionHeight: number; parts: number }
  | { kind: "reduce-or-split"; reason: string };

export interface StrategyDecision {
  strategy: OutputStrategy;
  estimates: { outputBytes: number; singleCanvasPeakBytes: number; tiledPeakBytes: number };
  /** Controlled reason codes, useful for analytics (`memory_fallback`) and UI copy. */
  reasons: string[];
}

export function decodedBytes(width: number, height: number): number {
  return width * height * 4;
}

export function chooseOutputStrategy(req: OutputRequest, caps: Capabilities, limits: ProcessingLimits = DEFAULT_LIMITS): StrategyDecision {
  const reasons: string[] = [];
  const outputBytes = decodedBytes(req.width, req.height);
  const tileBytes = decodedBytes(req.width, Math.min(limits.tileHeight, req.height));
  const singleCanvasPeakBytes = outputBytes * limits.singleCanvasPeakFactor + req.largestSourceBytes;
  // Tile canvas + one readback buffer + resident source(s).
  const tiledPeakBytes = tileBytes * 2 + req.largestSourceBytes;
  const estimates = { outputBytes, singleCanvasPeakBytes, tiledPeakBytes };
  const split = (format: OutputFormat): StrategyDecision => ({
    strategy: { kind: "split", format, sectionHeight: limits.splitSectionHeight, parts: Math.ceil(req.height / limits.splitSectionHeight) },
    estimates,
    reasons,
  });

  if (req.largestSourceBytes > limits.softBudgetBytes) {
    reasons.push("SOURCE_EXCEEDS_BUDGET");
    return { strategy: { kind: "reduce-or-split", reason: "SOURCE_EXCEEDS_BUDGET" }, estimates, reasons };
  }

  const maxSide = limits.formatMaxSide[req.format];
  if (req.width > maxSide || req.height > maxSide) {
    // Never let an encoder silently crop (Chromium truncates WebP > 16383 px).
    reasons.push("FORMAT_DIMENSION_LIMIT");
    return split(req.format);
  }

  const fitsCanvas = req.height <= limits.maxSingleCanvasHeight && req.width * req.height <= limits.maxSingleCanvasArea;
  if (!fitsCanvas) reasons.push("CANVAS_SIZE_LIMIT");
  const fitsBudget = singleCanvasPeakBytes <= limits.softBudgetBytes;
  if (!fitsBudget) reasons.push("MEMORY_BUDGET");

  if (fitsCanvas && fitsBudget && caps.offscreenCanvas) return { strategy: { kind: "single-canvas" }, estimates, reasons };

  if (req.format === "png" && caps.compressionStream) {
    return { strategy: { kind: "tiled-png", tileHeight: limits.tileHeight }, estimates, reasons };
  }
  // JPEG/WebP have no streaming browser encoder: split into sections (or offer PNG/PDF).
  reasons.push("NO_STREAMING_ENCODER");
  return split(req.format);
}
