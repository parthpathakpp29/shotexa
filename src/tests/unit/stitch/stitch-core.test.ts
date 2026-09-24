import { describe, expect, it } from "vitest";
import { analyseStitch } from "@/core/stitch/analyse";
import { DEFAULT_STITCH_CONFIG, resolveStitchConfig } from "@/core/stitch/config";
import { classifyConfidence, scoreConfidence } from "@/core/stitch/confidence";
import { downscaleGray, proxySize } from "@/core/stitch/gray";
import { createOpenCvMatcher, scanPeaks } from "@/core/stitch/opencv-matcher";
import { offsetRange, planStitch } from "@/core/stitch/plan";
import { contentResidual, inkMismatch, overlapResidual } from "@/core/stitch/residual";
import { createRgbaSource } from "@/core/stitch/sources";
import { detectStaticBands } from "@/core/stitch/static-bands";
import type { GrayImage } from "@/core/stitch/types";
import { loadOpenCvNode } from "../../helpers/stitch-fixtures";

/** Deterministic textured "page" of the given height. */
function page(width: number, height: number, seed = 1): GrayImage {
  const data = new Uint8Array(width * height);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  data.fill(240);
  for (let y = 0; y < height; y += 6 + Math.floor(rnd() * 10)) {
    const x0 = Math.floor(rnd() * width * 0.5);
    const w = Math.floor(width * (0.2 + rnd() * 0.4));
    const v = Math.floor(rnd() * 120);
    for (let yy = y; yy < Math.min(height, y + 4); yy++) for (let x = x0; x < Math.min(width, x0 + w); x++) data[yy * width + x] = v;
  }
  return { width, height, data };
}

function rows(src: GrayImage, y: number, h: number): GrayImage {
  return { width: src.width, height: h, data: src.data.slice(y * src.width, (y + h) * src.width) };
}

function toRgba(g: GrayImage): Uint8Array {
  const out = new Uint8Array(g.width * g.height * 4);
  for (let i = 0; i < g.data.length; i++) out.set([g.data[i], g.data[i], g.data[i], 255], i * 4);
  return out;
}

describe("planStitch (coordinate mapping)", () => {
  const a = { width: 100, height: 1000 };
  const b = { width: 100, height: 1000 };

  it("places the seam mid-overlap and keeps A header + B footer", () => {
    const p = planStitch(a, b, 600, { top: 100, bottom: 80 });
    // Valid seam window: [600 + 100, 1000 − 80) → mid 810.
    expect(p.seamY).toBe(810);
    expect(p.height).toBe(600 + 1000);
    expect(p.segments).toEqual([
      { source: "a", sy: 0, height: 810, dy: 0 },
      { source: "b", sy: 210, height: 790, dy: 810 },
    ]);
  });

  it("falls back to end-to-end when the offset equals A's height", () => {
    const p = planStitch(a, b, 1000, { top: 100, bottom: 80 });
    expect(p.seamY).toBe(1000);
    expect(p.height).toBe(2000);
    expect(p.segments[1]).toEqual({ source: "b", sy: 0, height: 1000, dy: 1000 });
  });

  it("clamps manual offsets into range", () => {
    expect(planStitch(a, b, -50, { top: 0, bottom: 0 }).offsetY).toBe(offsetRange(a).min);
    expect(planStitch(a, b, 5000, { top: 0, bottom: 0 }).offsetY).toBe(offsetRange(a).max);
  });

  it("output never loses rows: every output row maps to exactly one source row", () => {
    for (const dy of [1, 37, 500, 999]) {
      const p = planStitch(a, b, dy, { top: 20, bottom: 20 });
      const covered = p.segments.reduce((s, seg) => s + seg.height, 0);
      expect(covered).toBe(p.height);
      expect(p.segments[1].dy).toBe(p.segments[0].height);
    }
  });
});

describe("gray/proxy", () => {
  it("proxySize respects the width cap and never upscales", () => {
    expect(proxySize(1170, 2532, 360)).toEqual({ scale: 360 / 1170, width: 360, height: 779 });
    expect(proxySize(200, 400, 360).scale).toBe(1);
  });
  it("downscaleGray averages boxes", () => {
    const img: GrayImage = { width: 2, height: 2, data: new Uint8Array([0, 100, 200, 100]) };
    expect(Array.from(downscaleGray(img, 1, 1).data)).toEqual([100]);
  });
});

