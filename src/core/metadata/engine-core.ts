/**
 * Pure metadata engine over bytes (Node + browser + worker): inspect → clean → verify.
 * Container-level only: pixels are never decoded here.
 */
import { sniffImageType, validateImageHeader } from "@/core/image/validate";
import { assertInputSize, bytesEqual } from "./bytes";
import { MetadataError, toMetadataError } from "./errors";
import { analyseJpeg } from "./jpeg";
import { resolveMetadataPolicy, type FormatAnalysis } from "./policy";
import { analysePng } from "./png";
import type { MetadataCategory, MetadataCleanResult, MetadataFormat, MetadataInspection, MetadataPolicy, MetadataVerification, PrivacyFinding } from "./types";
import { analyseWebp } from "./webp";

export function detectFormat(b: Uint8Array): MetadataFormat | null {
  const t = sniffImageType(b.subarray(0, 16));
  return t === "image/jpeg" ? "jpeg" : t === "image/png" ? "png" : t === "image/webp" ? "webp" : null;
}

/**
 * Architecture §45: extension + declared MIME + magic bytes must agree. `name`/`type` may be
 * empty (clipboard images); the signature is always checked.
 */
export function validateMetadataInput(name: string, declaredType: string, b: Uint8Array): MetadataFormat {
  const r = validateImageHeader(name, declaredType, b.subarray(0, 16));
  if (!r.ok) throw new MetadataError(r.code === "UNSUPPORTED_FORMAT" ? "METADATA_UNSUPPORTED_FORMAT" : "METADATA_INVALID_FILE", r.code);
  return r.type === "image/jpeg" ? "jpeg" : r.type === "image/png" ? "png" : "webp";
}

export function analyse(b: Uint8Array, policy?: Partial<MetadataPolicy>): FormatAnalysis {
  assertInputSize(b.length);
  if (b.length === 0) throw new MetadataError("METADATA_INVALID_FILE", "empty");
  const format = detectFormat(b);
  if (!format) throw new MetadataError("METADATA_UNSUPPORTED_FORMAT", "unknown signature");
  const p = resolveMetadataPolicy(policy);
  return format === "jpeg" ? analyseJpeg(b, p) : format === "png" ? analysePng(b, p) : analyseWebp(b, p);
}

function toInspection(a: FormatAnalysis, bytes: number): MetadataInspection {
  const privacyFindings: PrivacyFinding[] = [];
  const categories = new Set<MetadataCategory>();
  for (const e of a.elements) {
    categories.add(e.item.category);
    if (e.item.privacy && e.item.action !== "preserve") privacyFindings.push(...e.findings);
    for (const f of e.findings) categories.add(f.category);
  }
  if (a.orientation !== undefined) categories.add("orientation");
  categories.delete("structure");
  return {
    format: a.format,
    width: a.width,
    height: a.height,
    bytes,
    categories: [...categories],
    privacyFindings,
    hasPrivacyMetadata: a.elements.some((e) => e.item.privacy && e.item.action !== "preserve"),
    removableMetadata: a.elements.filter((e) => e.item.action !== "preserve").map((e) => e.item),
    preservedMetadata: a.elements.filter((e) => e.item.action === "preserve" && e.item.category !== "structure").map((e) => e.item),
    warnings: a.warnings,
    orientation: a.orientation,
    hasAlpha: a.hasAlpha,
    animated: a.animated,
    lossless: a.lossless,
    colorProfile: a.colorProfile,
  };
}

export function inspectBytes(b: Uint8Array, policy?: Partial<MetadataPolicy>): MetadataInspection {
  try {
    return toInspection(analyse(b, policy), b.length);
  } catch (e) {
    throw toMetadataError(e, "inspect");
  }
}

/**
 * Clean: when nothing needs removing, the ORIGINAL bytes are returned (`changed: false`) — no
 * rewrite, no pretend "cleaning".
 */
