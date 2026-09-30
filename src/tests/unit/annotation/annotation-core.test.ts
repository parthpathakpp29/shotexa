import { describe, expect, it } from "vitest";
import { renderAnnotated } from "@/core/annotation/export";
import { annotationFrame, arrowGeometry, bounds, clampMove, handlesFor, hitTest, moveBy, resizeBox, setEndpoint, textBox, toOutput, toSource } from "@/core/annotation/geometry";
import { addObject, autoSizes, bringToFront, DragSession, MAX_PATH_POINTS, nextStepNumber, removeObject, renumberSteps, simplifyPath, stepsNeedRenumber, updateObject } from "@/core/annotation/objects";
import { contrastOn, drawAnnotations } from "@/core/annotation/render";
import type { AnnotationObject, ArrowAnnotation, FreehandAnnotation, StepAnnotation, TextAnnotation } from "@/core/annotation/types";
import { toOriented } from "@/core/image-transform/orientation";
import { flipTransform, IDENTITY_TRANSFORM, rotateTransform, withLockAspect, withOutputHeight, withOutputWidth, withVisibleCrop } from "@/core/image-transform/transform";
import type { ImageTransform, Point, Size } from "@/core/image-transform/types";

const S: Size = { width: 100, height: 60 };
const T = IDENTITY_TRANSFORM;
const P: Point = { x: 10, y: 20 };

const arrow = (from = P, to: Point = { x: 50, y: 20 }, width = 4): ArrowAnnotation => ({ id: "a1", type: "arrow", color: "#e5383b", from, to, width });
const step = (id: string, n: number, at: Point = P): StepAnnotation => ({ id, type: "step", color: "#e5383b", at, n, radius: 10 });
const out = (o: AnnotationObject, t: ImageTransform) => toOutput(o, annotationFrame(t, S));
const close = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe("critical: annotations stay on the same image content under every editor transform", () => {
  it("follows a 90° rotation (hand-computed and against the editor's own point formula)", () => {
    const turned = rotateTransform(T, "cw");
    const a = out(arrow(), turned) as ArrowAnnotation;
    close(a.from, { x: 40, y: 10 }); // (H − y, x)
    close(a.from, toOriented(P, S, turned));
    close(a.to, toOriented({ x: 50, y: 20 }, S, turned));
  });

  it("an annotation drawn AFTER a rotation stays on that content when the rotation is undone", () => {
    const turned = rotateTransform(T, "cw");
    const drawnOnScreen: ArrowAnnotation = { ...arrow(), from: { x: 40, y: 10 }, to: { x: 40, y: 50 } };
    const stored = toSource(drawnOnScreen, annotationFrame(turned, S)) as ArrowAnnotation;
    close(stored.from, P);
    // Undo the rotation: it must sit on exactly the same source pixels, unrotated.
    close((out(stored, T) as ArrowAnnotation).from, P);
    close((out(stored, T) as ArrowAnnotation).to, { x: 50, y: 20 });
  });

  it("follows a crop", () => {
    const cropped = withVisibleCrop(T, S, { x: 5, y: 10, width: 50, height: 30 });
    close((out(arrow(), cropped) as ArrowAnnotation).from, { x: 5, y: 10 });
  });

  it("follows horizontal and vertical flips", () => {
    close((out(arrow(), flipTransform(T, "horizontal")) as ArrowAnnotation).from, { x: 90, y: 20 });
    close((out(arrow(), flipTransform(T, "vertical")) as ArrowAnnotation).from, { x: 10, y: 40 });
  });

  it("scales position AND stroke with a resize", () => {
    const half = withOutputWidth(T, S, 50);
    const a = out(arrow(), half) as ArrowAnnotation;
    close(a.from, { x: 5, y: 10 });
    expect(a.width).toBeCloseTo(2);
  });

  it("combines crop + rotation exactly like the image", () => {
    const t = rotateTransform(withVisibleCrop(T, S, { x: 5, y: 10, width: 50, height: 30 }), "cw");
    // Crop-local (5,10) in a 50×30 crop, turned clockwise: (30 − 10, 5).
    close((out(arrow(), t) as ArrowAnnotation).from, { x: 20, y: 5 });
  });

  it("uses the same matrix the image is drawn with, for every orientation and crop", () => {
    const transforms: ImageTransform[] = [T, rotateTransform(T, "cw"), rotateTransform(T, "ccw"), flipTransform(T, "horizontal"), flipTransform(rotateTransform(T, "cw"), "vertical")];
    for (const t of transforms) {
      for (const p of [{ x: 0, y: 0 }, { x: 13, y: 7 }, { x: 100, y: 60 }]) close((out(arrow(p, p), t) as ArrowAnnotation).from, toOriented(p, S, t));
    }
  });

  it("round-trips every type through storage exactly", () => {
    const objects: AnnotationObject[] = [
      arrow(),
      { id: "r", type: "rectangle", color: "#000", rect: { x: 10, y: 5, width: 30, height: 20 }, width: 3 },
      { id: "h", type: "highlight", color: "#ffe14d", rect: { x: 1, y: 2, width: 40, height: 9 }, opacity: 0.5 },
      { id: "t", type: "text", color: "#000", at: { x: 12, y: 30 }, text: "Hi", size: 18 },
      { id: "f", type: "freehand", color: "#000", points: [{ x: 1, y: 1 }, { x: 9, y: 4 }, { x: 20, y: 30 }], width: 5 },
      step("s", 3),
    ];
    const transforms = [T, rotateTransform(T, "cw"), flipTransform(T, "vertical"), withOutputHeight(withLockAspect(T, false), S, 30)];
    for (const t of transforms) {
      const f = annotationFrame(t, S);
      for (const o of objects) {
        const back = toSource(toOutput(o, f), f);
        expect(JSON.parse(JSON.stringify(back), (_, v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v))).toEqual(o);
      }
    }
  });

  it("keeps text and step numbers upright: only their anchor moves, the glyph size scales", () => {
    const text: TextAnnotation = { id: "t", type: "text", color: "#000", at: P, text: "Label", size: 20 };
    const t = withOutputWidth(rotateTransform(T, "cw"), S, 30); // rotated, then half size
    const projected = out(text, t) as TextAnnotation;
    expect(projected.size).toBeCloseTo(10);
    expect(Object.keys(projected).sort()).toEqual(Object.keys(text).sort()); // no rotation field to draw sideways
    close(projected.at, { x: 20, y: 5 });
  });
});

