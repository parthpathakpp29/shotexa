/**
 * Streaming PNG encoder.
 *
 * Encodes an image of any height from row batches (e.g. canvas tiles) so a very tall
 * output never needs one giant canvas or one contiguous RGBA buffer. Uses the platform
 * `CompressionStream("deflate")` (zlib format, exactly what PNG IDAT expects).
 *
 * Memory: O(width × batch rows) for input + the compressed output parts (kept as Blob
 * parts, not concatenated in JS).
 *
 * Output is standard 8-bit RGB (colour type 2) or RGBA (colour type 6), non-interlaced,
 * adaptive per-row filter (None/Sub/Up — cheap and effective on screenshots).
 */
export interface PngStreamEncoderOptions {
  /** Keep the alpha channel. Screenshots are opaque, so RGB (25% less data) is the default. */
  alpha?: boolean;
}

export interface PngStreamEncoder {
  readonly width: number;
  readonly height: number;
  /** Append `rows` rows of RGBA pixels (length ≥ width × rows × 4). Rows must arrive in order. */
  writeRows(rgba: Uint8Array | Uint8ClampedArray, rows: number): Promise<void>;
  /** Finish the stream. Throws if fewer than `height` rows were written. */
  finish(): Promise<Blob>;
  /** Abort and release resources. */
  abort(): void;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable: Uint32Array | null = null;
function crc32(parts: Uint8Array[]): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = crcTable[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const head = new Uint8Array(8);
  const view = new DataView(head.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) head[4 + i] = type.charCodeAt(i);
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, crc32([head.subarray(4), data]));
  return [head, data, tail];
}

export function createPngStreamEncoder(width: number, height: number, opts: PngStreamEncoderOptions = {}): PngStreamEncoder {
  if (!(width > 0 && height > 0 && width <= 0x7fffffff && height <= 0x7fffffff)) throw new RangeError("invalid PNG size");
  const channels = opts.alpha ? 4 : 3;
  const stride = width * channels;

  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opts.alpha ? 6 : 2; // colour type
  // compression 0, filter 0, interlace 0

  const parts: BlobPart[] = [SIGNATURE, ...chunk("IHDR", ihdr)];
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  // Drain concurrently, otherwise backpressure stalls writes.
  const drained = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value.length) parts.push(...chunk("IDAT", value as Uint8Array<ArrayBuffer>));
    }
  })();

  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  const candidates = [new Uint8Array(stride + 1), new Uint8Array(stride + 1), new Uint8Array(stride + 1)];
  let written = 0;
  let aborted = false;

  const filterRow = (): Uint8Array => {
    const [none, sub, up] = candidates;
    none[0] = 0;
    sub[0] = 1;
    up[0] = 2;
    let sNone = 0;
    let sSub = 0;
    let sUp = 0;
    for (let i = 0; i < stride; i++) {
      const x = cur[i];
      const a = i >= channels ? cur[i - channels] : 0;
      const fSub = (x - a) & 0xff;
      const fUp = (x - prev[i]) & 0xff;
      none[i + 1] = x;
      sub[i + 1] = fSub;
      up[i + 1] = fUp;
      // Minimum sum of absolute differences heuristic (signed interpretation).
      sNone += x < 128 ? x : 256 - x;
      sSub += fSub < 128 ? fSub : 256 - fSub;
      sUp += fUp < 128 ? fUp : 256 - fUp;
    }
    const best = sSub <= sUp && sSub <= sNone ? sub : sUp <= sNone ? up : none;
    return best; // copied into the batch buffer by the caller
  };

  return {
    width,
    height,
    async writeRows(rgba, rows) {
      if (aborted) throw new Error("encoder aborted");
      if (written + rows > height) throw new RangeError("too many rows");
      if (rgba.length < width * rows * 4) throw new RangeError("row buffer too small");
      // Batch filtered rows into one write per call to limit stream overhead.
      const out = new Uint8Array(rows * (stride + 1));
      for (let r = 0; r < rows; r++) {
        const base = r * width * 4;
        if (channels === 4) {
          cur.set(rgba.subarray(base, base + stride));
        } else {
          for (let x = 0, s = base, d = 0; x < width; x++, s += 4, d += 3) {
            cur[d] = rgba[s];
            cur[d + 1] = rgba[s + 1];
            cur[d + 2] = rgba[s + 2];
          }
        }
        out.set(filterRow(), r * (stride + 1));
        const t = prev;
        prev = cur;
        cur = t;
      }
      written += rows;
      await writer.ready;
      await writer.write(out);
    },
    async finish() {
      if (written !== height) throw new RangeError(`expected ${height} rows, got ${written}`);
      await writer.close();
      await drained;
      parts.push(...chunk("IEND", new Uint8Array(0)));
      return new Blob(parts, { type: "image/png" });
    },
    abort() {
      aborted = true;
      void writer.abort().catch(() => {});
      void reader.cancel().catch(() => {});
      parts.length = 0;
    },
  };
}
