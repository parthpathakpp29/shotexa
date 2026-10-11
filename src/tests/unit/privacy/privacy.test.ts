import { describe, expect, it, vi } from "vitest";
import { parseCustomRules, saveCustomRules } from "@/core/privacy/custom-rules";
import { detectSensitiveText, isValidIban, passesLuhn, stringEntropy } from "@/core/privacy/detectors";
import { maskSensitiveValue } from "@/core/privacy/mask";
import { privacyConfigForPreset } from "@/core/privacy/presets";
import { PrivacyScanRegistry } from "@/core/privacy/registry";
import { validateCustomPattern } from "@/core/privacy/safe-regex";
import type { PrivacyCustomRule, PrivacyFindingSubtype } from "@/core/privacy/types";
import type { OcrLine, OcrResult } from "@/core/ocr/types";

function line(text: string, y = 0): OcrLine {
  const tokens = text.split(/\s+/);
  let x = 10;
  const words = tokens.map((token) => { const width = Math.max(12, token.length * 8); const word = { text: token, bbox: { x, y, w: width, h: 20 }, confidence: .96 }; x += width + 8; return word; });
  return { text, bbox: { x: 10, y, w: Math.max(1, x - 10), h: 20 }, confidence: .96, words };
}

function ocr(...texts: string[]): OcrResult {
  const lines = texts.map((text, index) => line(text, 10 + index * 30));
  return { rawText: texts.join("\n"), editedText: texts.join("\n"), language: "eng", confidence: .96, blocks: [{ bbox: { x: 0, y: 0, w: 1000, h: 1000 }, confidence: .96, paragraphs: [{ bbox: { x: 0, y: 0, w: 1000, h: 1000 }, confidence: .96, lines }] }], durationMs: 1, image: { width: 1200, height: 800 }, readingOrder: "auto", preprocessing: [], engine: { name: "synthetic", version: "1" } };
}

function find(texts: string[], subtype: PrivacyFindingSubtype, preset: Parameters<typeof privacyConfigForPreset>[0] = "maximum") {
  return detectSensitiveText(ocr(...texts), privacyConfigForPreset(preset)).find((finding) => finding.subtype === subtype);
}

