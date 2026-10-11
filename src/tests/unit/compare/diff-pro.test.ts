/**
 * V2.0F Compare Pro — the difference engine and changed-region intelligence.
 *
 * Everything here runs on small synthetic RGBA buffers, which is exactly what the renderer
 * hands the engine after rasterising both sides into the comparison space. The rendered
 * pixels themselves are verified again in the E2E suite.
 */
import { describe, expect, it } from "vitest";
import { analyseComparison, boxStats, classifyBox, detectMovement, regionLabel, sourceBoxToAnalysis, analysisBoxToSource } from "@/core/compare/analysis";
import { compareBuffers, compareStats, deltaE76, differenceStats, isHighlighted, parseHexColour, rgbToLab } from "@/core/compare/difference";
import { clampSettings, place } from "@/core/compare/layout";
import { DEFAULT_COMPARE, JND_DELTA_E } from "@/core/compare/presets";
import type { CompareBuffersOptions } from "@/core/compare/difference";
import type { CompareDiffSettings, CompareRegion, CompareSettings } from "@/core/compare/types";

type Pixel = [number, number, number, number];

function buffer(width: number, height: number, fill: (x: number, y: number) => Pixel): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = fill(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

const solid = (width: number, height: number, colour: [number, number, number], alpha = 255) => buffer(width, height, () => [...colour, alpha] as Pixel);

/** 8 px blocky deterministic texture, so a region genuinely has structure. */
function texture(x: number, y: number): number {
  const bx = Math.floor(x / 8);
  const by = Math.floor(y / 8);
  let h = (bx * 73856093) ^ (by * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) % 256;
}

const diff = (over: Partial<CompareDiffSettings> = {}): CompareDiffSettings => ({ ...DEFAULT_COMPARE.diff, ...over });

function run(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number, over: Partial<CompareBuffersOptions> = {}) {
  const out = new Uint8ClampedArray(a.length);
  const result = compareBuffers(a, b, out, {
    width,
    height,
    threshold: DEFAULT_COMPARE.threshold,
    diff: diff(),
    background: [243, 241, 238],
    ...over,
  });
  return { ...result, out };
}

const S = (over: Partial<CompareSettings> = {}): CompareSettings => ({ ...DEFAULT_COMPARE, a: "a", b: "b", ...over });

describe("colour science", () => {
  it("converts sRGB to CIELAB with the D65 white point", () => {
    const [l, a, b] = rgbToLab(255, 255, 255);
    expect(l).toBeCloseTo(100, 2);
    expect(a).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 4);
  });

  it("delta-E*ab is symmetric, zero for identical colours, and grows with difference", () => {
    expect(deltaE76(100, 110, 120, 100, 110, 120)).toBe(0);
    expect(deltaE76(10, 20, 30, 200, 190, 180)).toBeCloseTo(deltaE76(200, 190, 180, 10, 20, 30), 6);
    expect(deltaE76(128, 128, 128, 129, 129, 129)).toBeLessThan(JND_DELTA_E);
    expect(deltaE76(128, 128, 128, 200, 60, 60)).toBeGreaterThan(30);
  });

  it("parses only well-formed hex colours", () => {
    expect(parseHexColour("#f3f1ee")).toEqual([243, 241, 238]);
    expect(parseHexColour("#FFF")).toBeNull();
    expect(parseHexColour(null)).toBeNull();
  });
});

describe("percentages", () => {
  it("are taken over the pixels that were actually compared", () => {
    expect(differenceStats(38, 100)).toEqual({ changedPixels: 38, totalPixels: 100, changedPercent: 38, unchangedPercent: 62 });
    // 10 changed out of 50 compared is 20 %, even though the image has 100 pixels.
    expect(differenceStats(10, 100, 50).changedPercent).toBe(20);
    const stats = compareStats(10, 50, 100, 50);
    expect(stats).toMatchObject({ changedPixels: 10, comparedPixels: 50, totalPixels: 100, ignoredPixels: 50, changedPercent: 20, unchangedPercent: 80 });
  });
});

