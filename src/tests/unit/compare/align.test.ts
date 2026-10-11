/**
 * V2.0F Compare Pro — automatic alignment. Deterministic synthetic fixtures only: a blocky
 * pseudo-random texture generated from an infinite pattern, so a shifted or scaled copy is
 * exactly what a scrolled or differently-scaled viewport would produce, with no edge
 * artefacts to flatter the matcher.
 *
 * Convention under test: the estimate maps B onto A, as
 *   position in A = scale * position in B + (dx, dy)
 * so B shifted right by 10 px is reported as dx = -10.
 */
import { describe, expect, it } from "vitest";
import { alignGray, alignmentSummary, correlate, createNccMatcher, scaleGrayAboutCentre } from "@/core/compare/align";
import { appliedAlignment, alignPlacement, clampSettings, compareLayout, place } from "@/core/compare/layout";
import { DEFAULT_COMPARE } from "@/core/compare/presets";
import type { CompareAlignEstimate, CompareSettings } from "@/core/compare/types";
import type { GrayImage } from "@/core/stitch/types";

/** Stable 16 px blocky texture over an infinite plane. */
function patternValue(x: number, y: number): number {
  const bx = Math.floor(x / 16);
  const by = Math.floor(y / 16);
  let h = (bx * 73856093) ^ (by * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) % 256;
}

/** Window of the infinite pattern whose top-left corner is at (ox, oy). */
function patch(width: number, height: number, ox = 0, oy = 0): GrayImage {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = patternValue(x + ox, y + oy);
  return { width, height, data };
}

const flat = (width: number, height: number, value = 128): GrayImage => ({ width, height, data: new Uint8Array(width * height).fill(value) });

const S = (over: Partial<CompareSettings> = {}): CompareSettings => ({ ...DEFAULT_COMPARE, a: "a", b: "b", ...over });
const estimate = (over: Partial<CompareAlignEstimate> = {}): CompareAlignEstimate => ({
  status: "aligned",
  dx: 0,
  dy: 0,
  scale: 1,
  score: 0.98,
  confidence: "high",
  method: "translate",
  analysisScale: 1,
  ...over,
});

describe("the plain-TypeScript NCC matcher", () => {
  it("finds a template at its exact position and scores it 1", () => {
    const search = patch(64, 64);
    const template = { width: 16, height: 16, data: new Uint8Array(16 * 16) };
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) template.data[y * 16 + x] = search.data[(y + 20) * 64 + (x + 24)];
    const result = createNccMatcher().match(search, template, 2);
    expect([result.x, result.y]).toEqual([24, 20]);
    expect(result.score).toBeCloseTo(1, 5);
  });

  it("refuses a flat template rather than reporting a meaningless peak", () => {
    expect(createNccMatcher().match(patch(48, 48), flat(16, 16), 2).score).toBe(-1);
    // A template larger than the search area is also refused, never clamped silently.
    expect(createNccMatcher().match(patch(16, 16), patch(32, 32), 2).score).toBe(-1);
  });
});

describe("correlation of two patches", () => {
  it("is 1 for identical structure, lower for unrelated structure, 0 for flat", () => {
    expect(correlate(patch(32, 32), patch(32, 32))).toBeCloseTo(1, 6);
    expect(correlate(patch(32, 32), patch(32, 32, 500, 900))).toBeLessThan(0.6);
    expect(correlate(flat(32, 32), patch(32, 32))).toBe(0);
    // Brightness and contrast are normalised away: the same structure still correlates.
    const brighter = { ...patch(32, 32), data: patch(32, 32).data.map((v) => Math.min(255, v * 0.5 + 60)) as unknown as Uint8Array };
    expect(correlate(patch(32, 32), brighter)).toBeCloseTo(1, 4);
  });
});

