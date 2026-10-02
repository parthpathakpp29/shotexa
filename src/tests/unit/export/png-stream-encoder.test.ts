import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { createPngStreamEncoder } from "@/core/export/png-stream-encoder";

function pattern(width: number, height: number, seed = 1): Uint8Array {
  const px = new Uint8Array(width * height * 4);
  let s = seed;
  for (let i = 0; i < width * height; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const y = Math.floor(i / width);
    // Mix of flat areas, gradients and noise (screenshot-like variety).
    const v = y % 40 < 20 ? 250 : (i * 7) & 0xff;
    px.set([v, (v + y) & 0xff, s & 0xff, 255], i * 4);
  }
  return px;
}

async function encode(width: number, height: number, px: Uint8Array, batch: number, alpha = false) {
  const enc = createPngStreamEncoder(width, height, { alpha });
  for (let y = 0; y < height; y += batch) {
    const rows = Math.min(batch, height - y);
    await enc.writeRows(px.subarray(y * width * 4, (y + rows) * width * 4), rows);
  }
  return Buffer.from(await (await enc.finish()).arrayBuffer());
}

describe("streaming PNG encoder", () => {
  it("round-trips RGB exactly regardless of batch size", async () => {
    const w = 37;
    const h = 101;
    const px = pattern(w, h);
    for (const batch of [1, 7, 64, 101]) {
      const png = PNG.sync.read(await encode(w, h, px, batch));
      expect(png.width).toBe(w);
      expect(png.height).toBe(h);
      expect(Buffer.compare(png.data, Buffer.from(px))).toBe(0);
    }
  });

  it("round-trips RGBA when alpha is requested", async () => {
    const px = pattern(16, 16, 3);
    for (let i = 3; i < px.length; i += 4) px[i] = i & 0xff;
    const png = PNG.sync.read(await encode(16, 16, px, 5, true));
    expect(Buffer.compare(png.data, Buffer.from(px))).toBe(0);
  });

  it("validates row counts", async () => {
    const enc = createPngStreamEncoder(4, 4);
    await enc.writeRows(new Uint8Array(4 * 2 * 4), 2);
    await expect(enc.finish()).rejects.toThrow(/expected 4 rows/);
    const enc2 = createPngStreamEncoder(4, 2);
    await expect(enc2.writeRows(new Uint8Array(4 * 3 * 4), 3)).rejects.toThrow(/too many rows/);
  });

  it("handles outputs taller than browser canvas limits without a full-size buffer", async () => {
    const w = 8;
    const h = 70_000; // > 65,535 (Chromium/JPEG limit) and > 32,767 (Firefox canvas limit)
    const enc = createPngStreamEncoder(w, h);
    const tile = new Uint8Array(w * 1000 * 4).fill(200);
    for (let y = 0; y < h; y += 1000) await enc.writeRows(tile, 1000);
    const png = PNG.sync.read(Buffer.from(await (await enc.finish()).arrayBuffer()));
    expect(png.height).toBe(h);
  });
});
