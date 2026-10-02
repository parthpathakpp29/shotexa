/**
 * Controlled metadata error codes (architecture §46: never forward raw parser messages).
 * `detail` is for local developer diagnostics only.
 */
export type MetadataErrorCode =
  | "METADATA_UNSUPPORTED_FORMAT"
  | "METADATA_INVALID_FILE"
  | "METADATA_PARSE_FAILED"
  | "METADATA_MALFORMED_CONTAINER"
  | "METADATA_TOO_LARGE"
  | "METADATA_CLEAN_FAILED"
  | "METADATA_VERIFICATION_FAILED"
  | "METADATA_OUTPUT_INVALID";

export class MetadataError extends Error {
  constructor(
    readonly code: MetadataErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "MetadataError";
  }
}

export const malformed = (detail: string) => new MetadataError("METADATA_MALFORMED_CONTAINER", detail);

/** Anything that is not already a MetadataError becomes a controlled code for its phase. */
export function toMetadataError(err: unknown, phase: "inspect" | "clean" | "verify"): MetadataError {
  if (err instanceof MetadataError) return err;
  const detail = String((err as Error)?.message ?? err ?? "");
  if (err instanceof RangeError) return new MetadataError("METADATA_MALFORMED_CONTAINER", detail);
  if (phase === "clean") return new MetadataError("METADATA_CLEAN_FAILED", detail);
  if (phase === "verify") return new MetadataError("METADATA_VERIFICATION_FAILED", detail);
  return new MetadataError("METADATA_PARSE_FAILED", detail);
}
