import { describe, expect, it } from "vitest";
import { applyMaskAlpha, applyStroke, blurMask, maskBounds, refineMask } from "@/core/background-removal/mask";
import { BackgroundMaskRegistry } from "@/core/background-removal/registry";
import { backgroundIsOpaque, removalOutputPlan, renderRemovedBackground, validateRemovalFormat } from "@/core/background-removal/render";
import { DEFAULT_BACKGROUND_REMOVAL, EDGE_PRESETS, type MaskStroke, type SegmentationResult } from "@/core/background-removal/types";
import { batchFormat, batchOutputName, DEFAULT_BATCH_SETTINGS } from "@/core/batch/settings";
import { PRODUCT_SCREENSHOT_RECIPE } from "@/core/workflows/recipes";
import { SUPPORTED_WORKFLOW_ACTIONS } from "@/core/workflows/validate";

const result = (mask: number[], width: number, height: number): SegmentationResult => ({ mask: Uint8ClampedArray.from(mask), width, height, provider: "wasm", model: "u2netp", modelBytes: 4_574_861, modelLoadMs: 5, inferenceMs: 8, sessionReused: false });
const stroke = (patch: Partial<MaskStroke> = {}): MaskStroke => ({ id: "s1", mode: "restore", size: 2, hardness: 1, points: [{ x: .5, y: .5 }], ...patch });

describe("background removal mask", () => {
  it("finds subject bounds and returns null for an empty mask", () => {
    expect(maskBounds(Uint8ClampedArray.from([0, 0, 0, 0]), 2, 2)).toBeNull();
    expect(maskBounds(Uint8ClampedArray.from([0, 9, 0, 255, 255, 0]), 3, 2)).toEqual({ x: 0, y: 0, width: 2, height: 2 });
  });

  it("multiplies existing alpha without changing colour channels", () => {
    const pixels = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 128]);
    expect([...applyMaskAlpha(pixels, Uint8ClampedArray.from([128, 0]))]).toEqual([10, 20, 30, 128, 40, 50, 60, 0]);
    expect(() => applyMaskAlpha(pixels, Uint8ClampedArray.from([1]))).toThrow(RangeError);
  });

  it("restores and erases with one grouped stroke", () => {
    const mask = new Uint8ClampedArray(25);
    applyStroke(mask, 5, 5, stroke());
    expect(mask[12]).toBe(255);
    applyStroke(mask, 5, 5, stroke({ id: "s2", mode: "erase" }));
    expect(mask[12]).toBe(0);
  });

  it("feathers and expands/contracts deterministically", () => {
    const point = new Uint8ClampedArray(25); point[12] = 255;
    const blurred = blurMask(point, 5, 5, 1);
    expect(blurred[12]).toBeGreaterThan(0); expect(blurred[11]).toBeGreaterThan(0); expect(blurred[0]).toBe(0);
    const expanded = refineMask(point, 5, 5, { ...EDGE_PRESETS.crisp, shift: 1 });
    expect([...expanded].filter(Boolean).length).toBe(9);
    const block = new Uint8ClampedArray(25); for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) block[y * 5 + x] = 255;
    const contracted = refineMask(block, 5, 5, { ...EDGE_PRESETS.crisp, shift: -1 });
    expect([...contracted].filter(Boolean).length).toBe(1);
  });

  it("stores only base mask plus strokes and supports undo, redo and cleanup", () => {
    const registry = new BackgroundMaskRegistry(); registry.put("a", result([0, 0, 0, 0], 2, 2));
    expect(registry.stats()).toEqual({ entries: 1, bytes: 4, strokes: 0 });
    registry.commit("a", stroke()); expect(registry.canUndo("a")).toBe(true); expect(registry.stats().strokes).toBe(1);
    expect(registry.undo("a")).toBe(true); expect(registry.canRedo("a")).toBe(true); expect(registry.redo("a")).toBe(true);
    registry.remove("a"); expect(registry.stats()).toEqual({ entries: 0, bytes: 0, strokes: 0 });
  });
});

describe("background removal output", () => {
  it("preserves source dimensions until trim is enabled", () => {
    const mask = Uint8ClampedArray.from([0, 255, 0, 0, 255, 0]);
    expect(removalOutputPlan(mask, 3, 2, { width: 300, height: 200 }, DEFAULT_BACKGROUND_REMOVAL)).toMatchObject({ width: 300, height: 200 });
    const settings = { ...DEFAULT_BACKGROUND_REMOVAL, trim: true, subject: { ...DEFAULT_BACKGROUND_REMOVAL.subject, padding: 10 } };
    expect(removalOutputPlan(mask, 3, 2, { width: 300, height: 200 }, settings)).toMatchObject({ width: 120, height: 220, padding: 10 });
  });

  it("allows alpha in PNG/WebP and refuses transparent JPEG", () => {
    expect(validateRemovalFormat("png", { kind: "transparent" })).toEqual({ transparency: true, opaque: false });
    expect(validateRemovalFormat("webp", { kind: "transparent" })).toEqual({ transparency: true, opaque: false });
    expect(() => validateRemovalFormat("jpeg", { kind: "transparent" })).toThrowError("BACKGROUND_JPEG_NEEDS_BACKGROUND");
    expect(validateRemovalFormat("jpeg", { kind: "solid", color: "#fff" })).toEqual({ transparency: false, opaque: true });
  });

  it("trims transformed bounds without clipping a scaled or moved subject", () => {
    const settings = { ...DEFAULT_BACKGROUND_REMOVAL, trim: true, subject: { ...DEFAULT_BACKGROUND_REMOVAL.subject, scale: 2, x: 70, y: -30, padding: 10 } };
    const plan = removalOutputPlan(Uint8ClampedArray.from([0, 255, 0, 0, 255, 0]), 3, 2, { width: 300, height: 200 }, settings);
    expect(plan).toMatchObject({ width: 220, height: 420, drawX: -190, drawY: 10 });
  });

  it("treats every replacement background as opaque", () => {
    expect(backgroundIsOpaque({ kind: "transparent" })).toBe(false);
    expect(backgroundIsOpaque({ kind: "gradient", from: "#000", to: "#fff", angle: 90 })).toBe(true);
    expect(backgroundIsOpaque({ kind: "blur-original", blur: 20 })).toBe(true);
  });

  it("rejects a custom-image export when no local background image was supplied", async () => {
    await expect(renderRemovedBackground(new Blob(), {
      source: { width: 1, height: 1 },
      mask: { data: Uint8ClampedArray.from([255]), width: 1, height: 1 },
      settings: { ...DEFAULT_BACKGROUND_REMOVAL, background: { kind: "image" } },
      format: "png",
    })).rejects.toThrowError("BACKGROUND_CUSTOM_IMAGE_MISSING");
  });

  it("registers workflow and deterministic transparent batch output", () => {
    expect(SUPPORTED_WORKFLOW_ACTIONS).toContain("remove-background");
    expect(PRODUCT_SCREENSHOT_RECIPE.steps.some((step) => step.action === "remove-background" && step.optional)).toBe(true);
    const source = { id: "a", name: "hero.jpg", type: "image/jpeg" as const, bytes: 1, width: 100, height: 100 };
    expect(batchFormat("background", source, DEFAULT_BATCH_SETTINGS)).toBe("png");
    expect(batchOutputName("background", source.name, "png")).toBe("background-removed-hero.png");
  });
});
