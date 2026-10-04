import { describe, expect, it } from "vitest";
import { adjustmentFilter, applyMatrix, transformMatrix } from "@/core/image-transform/matrix";
import { toOriented } from "@/core/image-transform/orientation";
import { planTransformExport } from "@/core/image-transform/render";
import {
  describeOrientation,
  EDITOR_LIMITS,
  flipTransform,
  IDENTITY_TRANSFORM,
  isIdentity,
  isValidTransform,
  naturalSize,
  outputIssue,
  outputSize,
  parseDimension,
  resetCrop,
  rotate180,
  rotateTransform,
  sourceCrop,
  straightenedSize,
  visibleCrop,
  withAdjustments,
  withCropAspect,
  withCropField,
  withLockAspect,
  withOutputHeight,
  withOutputWidth,
  withStraighten,
  withVisibleCrop,
} from "@/core/image-transform/transform";
import { EditorError, type ImageTransform, type Orientation, type Rotation, type Size } from "@/core/image-transform/types";

const PHONE: Size = { width: 1170, height: 2532 };
const WIDE: Size = { width: 100, height: 60 };
const T = IDENTITY_TRANSFORM;

describe("crop", () => {
  it("stores the crop in source pixels and shows it in the visible frame", () => {
    const t = withVisibleCrop(T, WIDE, { x: 10, y: 5, width: 20, height: 10 });
    expect(t.crop).toEqual({ x: 10, y: 5, width: 20, height: 10 });
    expect(visibleCrop(t, WIDE)).toEqual(t.crop);
  });

  it("maps a crop drawn on a rotated view back to the right source pixels", () => {
    // Rotated clockwise, the visible top-left quarter is the source's bottom-left.
    const rotated = rotateTransform(T, "cw");
    const t = withVisibleCrop(rotated, WIDE, { x: 0, y: 0, width: 30, height: 50 });
    expect(t.crop).toEqual({ x: 0, y: 30, width: 50, height: 30 });
    expect(naturalSize(t, WIDE)).toEqual({ width: 30, height: 50 });
  });

  it("keeps the same pixels when the image is rotated afterwards", () => {
    const cropped = withVisibleCrop(T, WIDE, { x: 10, y: 5, width: 20, height: 10 });
    const turned = rotateTransform(cropped, "cw");
    expect(turned.crop).toEqual(cropped.crop);
    expect(visibleCrop(turned, WIDE)).toEqual({ x: 45, y: 10, width: 10, height: 20 });
    expect(outputSize(turned, WIDE)).toEqual({ width: 10, height: 20 });
  });

  it("treats a crop covering the whole image as no crop", () => {
    expect(withVisibleCrop(T, WIDE, { x: -5, y: -5, width: 999, height: 999 }).crop).toBeNull();
    expect(isIdentity(withVisibleCrop(T, WIDE, { x: 0, y: 0, width: 100, height: 60 }))).toBe(true);
  });

  it("honours a typed position by trimming a box that would overflow, instead of ignoring it", () => {
    // Full-width box: typing X = 60 must give the right half, not snap back to 0.
    const q = { width: 120, height: 80 };
    const t = withCropField(T, q, "x", 60);
    expect(visibleCrop(t, q)).toEqual({ x: 60, y: 0, width: 60, height: 80 });
    // A box with room to move keeps its size.
    const narrow = withVisibleCrop(T, q, { x: 0, y: 0, width: 40, height: 40 });
    expect(visibleCrop(withCropField(narrow, q, "x", 30), q)).toEqual({ x: 30, y: 0, width: 40, height: 40 });
    expect(visibleCrop(withCropField(narrow, q, "y", 70), q)).toEqual({ x: 0, y: 70, width: 40, height: 10 });
  });

  it("keeps a fixed ratio when a typed value trims or resizes the box", () => {
    const q = { width: 120, height: 80 };
    const square = withCropAspect(T, q, "1:1"); // 80×80 at x = 20
    const c = visibleCrop(withCropField(square, q, "width", 50), q);
    expect([c.width, c.height]).toEqual([50, 50]);
    const moved = visibleCrop(withCropField(square, q, "x", 100), q);
    expect(moved.width).toBe(moved.height);
    expect(moved.x + moved.width).toBeLessThanOrEqual(120);
  });

  it("clamps typed sizes to the image", () => {
    const q = { width: 120, height: 80 };
    expect(visibleCrop(withCropField(T, q, "width", 9999), q).width).toBe(120);
    expect(visibleCrop(withCropField(T, q, "x", -50), q).x).toBe(0);
  });

  it("applies aspect presets to the whole visible image", () => {
    const square = withCropAspect(T, PHONE, "1:1");
    expect(square.cropAspect).toBe("1:1");
    expect(visibleCrop(square, PHONE)).toEqual({ x: 0, y: 681, width: 1170, height: 1170 });
    expect(withCropAspect(square, PHONE, "free").crop).toEqual(square.crop); // free keeps the box
    expect(withCropAspect(T, PHONE, "original").crop).toBeNull(); // original ratio = whole image
    expect(resetCrop(square)).toMatchObject({ crop: null, cropAspect: "free" });
  });
});

