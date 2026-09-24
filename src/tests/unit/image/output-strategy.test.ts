import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, MiB, softBudgetFor } from "@/config/limits";
import { chooseOutputStrategy, decodedBytes } from "@/core/image/output-strategy";

const caps = { offscreenCanvas: true, compressionStream: true };
const phone = decodedBytes(1080, 2400);

describe("chooseOutputStrategy", () => {
  it("uses one canvas for ordinary outputs", () => {
    expect(chooseOutputStrategy({ width: 1080, height: 5000, format: "png", largestSourceBytes: phone }, caps).strategy).toEqual({ kind: "single-canvas" });
    // 1080×15000 = 16.2M px: under the 16.7M px cross-browser area ceiling and the budget.
    expect(chooseOutputStrategy({ width: 1080, height: 15_000, format: "jpeg", largestSourceBytes: phone }, caps).strategy).toEqual({ kind: "single-canvas" });
  });

  it("uses tiles once the area ceiling is exceeded (Spike B: 1080×20000 → tiled)", () => {
    const d = chooseOutputStrategy({ width: 1080, height: 20_000, format: "png", largestSourceBytes: phone }, caps);
    expect(d.strategy.kind).toBe("tiled-png");
  });

  it("respects a smaller device budget", () => {
    const small = { ...DEFAULT_LIMITS, softBudgetBytes: softBudgetFor({ deviceMemoryGiB: 2 }) };
    expect(softBudgetFor({ deviceMemoryGiB: 2 })).toBe(128 * MiB);
    expect(softBudgetFor({ isIOS: true })).toBe(160 * MiB);
    // 1080×15000 canvas (61.8 MiB × 1.5) + a resident 1080×10000 source (41.2 MiB) > 128 MiB → tiled.
    const req = { width: 1080, height: 15_000, format: "png" as const, largestSourceBytes: decodedBytes(1080, 10_000) };
    expect(chooseOutputStrategy(req, caps, small).strategy.kind).toBe("tiled-png");
    expect(chooseOutputStrategy(req, caps).strategy.kind).toBe("single-canvas");
  });

  it("switches tall PNG outputs to the tiled streaming encoder", () => {
    const d = chooseOutputStrategy({ width: 1080, height: 30_000, format: "png", largestSourceBytes: phone }, caps);
    expect(d.strategy).toEqual({ kind: "tiled-png", tileHeight: DEFAULT_LIMITS.tileHeight });
    expect(d.reasons).toContain("CANVAS_SIZE_LIMIT");
    expect(d.estimates.tiledPeakBytes).toBeLessThan(d.estimates.singleCanvasPeakBytes / 5);
  });

  it("never lets WebP silently crop: > 16383 px splits", () => {
    const d = chooseOutputStrategy({ width: 1080, height: 20_000, format: "webp", largestSourceBytes: phone }, caps);
    expect(d.strategy).toMatchObject({ kind: "split", format: "webp", parts: Math.ceil(20_000 / DEFAULT_LIMITS.splitSectionHeight) });
    expect(d.reasons).toContain("FORMAT_DIMENSION_LIMIT");
  });

  it("splits tall JPEG (no streaming encoder)", () => {
    const d = chooseOutputStrategy({ width: 1440, height: 40_000, format: "jpeg", largestSourceBytes: phone }, caps);
    expect(d.strategy.kind).toBe("split");
    expect(d.reasons).toContain("NO_STREAMING_ENCODER");
  });

  it("falls back to split when CompressionStream is unavailable", () => {
    const d = chooseOutputStrategy({ width: 1080, height: 30_000, format: "png", largestSourceBytes: phone }, { ...caps, compressionStream: false });
    expect(d.strategy.kind).toBe("split");
  });

  it("asks to reduce/split when a single source cannot fit the budget", () => {
    const d = chooseOutputStrategy({ width: 4000, height: 40_000, format: "png", largestSourceBytes: decodedBytes(4000, 40_000) }, caps);
    expect(d.strategy.kind).toBe("reduce-or-split");
  });
});