describe("measuring a translation", () => {
  it("recovers a pure shift, in both directions", () => {
    const a = patch(320, 240);
    for (const [sx, sy] of [
      [10, 0],
      [0, 8],
      [14, -6],
      [-20, 12],
    ] as const) {
      // B is the same content moved by (sx, sy): B(p) = A(p - s).
      const b = patch(320, 240, -sx, -sy);
      const result = alignGray(a, b, { mode: "translate" });
      expect(result.status, `${sx},${sy}`).toBe("aligned");
      expect(result.dx, `${sx},${sy} dx`).toBeCloseTo(-sx, 0);
      expect(result.dy, `${sx},${sy} dy`).toBeCloseTo(-sy, 0);
      expect(result.scale).toBe(1);
      expect(result.score).toBeGreaterThan(0.9);
      expect(result.confidence).toBe("high");
      expect(result.method).toBe("translate");
    }
  });

  it("reports cell pixels, not analysis pixels", () => {
    const a = patch(320, 240);
    const b = patch(320, 240, -12, 0);
    const half = alignGray(a, b, { mode: "translate", analysisScale: 2 });
    expect(half.dx).toBeCloseTo(-24, 0);
    expect(half.analysisScale).toBe(2);
  });

  it("calls the same image already aligned instead of inventing an offset", () => {
    const result = alignGray(patch(320, 240), patch(320, 240), { mode: "auto" });
    expect(result.status).toBe("identity");
    expect([result.dx, result.dy, result.scale]).toEqual([0, 0, 1]);
    expect(alignmentSummary(result)).toBe("Already aligned");
  });
});

describe("measuring a uniform scale", () => {
  it("recovers the factor that puts B back onto A", () => {
    const a = patch(320, 240);
    // B shows the same content magnified by 1.04, so B must be scaled by ~1/1.04 to match.
    const b = scaleGrayAboutCentre(a, 1.04);
    const result = alignGray(a, b, { mode: "translate-scale" });
    expect(result.status).toBe("aligned");
    expect(result.scale).toBeGreaterThan(0.94);
    expect(result.scale).toBeLessThan(0.99);
    expect(result.score).toBeGreaterThan(0.75);
    expect(result.method).toBe("translate-scale");
  });

  it("auto keeps translation when a scale does not help", () => {
    const a = patch(320, 240);
    const b = patch(320, 240, -9, -5);
    const result = alignGray(a, b, { mode: "auto" });
    expect(result.status).toBe("aligned");
    expect(result.scale).toBe(1);
    expect(result.dx).toBeCloseTo(-9, 0);
  });

  it("never reports a non-uniform stretch: one scale is applied to both axes", () => {
    const a = patch(320, 240);
    const result = alignGray(a, scaleGrayAboutCentre(a, 1.03), { mode: "auto" });
    const placement = alignPlacement(place({ width: 320, height: 240 }, { width: 320, height: 240 }, "contain", "center"), {
      mode: "translate-scale",
      dx: result.dx,
      dy: result.dy,
      scale: result.scale,
    });
    expect(placement.dest.width / placement.dest.height).toBeCloseTo(320 / 240, 3);
  });
});

describe("when alignment cannot be measured", () => {
  it("fails on flat screenshots instead of returning a confident zero", () => {
    const result = alignGray(flat(320, 240), flat(320, 240), { mode: "auto" });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("no-texture");
    expect(alignmentSummary(result)).toBe("Alignment could not be measured");
  });

  it("fails on differing analysis dimensions and on images too small to match", () => {
    expect(alignGray(patch(320, 240), patch(300, 240), { mode: "auto" }).reason).toBe("too-small");
    expect(alignGray(patch(16, 16), patch(16, 16), { mode: "auto" }).reason).toBe("too-small");
  });

  it("fails rather than aligning unrelated screenshots", () => {
    const result = alignGray(patch(320, 240), patch(320, 240, 4000, 7000), { mode: "translate" });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("low-score");
  });

  it("stops when cancelled", () => {
    const result = alignGray(patch(320, 240), patch(320, 240, -8, 0), { mode: "auto", signal: { aborted: true } });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("cancelled");
  });

  it("is off, with no transform at all, when the mode is off", () => {
    const result = alignGray(patch(320, 240), patch(320, 240, -8, 0), { mode: "off" });
    expect(result.status).toBe("off");
    expect([result.dx, result.dy, result.scale]).toEqual([0, 0, 1]);
    expect(alignmentSummary(result)).toBe("Alignment off");
  });
});