describe("rotate and flip", () => {
  it("swaps output dimensions on quarter turns only", () => {
    expect(outputSize(rotateTransform(T, "cw"), PHONE)).toEqual({ width: 2532, height: 1170 });
    expect(outputSize(rotateTransform(T, "ccw"), PHONE)).toEqual({ width: 2532, height: 1170 });
    expect(outputSize(rotate180(T), PHONE)).toEqual(PHONE);
    expect(outputSize(flipTransform(T, "horizontal"), PHONE)).toEqual(PHONE);
  });

  it("drops a fixed landscape crop ratio on a quarter turn, but keeps it on a half turn", () => {
    const wide = withCropAspect(T, WIDE, "16:9");
    expect(rotateTransform(wide, "cw").cropAspect).toBe("free");
    expect(rotate180(wide).cropAspect).toBe("16:9");
    expect(rotateTransform(withCropAspect(T, WIDE, "1:1"), "cw").cropAspect).toBe("1:1");
    expect(rotateTransform(withCropAspect(T, WIDE, "original"), "cw").cropAspect).toBe("original");
  });

  it("describes orientations the way the user performed them", () => {
    expect(describeOrientation(T)).toEqual([]);
    expect(describeOrientation(rotateTransform(T, "cw"))).toEqual(["Rotated 90° right"]);
    expect(describeOrientation(rotateTransform(T, "ccw"))).toEqual(["Rotated 90° left"]);
    expect(describeOrientation(flipTransform(T, "horizontal"))).toEqual(["Flipped horizontally"]);
    // Stored as half turn + horizontal mirror, but shown as the vertical flip it is.
    expect(describeOrientation(flipTransform(T, "vertical"))).toEqual(["Flipped vertically"]);
  });

  it("never names a direction the user may not have chosen for a mirrored quarter turn", () => {
    // Two different action sequences reach the same stored picture…
    const a = flipTransform(rotateTransform(T, "cw"), "vertical");
    const b = flipTransform(rotateTransform(T, "ccw"), "horizontal");
    expect(a).toEqual(b);
    // …so the description must be true for both.
    expect(describeOrientation(a)).toEqual(["Rotated 90°", "Mirrored"]);
  });

  it("returns to the identity after undoing every step", () => {
    let t = rotateTransform(T, "cw");
    t = flipTransform(t, "horizontal");
    t = rotateTransform(t, "ccw");
    t = flipTransform(t, "vertical");
    // cw·flipH·ccw = flipV, so one more vertical flip cancels everything.
    expect(isIdentity(t)).toBe(true);
  });
});

