import { describe, expect, it } from "vitest";
import { detectInk, unmatteInk } from "@/core/background-removal/ink";

describe("single-ink extraction", () => {
  it.each([[255, 255, 255], [242, 235, 216], [15, 20, 30]])("preserves subpixel strokes against %j", (...paper) => {
    const ink = [24, 84, 180];
    const pixels = new Uint8ClampedArray(20 * 20 * 4);
    for (let i = 0; i < 400; i++) pixels.set([...paper, 255], i * 4);
    for (const [x, alpha] of [[5, 1], [6, .5], [7, .1]]) pixels.set([...paper.map((b, c) => Math.round(b * (1 - alpha) + ink[c] * alpha)), 255], (10 * 20 + x) * 4);
    const { mask, matte } = detectInk(pixels, 20, 20);
    expect(mask[0]).toBe(0);
    expect(mask[205]).toBe(255);
    expect(mask[206]).toBeGreaterThanOrEqual(126);
    expect(mask[206]).toBeLessThanOrEqual(129);
    expect(mask[207]).toBeGreaterThan(20);
    unmatteInk(pixels, matte);
    for (let c = 0; c < 3; c++) expect(Math.abs(pixels[206 * 4 + c] - ink[c])).toBeLessThan(3);
  });

  it("rejects textured borders, empty paper, transparency and multicolor marks", () => {
    const pixels = new Uint8ClampedArray(20 * 20 * 4).fill(255);
    expect(() => detectInk(pixels, 20, 20)).toThrow("BACKGROUND_INK_UNSUITABLE");
    pixels.set([0, 0, 0, 0], 0);
    expect(() => detectInk(pixels, 20, 20)).toThrow("BACKGROUND_INK_UNSUITABLE");
    pixels.fill(255);
    for (let i = 20; i < 300; i++) pixels.set(i % 2 ? [200, 0, 0, 255] : [0, 0, 200, 255], i * 4);
    expect(() => detectInk(pixels, 20, 20)).toThrow("BACKGROUND_INK_UNSUITABLE");
  });
});