describe("applying an alignment", () => {
  it("ignores a failed measurement entirely", () => {
    const applied = appliedAlignment(S({ alignment: { mode: "auto", dx: 0, dy: 0, scale: 1 } }), estimate({ status: "failed", dx: 99, dy: 99, scale: 1.5 }));
    expect(applied).toEqual({ mode: "auto", dx: 0, dy: 0, scale: 1 });
  });

  it("adds the manual nudge on top of the measured transform", () => {
    const applied = appliedAlignment(S({ alignment: { mode: "translate-scale", dx: 4, dy: -2, scale: 1.01 } }), estimate({ dx: 14, dy: -6, scale: 0.994 }));
    expect(applied.dx).toBe(18);
    expect(applied.dy).toBe(-8);
    expect(applied.scale).toBeCloseTo(0.994 * 1.01, 6);
  });

  it("resetting means mode off: no measured transform and no nudge", () => {
    const applied = appliedAlignment(S({ alignment: { mode: "off", dx: 40, dy: 40, scale: 1.2 } }), estimate({ dx: 14 }));
    expect(applied).toEqual({ mode: "off", dx: 0, dy: 0, scale: 1 });
  });

  it("moves only B inside the layout, and leaves the canvas size alone", () => {
    const settings = S({ mode: "difference", alignment: { mode: "translate", dx: 0, dy: 0, scale: 1 } });
    const plain = compareLayout(settings, { size: { width: 800, height: 600 }, name: "a" }, { size: { width: 800, height: 600 }, name: "b" }, null);
    const shifted = compareLayout(settings, { size: { width: 800, height: 600 }, name: "a" }, { size: { width: 800, height: 600 }, name: "b" }, estimate({ dx: 14, dy: -6 }));
    expect(shifted.canvas).toEqual(plain.canvas);
    expect(shifted.a).toEqual(plain.a);
    expect(shifted.b.dest.x).toBe(plain.b.dest.x + 14);
    expect(shifted.b.dest.y).toBe(plain.b.dest.y - 6);
    expect(shifted.alignment).toMatchObject({ dx: 14, dy: -6, scale: 1 });
  });

  it("the preview and the export build the same transform from the same estimate", () => {
    const settings = S({ mode: "difference", alignment: { mode: "auto", dx: 2, dy: 3, scale: 1 } });
    const measured = estimate({ dx: -11, dy: 7, scale: 0.98 });
    const one = compareLayout(settings, { size: { width: 1200, height: 800 }, name: "a" }, { size: { width: 1200, height: 800 }, name: "b" }, measured);
    const two = compareLayout(settings, { size: { width: 1200, height: 800 }, name: "a" }, { size: { width: 1200, height: 800 }, name: "b" }, measured);
    expect(one.b).toEqual(two.b);
    expect(one.alignment).toEqual(two.alignment);
  });

  it("clamps manual alignment to a supported range", () => {
    const clamped = clampSettings(S({ alignment: { mode: "translate", dx: 99_999, dy: -99_999, scale: 40 } }));
    expect(clamped.alignment).toEqual({ mode: "translate", dx: 4000, dy: -4000, scale: 2 });
    expect(clampSettings(S({ alignment: { mode: "nonsense" as never, dx: 0, dy: 0, scale: 1 } })).alignment.mode).toBe("off");
  });
});

describe("the alignment readout", () => {
  it("states the measured numbers and nothing more", () => {
    expect(alignmentSummary(estimate({ dx: 14, dy: -6, scale: 0.994 }))).toBe("X +14 px · Y -6 px · Scale 99.4%");
    expect(alignmentSummary(estimate({ dx: 3, dy: -1, scale: 1 }))).toBe("X +3 px · Y -1 px");
    expect(alignmentSummary(estimate({ dx: 0, dy: 0, scale: 1, status: "identity" }))).toBe("Already aligned");
  });
});
