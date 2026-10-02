/**
 * Decode → small greyscale proxy → row signals. Runs in the document worker
 * (OffscreenCanvas) or, where OffscreenCanvas is missing, on the main thread with a
 * DOM canvas (yielding between bands). The proxy is built from 1:1 band copies and a JS area
 * average, not canvas downscaling, so every engine gets identical signals.
 */
import { resolvePaginationConfig, type PaginationConfig } from "./config";
import { decodeImage, timeSlicer, type DecodedImage } from "./decode";
import { PdfError } from "./errors";
import { assertSupportedSize } from "./geometry";
import { bandedAreaProxy, computeRowSignals, proxyScale, type RowSignals } from "./signals";

export interface AnalysedImage {
  width: number;
  height: number;
  signals: RowSignals;
  decodeMs: number;
  signalMs: number;
  /** Which decoder ran (diagnostics). */
  decoder: string;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export async function analyseImage(
  blob: Blob,
  cfg: PaginationConfig = resolvePaginationConfig(),
  makeCanvas?: (w: number, h: number) => AnyCanvas,
  /** Main-thread fallback passes a worker-side decode so the page never decodes itself. */
  decode: (b: Blob) => Promise<DecodedImage> = decodeImage,
): Promise<AnalysedImage> {
  const t0 = performance.now();
  let bm: DecodedImage;
  try {
    bm = await decode(blob);
  } catch {
    throw new PdfError("PDF_DECODE_FAILED");
  }
  const { width, height } = bm;
  const decodeMs = performance.now() - t0;
  try {
    assertSupportedSize(width, height);
    const t1 = performance.now();
    const { scaleX, scaleY } = proxyScale(width, cfg);
    const pw = Math.max(1, Math.round(width * scaleX));
    const ph = Math.max(1, Math.round(height * scaleY));
    // Full-width bands copied 1:1 (no resampling) → JS area average: identical in every engine.
    let canvas: AnyCanvas | null = null;
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
    const gray = await bandedAreaProxy(
      width,
      height,
      pw,
      ph,
      (s0, s1) => {
        const h = s1 - s0;
        if (!canvas || canvas.height < h) {
          if (canvas) canvas.width = 0;
          canvas = makeCanvas ? makeCanvas(width, h) : new OffscreenCanvas(width, h);
          ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
          if (!ctx) throw new PdfError("PDF_MEMORY_PRESSURE");
        }
        ctx!.fillStyle = "#fff"; // transparency reads as paper (as in the JPEG export)
        ctx!.fillRect(0, 0, width, h);
        ctx!.drawImage(bm.source, 0, s0, width, h, 0, 0, width, h);
        return ctx!.getImageData(0, 0, width, h).data;
      },
      // Main-thread fallback: small bands, yielding between them, so the page stays responsive.
      makeCanvas ? { bandProxyRows: 48, yieldBetweenBands: timeSlicer() } : {},
    );
    if (canvas) (canvas as AnyCanvas).width = 0; // drop backing store + reference to the bitmap (Spike B)
    const signals = computeRowSignals({ width: pw, height: ph, data: gray, scaleY: ph / height }, cfg);
    return { width, height, signals, decodeMs, signalMs: performance.now() - t1, decoder: (bm as { via?: string }).via ?? "worker-bitmap" };
  } finally {
    bm.close();
  }
}

/** Centres of stroke-free gaps and separator rows (original px) — manual-edit snap targets. */
export function safeYs(s: RowSignals, cfg: PaginationConfig, minGapPx = 4): number[] {
  const out: number[] = [];
  for (let y = 0; y < s.rows; ) {
    if (s.clearDown[y] > 0) {
      const len = s.clearDown[y];
      if (len / s.scaleY >= minGapPx) out.push(Math.round((y + len / 2) / s.scaleY));
      y += len;
    } else y++;
  }
  for (let y = 1; y < s.rows; y++) {
    if (s.transition[y] >= cfg.separatorTransition && s.edges[y] <= cfg.strokeFreeEdges && s.edges[y - 1] <= cfg.strokeFreeEdges) out.push(Math.round(y / s.scaleY));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