describe("privacy detector patterns and confidence", () => {
  it("detects and masks email without retaining the raw display value", () => {
    const finding = find(["Email: person@example.test"], "email");
    expect(finding).toMatchObject({ confidence: "high", category: "personal", selected: true });
    expect(finding?.maskedValue).not.toContain("person@example.test");
  });
  it("uses explicit context to raise phone confidence", () => {
    expect(find(["Phone: +1 202 555 0147"], "phone")?.confidence).toBe("high");
    expect(find(["Reference 202 555 0147"], "phone")?.confidence).toBe("low");
  });
  it("detects valid public and private IPv4 but rejects impossible octets", () => {
    expect(find(["Host 8.8.4.4"], "ipv4")?.confidence).toBe("medium");
    expect(find(["Server 192.168.1.24"], "private-network")?.confidence).toBe("high");
    expect(detectSensitiveText(ocr("999.400.300.299"), privacyConfigForPreset("maximum")).some((item) => item.subtype === "ipv4")).toBe(false);
  });
  it("detects IPv6 and MAC addresses", () => {
    expect(find(["Address 2001:db8:85a3:8a2e:370:7334:1234:5678"], "ipv6")).toBeTruthy();
    expect(find(["MAC AA:BB:CC:DD:EE:FF"], "mac-address")?.confidence).toBe("high");
  });
  it("uses Luhn validation and maps cards split across OCR lines into multiple regions", () => {
    expect(passesLuhn("4242 4242 4242 4242")).toBe(true);
    expect(passesLuhn("4242 4242 4242 4241")).toBe(false);
    const finding = find(["4242 4242", "4242 4242"], "payment-card");
    expect(finding?.regions).toHaveLength(2);
  });
  it("validates IBAN checksum before reporting", () => {
    expect(isValidIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(find(["IBAN GB82 WEST 1234 5698 7654 32"], "iban")).toBeTruthy();
    expect(isValidIban("GB00 WEST 1234 5698 7654 32")).toBe(false);
  });
  it("detects JWT and Bearer authorization values", () => {
    expect(find(["token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c3ludGhldGljLXNpZ25hdHVyZQ"], "jwt")?.confidence).toBe("high");
    expect(find(["Authorization: Bearer synthetic_token_value_123456"], "bearer-token")?.severity).toBe("critical");
  });
  it.each([
    ["AWS", "AKIAABCDEFGHIJKLMNOP"],
    ["GitHub", "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"],
    ["OpenAI", "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"],
    ["Stripe", "sk_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["Slack", ["xoxb-", "1234567890", "-", "abcdefghijklmnop"].join("")],
  ])("recognises %s-style synthetic prefixes", (_provider, value) => {
    expect(find([`API Key: ${value}`], /AKIA/.test(value) ? "api-key" : "access-token")?.confidence).toBe("high");
  });
  it("does not duplicate a known token as a generic secret or embedded phone number", () => {
    const findings = detectSensitiveText(ocr("API Key: sk-proj-SYNTHETIC1234567890ABCDEFGHIJ"), privacyConfigForPreset("maximum"));
    expect(findings.filter((finding) => finding.subtype === "access-token")).toHaveLength(1);
    expect(findings.some((finding) => finding.subtype === "generic-secret" || finding.subtype === "phone")).toBe(false);
  });
  it("detects secret URL parameters and connection strings", () => {
    expect(find(["https://example.test/callback?token=synthetic-secret-12345"], "secret-url")).toBeTruthy();
    expect(find(["postgres://demo:synthetic-pass@localhost:5432/app"], "connection-string")).toBeTruthy();
  });
  it("detects authorization, session and password fields only with explicit labels", () => {
    expect(find(["Authorization: syntheticCredentialValue123"], "authorization-header")).toBeTruthy();
    expect(find(["sessionid=syntheticSessionValue123"], "session-value")).toBeTruthy();
    expect(find(["password=syntheticPassword"], "password-value")).toBeTruthy();
    expect(find(["Caption syntheticPassword"], "password-value")).toBeUndefined();
  });
  it("requires secret context for a generic high-entropy candidate", () => {
    const value = "aB9_xY72QpLmN4zK8rTsV6wC";
    expect(stringEntropy(value)).toBeGreaterThan(3.5);
    expect(find([`API key: ${value}`], "generic-secret")?.confidence).toBe("medium");
    expect(find([`Build hash ${value}`], "generic-secret")).toBeUndefined();
  });
  it("detects labelled DOB, ID, username, bank account and postal address conservatively", () => {
    expect(find(["Date of birth: 12/04/1990"], "date-of-birth")).toBeTruthy();
    expect(find(["Customer ID: CUST-12345678"], "identifier")).toBeTruthy();
    expect(find(["Username: demo.user"], "username")?.selected).toBe(false);
    expect(find(["Bank account number: 1234 5678 9012"], "bank-account")).toBeTruthy();
    expect(find(["Address: 123 Example Street Sampletown"], "address")).toBeTruthy();
  });
  it("does not aggressively flag ordinary identifiers without labels", () => {
    const findings = detectSensitiveText(ocr("Release build ABCD1234EFGH5678", "Order 12345678"), privacyConfigForPreset("maximum"));
    expect(findings.filter((finding) => ["identifier", "generic-secret", "bank-account"].includes(finding.subtype))).toEqual([]);
  });
  it("keeps low-confidence findings visible but unselected by default", () => {
    const username = find(["Username: demo.user"], "username");
    expect(username).toMatchObject({ confidence: "low", recommendation: "review", selected: false });
    const config = privacyConfigForPreset("maximum"); config.includeLowConfidence = false;
    expect(detectSensitiveText(ocr("Username: demo.user"), config).some((item) => item.subtype === "username")).toBe(false);
  });
});

describe("privacy masking, rules and cleanup", () => {
  it.each<[PrivacyFindingSubtype, string]>([["email", "person@example.test"], ["api-key", "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ"], ["payment-card", "4242 4242 4242 4242"], ["ipv4", "192.168.1.24"]])("masks %s display values", (subtype, raw) => {
    expect(maskSensitiveValue(raw, subtype)).not.toContain(raw);
  });
  it("accepts bounded custom rules and rejects risky regex constructs", () => {
    expect(validateCustomPattern("CUST-[0-9]{8}").ok).toBe(true);
    expect(validateCustomPattern("(a+)+$").ok).toBe(false);
    expect(validateCustomPattern("(.*.*)").ok).toBe(false);
    expect(validateCustomPattern("(?<=secret)foo").ok).toBe(false);
    expect(validateCustomPattern("a".repeat(201)).ok).toBe(false);
  });
  it("maps a custom rule to OCR geometry", () => {
    const config = privacyConfigForPreset("maximum");
    config.customRules = [{ id: "customer", name: "Customer ID", pattern: "CUST-[0-9]{8}", caseSensitive: false, enabled: true, category: "personal" }];
    const finding = detectSensitiveText(ocr("Customer ID CUST-12345678"), config).find((item) => item.detector === "custom");
    expect(finding).toMatchObject({ label: "Customer ID", confidence: "high" });
    expect(finding?.regions[0].width).toBeGreaterThan(0);
  });
  it("serialises only valid local custom rules", () => {
    const values = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => { values.set(key, value); } };
    const rules: PrivacyCustomRule[] = [{ id: "1", name: "Customer ID", pattern: "CUST-[0-9]{8}", caseSensitive: false, enabled: true, category: "personal" }];
    saveCustomRules(storage, rules);
    expect(parseCustomRules([...values.values()][0])).toEqual(rules);
    expect(parseCustomRules(JSON.stringify([{ ...rules[0], pattern: "(a+)+$" }]))).toEqual([]);
  });
  it("never logs raw detected values", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    detectSensitiveText(ocr("API Key: sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"), privacyConfigForPreset("maximum"));
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
    log.mockRestore(); warn.mockRestore();
  });
  it("replaces per-asset scans and releases them", () => {
    const registry = new PrivacyScanRegistry();
    const base = { assetId: "asset", createdAt: 1, findings: [], stages: [], barcodeSupport: "not-requested" as const };
    registry.put({ ...base, id: "one" }); registry.put({ ...base, id: "two" });
    expect(registry.stats()).toEqual({ results: 1 }); expect(registry.get("one")).toBeUndefined();
    registry.removeAsset("asset"); expect(registry.stats()).toEqual({ results: 0 });
  });
});
