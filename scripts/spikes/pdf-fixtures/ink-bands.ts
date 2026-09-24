/**
 * Adds measured glyph (ink) bands to each ground-truth text line in truth.json.
 * DOM line boxes include space above/below glyphs (~25% at the top for Segoe UI), so the
 * benchmark judges "cuts through text" against the rows that actually contain glyph pixels.
 *
 *   npx tsx scripts/spikes/pdf-fixtures/ink-bands.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

type Box = [number, number, number, number];

export function inkBand(png: { width: number; height: number; data: Uint8Array | Buffer }, box: Box): [number, number] | null {
  const [x0, y0, w, h] = box;
  const xs = Math.max(0, x0);
  const xe = Math.min(png.width, x0 + w);
  const luma = (x: number, y: number) => {
    const i = (y * png.width + x) * 4;
    return (png.data[i] * 77 + png.data[i + 1] * 150 + png.data[i + 2] * 29) >> 8;
  };
  let top = -1;
  let bottom = -1;
  for (let y = Math.max(0, y0); y < Math.min(png.height, y0 + h); y++) {
    const vals: number[] = [];
    for (let x = xs; x < xe; x += 1) vals.push(luma(x, y));
    const sorted = [...vals].sort((a, b) => a - b);
    const bg = sorted[sorted.length >> 1];
    const ink = vals.filter((v) => Math.abs(v - bg) > 50).length;
    if (ink > 0) {
      if (top < 0) top = y;
      bottom = y + 1;
    }
  }
  return top < 0 ? null : [top, bottom];
}

export function addInkBands(dir: string) {
  const png = PNG.sync.read(readFileSync(join(dir, "image.png")));
  const truth = JSON.parse(readFileSync(join(dir, "truth.json"), "utf8"));
  for (const l of truth.textLines) l.ink = inkBand(png, l.box);
  writeFileSync(join(dir, "truth.json"), JSON.stringify(truth) + "\n");
  return truth.textLines.length;
}

if (process.argv[1]?.includes("ink-bands")) {
  const root = join(process.cwd(), "src", "tests", "fixtures", "pdf");
  for (const id of readdirSync(root)) {
    if (id.endsWith(".json")) continue;
    console.log(id, addInkBands(join(root, id)), "lines");
  }
}
