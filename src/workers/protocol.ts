/**
 * One typed worker contract for every Shotexa worker (architecture §25).
 * Requests: RUN | CANCEL. Responses: PROGRESS | SUCCESS | ERROR | CANCELLED.
 * Errors carry controlled codes only — never raw third-party messages.
 */
import type { ComposePlan } from "@/core/image/tiled-compose";
import type { CombineComposeResult, CombinePlan } from "@/core/combine/types";
import type { CombineErrorCode } from "@/core/combine/errors";
import type { EditorErrorCode, ImageTransform, TransformExportResult } from "@/core/image-transform/types";
import type { AnnotationErrorCode, AnnotationObject } from "@/core/annotation/types";
import type { SplitErrorCode, SplitExportResult, SplitPiece } from "@/core/split/types";
import type { EncodeErrorCode, EncodeResult } from "@/core/image-encode/types";
import type { BeautifyErrorCode, BeautifySettings } from "@/core/beautify/types";
import type { BeautifyRenderResult } from "@/core/beautify/render";
import type { CompareErrorCode, CompareSettings } from "@/core/compare/types";
import type { CompareRenderResult } from "@/core/compare/render";
import type { MetadataErrorCode } from "@/core/metadata/errors";
import type { ComposeChainResult } from "@/core/stitch/compose-chain";
import type { MetadataCleanRun, MetadataInspectRun } from "@/core/metadata/run";
import type { MetadataPolicy } from "@/core/metadata/types";
import type { PreparedImage } from "@/core/ocr/prepare-image";
import type { PaginationConfigOverrides } from "@/core/pdf/config";
import type { PdfErrorCode } from "@/core/pdf/errors";
import type { EncodedPage } from "@/core/pdf/render-pdf";
import type { RowSignals } from "@/core/pdf/signals";
import type { PageSetup, PageSlice } from "@/core/pdf/types";
import type { SearchableTextSource } from "@/core/pdf/searchable-text";
import type { PreprocessStep } from "@/core/ocr/preprocess";
import type { Redaction, RedactionErrorCode, SafeShareExportResult } from "@/core/redaction/types";
import type { StitchConfigOverrides } from "@/core/stitch/config";
import type { GrayImage, StitchAnalysis, StitchErrorCode, StitchPlan } from "@/core/stitch/types";

export const PROTOCOL_VERSION = 1 as const;

export interface WorkerOps {
  /** Downscaled preview (full decode happens here, off the main thread); bitmap is transferred. */
  "image.preview": {
    input: { image: Blob; maxWidth: number; maxPixels: number };
    output: { bitmap: ImageBitmap; width: number; height: number };
  };
  /** Full-resolution N-screenshot stitch export (single canvas or tiled/streamed PNG). */
  "stitch.composeChain": {
    input: { images: Blob[]; plan: ComposePlan; sources: { width: number; height: number }[]; format: "png" | "jpeg" | "webp"; quality?: number };
    output: ComposeChainResult;
  };
  /** Container-level metadata inspection (no pixel decode). */
  "metadata.inspect": {
    input: { image: Blob; name?: string; type?: string };
    output: MetadataInspectRun;
  };
  /** Inspect → clean → verify in one round trip; `output` is null when nothing needed removing. */
  "metadata.clean": {
    input: { image: Blob; name?: string; type?: string; policy?: Partial<MetadataPolicy> };
    output: MetadataCleanRun;
  };
  /** Full-resolution simple composition: vertical, horizontal or grid. */
  "combine.compose": {
    input: { images: Blob[]; plan: CombinePlan; format: "png" | "jpeg" | "webp"; quality?: number };
    output: CombineComposeResult;
  };
  /** Full-resolution Screenshot Editor render: crop → rotate → flip → resize → encode → verify. */
  "transform.export": {
    input: { image: Blob; transform: ImageTransform; source: { width: number; height: number }; format: "png" | "jpeg" | "webp"; quality?: number; background?: string };
    output: TransformExportResult;
  };
  /** Screenshot Editor render with annotations flattened in the same pass. */
  "annotation.export": {
    input: { image: Blob; transform: ImageTransform; annotations: AnnotationObject[]; source: { width: number; height: number }; format: "png" | "jpeg" | "webp"; quality?: number };
    output: TransformExportResult;
  };
  /** Split: decode the original once, render each [y0, y1) piece full width, encode, verify. */
  "split.export": {
    input: { image: Blob; pieces: SplitPiece[]; source: { width: number; height: number }; format: "png" | "jpeg" | "webp"; quality?: number };
    output: SplitExportResult;
  };
  /** Compress / Convert: decode once, re-encode at the same size (JPEG on a chosen background), verify. */
  "image.encode": {
    input: { image: Blob; source: { width: number; height: number }; format: "png" | "jpeg" | "webp"; quality: number; background: string; probe?: { format: "png" | "jpeg" | "webp"; quality: number } };
    output: EncodeResult;
  };
  /** Beautifier: decode once, compose background/frame/screenshot at full size, encode, verify. */
  "beautify.export": {
    input: { image: Blob; settings: BeautifySettings; source: { width: number; height: number }; format: "png" | "jpeg" | "webp"; quality?: number };
    output: BeautifyRenderResult;
  };
  /** Compare: decode both screenshots, compose the comparison at full size, encode, verify. */
  "compare.export": {
    input: { imageA: Blob; imageB: Blob; settings: CompareSettings; a: { width: number; height: number }; b: { width: number; height: number }; format: "png" | "jpeg" | "webp"; quality?: number };
    output: CompareRenderResult;
  };
  /** Full-resolution redaction render followed by encode → Privacy Clean → verification. */
  "redaction.export": {
    input: { image: Blob; operations: Redaction[]; format: "png" | "jpeg" | "webp"; quality?: number };
    output: SafeShareExportResult;
  };
  "stitch.analyse": {
    input: { a: Blob; b: Blob; config?: StitchConfigOverrides };
    output: StitchAnalysis & { engineLoadMs: number; decodeMs: number };
  };
  /** Same analysis from page-decoded greyscale images (browsers without worker OffscreenCanvas). */
  "stitch.analyseGray": {
    input: { a: GrayImage; b: GrayImage; config?: StitchConfigOverrides };
    output: StitchAnalysis & { engineLoadMs: number; decodeMs: number };
  };
  "stitch.compose": {
    input: { a: Blob; b: Blob; plan: StitchPlan; type: "image/png" | "image/jpeg" | "image/webp"; quality?: number };
    output: { blob: Blob; ms: number };
  };
  /**
   * OCR-only preprocessing of a COPY of the screenshot (never modifies the original).
   * Optional strips (long screenshots) are cut from ONE decode. `steps: "auto"` = default policy.
   */
  "ocr.prepare": {
    input: { image: Blob; steps: PreprocessStep[] | "auto"; strips?: { y: number; height: number }[] };
    output: PreparedImage;
  };
  /** Decode each screenshot once → proxy → row signals (pagination runs on these). */
  "pdf.analyse": {
    input: { images: Blob[]; config?: PaginationConfigOverrides };
    output: { images: { width: number; height: number; signals: RowSignals; decodeMs: number; signalMs: number; decoder: string }[] };
  };
  /** Decode only (main-thread fallback where the page has no OffscreenCanvas): the bitmap is transferred. */
  "pdf.decode": {
    input: { image: Blob };
    output: { bitmap: ImageBitmap; decodeMs: number };
  };
  /** Page-by-page render + pdf-lib assembly. `pages` = pre-encoded pages (no-OffscreenCanvas fallback). */
  "pdf.create": {
    input: { images?: Blob[]; slices: PageSlice[]; setup: PageSetup; imageFormat: "jpeg" | "png"; jpegQuality?: number; title?: string; pages?: EncodedPage[]; searchableText?: SearchableTextSource[] };
    output: { blob: Blob; ms: number; pages: number };
  };
}
export type OpName = keyof WorkerOps;