describe("static bands", () => {
  const cfg = DEFAULT_STITCH_CONFIG.staticBands;
  it("finds a shared header/footer and tolerates clock drift only near the edge", () => {
    const content = page(200, 900, 3);
    const a = rows(content, 0, 400);
    const b = rows(content, 250, 400);
    for (const img of [a, b]) {
      for (let y = 0; y < 40; y++) for (let x = 0; x < 200; x++) img.data[y * 200 + x] = 30; // header
      for (let y = 370; y < 400; y++) for (let x = 0; x < 200; x++) img.data[y * 200 + x] = 60; // footer
    }
    // "Clock" change in rows 8–14 of B, localised to 20px.
    for (let y = 8; y < 15; y++) for (let x = 10; x < 30; x++) b.data[y * 200 + x] = 250;
    const r = detectStaticBands(a, b, cfg);
    expect(r.tolerant.top).toBeGreaterThanOrEqual(40);
    expect(r.strict.top).toBeLessThan(15);
    expect(r.tolerant.bottom).toBeGreaterThanOrEqual(30);
    expect(r.identical).toBe(false);
  });
  it("flags identical images", () => {
    const a = page(100, 200);
    expect(detectStaticBands(a, a, cfg).identical).toBe(true);
  });
});

describe("residuals", () => {
  const src = page(120, 600, 7);
  const a = rows(src, 0, 300);
  const b = rows(src, 180, 300);
  it("overlap residual is 0 at the true offset and positive elsewhere", () => {
    expect(overlapResidual(a, b, 180, 0, 300)).toBe(0);
    expect(overlapResidual(a, b, 170, 0, 300)).toBeGreaterThan(0);
  });
  it("contentResidual excludes bands and reports overlap rows", () => {
    const r = contentResidual(a, b, 180, 10, 10);
    expect(r.rows).toBe(300 - 10 - (180 + 10));
    expect(r.mad).toBe(0);
  });
  it("ink mismatch separates true from shifted alignment", () => {
    expect(inkMismatch(a, b, 180, 0, 300, 40, 48)).toBe(0);
    expect(inkMismatch(a, b, 150, 0, 300, 40, 48)).toBeGreaterThan(0.2);
  });
});

describe("confidence", () => {
  const cfg = DEFAULT_STITCH_CONFIG.confidence;
  const good = { similarity: 0.95, uniquenessGap: 0.5, agreement: 1, residual: 1, baselineResidual: 30, inkMismatch: 0 };
  it("scores a clean match as high", () => {
    const { confidence } = scoreConfidence(good, cfg, 2);
    expect(classifyConfidence(confidence, cfg)).toBe("high");
  });
  it("any cap forces the result below the no-match threshold", () => {
    expect(cfg.lowCap).toBeLessThan(cfg.noMatchBelow);
    for (const bad of [{ similarity: 0.3 }, { inkMismatch: 0.5 }, { residual: 29 }]) {
      const r = scoreConfidence({ ...good, ...bad }, cfg, 2);
      expect(r.breakdown.caps.length).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThan(cfg.noMatchBelow);
    }
  });
  it("config overrides merge deeply without mutating defaults", () => {
    const c = resolveStitchConfig({ confidence: { thresholds: { high: 0.9 } } });
    expect(c.confidence.thresholds).toEqual({ high: 0.9, medium: 0.55 });
    expect(DEFAULT_STITCH_CONFIG.confidence.thresholds.high).toBe(0.8);
  });
});

describe("scanPeaks", () => {
  it("returns best and second-best outside the suppression window", () => {
    const data = new Float32Array([0.1, 0.2, 0.9, 0.85, 0.3, 0.6, NaN]);
    const r = scanPeaks(data, 7, 1, 1);
    expect(r).toMatchObject({ y: 2, x: 0 });
    expect(r.score).toBeCloseTo(0.9);
    expect(r.secondScore).toBeCloseTo(0.6);
  });
});

describe("analyseStitch (synthetic, OpenCV)", () => {
  it("recovers an exact offset and composes from full-res coordinates", async () => {
    const matcher = createOpenCvMatcher(await loadOpenCvNode());
    const src = page(720, 3000, 11);
    const a = rows(src, 0, 1400);
    const b = rows(src, 900, 1400);
    const res = await analyseStitch(createRgbaSource(toRgba(a), 720, 1400), createRgbaSource(toRgba(b), 720, 1400), matcher);
    expect(res.status).toBe("matched");
    expect(res.offsetY).toBe(900);
    expect(res.confidenceClass).toBe("high");
  });

  it("rejects mismatched widths with a controlled error", async () => {
    const matcher = createOpenCvMatcher(await loadOpenCvNode());
    const a = page(400, 400);
    const b = page(500, 400);
    await expect(analyseStitch(createRgbaSource(toRgba(a), 400, 400), createRgbaSource(toRgba(b), 500, 400), matcher)).rejects.toMatchObject({ code: "STITCH_WIDTH_MISMATCH" });
  });

  it("supports cooperative cancellation", async () => {
    const matcher = createOpenCvMatcher(await loadOpenCvNode());
    const a = page(400, 800);
    await expect(
      analyseStitch(createRgbaSource(toRgba(a), 400, 800), createRgbaSource(toRgba(a), 400, 800), matcher, { signal: { aborted: true } }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
