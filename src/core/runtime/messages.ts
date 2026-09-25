/** User-facing copy for controlled error codes (never raw engine messages). */
const MESSAGES: Record<string, string> = {
  UNSUPPORTED_FORMAT: "isn't a PNG, JPEG or WebP image.",
  SIGNATURE_MISMATCH: "doesn't match its file type — the contents aren't the image format its name says.",
  EMPTY_FILE: "is empty.",
  UNREADABLE: "couldn't be read as an image.",
  STITCH_WIDTH_MISMATCH: "These screenshots have different widths, so they can't be joined automatically.",
  STITCH_TOO_SMALL: "These screenshots are too small to align automatically.",
  STITCH_IDENTICAL_IMAGES: "These two screenshots look identical — there's nothing to join.",
  VISION_ENGINE_LOAD_FAILED: "The alignment engine couldn't load. Check your connection and try again.",
  DECODE_FAILED: "One of the screenshots couldn't be decoded.",
  MEMORY_PRESSURE: "Your browser ran low on memory. Try fewer or smaller screenshots.",
  EXPORT_TOO_LARGE: "This image is too tall for JPEG or WebP. Export it as PNG instead.",
  EXPORT_VERIFY_FAILED: "The browser produced an incomplete image, so it wasn't saved. Try PNG.",
  WORKER_CRASHED: "Processing stopped unexpectedly. Please try again.",
  CANCELLED: "Cancelled.",
};

export function messageFor(code: string | undefined): string {
  return (code && MESSAGES[code]) || "Something went wrong while processing locally. Please try again.";
}
