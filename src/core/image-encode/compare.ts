/**
 * Size comparison and honest advice. A larger result is reported as larger — never as savings —
 * and a suggestion is only ever a suggestion: settings change only when the user applies it.
 */
import { FORMAT_LABEL, type OutputFormat } from "./formats";

export interface SizeComparison {
  original: number;
  output: number;
  /** output − original (negative = smaller). */
  delta: number;
  /** Bytes saved (0 when the output is not smaller). */
  saved: number;
  /** Whole percent saved (smaller) or added (larger), relative to the original. */
  percent: number;
  outcome: "smaller" | "same" | "larger";
}

export function compareSize(original: number, output: number): SizeComparison {
  const delta = output - original;
  const outcome = delta < 0 ? "smaller" : delta > 0 ? "larger" : "same";
  const percent = original > 0 ? Math.round((Math.abs(delta) / original) * 100) : 0;
  return { original, output, delta, saved: Math.max(0, -delta), percent, outcome };
}

export interface Suggestion {
  message: string;
  /** Settings the "Try it" button applies. */
  apply?: { format: OutputFormat; quality?: number };
}

/** Quality the "try a smaller setting" suggestions use. */
export const SUGGESTED_QUALITY = 0.8;

export function suggest(input: { format: OutputFormat; quality: number; comparison: SizeComparison; probe?: { format: OutputFormat; quality: number; bytes: number } }): Suggestion | null {
  const { format, quality, comparison, probe } = input;
  const probeSaving = probe ? compareSize(comparison.original, probe.bytes) : null;
  const probeWins = !!probe && probeSaving!.outcome === "smaller" && probe.bytes < comparison.output * 0.8;
  const probeLabel = probe ? `${FORMAT_LABEL[probe.format]} at ${Math.round(probe.quality * 100)}%` : "";

  if (format === "png") {
    // The browser's PNG encoder is lossless with no quality setting: the only lever is the format.
    if (probeWins) return { message: `${probeLabel} would be ${probeSaving!.percent}% smaller than the original.`, apply: { format: probe!.format, quality: probe!.quality } };
    if (comparison.outcome !== "smaller") return { message: "PNG is lossless, so this screenshot can't get smaller as PNG. Try WebP for a smaller file.", apply: { format: "webp", quality: SUGGESTED_QUALITY } };
    return null;
  }
  if (comparison.outcome === "smaller") return null;
  if (quality > SUGGESTED_QUALITY) return { message: `Lower the quality to ${Math.round(SUGGESTED_QUALITY * 100)}% for a smaller file.`, apply: { format, quality: SUGGESTED_QUALITY } };
  if (format === "jpeg") return { message: "Try WebP for a smaller file.", apply: { format: "webp", quality } };
  return { message: "This image is already well compressed. Keeping the original may be best." };
}