export function cleanBytes(b: Uint8Array, policy?: Partial<MetadataPolicy>): MetadataCleanResult {
  let a: FormatAnalysis;
  try {
    a = analyse(b, policy);
  } catch (e) {
    throw toMetadataError(e, "inspect");
  }
  const before = toInspection(a, b.length);
  const removed = a.elements.filter((e) => e.item.action === "remove").map((e) => e.item);
  const rewritten = a.elements.filter((e) => e.item.action === "rewrite").map((e) => e.item);
  const preserved = a.elements.filter((e) => e.item.action === "preserve" && e.item.category !== "structure").map((e) => e.item);
  if (!removed.length && !rewritten.length) return { output: b, changed: false, before, removed, rewritten, preserved };
  let output: Uint8Array;
  try {
    output = a.build();
  } catch (e) {
    throw toMetadataError(e, "clean");
  }
  return { output, changed: true, before, removed, rewritten, preserved };
}

/**
 * Verify an output independently: re-parse it with the same inspection logic (not the rewrite
 * code), then check the policy. With `original`, also compares image payload bytes and
 * dimensions. Never throws for a bad output — it reports `passed: false`.
 */
export function verifyBytes(output: Uint8Array, opts: { original?: Uint8Array; policy?: Partial<MetadataPolicy> } = {}): MetadataVerification {
  const problems: string[] = [];
  const v: MetadataVerification = {
    passed: false,
    removedCategories: [],
    unexpectedRemainingPrivacyMetadata: [],
    preservedRequiredMetadata: [],
    missingRequiredMetadata: [],
    dimensionsMatch: false,
    outputValid: false,
    problems,
  };
  let after: FormatAnalysis;
  try {
    after = analyse(output, opts.policy);
    v.outputValid = true;
  } catch (e) {
    problems.push(`output does not parse: ${toMetadataError(e, "verify").code}`);
    return v;
  }
  const remaining = after.elements.filter((e) => e.item.privacy && e.item.action !== "preserve");
  v.unexpectedRemainingPrivacyMetadata = remaining.map((e) => `${e.item.container}: ${e.item.label}`);
  if (remaining.length) problems.push("privacy metadata remains");

  if (opts.original) {
    let before: FormatAnalysis;
    try {
      before = analyse(opts.original, opts.policy);
    } catch (e) {
      problems.push(`original does not parse: ${toMetadataError(e, "verify").code}`);
      return v;
    }
    if (before.format !== after.format) problems.push("format changed");
    v.dimensionsMatch = before.width === after.width && before.height === after.height;
    if (!v.dimensionsMatch) problems.push("dimensions changed");
    v.payloadIdentical = before.payload.length === after.payload.length && before.payload.every((p, i) => bytesEqual(p, after.payload[i]));
    if (!v.payloadIdentical) problems.push("image data changed");
    if (before.orientation !== undefined && opts.policy?.orientation !== "remove" && before.orientation >= 2 && after.orientation !== before.orientation) problems.push("orientation lost");
    if (before.hasAlpha && !after.hasAlpha) problems.push("alpha lost");
    // Every element the policy preserves must still be there, byte-identical.
    const keptAfter = after.elements.filter((e) => e.item.action === "preserve" && e.item.category !== "structure");
    for (const e of before.elements.filter((x) => x.item.action === "preserve" && x.item.category !== "structure")) {
      const bytes = opts.original.subarray(e.start, e.end);
      const found = keptAfter.some((k) => k.item.container === e.item.container && (e.item.container === "WebP VP8X" || bytesEqual(output.subarray(k.start, k.end), bytes)));
      (found ? v.preservedRequiredMetadata : v.missingRequiredMetadata).push(`${e.item.container}: ${e.item.label}`);
    }
    if (v.missingRequiredMetadata.length) problems.push("required metadata missing");
    const cats = (a: FormatAnalysis) => new Set(a.elements.filter((e) => e.item.privacy && e.item.action !== "preserve").flatMap((e) => [e.item.category, ...e.findings.map((f) => f.category)]));
    const was = cats(before);
    const now = cats(after);
    v.removedCategories = [...was].filter((c) => !now.has(c));
  } else {
    v.dimensionsMatch = true;
  }
  v.passed = problems.length === 0;
  return v;
}
