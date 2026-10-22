import type { OcrResult } from "@/core/ocr/types";
import { detectVisualCodes } from "./barcode";
import { detectPlateText, detectSensitiveText } from "./detectors";
import type { FaceSuggestion } from "./face-detect";
import type { PrivacyScanConfig, PrivacyScanResult } from "./types";

const scanId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `privacy-${Date.now().toString(36)}`;

export async function buildPrivacyScan(args: {
  assetId: string; blob: Blob; ocr?: OcrResult; faces?: FaceSuggestion[]; faceSupport?: PrivacyScanResult["faceSupport"]; config: PrivacyScanConfig; signal?: AbortSignal; onStage?(stage: string): void;
}): Promise<PrivacyScanResult> {
  const stages = ["Reading screenshot…"];
  const cancelled = () => { if (args.signal?.aborted) throw Object.assign(new Error("Privacy scan cancelled"), { code: "PRIVACY_SCAN_CANCELLED" }); };
  cancelled();
  args.onStage?.("Checking sensitive data…");
  stages.push("Checking sensitive data…");
  const findings = args.ocr ? detectSensitiveText(args.ocr, args.config) : [];
  if (args.ocr && args.config.detectPlateText && args.config.enabledCategories.includes("visual")) findings.push(...detectPlateText(args.ocr));
  for (const [index, face] of (args.faces ?? []).entries()) findings.push({
    id: `face-${index + 1}`, category: "visual", subtype: "face", label: `Possible face ${index + 1}`,
    maskedValue: "Visual content", confidence: face.score >= 0.85 ? "high" : "medium", severity: "medium",
    regions: [face.rect], reason: "Local YuNet model suggestion; check the full face boundary.", detector: "face",
    recommendation: "blackout", selected: true,
  });
  cancelled();
  let barcodeSupport: PrivacyScanResult["barcodeSupport"] = "not-requested";
  if (args.config.detectBarcodes && args.config.enabledCategories.includes("visual")) {
    const visual = await detectVisualCodes(args.blob, args.signal);
    barcodeSupport = visual.supported ? "supported" : "unsupported";
    findings.push(...visual.findings);
  }
  cancelled();
  args.onStage?.("Preparing review…");
  stages.push("Preparing review…");
  return { id: scanId(), assetId: args.assetId, createdAt: Date.now(), findings, stages, barcodeSupport, faceSupport: args.faceSupport ?? "not-requested" };
}
