import jpeg from "jpeg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { downscaleGray, rgbaToGray } from "@/core/stitch/gray";
import { HINT, likelyOverlap } from "@/core/stitch/overlap-hint";
import type { GrayImage } from "@/core/stitch/types";

const DIR = join(process.cwd(), "src", "tests", "fixtures", "stitch");
const manifest: { id: string; files: { a: string; b: string }; format: string; expect: "match" | "no-match" }[] = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));

function proxy(file: string): GrayImage {
  const buf = readFileSync(join(DIR, file));
  const img = file.endsWith(".png") ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true });
  const gray = rgbaToGray(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length), img.width, img.height);
  return downscaleGray(gray, HINT.width, Math.round((img.height * HINT.width) / img.width));
}

describe("homepage overlap hint (validated on Spike A fixture pairs)", () => {
  const cases = manifest.filter((m) => m.format !== "webp"); // no WebP decoder in Node
  const results = cases.map((m) => ({ m, r: likelyOverlap(proxy(m.files.a), proxy(m.files.b)) }));

  it("reports results", () => {
    for (const { m, r } of results) console.log(m.id.padEnd(26), m.expect.padEnd(8), r.likely, r.reason, r.score.toFixed(3), r.gap.toFixed(3));
  });
  it("never suggests stitching for non-overlapping pairs", () => {
    for (const { m, r } of results.filter((x) => x.m.expect === "no-match")) expect(r.likely, m.id).toBe(false);
  });
  // Recognised pairs (regression guard). Known misses — the banner simply doesn't appear, Smart
  // Stitch is still offered as an action and the validated engine does the real alignment:
  // small overlaps (≤ ~8%: small-overlap-webpage/chat, tiny-overlap) and periodic code lines.
  const RECOGNISED = ["chat-light", "chat-dark", "chat-light-jpeg", "webpage-article", "webpage-dark", "repeated-header-webpage", "large-overlap-chat", "large-overlap-webpage", "table-rows", "repetitive-chat"];
  it("suggests stitching for the recognised overlapping pairs (10 of 14 PNG/JPEG overlap fixtures)", () => {
    for (const { m, r } of results.filter((x) => RECOGNISED.includes(x.m.id))) expect(r.likely, m.id).toBe(true);
  });
  it("identical screenshots are not an overlap", () => {
    const p = proxy(cases[0].files.a);
    expect(likelyOverlap(p, p).likely).toBe(false);
  });
});
