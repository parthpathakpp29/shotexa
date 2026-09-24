/**
 * Input validation: extension + declared MIME + magic bytes (architecture §45).
 * V1 accepts PNG, JPEG, WebP only. SVG is never accepted.
 */
export type SupportedImageType = "image/png" | "image/jpeg" | "image/webp";

export type ValidationResult =
  | { ok: true; type: SupportedImageType }
  | { ok: false; code: "UNSUPPORTED_FORMAT" | "SIGNATURE_MISMATCH" | "EMPTY_FILE" };

const EXT: Record<string, SupportedImageType> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export function sniffImageType(head: Uint8Array): SupportedImageType | null {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  )
    return "image/webp";
  return null;
}

/**
 * `name` may be empty for clipboard images; then only MIME + signature are checked.
 */
export function validateImageHeader(name: string, declaredType: string, head: Uint8Array): ValidationResult {
  if (head.length === 0) return { ok: false, code: "EMPTY_FILE" };
  const sniffed = sniffImageType(head);
  if (!sniffed) return { ok: false, code: "UNSUPPORTED_FORMAT" };
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (ext && EXT[ext] === undefined) return { ok: false, code: "UNSUPPORTED_FORMAT" };
  if (ext && EXT[ext] !== sniffed) return { ok: false, code: "SIGNATURE_MISMATCH" };
  if (declaredType && declaredType !== sniffed) return { ok: false, code: "SIGNATURE_MISMATCH" };
  return { ok: true, type: sniffed };
}

export async function validateImageFile(file: File): Promise<ValidationResult> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return validateImageHeader(file.name, file.type, head);
}
