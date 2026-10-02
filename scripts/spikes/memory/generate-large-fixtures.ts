/**
 * Spike B fixtures: very tall synthetic screenshots, generated deterministically in Node
 * (no browser canvas limits involved) into a gitignored cache.
 *
 *   npx tsx scripts/spikes/memory/generate-large-fixtures.ts
 *
 * Output: .cache/spike-b/*.{png,jpg,webp} + manifest.json
 */
import { chromium } from "@playwright/test";
import jpeg from "jpeg-js";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

export const CACHE_DIR = join(process.cwd(), ".cache", "spike-b");

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Screenshot-like page: chat bubbles with "text" strokes, separators, photo blocks. */
export function renderPage(width: number, height: number, seed: number, dark = false): Uint8Array {
  const r = rng(seed);
  const px = new Uint8Array(width * height * 4);
  const bg = dark ? [11, 20, 26] : [239, 234, 226];
  const u32 = new Uint32Array(px.buffer);
  const pack = (c: number[]) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
  u32.fill(pack(bg));
  const rect = (x0: number, y0: number, w: number, h: number, c: number[]) => {
    const v = pack(c);
    const x1 = Math.min(width, x0 + w);
    const y1 = Math.min(height, y0 + h);
    for (let y = Math.max(0, y0); y < y1; y++) u32.fill(v, y * width + Math.max(0, x0), y * width + x1);
  };
  const s = width / 390; // CSS px → device px
  let y = Math.round(20 * s);
  while (y < height) {
    const kind = r();
    if (kind < 0.07) {
      // "photo": gradient + per-pixel noise (photos are what make real screenshot PNGs big)
      const h = Math.round((120 + r() * 160) * s);
      const x0 = Math.round(12 * s);
      const w = Math.round(260 * s);
      const hue = r() * 255;
      for (let yy = 0; yy < h && y + yy < height; yy++) {
        const row = (y + yy) * width;
        for (let xx = x0; xx < Math.min(width, x0 + w); xx++) {
          const n = (r() * 48) | 0;
          u32[row + xx] = pack([(hue + yy + n) & 255, (yy * 2 + xx / 4 + n) & 255, (255 - hue + n) & 255]);
        }
      }
      y += h + Math.round(10 * s);
      continue;
    }
    const out = r() < 0.45;
    const lines = 1 + Math.floor(r() * (r() < 0.25 ? 6 : 2));
    const lineH = Math.round(20 * s);
    const w = Math.round((80 + r() * 200) * s);
    const h = lines * lineH + Math.round(16 * s);
    const x0 = out ? width - w - Math.round(10 * s) : Math.round(10 * s);
    const bubble = dark ? (out ? [0, 92, 75] : [32, 44, 51]) : out ? [217, 253, 211] : [255, 255, 255];
    const ink = dark ? [233, 237, 239] : [17, 27, 33];
    rect(x0, y, w, h, bubble);
    for (let l = 0; l < lines; l++) {
      // "words": short ink strokes with gaps, glyph-like vertical detail
      let x = x0 + Math.round(9 * s);
      const ly = y + Math.round(8 * s) + l * lineH;
      const end = x0 + w - Math.round(9 * s) - (l === lines - 1 ? Math.round(r() * w * 0.4) : 0);
      while (x < end) {
        const ww = Math.round((12 + r() * 40) * s);
        for (let gx = x; gx < Math.min(end, x + ww); gx += Math.max(2, Math.round(2 * s))) {
          const gh = Math.round((6 + r() * 8) * s);
          const top = ly + Math.round(12 * s) - gh;
          rect(gx, top, Math.max(1, Math.round(1.2 * s)), gh, ink);
          // anti-aliased edges: random blend of ink and bubble on both sides
          const edge = (x: number) => {
            const t = r();
            rect(x, top, 1, gh, [0, 1, 2].map((i) => Math.round(ink[i] * t + bubble[i] * (1 - t))));
          };
          edge(gx - 1);
          edge(gx + Math.max(1, Math.round(1.2 * s)));
        }
        x += ww + Math.round(6 * s);
      }
    }
    y += h + Math.round((4 + r() * 8) * s);
  }
  return px;
}

function crop(px: Uint8Array, width: number, y0: number, h: number) {
  return px.subarray(y0 * width * 4, (y0 + h) * width * 4);
}

function writePng(file: string, width: number, height: number, rgba: Uint8Array) {
  const png = new PNG({ width, height, colorType: 2, inputColorType: 6, inputHasAlpha: true });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  writeFileSync(file, PNG.sync.write(png, { colorType: 2, inputColorType: 6, inputHasAlpha: true, deflateLevel: 6 }));
}

function writeJpeg(file: string, width: number, height: number, rgba: Uint8Array, quality: number) {
  writeFileSync(file, jpeg.encode({ data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height }, quality).data);
}

