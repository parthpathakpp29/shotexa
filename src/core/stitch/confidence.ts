import type { StitchConfig } from "./config";
import type { ConfidenceBreakdown, ConfidenceClass } from "./types";

export interface ConfidenceInputs {
  similarity: number;
  /** best − second-best template score of the most distinctive agreeing template. */
  uniquenessGap: number;
  /** Weight of agreeing templates / weight of all usable templates. */
  agreement: number;
  /** Residual at chosen offset. */
  residual: number;
  /** Median residual over other offsets (baseline). */
  baselineResidual: number;
  /** Full-res ink-mismatch fraction in the refinement band (NaN = no ink / not measured). */
  inkMismatch: number;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function scoreConfidence(
  input: ConfidenceInputs,
  cfg: StitchConfig["confidence"],
  residualFloor: number,
): { confidence: number; breakdown: ConfidenceBreakdown } {
  const baseline = Math.max(input.baselineResidual, residualFloor);
  const breakdown: ConfidenceBreakdown = {
    similarity: clamp01(input.similarity),
    uniqueness: clamp01(input.uniquenessGap / cfg.uniquenessScale),
    agreement: clamp01(input.agreement),
    residualContrast: clamp01((baseline - input.residual) / baseline),
    seamResidual: Number.isFinite(input.inkMismatch) ? clamp01(1 - input.inkMismatch / cfg.inkMismatchScale) : 0,
    caps: [],
  };
  const w = cfg.weights;
  const totalW = w.similarity + w.uniqueness + w.agreement + w.residualContrast + w.seamResidual;
  let confidence =
    (w.similarity * breakdown.similarity +
      w.uniqueness * breakdown.uniqueness +
      w.agreement * breakdown.agreement +
      w.residualContrast * breakdown.residualContrast +
      w.seamResidual * breakdown.seamResidual) /
    totalW;

  if (breakdown.similarity < cfg.minSimilarity) {
    breakdown.caps.push("low-similarity");
    confidence = Math.min(confidence, cfg.lowCap);
  }
  if (input.inkMismatch > cfg.maxInkMismatch) {
    breakdown.caps.push("seam-ink-mismatch");
    confidence = Math.min(confidence, cfg.lowCap);
  }
  if (breakdown.residualContrast < cfg.minResidualContrast) {
    breakdown.caps.push("low-residual-contrast");
    confidence = Math.min(confidence, cfg.lowCap);
  }
  return { confidence, breakdown };
}

export function classifyConfidence(confidence: number, cfg: StitchConfig["confidence"]): ConfidenceClass {
  if (confidence >= cfg.thresholds.high) return "high";
  if (confidence >= cfg.thresholds.medium) return "medium";
  return "low";
}

/** Copy for the UI — never communicate confidence by colour only (§31). */
export function describeConfidence(confidence: number, cls: ConfidenceClass): string {
  const pct = Math.round(confidence * 100);
  switch (cls) {
    case "high":
      return `Confidence: ${pct}% — joined automatically.`;
    case "medium":
      return `Confidence: ${pct}% — please review this join.`;
    default:
      return `Confidence: ${pct}% — no reliable overlap found. Adjust the join manually.`;
  }
}