describe("straighten and adjustments", () => {
  it("adds free rotation to the canonical output bounds and clamps it to a conservative range", () => {
    expect(straightenedSize({ width: 100, height: 60 }, 0)).toEqual({ width: 100, height: 60 });
    const tilted = withStraighten(T, 10);
    expect(tilted.straighten).toBe(10);
    expect(outputSize(tilted, WIDE)).toEqual(straightenedSize(WIDE, 10));
    expect(outputSize(tilted, WIDE).width).toBeGreaterThan(WIDE.width);
    expect(withStraighten(T, 99).straighten).toBe(15);
    expect(withStraighten(T, -99).straighten).toBe(-15);
  });

  it("maps every corner inside the expanded free-rotation canvas", () => {
    const t = withStraighten(T, 12);
    const out = outputSize(t, WIDE);
    const matrix = transformMatrix(WIDE, t, out);
    for (const point of [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 60 }, { x: 100, y: 60 }]) {
      const mapped = applyMatrix(matrix, point);
      expect(mapped.x).toBeGreaterThanOrEqual(-0.01);
      expect(mapped.y).toBeGreaterThanOrEqual(-0.01);
      expect(mapped.x).toBeLessThanOrEqual(out.width + 0.01);
      expect(mapped.y).toBeLessThanOrEqual(out.height + 0.01);
    }
  });

  it("keeps adjustments as settings and builds one deterministic render filter", () => {
    const adjusted = withAdjustments(T, { brightness: 12, contrast: 20, saturation: -15, warmth: 30, grayscale: 10, exposure: 1.2 });
    expect(adjusted.adjustments).toEqual({ brightness: 12, contrast: 20, saturation: -15, warmth: 30, grayscale: 10, exposure: 1.2 });
    expect(adjustmentFilter(adjusted.adjustments)).toBe("brightness(142%) contrast(120%) saturate(85%) grayscale(10%) sepia(11%) hue-rotate(-4deg)");
    expect(isIdentity(adjusted)).toBe(false);
    expect(withAdjustments(T, { brightness: 999, grayscale: -2, exposure: 8 }).adjustments).toMatchObject({ brightness: 100, grayscale: 0, exposure: 2 });
  });
});

describe("resize", () => {
  it("keeps the aspect ratio when locked", () => {
    const t = withOutputWidth(T, PHONE, 585);
    expect(outputSize(t, PHONE)).toEqual({ width: 585, height: 1266 });
    expect(outputSize(withOutputHeight(T, PHONE, 1266), PHONE)).toEqual({ width: 585, height: 1266 });
  });

  it("changes one side at a time when unlocked", () => {
    const free = withLockAspect(T, false);
    const t = withOutputHeight(withOutputWidth(free, PHONE, 600), PHONE, 900);
    expect(outputSize(t, PHONE)).toEqual({ width: 600, height: 900 });
  });

  it("re-locking snaps height back to the width's scale", () => {
    const stretched = withOutputHeight(withOutputWidth(withLockAspect(T, false), PHONE, 585), PHONE, 400);
    expect(outputSize(withLockAspect(stretched, true), PHONE)).toEqual({ width: 585, height: 1266 });
  });

  it("stores natural size as no resize", () => {
    expect(withOutputWidth(T, PHONE, 1170).resize).toBeNull();
    expect(isIdentity(withOutputWidth(withOutputWidth(T, PHONE, 500), PHONE, 1170))).toBe(true);
  });

  it("scales, so a later crop never silently upscales", () => {
    const half = withOutputWidth(T, WIDE, 50); // 50%
    const cropped = withVisibleCrop(half, WIDE, { x: 0, y: 0, width: 40, height: 20 });
    expect(outputSize(cropped, WIDE)).toEqual({ width: 20, height: 10 });
  });

  it("swaps unlocked scales with the axes on a quarter turn", () => {
    const source = { width: 1000, height: 400 };
    const t = withOutputWidth(withLockAspect(T, false), source, 500); // 500×400
    expect(outputSize(t, source)).toEqual({ width: 500, height: 400 });
    expect(outputSize(rotateTransform(t, "cw"), source)).toEqual({ width: 400, height: 500 });
  });

  it("rejects empty, zero, negative and non-numeric sizes", () => {
    for (const bad of ["", "0", "-5", "abc", "  ", "NaN", "Infinity"]) expect(parseDimension(bad)).toBeNull();
    expect(parseDimension(" 800 ")).toBe(800);
    expect(parseDimension("12.6")).toBe(13);
  });

  it("clamps absurd sizes to safe limits", () => {
    const huge = outputSize(withOutputWidth(T, PHONE, 10_000_000), PHONE);
    expect(huge.width).toBeLessThanOrEqual(EDITOR_LIMITS.maxWidth);
    expect(huge.width).toBeLessThanOrEqual(PHONE.width * EDITOR_LIMITS.maxScale);
    expect(outputSize(withOutputWidth(T, PHONE, 1), PHONE)).toEqual({ width: 1, height: 2 });
  });

  it("names the limit an output breaks", () => {
    expect(outputIssue({ width: 1170, height: 2532 })).toBeNull();
    expect(outputIssue({ width: 1170, height: 60_000 })).toBeNull(); // tall PNGs stream
    expect(outputIssue({ width: 40_000, height: 10 })).toBe("too-large");
    expect(outputIssue({ width: 30_000, height: 30_000 })).toBe("too-many-pixels");
  });
});

