import type { PrivacyFinding } from "./types";

interface DetectedBarcode {
  boundingBox: { x: number; y: number; width: number; height: number };
  rawValue?: string;
  format?: string;
}
interface BarcodeDetectorLike { detect(source: ImageBitmap): Promise<DetectedBarcode[]> }
interface BarcodeDetectorConstructor { new(options?: { formats?: string[] }): BarcodeDetectorLike; getSupportedFormats?(): Promise<string[]> }

export async function detectVisualCodes(blob: Blob, signal?: AbortSignal): Promise<{ supported: boolean; findings: PrivacyFinding[] }> {
  const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector || typeof createImageBitmap !== "function") return { supported: false, findings: [] };
  let bitmap: ImageBitmap | null = null;
  try {
    const supported = await Detector.getSupportedFormats?.().catch(() => []) ?? [];
    if (signal?.aborted) throw Object.assign(new Error("Privacy scan cancelled"), { code: "PRIVACY_SCAN_CANCELLED" });
    const formats = ["qr_code", "aztec", "data_matrix", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"].filter((format) => !supported.length || supported.includes(format));
    const detector = new Detector(formats.length ? { formats } : undefined);
    bitmap = await createImageBitmap(blob);
    const codes = await detector.detect(bitmap);
    if (signal?.aborted) throw Object.assign(new Error("Privacy scan cancelled"), { code: "PRIVACY_SCAN_CANCELLED" });
    return {
      supported: true,
      findings: codes.map((code, index) => {
        const qr = code.format === "qr_code";
        const preview = code.rawValue?.trim();
        return {
          id: `${qr ? "qr" : "barcode"}-${index + 1}`,
          category: "visual",
          subtype: qr ? "qr-code" : "barcode",
          label: qr ? "QR code" : "Barcode",
          maskedValue: preview ? `${preview.slice(0, 3)}••••${preview.slice(-2)}` : "Visual content",
          confidence: "medium",
          severity: "medium",
          regions: [{ x: code.boundingBox.x, y: code.boundingBox.y, width: code.boundingBox.width, height: code.boundingBox.height }],
          reason: `${qr ? "QR code" : "Barcode"} detected locally; review recommended`,
          detector: "barcode",
          recommendation: "review",
          selected: false,
        } satisfies PrivacyFinding;
      }),
    };
  } finally { bitmap?.close(); }
}
