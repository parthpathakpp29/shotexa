/**
 * Phase 2I Split Long Screenshot — planning maths, custom line editing, validation, the
 * source-coordinate mapping of each piece, and the reconstruction guarantee (every source row
 * in exactly one piece, in order). Pixel-level reconstruction is verified again in E2E.
 */
import { describe, expect, it } from "vitest";
import { outputSize, sourceCrop } from "@/core/image-transform/transform";
import { sourceToOutputMatrix } from "@/core/image-transform/matrix";
import {
  addLine,
  addLineInTallest,
  asCustom,
  canSplit,
  clampCount,
  clampHeight,
  cutsFor,
  defaultSplit,
  equalCountCuts,
  equalHeightCuts,
  heightBounds,
  linesValid,
  MAX_PIECES,
  maxPieces,
  MIN_SLICE_PX,
  moveLine,
  pieceName,
  piecesFor,
  planSplit,
  removeLine,
  validatePieces,
  withMode,
} from "@/core/split/plan";
import { pieceTransform } from "@/core/split/render";
import type { SplitPiece, SplitSettings } from "@/core/split/types";

let n = 0;
const id = () => `l${++n}`;
const heights = (pieces: SplitPiece[]) => pieces.map((p) => p.y1 - p.y0);

/** The reconstruction invariant: rows 0…H-1 each appear exactly once, in order. */
function expectCoversEveryRowOnce(pieces: SplitPiece[], height: number) {
  const seen = new Uint8Array(height);
  let previous = -1;
  for (const p of pieces) {
    for (let y = p.y0; y < p.y1; y++) {
      expect(y).toBeGreaterThan(previous);
      seen[y]++;
      previous = y;
    }
  }
  expect(seen.every((v) => v === 1)).toBe(true);
}

const equal = (over: Partial<SplitSettings> = {}): SplitSettings => ({ mode: "equal", by: "count", count: 2, height: 1000, lines: [], ...over });

describe("equal sections", () => {
  it("splits into near-equal pieces that differ by at most one row", () => {
    expect(equalCountCuts(3792, 2)).toEqual([1896]);
    expect(heights(piecesFor(equalCountCuts(3792, 4), 3792))).toEqual([948, 948, 948, 948]);
    const odd = heights(piecesFor(equalCountCuts(1001, 3), 1001));
    expect(odd.reduce((a, b) => a + b)).toBe(1001);
    expect(Math.max(...odd) - Math.min(...odd)).toBeLessThanOrEqual(1);
  });

  it("clamps the count to what the image can hold", () => {
    expect(clampCount(1, 2000)).toBe(2);
    expect(clampCount(0, 2000)).toBe(2);
    expect(clampCount(Number.NaN, 2000)).toBe(2);
    expect(clampCount(500, 2000)).toBe(maxPieces(2000));
    expect(maxPieces(2000)).toBe(Math.floor(2000 / MIN_SLICE_PX));
    expect(maxPieces(1_000_000)).toBe(MAX_PIECES);
    for (const count of [2, 7, 83]) {
      const pieces = piecesFor(equalCountCuts(2000, count), 2000);
      expect(pieces).toHaveLength(count);
      expect(Math.min(...heights(pieces))).toBeGreaterThanOrEqual(MIN_SLICE_PX);
    }
  });

  it("never splits an image too short for two pieces", () => {
    expect(canSplit(MIN_SLICE_PX * 2 - 1)).toBe(false);
    expect(canSplit(MIN_SLICE_PX * 2)).toBe(true);
    expect(equalCountCuts(30, 4)).toEqual([]);
    expect(equalHeightCuts(30, 10)).toEqual([]);
  });
});

