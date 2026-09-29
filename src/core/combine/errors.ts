export type CombineErrorCode =
  | "COMBINE_TOO_FEW_IMAGES"
  | "COMBINE_INVALID_LAYOUT"
  | "COMBINE_CANCELLED"
  | "COMBINE_MEMORY_PRESSURE"
  | "COMBINE_EXPORT_TOO_LARGE"
  | "COMBINE_EXPORT_VERIFY_FAILED";

export class CombineError extends Error {
  constructor(readonly code: CombineErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "CombineError";
  }
}
