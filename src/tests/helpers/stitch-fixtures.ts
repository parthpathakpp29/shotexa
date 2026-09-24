import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { OpenCvLike } from "@/core/stitch/opencv-matcher";

export const FIXTURE_DIR = join(process.cwd(), "src", "tests", "fixtures", "stitch");

export interface FixtureManifestEntry {
  id: string;
  description: string;
  category: string[];
  files: { a: string; b: string };
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
  dpr: number;
  expect: "match" | "no-match";
  expectedOffsetY: number | null;
  expectedOverlap: number;
}

export function loadManifest(): FixtureManifestEntry[] {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, "manifest.json"), "utf8"));
}

export interface Decoded {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Node-side decode for PNG/JPEG. WebP returns null (covered by the browser benchmark). */
export function decodeFixture(rel: string): Decoded | null {
  const buf = readFileSync(join(FIXTURE_DIR, rel));
  if (rel.endsWith(".png")) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
  }
  if (rel.endsWith(".jpg")) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width: img.width, height: img.height, data: img.data as Uint8Array };
  }
  return null;
}

let cvPromise: Promise<OpenCvLike> | null = null;
/** Loads the same OpenCV.js build the browser worker uses. */
export function loadOpenCvNode(): Promise<OpenCvLike> {
  cvPromise ??= (async () => {
    const require = createRequire(join(process.cwd(), "package.json"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = require("@techstark/opencv-js");
    if (mod instanceof Promise || typeof mod?.then === "function") return (await mod) as OpenCvLike;
    if (mod.Mat) return mod as OpenCvLike;
    await new Promise<void>((resolve) => (mod.onRuntimeInitialized = () => resolve()));
    return mod as OpenCvLike;
  })();
  return cvPromise;
}
