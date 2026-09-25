import { describe, expect, it } from "vitest";
import { planStitchChain } from "@/core/stitch/chain";
import { planStitch } from "@/core/stitch/plan";

const bands = (top = 0, bottom = 0) => ({ top, bottom });

/** Every output row is written exactly once, in order, from a valid source row. */
function assertContiguous(plan: ReturnType<typeof planStitchChain>, heights: number[]) {
  let y = 0;
  for (const s of plan.segments) {
    expect(s.dy).toBe(y);
    expect(s.height).toBeGreaterThan(0);
    expect(s.sy).toBeGreaterThanOrEqual(0);
    expect(s.sy + s.height).toBeLessThanOrEqual(heights[s.source]);
    y += s.height;
  }
  expect(y).toBe(plan.height);
}

describe("planStitchChain", () => {
  it("matches the validated pair planner for two screenshots", () => {
    const a = { width: 1170, height: 2532 };
    const b = { width: 1170, height: 2532 };
    for (const [offset, bd] of [
      [1260, bands(180, 150)],
      [1, bands()],
      [2532, bands()],
      [800, bands(300, 0)],
    ] as const) {
      const pair = planStitch(a, b, offset, bd);
      const chain = planStitchChain([a, b], [{ offsetY: offset, bands: bd }]);
      expect(chain.width).toBe(pair.width);
      expect(chain.height).toBe(pair.height);
      expect(chain.seams).toEqual([pair.seamY]);
      expect(chain.segments).toEqual(pair.segments.map((s) => ({ ...s, source: s.source === "a" ? 0 : 1 })));
    }
  });

  it("chains three screenshots contiguously", () => {
    const dims = [
      { width: 1280, height: 800 },
      { width: 1280, height: 800 },
      { width: 1280, height: 800 },
    ];
    const plan = planStitchChain(dims, [
      { offsetY: 560, bands: bands(64, 0) },
      { offsetY: 560, bands: bands(64, 0) },
    ]);
    expect(plan.tops).toEqual([0, 560, 1120]);
    expect(plan.height).toBe(1920);
    expect(plan.segments.map((s) => s.source)).toEqual([0, 1, 2]);
    assertContiguous(plan, dims.map((d) => d.height));
  });

  it("places screenshots end to end when there is no overlap", () => {
    const dims = [
      { width: 100, height: 300 },
      { width: 100, height: 200 },
      { width: 100, height: 250 },
    ];
    const plan = planStitchChain(dims, [
      { offsetY: 300, bands: bands() },
      { offsetY: 200, bands: bands() },
    ]);
    expect(plan.height).toBe(750);
    assertContiguous(plan, dims.map((d) => d.height));
  });

  it("stays contiguous with extreme manual offsets (seams clamped)", () => {
    const dims = [
      { width: 100, height: 1000 },
      { width: 100, height: 120 },
      { width: 100, height: 1000 },
    ];
    const plan = planStitchChain(dims, [
      { offsetY: 990, bands: bands(0, 500) },
      { offsetY: 1, bands: bands() },
    ]);
    assertContiguous(plan, dims.map((d) => d.height));
    for (let i = 1; i < plan.seams.length; i++) expect(plan.seams[i]).toBeGreaterThanOrEqual(plan.seams[i - 1]);
  });

  it("uses the widest screenshot and rejects a wrong join count", () => {
    const plan = planStitchChain(
      [
        { width: 100, height: 100 },
        { width: 104, height: 100 },
      ],
      [{ offsetY: 50, bands: bands() }],
    );
    expect(plan.width).toBe(104);
    expect(() => planStitchChain([{ width: 1, height: 1 }], [{ offsetY: 1, bands: bands() }])).toThrow(RangeError);
    expect(planStitchChain([], []).height).toBe(0);
  });
});
