import { describe, expect, it } from "vitest";
import { aspectRatio, clampCrop, MIN_CROP, moveCrop, presetCrop, resizeCrop } from "@/core/image-transform/crop";
import type { Rect, Size } from "@/core/image-transform/types";

const B: Size = { width: 1000, height: 600 };
const inside = (r: Rect, b: Size) => r.x >= 0 && r.y >= 0 && r.x + r.width <= b.width && r.y + r.height <= b.height;

describe("aspect presets", () => {
  it("resolves each preset in the visible frame", () => {
    expect(aspectRatio("free", B)).toBeNull();
    expect(aspectRatio("original", B)).toBeCloseTo(1000 / 600);
    expect(aspectRatio("1:1", B)).toBe(1);
    expect(aspectRatio("4:3", B)).toBeCloseTo(4 / 3);
    expect(aspectRatio("16:9", B)).toBeCloseTo(16 / 9);
  });

  it("fits the largest centred box of the ratio", () => {
    expect(presetCrop(16 / 9, { width: 1600, height: 1200 })).toEqual({ x: 0, y: 150, width: 1600, height: 900 });
    // A tall phone screenshot: the square spans the full width, centred vertically.
    expect(presetCrop(1, { width: 1170, height: 2532 })).toEqual({ x: 0, y: 681, width: 1170, height: 1170 });
    // A wide image: the square spans the full height.
    expect(presetCrop(1, B)).toEqual({ x: 200, y: 0, width: 600, height: 600 });
  });
});

describe("moving", () => {
  it("moves by the delta and stops at every edge without shrinking", () => {
    const r = { x: 100, y: 100, width: 200, height: 100 };
    expect(moveCrop(r, 50, -20, B)).toEqual({ x: 150, y: 80, width: 200, height: 100 });
    expect(moveCrop(r, -500, -500, B)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(moveCrop(r, 5000, 5000, B)).toEqual({ x: 800, y: 500, width: 200, height: 100 });
  });

  it("clamps a box larger than the image down to the image", () => {
    expect(clampCrop({ x: -10, y: -10, width: 5000, height: 5000 }, B)).toEqual({ x: 0, y: 0, width: 1000, height: 600 });
  });
});

describe("free resizing", () => {
  const r = { x: 100, y: 100, width: 200, height: 100 };

  it("drags a corner with the opposite corner anchored", () => {
    expect(resizeCrop(r, "se", { x: 500, y: 400 }, B, null)).toEqual({ x: 100, y: 100, width: 400, height: 300 });
    expect(resizeCrop(r, "nw", { x: 50, y: 40 }, B, null)).toEqual({ x: 50, y: 40, width: 250, height: 160 });
  });

  it("drags an edge and leaves the other axis alone", () => {
    expect(resizeCrop(r, "e", { x: 700, y: 9999 }, B, null)).toEqual({ x: 100, y: 100, width: 600, height: 100 });
    expect(resizeCrop(r, "w", { x: 20, y: -9999 }, B, null)).toEqual({ x: 20, y: 100, width: 280, height: 100 });
    expect(resizeCrop(r, "n", { x: 0, y: 30 }, B, null)).toEqual({ x: 100, y: 30, width: 200, height: 170 });
  });

  it("never leaves the image", () => {
    const out = resizeCrop(r, "se", { x: 99_999, y: 99_999 }, B, null);
    expect(out).toEqual({ x: 100, y: 100, width: 900, height: 500 });
    expect(inside(resizeCrop(r, "nw", { x: -500, y: -500 }, B, null), B)).toBe(true);
  });

  it("never flips past its anchor or drops below the minimum size", () => {
    const out = resizeCrop(r, "se", { x: 0, y: 0 }, B, null);
    expect(out).toEqual({ x: 100, y: 100, width: MIN_CROP, height: MIN_CROP });
    const w = resizeCrop(r, "w", { x: 999, y: 0 }, B, null);
    expect(w.width).toBe(MIN_CROP);
    expect(w.x + w.width).toBe(300); // right edge stayed put
  });
});

describe("ratio-locked resizing", () => {
  const r = { x: 100, y: 100, width: 160, height: 90 };
  const ratio = 16 / 9;

  it("keeps the ratio on a corner drag and stays inside the image", () => {
    for (const pointer of [{ x: 600, y: 200 }, { x: 250, y: 580 }, { x: 99_999, y: 99_999 }]) {
      const out = resizeCrop(r, "se", pointer, B, ratio);
      expect(Math.abs(out.width / out.height - ratio)).toBeLessThan(0.02);
      expect(inside(out, B)).toBe(true);
      expect(out.x).toBe(100);
      expect(out.y).toBe(100);
    }
  });

  it("an edge drag grows the other axis about the centre", () => {
    const out = resizeCrop(r, "e", { x: 420, y: 0 }, B, ratio);
    expect(out.width).toBe(320);
    expect(out.height).toBe(180);
    expect(out.y + out.height / 2).toBeCloseTo(r.y + r.height / 2, 0);
  });

  it("a square crop stays square however it is dragged", () => {
    for (const handle of ["ne", "nw", "se", "sw", "n", "e"] as const) {
      const out = resizeCrop({ x: 300, y: 200, width: 200, height: 200 }, handle, { x: 120, y: 90 }, B, 1);
      expect(out.width).toBe(out.height);
      expect(inside(out, B)).toBe(true);
    }
  });
});