describe("target height", () => {
  it("cuts every N rows and gives the remainder to the last piece", () => {
    expect(equalHeightCuts(3792, 1000)).toEqual([1000, 2000, 3000]);
    expect(heights(piecesFor(equalHeightCuts(3792, 1000), 3792))).toEqual([1000, 1000, 1000, 792]);
    expect(heights(piecesFor(equalHeightCuts(3000, 1000), 3000))).toEqual([1000, 1000, 1000]); // exact: no empty tail
  });

  it("folds a sliver remainder into the previous piece", () => {
    // 3010 = 3 × 1000 + 10: a 10 px fourth piece would be an accident.
    expect(heights(piecesFor(equalHeightCuts(3010, 1000), 3010))).toEqual([1000, 1000, 1010]);
    expect(heights(piecesFor(equalHeightCuts(3000 + MIN_SLICE_PX, 1000), 3000 + MIN_SLICE_PX))).toEqual([1000, 1000, 1000, MIN_SLICE_PX]);
  });

  it("bounds the height so there are two to MAX_PIECES pieces", () => {
    const b = heightBounds(100_000);
    expect(b.min).toBe(1000); // 100 pieces at most
    expect(b.max).toBe(100_000 - MIN_SLICE_PX); // always at least two
    expect(clampHeight(5, 100_000)).toBe(1000);
    expect(clampHeight(1e9, 3792)).toBe(3792 - MIN_SLICE_PX);
    expect(piecesFor(equalHeightCuts(100_000, 1), 100_000).length).toBeLessThanOrEqual(MAX_PIECES);
    expect(heights(piecesFor(equalHeightCuts(3792, 1e9), 3792))).toEqual([3792 - MIN_SLICE_PX, MIN_SLICE_PX]);
  });

  it("defaults to a phone-screen-shaped piece", () => {
    expect(defaultSplit({ width: 1170, height: 10_000 })).toMatchObject({ mode: "equal", by: "count", count: 2, height: 2080 });
    expect(defaultSplit({ width: 1170, height: 1500 }).height).toBe(1500 - MIN_SLICE_PX); // clamped
  });
});

describe("custom split lines", () => {
  const H = 3000;
  const custom = (ys: number[]): SplitSettings => ({ ...equal(), mode: "custom", lines: ys.map((y) => ({ id: `c${y}`, y, source: "manual" })) });

  it("starts from the equal split when the user first edits it", () => {
    const c = asCustom(equal({ count: 3 }), H, id);
    expect(c.mode).toBe("custom");
    expect(c.lines.map((l) => l.y)).toEqual([1000, 2000]);
    expect(cutsFor(c, H)).toEqual(cutsFor(equal({ count: 3 }), H)); // same pieces, now editable
  });

  it("switching modes keeps earlier custom lines", () => {
    const c = custom([700]);
    const e = withMode(c, "equal", H, id);
    expect(cutsFor(e, H)).toEqual([1500]);
    expect(withMode(e, "custom", H, id).lines).toEqual(c.lines);
  });

  it("adds lines in order, and rejects slivers and out-of-range positions", () => {
    let s = custom([1000]);
    s = addLine(s, 2500.4, H, id);
    s = addLine(s, 400, H, id);
    expect(cutsFor(s, H)).toEqual([400, 1000, 2500]);
    expect(addLine(s, 1000 + MIN_SLICE_PX - 1, H, id)).toBe(s); // too close to a line
    expect(addLine(s, 3, H, id)).toBe(s); // too close to the top
    expect(addLine(s, H - 3, H, id)).toBe(s); // too close to the bottom
    expect(addLine(s, -50, H, id)).toBe(s);
    expect(addLine(s, H + 50, H, id)).toBe(s);
  });

  it("adding from equal mode converts it in one step", () => {
    const s = addLine(equal({ count: 2 }), 600, H, id);
    expect(s.mode).toBe("custom");
    expect(cutsFor(s, H)).toEqual([600, 1500]);
    expect(addLine(equal({ count: 2 }), 1500 + 3, H, id).mode).toBe("equal"); // rejected: unchanged
  });

  it("'Add split' halves the tallest piece", () => {
    expect(cutsFor(addLineInTallest(custom([500]), H, id), H)).toEqual([500, 1750]);
    expect(cutsFor(addLineInTallest(equal({ count: 2 }), H, id), H)).toEqual([750, 1500]);
  });

  it("a moved line stays between its neighbours and inside the image", () => {
    const s = custom([1000, 2000]);
    expect(cutsFor(moveLine(s, "c1000", 1234.6, H), H)).toEqual([1235, 2000]);
    // Dragged past its neighbour: stops MIN_SLICE_PX short, never reorders.
    const past = moveLine(s, "c1000", 2600, H);
    expect(cutsFor(past, H)).toEqual([2000 - MIN_SLICE_PX, 2000]);
    expect(past.lines.map((l) => l.id)).toEqual(["c1000", "c2000"]);
    expect(cutsFor(moveLine(s, "c1000", -500, H), H)).toEqual([MIN_SLICE_PX, 2000]);
    expect(cutsFor(moveLine(s, "c2000", 1e9, H), H)).toEqual([1000, H - MIN_SLICE_PX]);
    expect(linesValid(past.lines, H)).toBe(true);
    expect(moveLine(s, "missing", 5, H)).toBe(s);
  });

  it("removes a line", () => {
    const s = removeLine(custom([1000, 2000]), "c1000");
    expect(cutsFor(s, H)).toEqual([2000]);
    expect(removeLine(equal(), "x")).toEqual(equal());
  });

  it("detects invalid line sets", () => {
    expect(linesValid(custom([1000, 1010]).lines, H)).toBe(false);
    expect(linesValid(custom([0]).lines, H)).toBe(false);
    expect(linesValid(custom([1000, 2000]).lines, H)).toBe(true);
  });
});

