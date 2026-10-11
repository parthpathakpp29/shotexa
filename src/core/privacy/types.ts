import type { ImageRect, RedactionMode } from "@/core/redaction/types";

export type PrivacyCategory = "personal" | "financial" | "developer" | "network" | "visual";
export type PrivacyConfidence = "high" | "medium" | "low";
export type PrivacySeverity = "critical" | "high" | "medium" | "low";

export type PrivacyFindingSubtype =
  | "email" | "phone" | "address" | "date-of-birth" | "identifier" | "username"
  | "payment-card" | "iban" | "bank-account"
  | "api-key" | "access-token" | "bearer-token" | "jwt" | "generic-secret"
  | "connection-string" | "secret-url" | "authorization-header" | "session-value" | "password-value"
  | "ipv4" | "ipv6" | "mac-address" | "private-network"
  | "qr-code" | "barcode" | "face" | "custom";

export interface PrivacyFinding {
  id: string;
  category: PrivacyCategory;
  subtype: PrivacyFindingSubtype;
  label: string;
  maskedValue: string;
  confidence: PrivacyConfidence;
  severity: PrivacySeverity;
  regions: ImageRect[];
  reason: string;
  detector: "pattern" | "context" | "entropy" | "custom" | "barcode" | "face";
  recommendation: RedactionMode | "review";
  selected: boolean;
  ignored?: boolean;
  /** The finding has been converted into editable redaction regions. */
  applied?: boolean;
}

export type PrivacyPresetId = "developer" | "customer-support" | "finance" | "social-sharing" | "maximum";

export interface PrivacyScanConfig {
  preset: PrivacyPresetId;
  enabledCategories: PrivacyCategory[];
  includeLowConfidence: boolean;
  detectBarcodes: boolean;
  customRules: PrivacyCustomRule[];
}

export interface PrivacyCustomRule {
  id: string;
  name: string;
  pattern: string;
  caseSensitive: boolean;
  enabled: boolean;
  category: Exclude<PrivacyCategory, "visual">;
}

export interface PrivacyScanResult {
  id: string;
  assetId: string;
  createdAt: number;
  findings: PrivacyFinding[];
  stages: string[];
  barcodeSupport: "supported" | "unsupported" | "not-requested";
}

export interface PrivacyVerification {
  selectedRegionsFlattened: number;
  metadataRemoved: boolean;
  exportGenerated: boolean;
  redactionsEditable: false;
  residualFindingCount?: number;
}