describe("the pixel metric", () => {
  it("finds nothing at all between identical screenshots", () => {
    const a = buffer(16, 16, (x, y) => [texture(x, y), 128, 64, 255]);
    const result = run(a, a.slice(), 16, 16);
    expect(result.changed).toBe(0);
    expect(result.compared).toBe(256);
    expect(result.ignored).toBe(0);
    for (let i = 0; i < result.out.length; i += 4) expect(isHighlighted([result.out[i], result.out[i + 1], result.out[i + 2]])).toBe(false);
  });

  it("finds a single changed pixel", () => {
    const a = solid(16, 16, [100, 100, 100]);
    const b = a.slice();
    const index = (7 * 16 + 9) * 4;
    b[index] = 240;
    const result = run(a, b, 16, 16, { threshold: 0 });
    expect(result.changed).toBe(1);
    expect(result.mask[7 * 16 + 9]).toBe(1);
    expect(isHighlighted([result.out[index], result.out[index + 1], result.out[index + 2]])).toBe(true);
  });

  it("the colour tolerance decides what counts", () => {
    const a = solid(4, 1, [100, 100, 100]);
    // Red channel differences of 0, 10, 40 and 155 (the last clamps at 255).
    const b = buffer(4, 1, (x) => [100 + [0, 10, 40, 200][x], 100, 100, 255]);
    expect(run(a, b, 4, 1, { threshold: 0 }).changed).toBe(3);
    expect(run(a, b, 4, 1, { threshold: 12 }).changed).toBe(2);
    expect(run(a, b, 4, 1, { threshold: 50 }).changed).toBe(1);
    // Above every difference the colour gate is silent, but the luminance gate still fires
    // for the 155-step pixel until its own tolerance is raised too.
    expect(run(a, b, 4, 1, { threshold: 220 }).changed).toBe(1);
    expect(run(a, b, 4, 1, { threshold: 220, diff: diff({ luminanceTolerance: 220 }) }).changed).toBe(0);
  });

  it("the luminance gate catches brightness changes inside the colour tolerance", () => {
    const a = solid(8, 1, [120, 120, 120]);
    const b = solid(8, 1, [150, 150, 150]);
    // Colour tolerance 40 would let a 30-step change through…
    expect(run(a, b, 8, 1, { threshold: 40, diff: diff({ luminanceTolerance: 40 }) }).changed).toBe(0);
    // …unless the luminance tolerance is tighter.
    expect(run(a, b, 8, 1, { threshold: 40, diff: diff({ luminanceTolerance: 5 }) }).changed).toBe(8);
  });
});

describe("the perceptual metric", () => {
  it("ignores differences under the just-noticeable difference", () => {
    const a = solid(8, 1, [128, 128, 128]);
    const b = solid(8, 1, [129, 129, 129]);
    expect(run(a, b, 8, 1, { threshold: 0 }).changed).toBe(8); // pixel metric, zero tolerance
    expect(run(a, b, 8, 1, { threshold: 0, diff: diff({ metric: "perceptual" }) }).changed).toBe(0);
  });

  it("can forgive rendering noise the pixel metric reports, while keeping real changes", () => {
    const a = solid(8, 1, [240, 240, 240]);
    const near = solid(8, 1, [254, 254, 254]);
    // A 14-step change in a bright area: the pixel metric flags it at tolerance 12…
    expect(run(a, near, 8, 1, { threshold: 12 }).changed).toBe(8);
    // …while a delta-E of 6 treats it as the same colour.
    expect(run(a, near, 8, 1, { threshold: 12, diff: diff({ metric: "perceptual", deltaE: 6 }) }).changed).toBe(0);
    // A visible change is still reported at the same tolerance.
    expect(run(a, solid(8, 1, [120, 60, 200]), 8, 1, { threshold: 12, diff: diff({ metric: "perceptual", deltaE: 6 }) }).changed).toBe(8);
  });

  it("is recorded as the metric used, so a result can never be mistaken for the other one", () => {
    const a = solid(8, 8, [100, 120, 140]);
    const result = run(a, a.slice(), 8, 8, { diff: diff({ metric: "perceptual" }) });
    const analysis = analyseComparison(result, { width: 8, height: 8, analysisScale: 1, metric: "perceptual", detectMovement: false, minRegionSize: 1, mergeDistance: 0, ignoreTiny: false });
    expect(analysis.metric).toBe("perceptual");
  });
});

