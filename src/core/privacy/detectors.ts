import type { OcrLine, OcrResult, OcrWord } from "@/core/ocr/types";
import type { ImageRect } from "@/core/redaction/types";
import { maskSensitiveValue } from "./mask";
import { validateCustomPattern } from "./safe-regex";
import type { PrivacyCategory, PrivacyConfidence, PrivacyFinding, PrivacyFindingSubtype, PrivacyScanConfig, PrivacySeverity } from "./types";

interface SpanWord { start: number; end: number; word: OcrWord }
interface SearchUnit { text: string; words: SpanWord[]; context: string }
interface Candidate {
  subtype: PrivacyFindingSubtype; category: PrivacyCategory; label: string; value: string;
  confidence: PrivacyConfidence; severity: PrivacySeverity; reason: string;
  detector: PrivacyFinding["detector"]; recommendation?: PrivacyFinding["recommendation"];
  regions: ImageRect[];
}

const LABELS = {
  email: /\b(?:e-?mail|contact)\b/i,
  phone: /\b(?:phone|mobile|tel(?:ephone)?)\b/i,
  address: /\b(?:address|street|shipping|billing)\b/i,
  dob: /\b(?:dob|date of birth|born)\b/i,
  id: /\b(?:customer|account|member|user|client|employee)\s*(?:id|number|no\.?|#)\b/i,
  username: /\b(?:username|handle|user name)\b/i,
  bank: /\b(?:bank|account|routing|sort code|beneficiary)\b/i,
  secret: /\b(?:api[ _-]?key|access[ _-]?token|secret|client[ _-]?secret|password|passwd|pwd|auth(?:orization)?|cookie|session)\b/i,
};

const lineList = (result: OcrResult): OcrLine[] => result.blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));

function unit(lines: OcrLine[]): SearchUnit {
  let text = "";
  const words: SpanWord[] = [];
  for (const line of lines) {
    for (const word of line.words) {
      if (text && !/\s$/.test(text)) text += " ";
      const start = text.length;
      text += word.text;
      words.push({ start, end: text.length, word });
    }
    text += "\n";
  }
  return { text: text.trimEnd(), words, context: text.toLowerCase() };
}

function regionsForMatch(value: SearchUnit, start: number, end: number): ImageRect[] {
  const selected = value.words.filter((entry) => entry.end > start && entry.start < end);
  if (!selected.length) return [];
  const rows: ImageRect[] = [];
  for (const entry of selected) {
    const box = entry.word.bbox;
    const rect = { x: box.x, y: box.y, width: box.w, height: box.h };
    const row = rows.find((candidate) => Math.abs(candidate.y - rect.y) <= Math.max(3, rect.height * 0.45));
    if (!row) rows.push(rect);
    else {
      const right = Math.max(row.x + row.width, rect.x + rect.width);
      const bottom = Math.max(row.y + row.height, rect.y + rect.height);
      row.x = Math.min(row.x, rect.x);
      row.y = Math.min(row.y, rect.y);
      row.width = right - row.x;
      row.height = bottom - row.y;
    }
  }
  return rows;
}

function candidatesForRegex(search: SearchUnit, regex: RegExp, build: (value: string, context: string) => Omit<Candidate, "value" | "regions"> | null): Candidate[] {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  const found: Candidate[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(search.text))) {
    const value = match[0];
    const details = build(value, search.context);
    const regions = regionsForMatch(search, match.index, match.index + value.length);
    if (details && regions.length) found.push({ ...details, value, regions });
    if (!value.length) re.lastIndex++;
  }
  return found;
}

export function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0; let alternate = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = Number(digits[index]);
    if (alternate) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit; alternate = !alternate;
  }
  return sum % 10 === 0;
}

export function isValidIban(value: string): boolean {
  const compact = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const expanded = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function stringEntropy(value: string): number {
  if (!value.length) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) { const p = count / value.length; entropy -= p * Math.log2(p); }
  return entropy;
}

function isPrivateIpv4(value: string): boolean {
  const [a, b] = value.split(".").map(Number);
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

function validIpv4(value: string): boolean { return value.split(".").length === 4 && value.split(".").every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255); }

function id(prefix: string, index: number): string { return `${prefix}-${index + 1}`; }

function candidateToFinding(candidate: Candidate, index: number): PrivacyFinding {
  return {
    id: id(candidate.subtype, index), category: candidate.category, subtype: candidate.subtype, label: candidate.label,
    maskedValue: maskSensitiveValue(candidate.value, candidate.subtype), confidence: candidate.confidence, severity: candidate.severity,
    regions: candidate.regions, reason: candidate.reason, detector: candidate.detector,
    recommendation: candidate.recommendation ?? "blackout", selected: candidate.confidence !== "low" && candidate.recommendation !== "review",
  };
}

