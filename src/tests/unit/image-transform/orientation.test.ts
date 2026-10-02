import { describe, expect, it } from "vitest";
import { flipOrientation, fromOriented, normaliseOrientation, orientedSize, rectFromOriented, rectToOriented, rotateOrientation, toOriented } from "@/core/image-transform/orientation";
import type { Orientation, Point, Rotation, Size } from "@/core/image-transform/types";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
/** All eight distinct orientations of a rectangle (4 rotations × optional mirror). */
const ALL: Orientation[] = ROTATIONS.flatMap((rotation) => [false, true].flatMap((flipH) => [false, true].map((flipV) => ({ rotation, flipH, flipV }))));

describe("orientedSize", () => {
  it("swaps width and height only on quarter turns", () => {
    expect(orientedSize({ width: 4, height: 2 }, 0)).toEqual({ width: 4, height: 2 });
    expect(orientedSize({ width: 4, height: 2 }, 90)).toEqual({ width: 2, height: 4 });
    expect(orientedSize({ width: 4, height: 2 }, 180)).toEqual({ width: 4, height: 2 });
    expect(orientedSize({ width: 4, height: 2 }, 270)).toEqual({ width: 2, height: 4 });
  });
});

describe("point mapping (hand-computed, source 4×2)", () => {
  const S: Size = { width: 4, height: 2 };
  const p = { x: 1, y: 0.5 };
  const none = { flipH: false, flipV: false };

  it("rotates clockwise", () => {
    // 90° cw: the left column becomes the top row → (x, y) ↦ (H − y, x).
    expect(toOriented(p, S, { rotation: 90, ...none })).toEqual({ x: 1.5, y: 1 });
    expect(toOriented(p, S, { rotation: 180, ...none })).toEqual({ x: 3, y: 1.5 });
    expect(toOriented(p, S, { rotation: 270, ...none })).toEqual({ x: 0.5, y: 3 });
  });

  it("maps the top-left corner to the corner a clockwise turn would put it in", () => {
    expect(toOriented({ x: 0, y: 0 }, S, { rotation: 90, ...none })).toEqual({ x: 2, y: 0 }); // top-right
    expect(toOriented({ x: 0, y: 0 }, S, { rotation: 180, ...none })).toEqual({ x: 4, y: 2 }); // bottom-right
    expect(toOriented({ x: 0, y: 0 }, S, { rotation: 270, ...none })).toEqual({ x: 0, y: 4 }); // bottom-left
  });

  it("mirrors in the visible frame", () => {
    expect(toOriented(p, S, { rotation: 0, flipH: true, flipV: false })).toEqual({ x: 3, y: 0.5 });
    expect(toOriented(p, S, { rotation: 0, flipH: false, flipV: true })).toEqual({ x: 1, y: 1.5 });
  });
});

describe("inverse mapping", () => {
  const S: Size = { width: 1170, height: 2532 };
  const points: Point[] = [
    { x: 0, y: 0 },
    { x: 1170, y: 2532 },
    { x: 13, y: 2001 },
    { x: 600.5, y: 7.25 },
  ];
  it("fromOriented undoes toOriented for every orientation", () => {
    for (const o of ALL) for (const p of points) expect(fromOriented(toOriented(p, S, o), S, o)).toEqual(p);
  });

  it("maps integer rectangles to integer rectangles exactly, both ways", () => {
    const rect = { x: 10, y: 20, width: 300, height: 400 };
    for (const o of ALL) {
      const visible = rectToOriented(rect, S, o);
      expect([visible.x, visible.y, visible.width, visible.height].every(Number.isInteger)).toBe(true);
      expect(rectFromOriented(visible, S, o)).toEqual(rect);
    }
  });

  it("maps a rectangle through a quarter turn (hand-computed)", () => {
    // Source 100×60, rect (10,5)–(30,15): corners → (55,10) and (45,30).
    expect(rectToOriented({ x: 10, y: 5, width: 20, height: 10 }, { width: 100, height: 60 }, { rotation: 90, flipH: false, flipV: false })).toEqual({ x: 45, y: 10, width: 10, height: 20 });
  });
});

describe("visible-frame composition", () => {
  const S: Size = { width: 30, height: 20 };
  const samples: Point[] = [
    { x: 0, y: 0 },
    { x: 7, y: 3 },
    { x: 30, y: 20 },
    { x: 22.5, y: 19 },
  ];

  it("'rotate right' turns exactly what is currently visible, from any orientation", () => {
    for (const o of ALL) {
      const before = orientedSize(S, o.rotation);
      const next = rotateOrientation(o, "cw");
      for (const p of samples) {
        const seen = toOriented(p, S, o);
        // Independent formula: a clockwise turn of the visible frame.
        expect(toOriented(p, S, next)).toEqual({ x: before.height - seen.y, y: seen.x });
      }
    }
  });

  it("'flip horizontal' mirrors exactly what is currently visible, from any orientation", () => {
    for (const o of ALL) {
      const size = orientedSize(S, o.rotation);
      for (const p of samples) {
        const seen = toOriented(p, S, o);
        expect(toOriented(p, S, flipOrientation(o, "horizontal"))).toEqual({ x: size.width - seen.x, y: seen.y });
        expect(toOriented(p, S, flipOrientation(o, "vertical"))).toEqual({ x: seen.x, y: size.height - seen.y });
      }
    }
  });

  it("four quarter turns, or a turn and its reverse, are the identity", () => {
    for (const o of ALL) {
      const n = normaliseOrientation(o);
      let r = n;
      for (let i = 0; i < 4; i++) r = rotateOrientation(r, "cw");
      expect(r).toEqual(n);
      expect(rotateOrientation(rotateOrientation(n, "cw"), "ccw")).toEqual(n);
      expect(flipOrientation(flipOrientation(n, "horizontal"), "horizontal")).toEqual(n);
    }
  });

  it("has exactly one stored form per picture: same picture ⇔ same normalised state", () => {
    const picture = (o: Orientation) => JSON.stringify(samples.map((p) => toOriented(p, S, o)));
    const forms = new Set(ALL.map((o) => JSON.stringify(normaliseOrientation(o))));
    expect(forms.size).toBe(8); // the eight symmetries of a rectangle
    for (const a of ALL) {
      for (const b of ALL) {
        const samePicture = picture(a) === picture(b);
        const sameForm = JSON.stringify(normaliseOrientation(a)) === JSON.stringify(normaliseOrientation(b));
        expect(sameForm).toBe(samePicture);
      }
      // Normalising never changes the picture.
      expect(picture(normaliseOrientation(a))).toBe(picture(a));
    }
  });

  it("never stores a vertical mirror (it is a horizontal mirror plus a half turn)", () => {
    for (const o of ALL) expect(normaliseOrientation(o).flipV).toBe(false);
    expect(normaliseOrientation({ rotation: 0, flipH: false, flipV: true })).toEqual({ rotation: 180, flipH: true, flipV: false });
  });

  it("stores mirroring both axes as a half turn, so equal images compare equal", () => {
    expect(normaliseOrientation({ rotation: 90, flipH: true, flipV: true })).toEqual({ rotation: 270, flipH: false, flipV: false });
    const both = flipOrientation(flipOrientation({ rotation: 0, flipH: false, flipV: false }, "horizontal"), "vertical");
    expect(both).toEqual({ rotation: 180, flipH: false, flipV: false });
    // …and it really is the same picture.
    for (const p of samples) expect(toOriented(p, S, both)).toEqual(toOriented(p, S, { rotation: 0, flipH: true, flipV: true }));
  });
});