describe("arrow geometry", () => {
  it("sizes the head to the stroke and stops the shaft at its base", () => {
    const g = arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    close(g.head[0], { x: 100, y: 0 });
    close(g.shaftEnd, { x: 86.4, y: 0 });
    expect(Math.abs(g.head[1].y - g.head[2].y)).toBeCloseTo(13.6 * 0.58 * 2);
  });

  it("never lets the head overshoot a very short arrow", () => {
    const g = arrowGeometry({ x: 0, y: 0 }, { x: 10, y: 0 }, 6);
    expect(g.shaftEnd.x).toBeCloseTo(2); // head is 80% of the length
  });
});

describe("editing in output pixels", () => {
  const box: AnnotationObject = { id: "r", type: "rectangle", color: "#000", rect: { x: 10, y: 10, width: 20, height: 10 }, width: 4 };

  it("includes stroke thickness in rectangle bounds", () => {
    expect(bounds(box)).toEqual({ x: 8, y: 8, width: 24, height: 14 });
  });

  it("hit-tests topmost first, with tolerance for thin strokes", () => {
    const list: AnnotationObject[] = [box, { ...arrow({ x: 0, y: 15 }, { x: 60, y: 15 }), id: "top" }];
    expect(hitTest(list, { x: 20, y: 15 }, 2)).toBe("top");
    expect(hitTest(list, { x: 20, y: 10 }, 2)).toBe("r"); // 5 px from the arrow: past its 2+2 px grab

    expect(hitTest(list, { x: 90, y: 50 }, 2)).toBeNull();
    expect(hitTest([arrow()], { x: 30, y: 25 }, 2)).toBeNull(); // 5 px from a 4 px line
    expect(hitTest([arrow()], { x: 30, y: 23 }, 2)).toBe("a1");
  });

  it("moves every point of every type", () => {
    expect((moveBy(arrow(), 5, -2) as ArrowAnnotation).to).toEqual({ x: 55, y: 18 });
    expect((moveBy(box, 1, 2) as { rect: object }).rect).toEqual({ x: 11, y: 12, width: 20, height: 10 });
    const free = moveBy({ id: "f", type: "freehand", color: "#000", points: [{ x: 1, y: 1 }], width: 2 }, 3, 3) as FreehandAnnotation;
    expect(free.points).toEqual([{ x: 4, y: 4 }]);
  });

  it("keeps a moved object partly on the image so it can always be selected again", () => {
    const d = clampMove(box, -500, 500, S);
    const moved = bounds(moveBy(box, d.x, d.y));
    expect(moved.x + moved.width).toBeGreaterThan(0);
    expect(moved.y).toBeLessThan(S.height);
  });

  it("resizes boxes with the Screenshot Editor's crop-handle maths, inside the image", () => {
    expect(resizeBox({ x: 10, y: 10, width: 20, height: 10 }, "se", { x: 60, y: 40 }, S)).toEqual({ x: 10, y: 10, width: 50, height: 30 });
    expect(resizeBox({ x: 10, y: 10, width: 20, height: 10 }, "se", { x: 999, y: 999 }, S)).toEqual({ x: 10, y: 10, width: 90, height: 50 });
  });

  it("moves arrow endpoints independently, and offers the right handles", () => {
    expect(setEndpoint(arrow(), "to", { x: 1, y: 2 }).to).toEqual({ x: 1, y: 2 });
    expect(handlesFor(arrow()).map((h) => h.id)).toEqual(["from", "to"]);
    expect(handlesFor(box)).toHaveLength(8);
    expect(handlesFor(step("s", 1))).toHaveLength(0);
  });

  it("measures multi-line text boxes", () => {
    const t: TextAnnotation = { id: "t", type: "text", color: "#000", at: { x: 0, y: 0 }, text: "ab\nabcd", size: 10 };
    expect(textBox(t, (line) => line.length * 5)).toEqual({ x: 0, y: 0, width: 20, height: 25 });
  });
});

