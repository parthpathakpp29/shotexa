import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { Rgba } from "@/core/ocr/preprocess";
import { TesseractEngine, type CreateWorker } from "@/core/ocr/tesseract-engine";

export const OCR_FIXTURE_DIR = join(process.cwd(), "src", "tests", "fixtures", "ocr");

export interface OcrFixture {
  id: string;
  category: string[];
  description: string;
  file: string;
  format: "png" | "jpeg";
  width: number;
  height: number;
  dpr: number;
  lang: "eng" | "hin" | "eng+hin";
  lines: number;
  words: number;
  rotate90: boolean;
}

export interface OcrExpected {
  id: string;
  lang: string;
  boxesFrame: "image" | "unrotated";
  lines: { text: string; box: [number, number, number, number]; words: { text: string; box: [number, number, number, number]; emoji: boolean }[] }[];
  sourceLines: string[] | null;
}

export function loadOcrManifest(): OcrFixture[] {
  return JSON.parse(readFileSync(join(OCR_FIXTURE_DIR, "manifest.json"), "utf8"));
}
export function loadExpected(id: string): OcrExpected {
  return JSON.parse(readFileSync(join(OCR_FIXTURE_DIR, id, "expected.json"), "utf8"));
}
export function readFixtureBytes(f: OcrFixture): Buffer {
  return readFileSync(join(OCR_FIXTURE_DIR, f.file));
}
export function decodeFixture(f: OcrFixture): Rgba {
  const buf = readFixtureBytes(f);
  if (f.format === "png") {
    const p = PNG.sync.read(buf);
    return { width: p.width, height: p.height, data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length) };
  }
  const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  return { width: j.width, height: j.height, data: j.data as Uint8Array };
}

export function encodeGrayPng(g: { width: number; height: number; data: Uint8Array }): Buffer {
  const png = new PNG({ width: g.width, height: g.height, colorType: 0, inputColorType: 0, inputHasAlpha: false });
  png.data = Buffer.from(g.data.buffer, g.data.byteOffset, g.data.length);
  return PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false });
}

export function cropRgba(img: Rgba, y: number, h: number): Rgba {
  return { width: img.width, height: h, data: img.data.slice(y * img.width * 4, (y + h) * img.width * 4) };
}
export function encodeRgbaPng(img: Rgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  return PNG.sync.write(png);
}

const req = createRequire(join(process.cwd(), "package.json"));

/** Node engine using the same adapter as the browser, with local (npm) language data. */
export function createNodeEngine(): TesseractEngine {
  const { createWorker } = req("tesseract.js") as { createWorker: CreateWorker };
  const version = (req("tesseract.js/package.json") as { version: string }).version;
  return new TesseractEngine({
    createWorker,
    // Node resolves `${langPath}/${lang}.traineddata.gz`; eng and hin live in separate packages,
    // so a small merged directory is prepared by `prepareNodeLangDir()`.
    langPath: prepareNodeLangDir(),
    cacheMethod: "none",
    version,
  });
}

let langDir: string | null = null;
export function prepareNodeLangDir(): string {
  if (langDir) return langDir;
  const { mkdirSync, copyFileSync, existsSync } = req("node:fs") as typeof import("node:fs");
  const dir = join(process.cwd(), ".cache", "tessdata", "4.0.0_best_int");
  mkdirSync(dir, { recursive: true });
  for (const lang of ["eng", "hin"]) {
    const src = join(process.cwd(), "node_modules", "@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`);
    const dst = join(dir, `${lang}.traineddata.gz`);
    if (!existsSync(dst)) copyFileSync(src, dst);
  }
  langDir = dir;
  return dir;
}
