/**
 * Decode a screenshot for canvas work without blocking the page.
 *
 * Spike D found that Firefox's `createImageBitmap(blob)` inside a worker blocks the MAIN thread
 * for the whole decode (~400 ms for 1080×21342); WebCodecs `ImageDecoder` in the same worker
 * does not. In Chromium the opposite trade-off holds: `createImageBitmap` in a worker does not
 * stall, and `ImageDecoder` roughly doubled export peak memory (1080×11586: +183 → +382 MiB).
 * So the `ImageDecoder` path is a targeted Gecko workaround, for PNG/WebP/GIF only. JPEG stays
 * on `createImageBitmap`, which applies EXIF orientation (phone photos). Any `ImageDecoder`
 * failure (unsupported type, frame-size limits) falls back to `createImageBitmap`.
 */
export interface DecodedImage {
  width: number;
  height: number;
  /** ImageBitmap or VideoFrame — both are valid `drawImage` sources. */
  source: CanvasImageSource;
  close(): void;
}

/** Last ImageDecoder failure (diagnostics only; never sent anywhere). */
export let lastDecoderError: string | null = null;

const DECODER_TYPES = new Set(["image/png", "image/webp", "image/gif"]);

/** Gecko only (see above). UA check is deliberate: the bug is an engine behaviour, not a missing API. */
const preferImageDecoder = () => typeof navigator !== "undefined" && /Gecko\/\d/.test(navigator.userAgent) && /Firefox\//.test(navigator.userAgent);

/** Minimal WebCodecs ImageDecoder surface (not in every TS DOM lib yet). */
interface ImageDecoderLike {
  decode(): Promise<{ image: VideoFrame }>;
  close(): void;
}
type ImageDecoderCtor = {
  new (init: { data: ReadableStream<Uint8Array> | BufferSource; type: string }): ImageDecoderLike;
  isTypeSupported(type: string): Promise<boolean>;
};

async function sniffType(blob: Blob): Promise<string> {
  if (blob.type) return blob.type;
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  return "";
}

export async function decodeImage(blob: Blob): Promise<DecodedImage & { via: string }> {
  const Dec = (globalThis as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
  if (Dec && preferImageDecoder()) {
    const type = await sniffType(blob);
    if (DECODER_TYPES.has(type) && (await Dec.isTypeSupported(type).catch(() => false))) {
      let dec: ImageDecoderLike | null = null;
      try {
        dec = new Dec({ data: blob.stream(), type });
        const { image } = await dec.decode();
        return { width: image.displayWidth, height: image.displayHeight, source: image, close: () => image.close(), via: "ImageDecoder" };
      } catch (e) {
        lastDecoderError = String((e as Error)?.message ?? e);
      } finally {
        dec?.close();
      }
    }
  }
  const bm = await createImageBitmap(blob);
  return { width: bm.width, height: bm.height, source: bm, close: () => bm.close(), via: lastDecoderError ? `createImageBitmap (ImageDecoder failed: ${lastDecoderError.slice(0, 80)})` : "createImageBitmap" };
}

/**
 * Cooperative yielding for page-thread work: yields (macrotask) only once `budgetMs` of work
 * has accumulated, so many small steps don't each pay the timer clamp.
 */
export function timeSlicer(budgetMs = 24) {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < budgetMs) return;
    await new Promise<void>((r) => setTimeout(r, 0));
    since = performance.now();
  };
}

/** Wrap an already-decoded ImageBitmap (e.g. transferred from the worker). */
export const fromBitmap = (bm: ImageBitmap): DecodedImage => ({ width: bm.width, height: bm.height, source: bm, close: () => bm.close() });