interface Envelope {
  version: typeof PROTOCOL_VERSION;
  jobId: string;
}

export type WorkerRequest =
  | ({ [K in OpName]: Envelope & { type: "RUN"; op: K; input: WorkerOps[K]["input"] } }[OpName])
  | (Envelope & { type: "CANCEL" });

export type WorkerErrorCode = StitchErrorCode | CombineErrorCode | EditorErrorCode | AnnotationErrorCode | SplitErrorCode | EncodeErrorCode | BeautifyErrorCode | CompareErrorCode | RedactionErrorCode | "UNKNOWN_OP" | "PROTOCOL_MISMATCH" | "COMPOSE_FAILED" | "MEMORY_PRESSURE" | "OCR_DECODE_FAILED" | "OCR_OUT_OF_MEMORY" | PdfErrorCode | MetadataErrorCode;

export type WorkerResponse =
  | (Envelope & { type: "PROGRESS"; progress: number; stage?: string })
  | (Envelope & { type: "SUCCESS"; output: unknown })
  | (Envelope & { type: "ERROR"; code: WorkerErrorCode })
  | (Envelope & { type: "CANCELLED" });

export interface JobContext {
  readonly signal: { readonly aborted: boolean };
  progress(fraction: number, stage?: string): void;
}

export type OpHandler<K extends OpName> = (input: WorkerOps[K]["input"], ctx: JobContext) => Promise<WorkerOps[K]["output"]>;

/** Worker-side dispatcher with cooperative cancellation. */
export function serveWorker(
  scope: { postMessage(msg: WorkerResponse, transfer?: Transferable[]): void; addEventListener(t: "message", l: (e: MessageEvent<WorkerRequest>) => void): void },
  handlers: { [K in OpName]?: OpHandler<K> },
  toCode: (err: unknown) => WorkerErrorCode,
  /** Transferables in an op's output (moved, not copied, to the page). */
  transferOf?: (op: OpName, output: unknown) => Transferable[],
) {
  const jobs = new Map<string, { aborted: boolean }>();
  scope.addEventListener("message", async (e) => {
    const msg = e.data;
    if (msg.version !== PROTOCOL_VERSION) {
      scope.postMessage({ version: PROTOCOL_VERSION, jobId: msg.jobId, type: "ERROR", code: "PROTOCOL_MISMATCH" });
      return;
    }
    if (msg.type === "CANCEL") {
      const j = jobs.get(msg.jobId);
      if (j) j.aborted = true;
      return;
    }
    const handler = handlers[msg.op] as OpHandler<OpName> | undefined;
    const base = { version: PROTOCOL_VERSION, jobId: msg.jobId } as const;
    if (!handler) {
      scope.postMessage({ ...base, type: "ERROR", code: "UNKNOWN_OP" });
      return;
    }
    const signal = { aborted: false };
    jobs.set(msg.jobId, signal);
    try {
      const output = await handler(msg.input as never, {
        signal,
        progress: (progress, stage) => scope.postMessage({ ...base, type: "PROGRESS", progress, stage }),
      });
      if (signal.aborted) scope.postMessage({ ...base, type: "CANCELLED" });
      else scope.postMessage({ ...base, type: "SUCCESS", output }, transferOf?.(msg.op, output) ?? []);
    } catch (err) {
      const code = toCode(err);
      scope.postMessage(code === "CANCELLED" || signal.aborted ? { ...base, type: "CANCELLED" } : { ...base, type: "ERROR", code });
    } finally {
      jobs.delete(msg.jobId);
    }
  });
}
