import { describe, expect, it } from "vitest";
import { planCombine } from "@/core/combine/layout";
import { selectCombineInputs } from "@/core/combine/inputs";
import { chooseOutputStrategy } from "@/core/image/output-strategy";
import { DEFAULT_LIMITS } from "@/config/limits";
import type { WorkspaceFile } from "@/core/runtime/types";

const sources = [{ width: 100, height: 200 }, { width: 300, height: 100 }, { width: 120, height: 120 }, { width: 80, height: 160 }];

describe("Combine layout planning", () => {
  it("stacks vertically with gap and center alignment without distortion", () => {
    const plan = planCombine(sources.slice(0, 2), { layout: "vertical", gap: 10, alignment: "center" });
    expect(plan).toMatchObject({ width: 300, height: 310 });
    expect(plan.placements).toEqual([
      { source: 0, x: 100, y: 0, width: 100, height: 200 },
      { source: 1, x: 0, y: 210, width: 300, height: 100 },
    ]);
  });

  it("matches width uniformly when requested", () => {
    const plan = planCombine(sources.slice(0, 2), { layout: "vertical", sizing: "match-width", gap: 0 });
    expect(plan.width).toBe(300);
    expect(plan.placements[0]).toMatchObject({ width: 300, height: 600 });
    expect(plan.placements[0].width / plan.placements[0].height).toBeCloseTo(0.5);
  });

  it("places horizontal images with natural height alignment", () => {
    const plan = planCombine(sources.slice(0, 2), { layout: "horizontal", gap: 20, alignment: "end" });
    expect(plan).toMatchObject({ width: 420, height: 200 });
    expect(plan.placements[0]).toMatchObject({ x: 0, y: 0 });
    expect(plan.placements[1]).toMatchObject({ x: 120, y: 100 });
  });

  it("builds deterministic grid cells with gaps and alignment", () => {
    const plan = planCombine(sources, { layout: "grid", gridColumns: 2, gap: 12, alignment: "center", background: "cream" });
    expect(plan.width).toBe(432);
    expect(plan.height).toBe(372);
    expect(plan.background).toBe("#f8f6f1");
    expect(plan.placements.map((placement) => [placement.x, placement.y])).toEqual([[10, 0], [132, 50], [0, 232], [242, 212]]);
  });

  it("clamps spacing and rejects a one-image plan", () => {
    expect(() => planCombine(sources.slice(0, 1))).toThrow("COMBINE_TOO_FEW_IMAGES");
    expect(planCombine(sources.slice(0, 2), { gap: 999 }).settings.gap).toBe(256);
  });
});

describe("Combine artifact handoff and strategy", () => {
  const file = (id: string, extra: Partial<WorkspaceFile> = {}): WorkspaceFile => ({ id, name: `${id}.png`, type: "image/png", bytes: 1, width: 100, height: 100, source: "picker", kind: "original", addedAt: 0, previewVersion: 0, ...extra });

  it("uses a selected artifact and excludes its original sources", () => {
    const files = { a: file("a"), b: file("b"), c: file("c"), stitched: file("stitched", { kind: "artifact", source: "artifact", derivedFrom: ["a", "b"], producedBy: "stitch" }) };
    expect(selectCombineInputs(["a", "b", "c", "stitched"], files, "stitched")).toEqual(["stitched", "c"]);
  });

  it("selects a tiled PNG strategy for a tall safe combine and refuses oversized WebP", () => {
    const tall = chooseOutputStrategy({ width: 1080, height: 30_000, format: "png", largestSourceBytes: 20 * 1024 * 1024 }, { offscreenCanvas: true, compressionStream: true }, DEFAULT_LIMITS);
    expect(tall.strategy.kind).toBe("tiled-png");
    const webp = chooseOutputStrategy({ width: 1080, height: 30_000, format: "webp", largestSourceBytes: 20 * 1024 * 1024 }, { offscreenCanvas: true, compressionStream: true }, DEFAULT_LIMITS);
    expect(webp.strategy.kind).toBe("split");
  });
});