/** Real dimensions from a WebP header (VP8 / VP8L / VP8X). */
export function webpSize(b: Buffer): { width: number; height: number } {
  const fourcc = b.toString("ascii", 12, 16);
  if (fourcc === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (fourcc === "VP8L") {
    const v = b.readUInt32LE(21);
    return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
  }
  return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
}

interface Entry {
  file: string;
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
  bytes: number;
  note?: string;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const manifest: Entry[] = [];
  const add = (file: string, width: number, height: number, format: Entry["format"], note?: string) =>
    manifest.push({ file, width, height, format, bytes: statSync(join(CACHE_DIR, file)).size, note });
  const need = (f: string) => !existsSync(join(CACHE_DIR, f));

  const tall: [number, number, number][] = [
    [1080, 5000, 101],
    [1080, 10000, 102],
    [1080, 20000, 103],
    [1080, 30000, 104],
    [1440, 20000, 105],
  ];
  for (const [w, h, seed] of tall) {
    const png = `tall-${w}x${h}.png`;
    const jpg = `tall-${w}x${h}.jpg`;
    if (need(png) || need(jpg)) {
      const t = Date.now();
      const px = renderPage(w, h, seed);
      if (need(png)) writePng(join(CACHE_DIR, png), w, h, px);
      if (need(jpg)) writeJpeg(join(CACHE_DIR, jpg), w, h, px, 85);
      console.log(`${png}/${jpg} in ${Date.now() - t} ms`);
    }
    add(png, w, h, "png");
    add(jpg, w, h, "jpeg");
  }

  // Phone-sized screenshots for multi-image composition (distinct content, cycled).
  for (const [w, h, count, dark] of [
    [1080, 2400, 4, false],
    [1440, 3200, 3, true],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const f = `phone-${w}x${h}-${i}.png`;
      if (need(f)) writePng(join(CACHE_DIR, f), w, h, renderPage(w, h, 500 + i + w, dark));
      add(f, w, h, "png");
    }
  }

  // Overlapping tall pair for OpenCV analysis: offset 7000.
  if (need("pair-1080x10000-a.png") || need("pair-1080x10000-b.png")) {
    const src = renderPage(1080, 17000, 900);
    writePng(join(CACHE_DIR, "pair-1080x10000-a.png"), 1080, 10000, crop(src, 1080, 0, 10000));
    writePng(join(CACHE_DIR, "pair-1080x10000-b.png"), 1080, 10000, crop(src, 1080, 7000, 10000));
  }
  add("pair-1080x10000-a.png", 1080, 10000, "png", "overlap pair A (offset 7000)");
  add("pair-1080x10000-b.png", 1080, 10000, "png", "overlap pair B");

  // WebP via Chromium's encoder (Node has none). WebP's format limit is 16383 px per side.
  const webpTargets = [
    [1080, 5000],
    [1080, 10000],
    [1080, 16383],
    [1080, 20000],
  ];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  for (const [w, h] of webpTargets) {
    const f = `tall-${w}x${h}.webp`;
    if (need(f) && need(`${f}.unsupported`)) {
      // Passed as a string: tsx/esbuild helpers (e.g. __name) don't exist in the page.
      const b64 = (await page.evaluate(`(async () => {
        const w = ${w}, h = ${h};
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext("2d");
        let s = ${h};
        const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
        ctx.fillStyle = "#efeae2";
        ctx.fillRect(0, 0, w, h);
        ctx.font = "40px sans-serif";
        for (let y = 60; y < h; y += 70 + Math.floor(r() * 60)) {
          const out = r() < 0.45;
          const bw = 240 + r() * 540;
          ctx.fillStyle = out ? "#d9fdd3" : "#fff";
          ctx.fillRect(out ? w - bw - 30 : 30, y, bw, 58);
          ctx.fillStyle = "#111b21";
          ctx.fillText("Lorem ipsum dolor sit amet ".repeat(3).slice(0, Math.floor(bw / 22)), out ? w - bw - 10 : 50, y + 42);
        }
        const blob = await c.convertToBlob({ type: "image/webp", quality: 0.8 });
        if (blob.type !== "image/webp") return null; // encoder refused / fell back
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(bin);
      })()`)) as string | null;
      if (b64) writeFileSync(join(CACHE_DIR, f), Buffer.from(b64, "base64"));
      else writeFileSync(join(CACHE_DIR, `${f}.unsupported`), "Chromium convertToBlob did not return image/webp for this size\n");
    }
    if (existsSync(join(CACHE_DIR, f))) {
      const real = webpSize(readFileSync(join(CACHE_DIR, f)));
      add(f, real.width, real.height, "webp", real.height !== h ? `requested ${w}×${h}; Chromium silently truncated to ${real.width}×${real.height} while reporting image/webp` : undefined);
    }
    else console.log(`${f}: WebP encode unsupported at this size (${readFileSync(join(CACHE_DIR, `${f}.unsupported`), "utf8").trim()})`);
  }
  await browser.close();

  writeFileSync(join(CACHE_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const e of manifest) console.log(`${e.file.padEnd(28)} ${String(e.width).padStart(5)}×${String(e.height).padEnd(6)} ${(e.bytes / 1024).toFixed(0).padStart(7)} KiB  decoded ${((e.width * e.height * 4) / 2 ** 20).toFixed(1)} MiB`);
}

if (process.argv[1]?.includes("generate-large-fixtures")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