describe("list edits and step numbering", () => {
  it("adds, updates, removes and brings to front", () => {
    let list: AnnotationObject[] = [];
    list = addObject(list, arrow());
    list = addObject(list, step("s1", 1));
    list = updateObject(list, { ...arrow(), color: "#000000" });
    expect(list[0].color).toBe("#000000");
    expect(bringToFront(list, "a1").map((o) => o.id)).toEqual(["s1", "a1"]);
    expect(removeObject(list, "a1").map((o) => o.id)).toEqual(["s1"]);
  });

  it("numbers new markers after the highest, never silently renumbering existing ones", () => {
    let list: AnnotationObject[] = [step("s1", 1), step("s2", 2), step("s3", 3)];
    expect(nextStepNumber([])).toBe(1);
    expect(nextStepNumber(list)).toBe(4);
    list = removeObject(list, "s2");
    expect(list.map((o) => (o as StepAnnotation).n)).toEqual([1, 3]); // untouched
    expect(stepsNeedRenumber(list)).toBe(true);
    expect(nextStepNumber(list)).toBe(4);
  });

  it("renumbers on request to 1…N in current order", () => {
    const list: AnnotationObject[] = [step("x", 5), arrow(), step("y", 2), step("z", 5)];
    const renumbered = renumberSteps(list);
    expect(renumbered.filter((o) => o.type === "step").map((o) => [(o as StepAnnotation).id, (o as StepAnnotation).n])).toEqual([
      ["x", 2],
      ["y", 1],
      ["z", 3],
    ]);
    expect(stepsNeedRenumber(renumbered)).toBe(false);
    expect(renumbered[1]).toEqual(list[1]); // other objects untouched
  });
});

