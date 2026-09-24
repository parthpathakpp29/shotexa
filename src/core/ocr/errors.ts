/** Controlled OCR error codes (never forward raw third-party messages to analytics). */
export type OcrErrorCode =
  | "OCR_ENGINE_LOAD_FAILED"
  | "OCR_MODEL_LOAD_FAILED"
  | "OCR_DECODE_FAILED"
  | "OCR_CANCELLED"
  | "OCR_OUT_OF_MEMORY"
  | "OCR_RECOGNITION_FAILED";

export class OcrError extends Error {
  constructor(
    readonly code: OcrErrorCode,
    /** Local-only diagnostic detail. Must not be sent to analytics/logging. */
    readonly detail?: string,
  ) {
    super(code);
    this.name = "OcrError";
  }
}

export type OcrPhase = "load" | "model" | "recognise";

/**
 * Map anything thrown by an engine to a controlled code. Phase disambiguates generic
 * failures (a network error while loading the core vs while fetching a model).
 */
export function toOcrError(err: unknown, phase: OcrPhase): OcrError {
  if (err instanceof OcrError) return err;
  const msg = String((err as Error)?.message ?? err ?? "").toLowerCase();
  if ((err as Error)?.name === "AbortError" || /cancel|terminat|abort/.test(msg)) return new OcrError("OCR_CANCELLED", msg);
  if (err instanceof RangeError || /out of memory|cannot enlarge memory|memory access out of bounds|allocation failed|oom/.test(msg)) {
    return new OcrError("OCR_OUT_OF_MEMORY", msg);
  }
  if (/traineddata|language|lang data|\.gz\b|loadlanguage/.test(msg) || phase === "model") return new OcrError("OCR_MODEL_LOAD_FAILED", msg);
  if (/image|pix|read|decode|unsupported|format|leptonica/.test(msg) && phase === "recognise") return new OcrError("OCR_DECODE_FAILED", msg);
  if (phase === "load") return new OcrError("OCR_ENGINE_LOAD_FAILED", msg);
  return new OcrError("OCR_RECOGNITION_FAILED", msg);
}
