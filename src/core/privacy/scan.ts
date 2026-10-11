import type { OcrResult } from "@/core/ocr/types";
import { detectVisualCodes } from "./barcode";
import { detectSensitiveText } from "./detectors";
import type { PrivacyScanConfig, PrivacyScanResult } from "./types";

const scanId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `privacy-${Date.now().toString(36)}`;

export async function buildPrivacyScan(args: {
  assetId: string; blob: Blob; ocr: OcrResult; config: PrivacyScanConfig; signal?: AbortSignal; onStage?(stage: string): void;
}): Promise<PrivacyScanResult> {
  const stages = ["Reading screenshot…", "Extracting text…"];
  const cancelled = () => { if (args.signal?.aborted) throw Object.assign(new Error("Privacy scan cancelled"), { code: "PRIVACY_SCAN_CANCELLED" }); };
  cancelled();
  args.onStage?.("Checking sensitive data…");
  stages.push("Checking sensitive data…");
  const findings = detectSensitiveText(args.ocr, args.config);
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
  return { id: scanId(), assetId: args.assetId, createdAt: Date.now(), findings, stages, barcodeSupport };
}