describe("freehand paths", () => {
  it("stores a straight stroke as two points, not hundreds", () => {
    const line = Array.from({ length: 1000 }, (_, i) => ({ x: i / 10, y: i / 20 }));
    expect(simplifyPath(line)).toEqual([line[0], { x: 99.9, y: 49.95 }].map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })));
  });

  it("keeps a curve within a pixel of the original", () => {
    const circle = Array.from({ length: 720 }, (_, i) => ({ x: 50 + 40 * Math.cos((i / 720) * Math.PI * 2), y: 50 + 40 * Math.sin((i / 720) * Math.PI * 2) }));
    const simple = simplifyPath(circle);
    expect(simple.length).toBeLessThan(120);
    for (const p of circle) {
      const nearest = Math.min(...simple.map((q, i) => (i ? Math.hypot(p.x - q.x, p.y - q.y) : Infinity)));
      expect(nearest).toBeLessThan(12); // every original point sits near the simplified path's vertices
    }
  });

  it("caps an enormous scribble, quickly", () => {
    const noisy = Array.from({ length: 20_000 }, (_, i) => ({ x: i * 0.3, y: (i % 2) * 5 }));
    const started = performance.now();
    expect(simplifyPath(noisy).length).toBeLessThanOrEqual(MAX_PATH_POINTS);
    // A pathological input must not freeze the page (it took ~70 s before the input cap).
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it("drops repeated samples from a stationary pointer", () => {
    expect(simplifyPath([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("critical: a fast drag commits the latest pointer position", () => {
  it("returns the last update even if no render happened in between", () => {
    const drag = new DragSession<Point>();
    drag.begin({ x: 0, y: 0 });
    for (let i = 1; i <= 50; i++) drag.update({ x: i, y: i }); // a burst of moves, no renders
    expect(drag.commit()).toEqual({ x: 50, y: 50 });
  });

  it("commits once, and ignores moves when no gesture is active", () => {
    const drag = new DragSession<number>();
    drag.update(9);
    expect(drag.commit()).toBeNull();
    drag.begin(1);
    drag.update(2);
    expect(drag.commit()).toBe(2);
    expect(drag.commit()).toBeNull();
    drag.begin(1);
    drag.cancel();
    expect(drag.commit()).toBeNull();
  });
});

describe("critical: preview and export draw at the same place", () => {
  function recorder() {
    const calls: [string, number[]][] = [];
    const record = (name: string) => (...args: unknown[]) => calls.push([name, args.filter((a) => typeof a === "number") as number[]]);
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key: string) => (key in target ? target[key] : record(key)),
      set: (target, key: string, value) => ((target[key] = value), true),
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }

  it("export draws output coordinates 1:1; the preview only adds its display scale", () => {
    const o = out(arrow(), rotateTransform(T, "cw"));
    const exp = recorder();
    drawAnnotations(exp.ctx, [o], 1, 0);
    const prev = recorder();
    drawAnnotations(prev.ctx, [o], 0.25, 0);
    // Identical geometry calls; only the canvas transform differs by the display scale.
    const geometry = (calls: [string, number[]][]) => calls.filter(([n]) => n === "moveTo" || n === "lineTo");
    expect(geometry(prev.calls)).toEqual(geometry(exp.calls));
    expect(exp.calls.find(([n]) => n === "setTransform")![1]).toEqual([1, 0, 0, 1, 0, -0]);
    expect(prev.calls.find(([n]) => n === "setTransform")![1]).toEqual([0.25, 0, 0, 0.25, 0, -0]);
    expect(geometry(exp.calls)[0][1]).toEqual([40, 10]); // the rotated start point
  });

  it("offsets tiles by their first row so a mark spanning tiles joins up", () => {
    const tile = recorder();
    drawAnnotations(tile.ctx, [arrow()], 1, 2048);
    expect(tile.calls.find(([n]) => n === "setTransform")![1]).toEqual([1, 0, 0, 1, 0, -2048]);
  });

  it("refuses to export with nothing to flatten", async () => {
    await expect(renderAnnotated(new Blob(), T, [], { source: S, format: "png" })).rejects.toMatchObject({ code: "ANNOTATION_EMPTY" });
  });
});

describe("defaults and contrast", () => {
  it("sizes strokes, text and markers in proportion to the image", () => {
    expect(autoSizes({ width: 1170, height: 2532 })).toEqual({ stroke: 6, font: 45, radius: 31 });
    const big = autoSizes({ width: 3840, height: 2160 });
    expect(big.stroke).toBeGreaterThan(6);
    expect(autoSizes({ width: 200, height: 100 }).stroke).toBe(3); // never hairline
  });

  it("puts a readable halo/number colour on any fill", () => {
    expect(contrastOn("#ffe14d")).toBe("#1c1714");
    expect(contrastOn("#1c1714")).toBe("#ffffff");
    expect(contrastOn("#e5383b")).toBe("#ffffff");
  });
});
