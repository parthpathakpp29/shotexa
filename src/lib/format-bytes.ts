/** Compact, stable byte label for workspace metadata; no image decoding required. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function imageTypeLabel(type: string): string {
  if (type === "image/jpeg") return "JPEG";
  if (type === "image/webp") return "WebP";
  if (type === "image/png") return "PNG";
  return type;
}
