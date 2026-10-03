/**
 * Compress / Convert: decode the ORIGINAL file once and re-encode it at the same pixel size in
 * the chosen format and quality.
 *
 * The pixels go through the Screenshot Editor pipeline with an identity transform
 * (`renderDecoded`): a 1:1 copy with smoothing off, the same single-canvas / tiled-PNG choice
 * and memory limits, the JPEG background, post-encode dimension verification and canvas
 * cleanup as every other export. Nothing here draws or encodes on its own.
 */
import { decodeSource, renderDecoded } from "@/core/image-transform/render";
import { IDENTITY_TRANSFORM } from "@/core/image-transform/transform";
import { EditorError, type EditorErrorCode } from "@/core/image-transform/types";
import { encoderQuality } from "./formats";
import { encodeIssue } from "./limits";
import { searchTargetSize } from "./target-size";
import { EncodeError, type EncodeErrorCode, type EncodeOptions, type EncodeResult } from "./types";

/** Largest image the optional size probe runs on (it is a second full encode). */
export const PROBE_MAX_PIXELS = 16_000_000;

const FROM_EDITOR: Record<EditorErrorCode, EncodeErrorCode> = {
  EDITOR_INVALID_TRANSFORM: "ENCODE_TOO_LARGE",
  EDITOR_DECODE_FAILED: "ENCODE_DECODE_FAILED",
  EDITOR_SOURCE_MISMATCH: "ENCODE_SOURCE_MISMATCH",
  EDITOR_MEMORY_PRESSURE: "ENCODE_MEMORY_PRESSURE",
  EDITOR_EXPORT_TOO_LARGE: "ENCODE_TOO_LARGE",
  EDITOR_EXPORT_VERIFY_FAILED: "ENCODE_VERIFY_FAILED",
  EDITOR_CANCELLED: "ENCODE_CANCELLED",
};

export function toEncodeError(error: unknown): EncodeError {
  if (error instanceof EncodeError) return error;
  if (error instanceof EditorError) return new EncodeError(FROM_EDITOR[error.code], error.message);
  if (error instanceof RangeError) return new EncodeError("ENCODE_MEMORY_PRESSURE");
  return new EncodeError("ENCODE_MEMORY_PRESSURE", String(error));
}

/** Throws a controlled error, before decoding anything, if the format can't hold this image. */
export function assertEncodable(size: { width: number; height: number }, format: EncodeOptions["format"], compressionStream = typeof CompressionStream !== "undefined") {
  const issue = encodeIssue(size, format, compressionStream);
  if (issue === "format-dimension") throw new EncodeError("ENCODE_FORMAT_TOO_LARGE", `${format} ${size.width}x${size.height}`);
  if (issue) throw new EncodeError("ENCODE_TOO_LARGE", issue);
}

export async function encodeImage(image: Blob, o: EncodeOptions): Promise<EncodeResult> {
  assertEncodable(o.source, o.format);
  const started = performance.now();
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeSource(image, o.source);
    const decoded = bitmap;
    const common = { source: o.source, background: o.background, createCanvas: o.createCanvas, yieldBetweenTiles: o.yieldBetweenTiles, signal: o.signal };
    const render = (quality: number) =>
      renderDecoded(decoded, IDENTITY_TRANSFORM, {
        ...common,
        format: o.format,
        quality: encoderQuality(o.format, quality),
      });
    const targetEnabled = !!o.targetBytes && o.targetBytes > 0 && o.format !== "png";
    let quality = o.quality;
    let main;
    let target: EncodeResult["target"];
    if (targetEnabled) {
      let best: Awaited<ReturnType<typeof render>> | null = null;
      let bestQuality = 0;
      let smallest: Awaited<ReturnType<typeof render>> | null = null;
      const found = await searchTargetSize(o.targetBytes!, o.quality, async (candidateQuality) => {
        const candidate = await render(candidateQuality);
        if (!smallest || candidate.blob.size < smallest.blob.size) smallest = candidate;
        if (candidate.blob.size <= o.targetBytes! && (!best || candidateQuality > bestQuality)) {
          best = candidate;
          bestQuality = candidateQuality;
        }
        o.onProgress?.(Math.min(0.95, (candidateQuality / Math.max(0.5, o.quality)) * 0.9));
        return candidate.blob.size;
      });
      main = best ?? smallest;
      if (!main) throw new EncodeError("ENCODE_MEMORY_PRESSURE", "target search did not encode");
      quality = found.quality;
      target = { bytes: o.targetBytes!, metTarget: found.metTarget, attempts: found.attempts };
    } else {
      main = await renderDecoded(bitmap, IDENTITY_TRANSFORM, {
        ...common,
        format: o.format,
        quality: encoderQuality(o.format, o.quality),
        onProgress: (p) => o.onProgress?.(o.probe ? p * 0.8 : p),
      });
    }
    let probe: EncodeResult["probe"];
    const probeFormat = o.probe?.format;
    if (!targetEnabled && o.probe && probeFormat && probeFormat !== o.format && o.source.width * o.source.height <= PROBE_MAX_PIXELS && !encodeIssue(o.source, probeFormat)) {
      // Best effort: a failed probe only means no size hint.
      const alt = await renderDecoded(bitmap, IDENTITY_TRANSFORM, { ...common, format: probeFormat, quality: encoderQuality(probeFormat, o.probe.quality) }).catch(() => null);
      if (alt) probe = { format: probeFormat, quality: o.probe.quality, bytes: alt.blob.size };
    }
    o.onProgress?.(1);
    return { blob: main.blob, width: main.width, height: main.height, format: o.format, strategy: main.strategy, ms: Math.round(performance.now() - started), quality, target, probe };
  } catch (error) {
    throw toEncodeError(error);
  } finally {
    bitmap?.close();
  }
}
