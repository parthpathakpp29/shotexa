import type { PrivacyCategory, PrivacyPresetId, PrivacyScanConfig } from "./types";

const ALL: PrivacyCategory[] = ["personal", "financial", "developer", "network", "visual"];

export const PRIVACY_PRESETS: { id: PrivacyPresetId; label: string; description: string; categories: PrivacyCategory[]; barcodes: boolean }[] = [
  { id: "developer", label: "Developer Screenshot", description: "Keys, tokens, JWTs, secret URLs, IP addresses and email.", categories: ["developer", "network", "personal"], barcodes: false },
  { id: "customer-support", label: "Customer Support", description: "Contact details, labelled IDs and account data.", categories: ["personal", "financial"], barcodes: false },
  { id: "finance", label: "Finance", description: "Cards, IBANs, account numbers and email.", categories: ["financial", "personal"], barcodes: false },
  { id: "social-sharing", label: "Social Sharing", description: "Contact details, usernames and visual codes for review.", categories: ["personal", "visual"], barcodes: true },
  { id: "maximum", label: "Maximum Scan", description: "All supported deterministic detectors.", categories: ALL, barcodes: true },
];

export function privacyConfigForPreset(preset: PrivacyPresetId): PrivacyScanConfig {
  const value = PRIVACY_PRESETS.find((item) => item.id === preset) ?? PRIVACY_PRESETS[4];
  return { preset: value.id, enabledCategories: [...value.categories], includeLowConfidence: true, detectBarcodes: value.barcodes, detectFaces: false, detectPlateText: false, customRules: [] };
}

export const DEFAULT_PRIVACY_SCAN = privacyConfigForPreset("maximum");