describe("anti-aliasing and near-identical colour", () => {
  /** A hard vertical edge, one pixel further right in B — exactly a sub-pixel shift. */
  const edge = (at: number) => buffer(12, 6, (x) => (x < at ? [0, 0, 0, 255] : [255, 255, 255, 255]));

  it("off by default: a one-pixel edge shift is reported", () => {
    const result = run(edge(5), edge(6), 12, 6, { threshold: 12 });
    expect(result.changed).toBe(6);
  });

  it("drops a changed pixel whose colour simply moved next door", () => {
    const result = run(edge(5), edge(6), 12, 6, { threshold: 12, diff: diff({ ignoreAntialiasing: true }) });
    expect(result.changed).toBe(0);
  });

  it("keeps a real change even with the anti-aliasing guard on", () => {
    const a = solid(12, 6, [30, 30, 30]);
    const b = buffer(12, 6, (x, y) => (x >= 4 && x < 8 && y >= 1 && y < 5 ? [240, 40, 40, 255] : [30, 30, 30, 255]));
    expect(run(a, b, 12, 6, { threshold: 12, diff: diff({ ignoreAntialiasing: true }) }).changed).toBe(16);
  });

  it("ignoring near-identical colour only removes sub-JND differences", () => {
    const a = solid(8, 1, [128, 128, 128]);
    expect(run(a, solid(8, 1, [130, 130, 130]), 8, 1, { threshold: 0, diff: diff({ ignoreNearIdenticalColour: true }) }).changed).toBe(0);
    expect(run(a, solid(8, 1, [160, 160, 160]), 8, 1, { threshold: 0, diff: diff({ ignoreNearIdenticalColour: true }) }).changed).toBe(8);
  });
});

describe("transparency and ignored colour", () => {
  it("leaves transparent pixels out of the comparison when asked", () => {
    const a = buffer(4, 1, (x) => (x < 2 ? [10, 10, 10, 0] : [10, 10, 10, 255]));
    const b = buffer(4, 1, (x) => (x < 2 ? [200, 200, 200, 0] : [200, 200, 200, 255]));
    // Composited over the background, the transparent pixels look identical anyway…
    expect(run(a, b, 4, 1).changed).toBe(2);
    expect(run(a, b, 4, 1).compared).toBe(4);
    // …and with the option on they are not compared at all.
    const skipped = run(a, b, 4, 1, { diff: diff({ ignoreTransparent: true }) });
    expect(skipped.changed).toBe(2);
    expect(skipped.compared).toBe(2);
  });

  it("counts an alpha difference as a change only when asked to", () => {
    const a = solid(4, 1, [100, 100, 100], 255);
    const b = solid(4, 1, [100, 100, 100], 40);
    // Composited over the background the colours differ, so the default already sees it…
    expect(run(a, b, 4, 1, { background: [100, 100, 100] }).changed).toBe(0);
    // …but on the same background only the alpha differs, and that needs the option.
    expect(run(a, b, 4, 1, { background: [100, 100, 100], diff: diff({ compareAlpha: true }) }).changed).toBe(4);
  });

  it("ignores one chosen colour within a tolerance", () => {
    const a = buffer(4, 1, (x) => (x < 2 ? [255, 255, 255, 255] : [20, 20, 20, 255]));
    const b = buffer(4, 1, (x) => (x < 2 ? [10, 10, 10, 255] : [200, 200, 200, 255]));
    expect(run(a, b, 4, 1).changed).toBe(4);
    const result = run(a, b, 4, 1, { diff: diff({ ignoreColour: "#ffffff", ignoreColourTolerance: 20 }) });
    expect(result.changed).toBe(2);
    expect(result.compared).toBe(2);
  });
});

describe("ignore regions", () => {
  const a = solid(20, 10, [40, 40, 40]);
  const b = buffer(20, 10, (x, y) => (y < 4 ? [240, 40, 40, 255] : [40, 40, 40, 255]));

  it("leave their pixels out of both the change count and the total compared", () => {
    const plain = run(a, b, 20, 10);
    expect(plain.changed).toBe(80);
    expect(plain.compared).toBe(200);
    expect(plain.ignored).toBe(0);

    const ignored = run(a, b, 20, 10, { ignore: [{ x: 0, y: 0, width: 20, height: 4 }] });
    expect(ignored.changed).toBe(0);
    expect(ignored.compared).toBe(120);
    expect(ignored.ignored).toBe(80);
    const analysis = analyseComparison(ignored, { width: 20, height: 10, analysisScale: 1, metric: "pixel", detectMovement: false, minRegionSize: 1, mergeDistance: 0, ignoreTiny: false });
    expect(analysis.regions).toHaveLength(0);
    expect(analysis.changedPercent).toBe(0);
    expect(analysis.ignoredPixels).toBe(80);
  });

  it("overlapping regions are counted once", () => {
    const result = run(a, b, 20, 10, {
      ignore: [
        { x: 0, y: 0, width: 10, height: 4 },
        { x: 5, y: 0, width: 10, height: 4 },
      ],
    });
    expect(result.ignored).toBe(60);
  });

  it("are clamped to the comparison frame and capped in number", () => {
    const clamped = clampSettings(S({ ignoreRegions: [{ id: "x", name: "a".repeat(200), x: -1, y: 2, width: 9, height: 9, enabled: true }] }));
    expect(clamped.ignoreRegions[0]).toMatchObject({ x: 0, y: 1 });
    expect(clamped.ignoreRegions[0].width).toBeLessThanOrEqual(1);
    expect(clamped.ignoreRegions[0].name.length).toBe(60);
    const many = clampSettings(S({ ignoreRegions: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, name: "", x: 0, y: 0, width: 0.1, height: 0.1, enabled: true })) }));
    expect(many.ignoreRegions).toHaveLength(24);
  });
});

