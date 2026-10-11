import { describe, expect, it } from "vitest";
import { ANIMATION_PRESETS } from "@/core/beautify/animation";
import { autoDesignFromPixels, averagePixelLuminance } from "@/core/beautify/auto-design";
import { backgroundFromPixels } from "@/core/beautify/auto-background";
import { beautifyLayout, beautifySize, clampSettings } from "@/core/beautify/layout";
import { multiImageLayout } from "@/core/beautify/multi-layout";
import { perspectiveForPreset, projectPerspective } from "@/core/beautify/perspective";
import { BACKGROUND_PRESETS, DEFAULT_BEAUTIFY, OUTPUT_PRESETS, STYLE_PRESETS } from "@/core/beautify/presets";
import { planBeautifyExport } from "@/core/beautify/render";

const source = { width: 1440, height: 900 };

describe("Beautifier V2.0A perspective", () => {
  it("keeps flat geometry pixel-identical", () => {
    const rect = { x: 20, y: 30, width: 800, height: 500 };
    const projected = projectPerspective(rect, perspectiveForPreset("flat"));
    expect(projected.active).toBe(false);
    expect(projected.bounds).toEqual(rect);
    expect(projected.quad).toEqual([{ x: 20, y: 30 }, { x: 820, y: 30 }, { x: 820, y: 530 }, { x: 20, y: 530 }]);
  });

  it("projects left and right presets in opposite directions", () => {
    const rect = { x: 0, y: 0, width: 1000, height: 600 };
    const left = projectPerspective(rect, perspectiveForPreset("perspective-left"));
    const right = projectPerspective(rect, perspectiveForPreset("perspective-right"));
    expect(left.active).toBe(true);
    expect(right.active).toBe(true);
    expect(left.quad[0].x).not.toBe(left.quad[3].x);
    expect(Math.sign(left.quad[0].x - left.quad[3].x)).toBe(-Math.sign(right.quad[1].x - right.quad[2].x));
  });

  it("exposes all eight quick presets", () => {
    const ids = ["flat", "tilt-left", "tilt-right", "perspective-left", "perspective-right", "floating", "isometric-left", "isometric-right"] as const;
    expect(ids.map((id) => perspectiveForPreset(id).preset)).toEqual(ids);
  });
});

describe("Beautifier V2.0A backgrounds and Auto Design", () => {
  it("keeps the curated background library intentionally bounded", () => {
    expect(BACKGROUND_PRESETS.length).toBeGreaterThanOrEqual(13);
    expect(BACKGROUND_PRESETS.length).toBeLessThan(30);
    expect(BACKGROUND_PRESETS.map((preset) => preset.label)).toContain("Warm Sunset");
    expect(BACKGROUND_PRESETS.map((preset) => preset.label)).toContain("Minimal Gray");
  });

  it("generates related local colours from pixels", () => {
    expect(backgroundFromPixels(new Uint8ClampedArray([250, 40, 20, 255, 230, 60, 30, 255]))).toEqual(expect.objectContaining({ color: expect.stringMatching(/^#[0-9a-f]{6}$/), color2: expect.stringMatching(/^#[0-9a-f]{6}$/) }));
  });

  it("detects dark screenshots and chooses readable styling", () => {
    const pixels = new Uint8ClampedArray(Array.from({ length: 64 }, (_, index) => index % 4 === 3 ? 255 : 12));
    const decision = autoDesignFromPixels(DEFAULT_BEAUTIFY, source, pixels);
    expect(averagePixelLuminance(pixels)).toBeLessThan(0.01);
    expect(decision.screenshotIsDark).toBe(true);
    expect(decision.settings.text.color).toBe("#ffffff");
    expect(decision.settings.background.kind).toBe("mesh");
    expect(decision.settings.shadow).toBe("ambient");
  });

  it("chooses dark text for a light screenshot", () => {
    const pixels = new Uint8ClampedArray(Array.from({ length: 64 }, (_, index) => index % 4 === 3 ? 255 : 245));
    const decision = autoDesignFromPixels(DEFAULT_BEAUTIFY, source, pixels);
    expect(decision.screenshotIsDark).toBe(false);
    expect(decision.settings.text.color).toBe("#111827");
  });
});

describe("Beautifier V2.0A recipes, canvas and export", () => {
  it("keeps existing recipes and adds the premium set as editable settings", () => {
    const ids = STYLE_PRESETS.map((recipe) => recipe.id);
    expect(ids).toEqual(expect.arrayContaining(["clean", "launch", "developer", "product-launch", "saas-hero", "3d-tilt", "device-showcase", "before-after", "feature-announcement"]));
    expect(STYLE_PRESETS.find((recipe) => recipe.id === "3d-tilt")?.settings.perspective?.preset).toBe("isometric-right");
  });

  it("includes named social output sizes", () => {
    expect(OUTPUT_PRESETS.map((preset) => preset.value)).toEqual(expect.arrayContaining(["2:1", "x-post", "linkedin-post", "youtube-thumbnail", "open-graph", "product-hunt"]));
    expect(beautifySize({ ...DEFAULT_BEAUTIFY, preset: "youtube-thumbnail" }, source)).toEqual({ width: 1280, height: 720 });
  });

  it("supports safe 3x output scaling", () => {
    const settings = { ...DEFAULT_BEAUTIFY, preset: "open-graph" as const, exportScale: 3 as const };
    expect(beautifySize(settings, source)).toEqual({ width: 3600, height: 1890 });
    expect(clampSettings(settings).exportScale).toBe(3);
  });

  it("retains export validation for transformed output", () => {
    const settings = { ...DEFAULT_BEAUTIFY, perspective: perspectiveForPreset("isometric-left") };
    const layout = beautifyLayout(settings, source);
    const plan = planBeautifyExport(layout, source, "png", true);
    expect(plan.out).toEqual(layout.canvas);
    expect(["single-canvas", "tiled-png"]).toContain(plan.strategy);
  });
});

describe("Beautifier V2.0A multi-image and animation configuration", () => {
  const container = { x: 0, y: 0, width: 1200, height: 700 };
  const sources = [{ width: 1200, height: 800 }, { width: 900, height: 1200 }, { width: 1000, height: 700 }];

  it.each(["side-by-side", "stacked", "fan", "three-column", "overlap"] as const)("calculates bounded %s placements", (mode) => {
    const placements = multiImageLayout(container, sources, mode, 6);
    expect(placements).toHaveLength(mode === "side-by-side" || mode === "stacked" ? 2 : 3);
    placements.forEach(({ rect }) => {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(Number.isFinite(rect.x + rect.y)).toBe(true);
    });
  });

  it("keeps animation presets controlled and export-independent", () => {
    expect(Object.keys(ANIMATION_PRESETS)).toEqual(["none", "fade-in", "slide-up", "zoom-in", "float", "slow-pan", "parallax", "tilt", "rotate-3d", "orbit"]);
    expect(ANIMATION_PRESETS.float.loop).toBe(true);
    expect(ANIMATION_PRESETS["fade-in"].loop).toBe(false);
  });
});

