/** Controlled PDF error codes (never forward raw dependency messages to analytics). */
export type PdfErrorCode =
  | "PDF_DECODE_FAILED"
  | "PDF_ANALYSIS_FAILED"
  | "PDF_EXPORT_FAILED"
  | "PDF_MEMORY_PRESSURE"
  | "PDF_CANCELLED"
  | "PDF_UNSUPPORTED_SIZE"
  | "PDF_INVALID_BREAKS";

export class PdfError extends Error {
  constructor(
    readonly code: PdfErrorCode,
    /** Local-only diagnostic detail. */
    readonly detail?: string,
  ) {
    super(code);
    this.name = "PdfError";
  }
}

export function toPdfError(err: unknown, phase: "decode" | "analyse" | "export"): PdfError {
  if (err instanceof PdfError) return err;
  const msg = String((err as Error)?.message ?? err ?? "").toLowerCase();
  if ((err as Error)?.name === "AbortError" || /cancel|abort/.test(msg)) return new PdfError("PDF_CANCELLED", msg);
  if (err instanceof RangeError || /out of memory|allocation|array buffer allocation|invalid array length/.test(msg)) return new PdfError("PDF_MEMORY_PRESSURE", msg);
  if (phase === "decode") return new PdfError("PDF_DECODE_FAILED", msg);
  if (phase === "analyse") return new PdfError("PDF_ANALYSIS_FAILED", msg);
  return new PdfError("PDF_EXPORT_FAILED", msg);
}