describe("changed-region classification", () => {
  const flatA = (width: number, height: number) => solid(width, height, [200, 200, 200]);

  it("measures structure, not meaning", () => {
    expect(boxStats(new Uint8Array(100).fill(128), 10, 10, { x: 0, y: 0, width: 10, height: 10 })).toMatchObject({ mean: 128, std: 0, ink: 0 });
    const textured = new Uint8Array(100);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) textured[y * 10 + x] = (x + y) % 2 ? 20 : 230;
    const stats = boxStats(textured, 10, 10, { x: 0, y: 0, width: 10, height: 10 });
    expect(stats.std).toBeGreaterThan(100);
    expect(stats.ink).toBeGreaterThan(0.5);
  });

  it("names a region added or removed only when one side is genuinely blank", () => {
    expect(classifyBox({ mean: 200, std: 0, ink: 0 }, { mean: 120, std: 40, ink: 0.3 })).toEqual({ kind: "added", confidence: "high" });
    expect(classifyBox({ mean: 120, std: 40, ink: 0.3 }, { mean: 200, std: 0, ink: 0 })).toEqual({ kind: "removed", confidence: "high" });
    // Both sides have structure: nothing can be claimed beyond "something changed".
    expect(classifyBox({ mean: 120, std: 40, ink: 0.3 }, { mean: 90, std: 44, ink: 0.28 })).toEqual({ kind: "visual", confidence: "high" });
    // Both blank is not an addition either.
    expect(classifyBox({ mean: 200, std: 0, ink: 0 }, { mean: 20, std: 0, ink: 0 })).toMatchObject({ kind: "visual" });
  });

  it("reports an added region when content appears on flat background", () => {
    const b = buffer(48, 48, (x, y) => (x >= 12 && x < 28 && y >= 12 && y < 28 ? [texture(x, y), texture(x, y), texture(x, y), 255] : [200, 200, 200, 255]));
    const result = run(flatA(48, 48), b, 48, 48, { threshold: 12 });
    const analysis = analyseComparison(result, { width: 48, height: 48, analysisScale: 1, metric: "pixel", detectMovement: false, minRegionSize: 4, mergeDistance: 2, ignoreTiny: true });
    expect(analysis.regions).toHaveLength(1);
    expect(analysis.regions[0].kind).toBe("added");
    expect(regionLabel(analysis.regions[0])).toBe("Added region");
    expect(analysis.regions[0].percent).toBeGreaterThan(0);
  });

  it("falls back to a plain visual change rather than guessing", () => {
    const a = buffer(48, 48, (x, y) => [texture(x, y), 80, 80, 255]);
    const b = buffer(48, 48, (x, y) => (x >= 12 && x < 28 && y >= 12 && y < 28 ? [texture(x + 500, y + 700), 80, 80, 255] : [texture(x, y), 80, 80, 255]));
    const result = run(a, b, 48, 48, { threshold: 12 });
    const analysis = analyseComparison(result, { width: 48, height: 48, analysisScale: 1, metric: "pixel", detectMovement: false, minRegionSize: 4, mergeDistance: 4, ignoreTiny: true });
    expect(analysis.regions.length).toBeGreaterThan(0);
    expect(analysis.regions.every((region) => region.kind === "visual")).toBe(true);
    expect(regionLabel(analysis.regions[0])).toBe("Visual change");
  });
});

