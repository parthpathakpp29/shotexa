/**
 * Read image dimensions from the container header without decoding pixels.
 * Used to verify exports (encoders can silently crop — e.g. WebP > 16383 px) and to
 * estimate decoded memory before committing to a decode.
 */
export interface ImageSize {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
}

export function parseImageSize(b: Uint8Array): ImageSize | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // PNG: signature + IHDR
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { format: "png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === "VP8 ") return { format: "webp", width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    if (fourcc === "VP8L") {
      const v = dv.getUint32(21, true);
      return { format: "webp", width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 };
    }
    if (fourcc === "VP8X") {
      const u24 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
      return { format: "webp", width: 1 + u24(24), height: 1 + u24(27) };
    }
    return null;
  }
  // JPEG: walk markers to the first SOFn
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const marker = b[o + 1];
      if (marker === 0xff) {
        o++;
        continue;
      }
      const len = dv.getUint16(o + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { format: "jpeg", height: dv.getUint16(o + 5), width: dv.getUint16(o + 7) };
      if (len < 2) return null;
      o += 2 + len;
    }
  }
  return null;
}

/** Reads only as many bytes as needed (JPEG headers can hold large EXIF blocks). */
export async function readImageSize(blob: Blob): Promise<ImageSize | null> {
  for (const n of [64 * 1024, 1024 * 1024, blob.size]) {
    const r = parseImageSize(new Uint8Array(await blob.slice(0, n).arrayBuffer()));
    if (r || n >= blob.size) return r;
  }
  return null;
}
