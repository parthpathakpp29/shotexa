import { describe, expect, it } from "vitest";
import { alphaBounds } from "@/core/image-transform/trim";

describe("transparent-edge trim", () => {
  it("finds the exact non-transparent bounds without interpreting image content", () => {
    const width = 8;
    const height = 6;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 2; y < 5; y++) for (let x = 1; x < 7; x++) data[(y * width + x) * 4 + 3] = 255;
    expect(alphaBounds(data, width, height)).toEqual({ x: 1, y: 2, width: 6, height: 3 });
  });

  it("returns null for an entirely transparent image and respects an alpha threshold", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    expect(alphaBounds(data, 4, 4)).toBeNull();
    data[(1 * 4 + 1) * 4 + 3] = 2;
    expect(alphaBounds(data, 4, 4, 2)).toBeNull();
    expect(alphaBounds(data, 4, 4, 1)).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });
});