describe("movement detection", () => {
  const block = (ox: number, oy: number) =>
    buffer(100, 100, (x, y) => (x >= ox && x < ox + 16 && y >= oy && y < oy + 16 ? [texture(x - ox, y - oy), texture(x - ox, y - oy), texture(x - ox, y - oy), 255] : [210, 210, 210, 255]));

  it("pairs a removed and an added region when they genuinely match", () => {
    const result = run(block(10, 10), block(10, 34), 100, 100, { threshold: 12 });
    const analysis = analyseComparison(result, { width: 100, height: 100, analysisScale: 1, metric: "pixel", detectMovement: true, minRegionSize: 8, mergeDistance: 2, ignoreTiny: true });
    const moved = analysis.regions.filter((region) => region.kind === "moved");
    expect(moved).toHaveLength(2);
    const target = moved.find((region) => (region.movedBy?.dy ?? 0) > 0)!;
    expect(target.movedBy!.dy).toBe(24);
    expect(target.movedBy!.dx).toBe(0);
    expect(target.movedBy!.score).toBeGreaterThanOrEqual(0.92);
    expect(target.pairedWith).toBe(moved.find((region) => region !== target)!.id);
    expect(regionLabel(target, 1)).toBe("Moved about 24 px down");
    // The label is in comparison pixels, so a preview-resolution measurement still reads right.
    expect(regionLabel(target, 2)).toBe("Moved about 48 px down");
  });

  it("leaves unrelated regions separate instead of inventing a movement", () => {
    const a = block(10, 10);
    const b = buffer(100, 100, (x, y) => (x >= 10 && x < 26 && y >= 34 && y < 50 ? [texture(x + 900, y + 400), 60, 60, 255] : [210, 210, 210, 255]));
    const result = run(a, b, 100, 100, { threshold: 12 });
    const analysis = analyseComparison(result, { width: 100, height: 100, analysisScale: 1, metric: "pixel", detectMovement: true, minRegionSize: 8, mergeDistance: 2, ignoreTiny: true });
    expect(analysis.regions.some((region) => region.kind === "moved")).toBe(false);
    expect(analysis.regions.map((region) => region.kind).sort()).toEqual(["added", "removed"]);
  });

  it("does nothing when movement detection is off", () => {
    const result = run(block(10, 10), block(10, 34), 100, 100, { threshold: 12 });
    const analysis = analyseComparison(result, { width: 100, height: 100, analysisScale: 1, metric: "pixel", detectMovement: false, minRegionSize: 8, mergeDistance: 2, ignoreTiny: true });
    expect(analysis.regions.some((region) => region.kind === "moved")).toBe(false);
  });

  it("refuses a pair whose sizes disagree", () => {
    const regions: CompareRegion[] = [
      { id: 1, x: 10, y: 10, width: 16, height: 16, pixels: 256, percent: 1, kind: "removed", confidence: "high", sourceA: null, sourceB: null },
      { id: 2, x: 10, y: 34, width: 40, height: 16, pixels: 640, percent: 2, kind: "added", confidence: "high", sourceA: null, sourceB: null },
    ];
    const gray = new Uint8Array(100 * 100).fill(128);
    detectMovement(regions, gray, gray, 100, 100);
    expect(regions.every((region) => region.kind !== "moved")).toBe(true);
  });
});

describe("mapping regions back to the screenshots", () => {
  const cell = { width: 1000, height: 800 };

  it("converts an analysis box into that screenshot's own pixels", () => {
    // A 500 x 400 screenshot fitted into the cell is drawn at 2x, centred.
    const placement = place({ width: 500, height: 400 }, cell, "contain", "center");
    expect(placement.dest).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    const box = analysisBoxToSource({ x: 50, y: 40, width: 25, height: 20 }, placement, 4);
    expect(box).toEqual({ x: 100, y: 80, w: 50, h: 40 });
  });

  it("returns null when the box misses that screenshot entirely", () => {
    const placement = place({ width: 200, height: 200 }, cell, "actual", "top-left");
    expect(analysisBoxToSource({ x: 300, y: 300, width: 10, height: 10 }, placement, 1)).toBeNull();
  });

  it("round-trips a screenshot box into analysis space", () => {
    const placement = place({ width: 500, height: 400 }, cell, "contain", "center");
    const rect = sourceBoxToAnalysis({ x: 100, y: 80, w: 50, h: 40 }, placement, 4);
    expect(rect).toEqual({ x: 50, y: 40, width: 25, height: 20 });
  });
});

describe("different dimensions", () => {
  it("compares the smaller screenshot against the shared background, not against noise", () => {
    // A covers the whole frame; B only its top-left quarter. The rest is background on both
    // sides of the comparison, so it is defined — and it differs from A, which is the truth.
    const a = solid(20, 20, [40, 60, 200]);
    const b = buffer(20, 20, (x, y) => (x < 10 && y < 10 ? [40, 60, 200, 255] : [243, 241, 238, 255]));
    const result = run(a, b, 20, 20, { threshold: 12 });
    expect(result.changed).toBe(400 - 100);
    expect(result.compared).toBe(400);
  });
});