describe("transform matrix", () => {
  const ROTATIONS: Rotation[] = [0, 90, 180, 270];
  const ALL: Orientation[] = ROTATIONS.flatMap((rotation) => [false, true].flatMap((flipH) => [false, true].map((flipV) => ({ rotation, flipH, flipV }))));

  it("maps the crop's corners onto the output's corners for every orientation", () => {
    const crop = { width: 40, height: 20 };
    const out = { width: 17, height: 33 };
    for (const o of ALL) {
      const m = transformMatrix(crop, o, out);
      const corners = [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 0, y: 20 },
        { x: 40, y: 20 },
      ].map((p) => applyMatrix(m, p));
      const xs = corners.map((p) => Math.round(p.x)).sort((a, b) => a - b);
      const ys = corners.map((p) => Math.round(p.y)).sort((a, b) => a - b);
      expect([xs[0], xs[3], ys[0], ys[3]]).toEqual([0, out.width, 0, out.height]);
    }
  });

  it("agrees with the point formulas the crop overlay uses (two independent implementations)", () => {
    const S = { width: 30, height: 20 };
    for (const o of ALL) {
      const m = transformMatrix(S, o, o.rotation % 180 ? { width: 20, height: 30 } : S);
      for (const p of [{ x: 0, y: 0 }, { x: 7, y: 3 }, { x: 30, y: 20 }, { x: 12.5, y: 19 }]) {
        const a = applyMatrix(m, p);
        const b = toOriented(p, S, o);
        expect(a.x).toBeCloseTo(b.x, 9);
        expect(a.y).toBeCloseTo(b.y, 9);
      }
    }
  });

  it("applies crop → rotate → flip → resize in that order (hand-computed)", () => {
    // Crop 40×20 → rotate cw → 20×40 → flip horizontally → resize to 10×20.
    const t: ImageTransform = { ...T, crop: { x: 10, y: 10, width: 40, height: 20 }, rotation: 90, flipH: true, resize: { scaleX: 0.5, scaleY: 0.5 } };
    const crop = sourceCrop(t, WIDE);
    const out = outputSize(t, WIDE);
    expect(out).toEqual({ width: 10, height: 20 });
    const m = transformMatrix(crop, t, out);
    // Crop-local (0,0) → rot (20,0) → flipH (0,0) → scale (0,0).
    expect(applyMatrix(m, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    // Crop-local (40,0) → rot (20,40) → flipH (0,40) → scale (0,20): the crop's top edge
    // becomes the output's left edge, running top to bottom.
    const p = applyMatrix(m, { x: 40, y: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(20);
  });

  it("scales after rotating, so an unlocked resize stretches the visible axes", () => {
    const m = transformMatrix({ width: 40, height: 20 }, { rotation: 90, flipH: false, flipV: false }, { width: 20, height: 80 });
    // Visible 20×40 stretched to 20×80: only the visible vertical axis doubles.
    expect(applyMatrix(m, { x: 40, y: 20 })).toEqual({ x: 0, y: 80 });
  });
});

describe("validation", () => {
  it("rejects crops that are fractional, outside the image or empty, and bad scales", () => {
    expect(isValidTransform(T, WIDE)).toBe(true);
    expect(isValidTransform({ ...T, crop: { x: 0.5, y: 0, width: 10, height: 10 } }, WIDE)).toBe(false);
    expect(isValidTransform({ ...T, crop: { x: 90, y: 0, width: 20, height: 10 } }, WIDE)).toBe(false);
    expect(isValidTransform({ ...T, crop: { x: 0, y: 0, width: 0, height: 10 } }, WIDE)).toBe(false);
    expect(isValidTransform({ ...T, resize: { scaleX: -1, scaleY: 1 } }, WIDE)).toBe(false);
    expect(isValidTransform({ ...T, rotation: 45 as Rotation }, WIDE)).toBe(false);
  });
});

describe("export planning", () => {
  it("uses one canvas for an ordinary screenshot", () => {
    expect(planTransformExport(rotateTransform(T, "cw"), PHONE, "png", true)).toMatchObject({ out: { width: 2532, height: 1170 }, strategy: "single-canvas", tiles: 1 });
  });

  it("streams a tall Smart Stitch result as PNG tiles within the canvas area ceiling", () => {
    const tall = { width: 1170, height: 30_000 };
    const plan = planTransformExport({ ...T, flipH: true }, tall, "png", true);
    expect(plan.strategy).toBe("tiled-png");
    expect(plan.out).toEqual(tall);
    expect(plan.out.width * plan.tileHeight).toBeLessThanOrEqual(16_777_216);
    expect(plan.tiles).toBe(Math.ceil(30_000 / plan.tileHeight));
  });

  it("keeps tiles within the area ceiling even when rotation makes the output very wide", () => {
    const plan = planTransformExport(rotateTransform(T, "cw"), { width: 1170, height: 30_000 }, "png", true);
    expect(plan.out).toEqual({ width: 30_000, height: 1170 });
    expect(plan.tileHeight).toBe(Math.floor(16_777_216 / 30_000));
  });

  it("refuses sizes a format or engine would silently crop, with a controlled error", () => {
    const tall = { width: 1170, height: 70_000 };
    const cases: [ImageTransform, Size, "png" | "jpeg" | "webp", boolean][] = [
      [{ ...T, flipH: true }, tall, "jpeg", true], // JPEG side limit 65,535
      [withOutputWidth(T, { width: 4000, height: 3000 }, 17_000), { width: 4000, height: 3000 }, "webp", true], // WebP 16,383
      [{ ...T, flipH: true }, { width: 1170, height: 30_000 }, "png", false], // no streaming encoder
    ];
    for (const [t, source, format, stream] of cases) {
      expect(() => planTransformExport(t, source, format, stream)).toThrowError(EditorError);
      try {
        planTransformExport(t, source, format, stream);
      } catch (e) {
        expect((e as EditorError).code).toBe("EDITOR_EXPORT_TOO_LARGE");
      }
    }
  });

  it("rejects an invalid transform before touching any pixels", () => {
    expect(() => planTransformExport({ ...T, crop: { x: 0, y: 0, width: 5000, height: 10 } }, PHONE, "png", true)).toThrowError(/EDITOR_INVALID_TRANSFORM/);
  });
});
