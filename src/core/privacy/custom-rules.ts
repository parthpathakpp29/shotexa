import { validateCustomPattern } from "./safe-regex";
import type { PrivacyCustomRule } from "./types";

export const PRIVACY_RULES_STORAGE_KEY = "shotexa:privacy-rules:v1";

export function parseCustomRules(value: string | null): PrivacyCustomRule[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((rule): rule is PrivacyCustomRule => {
      if (!rule || typeof rule !== "object") return false;
      const r = rule as Partial<PrivacyCustomRule>;
      return typeof r.id === "string" && typeof r.name === "string" && typeof r.pattern === "string" && typeof r.caseSensitive === "boolean" && typeof r.enabled === "boolean" && ["personal", "financial", "developer", "network"].includes(r.category ?? "") && validateCustomPattern(r.pattern, r.caseSensitive).ok;
    }).slice(0, 25);
  } catch { return []; }
}

export function saveCustomRules(storage: Pick<Storage, "setItem">, rules: PrivacyCustomRule[]): void {
  storage.setItem(PRIVACY_RULES_STORAGE_KEY, JSON.stringify(rules.slice(0, 25)));
}