describe("validation and reconstruction", () => {
  it("every plan covers every source row exactly once, in order", () => {
    const cases: [SplitSettings, number][] = [
      [equal({ count: 2 }), 3792],
      [equal({ count: 7 }), 10_001],
      [equal({ count: 100 }), 99_999],
      [equal({ by: "height", height: 1000 }), 3792],
      [equal({ by: "height", height: 777 }), 5000],
      [{ ...equal(), mode: "custom", lines: [{ id: "a", y: 17 * 3, source: "manual" }, { id: "b", y: 1234, source: "manual" }] }, 1300],
    ];
    for (const [s, H] of cases) {
      const pieces = planSplit(s, { width: 10, height: H });
      expect(validatePieces(pieces, H)).toEqual([]);
      expectCoversEveryRowOnce(pieces, H);
      expect(pieces.map((p) => p.index)).toEqual(pieces.map((_, i) => i));
    }
  });

  it("flags plans that would lose, repeat or sliver rows", () => {
    expect(validatePieces([{ index: 0, y0: 0, y1: 100 }], 100)).toContain("NOTHING_TO_SPLIT");
    expect(validatePieces([{ index: 0, y0: 0, y1: 50 }, { index: 1, y0: 60, y1: 100 }], 100)).toContain("UNSORTED"); // a gap
    expect(validatePieces([{ index: 0, y0: 0, y1: 60 }, { index: 1, y0: 50, y1: 100 }], 100)).toContain("UNSORTED"); // an overlap
    expect(validatePieces([{ index: 0, y0: 0, y1: 90 }, { index: 1, y0: 90, y1: 100 }], 100)).toContain("TOO_CLOSE");
    expect(validatePieces([{ index: 0, y0: 0, y1: 50 }, { index: 1, y0: 50, y1: 90 }], 100)).toContain("OUT_OF_RANGE"); // bottom rows lost
    expect(validatePieces([{ index: 0, y0: 0, y1: 50.5 }, { index: 1, y0: 50.5, y1: 100 }], 100)).toContain("UNSORTED"); // fractional rows
  });
});

describe("output geometry", () => {
  it("each piece is a full-width crop whose first output row is its first source row", () => {
    const source = { width: 1170, height: 3792 };
    for (const p of planSplit(equal({ by: "height", height: 1000 }), source)) {
      const t = pieceTransform(p, source.width);
      expect(sourceCrop(t, source)).toEqual({ x: 0, y: p.y0, width: 1170, height: p.y1 - p.y0 });
      expect(outputSize(t, source)).toEqual({ width: 1170, height: p.y1 - p.y0 });
      // Source (x, y0) → output (x, 0): a pure vertical shift, no scaling — pixel-exact.
      expect(sourceToOutputMatrix(t, source).map((v) => v + 0)).toEqual([1, 0, 0, 1, 0, 0 - p.y0 + 0]);
    }
  });

  it("names pieces in order with zero padding", () => {
    expect(pieceName(0, 3, "png")).toBe("shotexa-split-01.png");
    expect(pieceName(2, 3, "jpg")).toBe("shotexa-split-03.jpg");
    expect(pieceName(99, 100, "webp")).toBe("shotexa-split-100.webp");
    expect(pieceName(4, 100, "png")).toBe("shotexa-split-005.png");
    expect(pieceName(1, 12, "webp", "screenshot-{n}.png")).toBe("screenshot-02.webp");
    expect(pieceName(0, 2, "jpg", "client:review-{n}")).toBe("client-review-01.jpg");
  });

  it("intentionally overlaps every piece after the first", () => {
    const pieces = planSplit(equal({ count: 3, overlap: 20 }), { width: 100, height: 300 });
    expect(pieces).toEqual([
      { index: 0, y0: 0, y1: 100 },
      { index: 1, y0: 80, y1: 200 },
      { index: 2, y0: 180, y1: 300 },
    ]);
    expect(validatePieces(pieces, 300, true)).toEqual([]);
    expect(validatePieces(pieces, 300)).toContain("UNSORTED");
  });
});
