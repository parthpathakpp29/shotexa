import type { PrivacyFindingSubtype } from "./types";

function visibleEdges(value: string, start = 5, end = 4): string {
  if (value.length <= start + end + 2) return `${value.slice(0, 1)}••••${value.slice(-1)}`;
  return `${value.slice(0, start)}••••••••${value.slice(-end)}`;
}

export function maskSensitiveValue(value: string, subtype: PrivacyFindingSubtype): string {
  const clean = value.trim();
  if (!clean) return "••••";
  if (subtype === "email") {
    const [local, domain = ""] = clean.split("@");
    const parts = domain.split(".");
    const host = parts.shift() ?? "";
    const suffix = parts.length ? `.${parts.join(".")}` : "";
    return `${local.slice(0, 1)}•••@${host.slice(0, 1)}•••${suffix}`;
  }
  if (subtype === "phone") return `••• ••• ${clean.replace(/\D/g, "").slice(-4)}`;
  if (subtype === "payment-card" || subtype === "bank-account" || subtype === "iban") return `•••• •••• •••• ${clean.replace(/\s|-/g, "").slice(-4)}`;
  if (subtype === "ipv4" || subtype === "private-network") {
    const parts = clean.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.•••.•••` : visibleEdges(clean, 3, 2);
  }
  if (subtype === "ipv6" || subtype === "mac-address") return visibleEdges(clean, 4, 4);
  if (subtype === "address") return `${clean.slice(0, 3)}••••••`;
  if (subtype === "date-of-birth") return "••/••/••••";
  if (subtype === "username" || subtype === "identifier") return visibleEdges(clean, 2, 2);
  if (subtype === "qr-code" || subtype === "barcode" || subtype === "face") return "Visual content";
  if (subtype === "license-plate") return `Plate text •••${clean.slice(-2)}`;
  return visibleEdges(clean, Math.min(8, Math.max(2, clean.indexOf("-") + 1)), 4);
}