function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const kept: Candidate[] = [];
  for (const item of candidates) {
    const region = item.regions[0];
    const key = `${item.subtype}:${Math.round(region?.x ?? 0)}:${Math.round(region?.y ?? 0)}:${item.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    if (item.subtype === "generic-secret" && kept.some((candidate) => candidate.category === "developer" && candidate.subtype !== "generic-secret" && candidate.regions.some((other) => item.regions.some((current) => {
      const left = Math.max(other.x, current.x); const top = Math.max(other.y, current.y); const right = Math.min(other.x + other.width, current.x + current.width); const bottom = Math.min(other.y + other.height, current.y + current.height);
      const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
      return intersection / Math.max(1, Math.min(other.width * other.height, current.width * current.height)) > .8;
    })))) continue;
    seen.add(key); kept.push(item);
  }
  return kept;
}

export function detectSensitiveText(result: OcrResult, config: PrivacyScanConfig): PrivacyFinding[] {
  const lines = lineList(result);
  const units = lines.flatMap((line, index) => [unit([line]), ...(index < lines.length - 1 ? [unit([line, lines[index + 1]])] : [])]);
  const categories = new Set(config.enabledCategories);
  const candidates: Candidate[] = [];
  const add = (category: PrivacyCategory, regex: RegExp, build: Parameters<typeof candidatesForRegex>[2]) => {
    if (!categories.has(category)) return;
    for (const search of units) candidates.push(...candidatesForRegex(search, regex, build));
  };

  add("personal", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, () => ({ subtype: "email", category: "personal", label: "Email", confidence: "high", severity: "medium", reason: "Email address pattern", detector: "pattern" }));
  add("personal", /(?<![A-Za-z0-9])(?:\+?\d[\d ()-]{6,}\d)(?![A-Za-z0-9])/, (value, context) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15 || passesLuhn(value)) return null;
    const labelled = LABELS.phone.test(context);
    return { subtype: "phone", category: "personal", label: "Phone", confidence: labelled ? "high" : "low", severity: "medium", reason: labelled ? "Phone-like number near a contact label" : "Possible phone-number pattern", detector: labelled ? "context" : "pattern" };
  });
  add("personal", /(?:\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]{2,}\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?)\b[^\n]*)/i, (_value, context) => LABELS.address.test(context) ? ({ subtype: "address", category: "personal", label: "Postal address", confidence: "medium", severity: "medium", reason: "Street-shaped text near an address label", detector: "context" }) : null);
  add("personal", /\b(?:dob|date of birth|born)\s*[:#-]?\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/i, () => ({ subtype: "date-of-birth", category: "personal", label: "Date of birth", confidence: "high", severity: "high", reason: "Date next to a birth-date label", detector: "context" }));
  add("personal", /\b(?:customer|account|member|user|client|employee)\s*(?:id|number|no\.?|#)\s*[:#-]?\s*[A-Z0-9][A-Z0-9_-]{3,}\b/i, () => ({ subtype: "identifier", category: "personal", label: "Labelled ID", confidence: "high", severity: "medium", reason: "Identifier next to an explicit ID label", detector: "context" }));
  add("personal", /\b(?:username|handle|user name)\s*[:#-]?\s*@?[A-Z0-9_.-]{3,}\b/i, () => ({ subtype: "username", category: "personal", label: "Username", confidence: "low", severity: "low", reason: "Username-shaped value near a label; review recommended", detector: "context", recommendation: "review" }));

  add("financial", /(?:\d[\s-]?){13,19}/, (value) => passesLuhn(value) ? ({ subtype: "payment-card", category: "financial", label: "Payment card", confidence: "high", severity: "critical", reason: "Payment-card length with a valid Luhn checksum", detector: "pattern" }) : null);
  add("financial", /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/i, (value) => isValidIban(value) ? ({ subtype: "iban", category: "financial", label: "IBAN", confidence: "high", severity: "critical", reason: "Valid IBAN structure and checksum", detector: "pattern" }) : null);
  add("financial", /\b(?:bank\s+)?account\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,24}\b/i, (_value, context) => LABELS.bank.test(context) ? ({ subtype: "bank-account", category: "financial", label: "Bank / account number", confidence: "medium", severity: "high", reason: "Account-shaped value next to a financial label", detector: "context" }) : null);

  add("network", /\b(?:\d{1,3}\.){3}\d{1,3}\b/, (value) => validIpv4(value) ? ({ subtype: isPrivateIpv4(value) ? "private-network" : "ipv4", category: "network", label: isPrivateIpv4(value) ? "Private network address" : "IPv4 address", confidence: isPrivateIpv4(value) ? "high" : "medium", severity: "medium", reason: isPrivateIpv4(value) ? "Private or local IPv4 range" : "Valid IPv4 address", detector: "pattern" }) : null);
  add("network", /\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b/i, () => ({ subtype: "ipv6", category: "network", label: "IPv6 address", confidence: "medium", severity: "medium", reason: "IPv6 address pattern", detector: "pattern" }));
  add("network", /\b(?:[A-F0-9]{2}[:-]){5}[A-F0-9]{2}\b/i, () => ({ subtype: "mac-address", category: "network", label: "MAC address", confidence: "high", severity: "medium", reason: "Six-pair hardware address pattern", detector: "pattern" }));
  add("network", /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d{2,5})?\b/i, () => ({ subtype: "private-network", category: "network", label: "Local network reference", confidence: "high", severity: "medium", reason: "Localhost or loopback reference", detector: "pattern" }));

  add("developer", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/, () => ({ subtype: "jwt", category: "developer", label: "JWT", confidence: "high", severity: "critical", reason: "Three-part JSON Web Token structure", detector: "pattern" }));
  add("developer", /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}={0,2}\b/i, () => ({ subtype: "bearer-token", category: "developer", label: "Bearer token", confidence: "high", severity: "critical", reason: "Bearer authorization value", detector: "context" }));
  add("developer", /\b(?:AKIA[0-9A-Z]{16}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/, (value) => ({ subtype: /AKIA/.test(value) ? "api-key" : "access-token", category: "developer", label: /AKIA/.test(value) ? "API key" : "Access token", confidence: "high", severity: "critical", reason: "Recognised provider token prefix and shape", detector: "pattern" }));
  add("developer", /\b(?:Authorization|X-Api-Key|Api-Key)\s*:\s*[^\s,;]{8,}\b/i, () => ({ subtype: "authorization-header", category: "developer", label: "Authorization header", confidence: "high", severity: "critical", reason: "Credential-bearing HTTP header", detector: "context" }));
  add("developer", /\b(?:Cookie|Set-Cookie|session(?:id)?|sid)\s*[:=]\s*[^\s;,]{8,}\b/i, () => ({ subtype: "session-value", category: "developer", label: "Cookie / session value", confidence: "high", severity: "critical", reason: "Session-shaped value next to an explicit label", detector: "context" }));
  add("developer", /\b(?:password|passwd|pwd|client_secret)\s*[:=]\s*[^\s,;]{4,}\b/i, () => ({ subtype: "password-value", category: "developer", label: "Password / secret field", confidence: "high", severity: "critical", reason: "Value next to an explicit password or secret label", detector: "context" }));
  add("developer", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s]+/i, () => ({ subtype: "connection-string", category: "developer", label: "Connection string", confidence: "high", severity: "critical", reason: "Database or service connection URI", detector: "pattern" }));
  add("developer", /https?:\/\/[^\s]+[?&](?:token|access_token|api_key|apikey|auth|session|signature|sig|key)=[^&#\s]+/i, () => ({ subtype: "secret-url", category: "developer", label: "URL with secret parameter", confidence: "high", severity: "critical", reason: "Authentication-like value in a URL query parameter", detector: "context" }));
  add("developer", /\b[A-Za-z0-9_+\/-]{16,}={0,2}\b/, (value, context) => LABELS.secret.test(context) && stringEntropy(value) >= 3.5 ? ({ subtype: "generic-secret", category: "developer", label: "Possible secret", confidence: "medium", severity: "high", reason: "High-entropy value near a key, token or secret label", detector: "entropy" }) : null);

  for (const rule of config.customRules.filter((item) => item.enabled && categories.has(item.category))) {
    const validated = validateCustomPattern(rule.pattern, rule.caseSensitive);
    if (!validated.regex) continue;
    for (const search of units) candidates.push(...candidatesForRegex(search, validated.regex, () => ({ subtype: "custom", category: rule.category, label: rule.name, confidence: "high", severity: "medium", reason: `Matched local custom rule: ${rule.name}`, detector: "custom" })));
  }

  return dedupe(candidates)
    .filter((candidate) => config.includeLowConfidence || candidate.confidence !== "low")
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.confidence] - { high: 0, medium: 1, low: 2 }[b.confidence]))
    .map(candidateToFinding);
}

/** OCR can suggest familiar registration strings; it does not detect a physical plate. */
export function detectPlateText(result: OcrResult): PrivacyFinding[] {
  const lines = lineList(result);
  const candidates = lines.flatMap((line) => candidatesForRegex(
    unit([line]),
    /\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{3,4}\b/i,
    () => ({ subtype: "license-plate", category: "visual", label: "Possible plate text", confidence: "medium", severity: "medium", reason: "Indian-style registration pattern in readable text. Check the entire plate and add a manual region if needed.", detector: "plate-text", recommendation: "review" }),
  ));
  return dedupe(candidates).map(candidateToFinding);
}

export function findingsToRegions(findings: PrivacyFinding[]): ImageRect[] {
  return findings.filter((finding) => finding.selected && !finding.ignored).flatMap((finding) => finding.regions);
}
