/**
 * Phase 2M Compare Screenshots — the canonical comparison space (fit, alignment, differing
 * sizes), side-by-side and slider geometry, overlay opacity, the pixel difference and its
 * threshold, and settings clamping. The rendered pixels are verified again in the E2E suite.
 */
import { describe, expect, it } from "vitest";
import { changedRegions, differencePixels, differenceStats, isHighlighted } from "@/core/compare/difference";
import { clampSettings, compareCell, compareLayout, compareSize, dividerFromX, place } from "@/core/compare/layout";
import { COMPARE_NAMES, DEFAULT_COMPARE, DIFF_HIGHLIGHT } from "@/core/compare/presets";
import { compareIssue } from "@/core/compare/render";
import type { CompareSettings } from "@/core/compare/types";

const S = (over: Partial<CompareSettings> = {}): CompareSettings => ({ ...DEFAULT_COMPARE, a: "a", b: "b", ...over });
const input = (width: number, height: number, name = "x.png") => ({ size: { width, height }, name });
const aspect = (r: { width: number; height: number }) => r.width / r.height;

describe("the comparison cell", () => {
  it("is large enough to hold either screenshot at its natural size", () => {
    expect(compareCell({ width: 800, height: 600 }, { width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(compareCell({ width: 1200, height: 400 }, { width: 500, height: 900 })).toEqual({ width: 1200, height: 900 });
  });
});

describe("placing a screenshot in the cell", () => {
  const cell = { width: 1000, height: 800 };

  it("contain fits the whole screenshot inside, keeping its proportions", () => {
    const wide = place({ width: 2000, height: 800 }, cell, "contain", "center");
    expect(wide.dest).toEqual({ x: 0, y: 200, width: 1000, height: 400 }); // scaled to 0.5, centred
    expect(aspect(wide.dest)).toBeCloseTo(2000 / 800, 3);
    expect(wide.source).toEqual({ x: 0, y: 0, width: 2000, height: 800 }); // nothing cropped
    // A smaller screenshot is enlarged so the two are compared at the same displayed size.
    const small = place({ width: 500, height: 400 }, cell, "contain", "center");
    expect(small.dest).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(small.zoom).toBe(2);
  });

  it("cover fills the cell and crops the overflow", () => {
    const p = place({ width: 2000, height: 800 }, cell, "cover", "center");
    expect(p.dest).toEqual({ x: 0, y: 0, width: 1000, height: 800 }); // the whole cell
    expect(p.source.height).toBe(800); // scale 1 vertically…
    expect(p.source.width).toBe(1000); // …so only the middle 1000 px are used
    expect(p.source.x).toBe(500);
    expect(aspect(p.dest)).toBeCloseTo(aspect(p.source), 3); // still not stretched
  });

  it("actual keeps the natural pixels and shows background around them", () => {
    const p = place({ width: 600, height: 400 }, cell, "actual", "center");
    expect(p.dest).toEqual({ x: 200, y: 200, width: 600, height: 400 });
    expect(p.zoom).toBe(1);
  });

  it("alignment decides where the leftover space goes", () => {
    const image = { width: 600, height: 400 };
    expect(place(image, cell, "actual", "top").dest).toMatchObject({ x: 200, y: 0 });
    expect(place(image, cell, "actual", "bottom").dest).toMatchObject({ x: 200, y: 400 });
    expect(place(image, cell, "actual", "left").dest).toMatchObject({ x: 0, y: 200 });
    expect(place(image, cell, "actual", "right").dest).toMatchObject({ x: 400, y: 200 });
    // With cover, the alignment moves the crop instead.
    expect(place({ width: 2000, height: 800 }, cell, "cover", "left").source.x).toBe(0);
    expect(place({ width: 2000, height: 800 }, cell, "cover", "right").source.x).toBe(1000);
  });

  it("never stretches, whatever the shapes and settings", () => {
    const sizes = [
      { width: 800, height: 600 },
      { width: 1170, height: 2532 },
      { width: 3000, height: 400 },
      { width: 500, height: 500 },
    ];
    for (const image of sizes) {
      for (const other of sizes) {
        const c = compareCell(image, other);
        for (const fit of ["contain", "cover", "actual"] as const) {
          for (const align of ["center", "top", "bottom", "left", "right"] as const) {
            const p = place(image, c, fit, align);
            const label = `${image.width}×${image.height} ${fit}/${align}`;
            expect(aspect(p.dest), label).toBeCloseTo(aspect(p.source), 1);
            expect(p.dest.x, label).toBeGreaterThanOrEqual(0);
            expect(p.dest.y, label).toBeGreaterThanOrEqual(0);
            expect(p.dest.x + p.dest.width, label).toBeLessThanOrEqual(c.width);
            expect(p.dest.y + p.dest.height, label).toBeLessThanOrEqual(c.height);
            expect(p.source.x + p.source.width, label).toBeLessThanOrEqual(image.width);
            expect(p.source.y + p.source.height, label).toBeLessThanOrEqual(image.height);
          }
        }
      }
    }
  });
});

describe("side by side", () => {
  it("puts two cells next to each other with a gap", () => {
    const l = compareLayout(S({ mode: "side-by-side", gap: 2 }), input(800, 600), input(800, 600));
    const gap = Math.round(0.02 * 600);
    expect(l.canvas).toEqual({ width: 1600 + gap, height: 600 });
    expect(l.cellA).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(l.cellB.x).toBe(800 + gap);
    expect(l.a.dest).toMatchObject({ x: 0, y: 0, width: 800, height: 600 });
    expect(l.b.dest).toMatchObject({ x: 800 + gap, y: 0, width: 800, height: 600 });
  });

  it("keeps both cells the same size when the screenshots differ", () => {
    const l = compareLayout(S({ mode: "side-by-side", gap: 0 }), input(1200, 400), input(500, 900));
    expect(l.cell).toEqual({ width: 1200, height: 900 });
    expect(l.canvas).toEqual({ width: 2400, height: 900 });
    // Each is fitted into its own cell, neither stretched.
    expect(aspect(l.a.dest)).toBeCloseTo(1200 / 400, 2);
    expect(aspect(l.b.dest)).toBeCloseTo(500 / 900, 2);
    expect(l.b.dest.x).toBeGreaterThanOrEqual(1200);
  });

  it("the other modes share one cell", () => {
    for (const mode of ["slider", "overlay", "difference", "heatmap"] as const) {
      const l = compareLayout(S({ mode }), input(1200, 400), input(500, 900));
      expect(l.canvas).toEqual({ width: 1200, height: 900 });
      expect(l.cellA).toEqual(l.cellB);
    }
  });
});

describe("the before/after divider", () => {
  it("is a percentage of the canvas, not preview pixels", () => {
    const sizes = compareLayout(S({ mode: "slider" }), input(800, 600), input(800, 600));
    expect(sizes.divider).toBe(400);
    expect(compareLayout(S({ mode: "slider", divider: 0 }), input(800, 600), input(800, 600)).divider).toBe(0);
    expect(compareLayout(S({ mode: "slider", divider: 100 }), input(800, 600), input(800, 600)).divider).toBe(800);
    expect(compareLayout(S({ mode: "slider", divider: 25 }), input(1200, 600), input(800, 600)).divider).toBe(300);
  });

  it("converts a pointer position into a percentage, clamped to the canvas", () => {
    expect(dividerFromX(0, 500)).toBe(0);
    expect(dividerFromX(250, 500)).toBe(50);
    expect(dividerFromX(500, 500)).toBe(100);
    expect(dividerFromX(-80, 500)).toBe(0);
    expect(dividerFromX(900, 500)).toBe(100);
    // The same fraction of any preview width gives the same stored percentage.
    expect(dividerFromX(120, 480)).toBe(dividerFromX(300, 1200));
  });
});

describe("settings", () => {
  it("clamps everything to its supported range", () => {
    const c = clampSettings(S({ divider: 180, opacity: 4, threshold: -5, gap: 99, background: "nope" }));
    expect(c).toMatchObject({ divider: 100, opacity: 1, threshold: 0, gap: 20, background: "#f3f1ee" });
    expect(clampSettings(S({ opacity: 0.333, threshold: 500 }))).toMatchObject({ opacity: 0.33, threshold: 120 });
  });

  it("names results after the mode, never after an asset id", () => {
    expect(COMPARE_NAMES).toEqual({ "side-by-side": "compare-side-by-side", slider: "compare-before-after", overlay: "compare-overlay", difference: "compare-difference", heatmap: "compare-heatmap" });
    for (const name of Object.values(COMPARE_NAMES)) expect(name).toMatch(/^compare-[a-z-]+$/);
  });

  it("reports the exported size without building the layout", () => {
    for (const mode of ["side-by-side", "slider", "overlay", "difference", "heatmap"] as const) {
      const settings = S({ mode });
      expect(compareSize(settings, { width: 800, height: 600 }, { width: 500, height: 900 })).toEqual(
        compareLayout(settings, input(800, 600), input(500, 900)).canvas,
      );
    }
  });

  it("refuses a comparison that a browser cannot render in one canvas", () => {
    expect(compareIssue({ width: 2400, height: 3792 }, "slider", { width: 1200, height: 3792 }, { width: 1200, height: 3792 })).toBeNull();
    expect(compareIssue({ width: 9000, height: 9000 }, "slider", { width: 9000, height: 9000 }, { width: 9000, height: 9000 })).toBe("too-large");
    // Difference keeps more buffers, so its ceiling is lower than the other modes'.
    const big = { width: 4000, height: 4000 };
    expect(compareIssue(big, "slider", big, big)).toBeNull();
    expect(compareIssue(big, "difference", big, big)).toBe("too-large");
    expect(compareIssue(big, "heatmap", big, big)).toBe("too-large");
    expect(compareIssue({ width: 1200, height: 800 }, "difference", { width: 1200, height: 800 }, { width: 1200, height: 800 })).toBeNull();
  });
});

describe("pixel difference", () => {
  it("reports changed and unchanged preview percentages from measured pixels", () => {
    expect(differenceStats(38, 100)).toEqual({ changedPixels: 38, totalPixels: 100, changedPercent: 38, unchangedPercent: 62 });
    expect(differenceStats(999, 5)).toEqual({ changedPixels: 5, totalPixels: 5, changedPercent: 100, unchangedPercent: 0 });
    expect(differenceStats(-1, 0)).toEqual({ changedPixels: 0, totalPixels: 0, changedPercent: 0, unchangedPercent: 100 });
  });

  /** A tiny RGBA buffer helper: `fill` decides each pixel. */
  const buffer = (w: number, h: number, fill: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const [r, g, b] = fill(x, y);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    return data;
  };
  const pixel = (data: Uint8ClampedArray, w: number, x: number, y: number) => [data[(y * w + x) * 4], data[(y * w + x) * 4 + 1], data[(y * w + x) * 4 + 2]];

  it("identical screenshots produce no highlights at all", () => {
    const a = buffer(8, 8, (x, y) => [x * 20, y * 20, 128]);
    const b = buffer(8, 8, (x, y) => [x * 20, y * 20, 128]);
    const out = new Uint8ClampedArray(a.length);
    expect(differencePixels(a, b, out, 0)).toBe(0);
    for (let i = 0; i < out.length; i += 4) expect(isHighlighted([out[i], out[i + 1], out[i + 2]])).toBe(false);
    // Unchanged areas keep a faint ghost of "before", so they are dim but not black.
    expect(pixel(out, 8, 7, 7)[0]).toBeGreaterThan(18);
    expect(pixel(out, 8, 7, 7)[0]).toBeLessThan(100);
  });

  it("marks exactly the pixels that changed, and leaves the rest alone", () => {
    const changed = (x: number, y: number) => x >= 2 && x < 5 && y >= 1 && y < 3;
    const a = buffer(8, 8, () => [100, 100, 100]);
    const b = buffer(8, 8, (x, y) => (changed(x, y) ? [255, 100, 100] : [100, 100, 100]));
    const out = new Uint8ClampedArray(a.length);
    expect(differencePixels(a, b, out, 0)).toBe(3 * 2);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(isHighlighted(pixel(out, 8, x, y)), `${x},${y}`).toBe(changed(x, y));
      }
    }
  });

  it("the threshold decides what counts as a change, and the tint grows with it", () => {
    const a = buffer(4, 1, () => [100, 100, 100]);
    const b = buffer(4, 1, (x) => [100 + [0, 10, 40, 200][x], 100, 100]);
    const out = new Uint8ClampedArray(a.length);
    expect(differencePixels(a, b, out, 0)).toBe(3); // every non-identical pixel
    expect(differencePixels(a, b, out, 12)).toBe(2); // the 10-step change is now ignored
    expect(differencePixels(a, b, out, 50)).toBe(1);
    expect(differencePixels(a, b, out, 120)).toBe(1);
    // A bigger change is tinted more strongly.
    differencePixels(a, b, out, 12);
    expect(pixel(out, 4, 3, 0)[0]).toBeGreaterThan(pixel(out, 4, 2, 0)[0]);
    expect(pixel(out, 4, 3, 0)[0]).toBeLessThanOrEqual(DIFF_HIGHLIGHT[0]);
    expect(isHighlighted(pixel(out, 4, 1, 0))).toBe(false);
  });

  it("a difference is symmetric in magnitude and always opaque", () => {
    const a = buffer(4, 4, (x) => [x * 60, 10, 10]);
    const b = buffer(4, 4, (x) => [10, x * 60, 10]);
    const one = new Uint8ClampedArray(a.length);
    const other = new Uint8ClampedArray(a.length);
    expect(differencePixels(a, b, one, 5)).toBe(differencePixels(b, a, other, 5));
    for (let i = 3; i < one.length; i += 4) expect(one[i]).toBe(255);
  });

  it("renders a deterministic cool-to-hot heatmap from the same threshold", () => {
    const a = buffer(3, 1, () => [20, 20, 20]);
    const b = buffer(3, 1, (x) => [20 + [0, 80, 235][x], 20, 20]);
    const out = new Uint8ClampedArray(a.length);
    const mask = new Uint8Array(3);
    expect(differencePixels(a, b, out, 10, mask, "heatmap")).toBe(2);
    expect([...mask]).toEqual([0, 1, 1]);
    expect(pixel(out, 3, 1, 0)[2]).toBeGreaterThan(0);
    expect(pixel(out, 3, 2, 0)[0]).toBe(255);
  });

  it("groups changed pixels into bounded regions and merges nearby boxes", () => {
    const mask = new Uint8Array(12 * 8);
    const mark = (x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) mask[y * 12 + x] = 1;
    };
    mark(1, 1, 2, 2);
    mark(5, 1, 2, 2);
    mark(10, 7, 1, 1);
    const separate = changedRegions(mask.slice(), 12, 8, { minRegionSize: 2, mergeDistance: 0, ignoreTiny: true });
    expect(separate.regions).toHaveLength(2); // the one-pixel speck is ignored
    expect(separate.regions.map((region) => region.pixels)).toEqual([4, 4]);
    const merged = changedRegions(mask.slice(), 12, 8, { minRegionSize: 2, mergeDistance: 2, ignoreTiny: true });
    expect(merged.regions).toHaveLength(1);
    expect(merged.regions[0]).toMatchObject({ x: 1, y: 1, width: 6, height: 2, pixels: 8, id: 1 });
  });
});
