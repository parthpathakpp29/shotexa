import { describe, expect, it } from "vitest";
import { beautifyLayout } from "@/core/beautify/layout";
import { DEFAULT_BEAUTIFY } from "@/core/beautify/presets";
import { STUDIO_ART } from "@/core/beautify/studio-art";
import { resolveStudioTemplate, STUDIO_BACKGROUNDS, STUDIO_TEMPLATES } from "@/core/beautify/studio-library";

describe("premium Beautifier studio", () => {
  it("keeps the curated vector art registry complete and distinct", () => {
    const ids = STUDIO_ART.map((entry) => entry.id);
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STUDIO_BACKGROUNDS.map((entry) => entry.id)).toEqual(ids);
    expect(new Set(STUDIO_ART.map((entry) => entry.motif)).size).toBe(18);
  });

  it("frames a landscape dashboard prominently without cropping its source", () => {
    const template = STUDIO_TEMPLATES.find((entry) => entry.id === "orbit-launch")!;
    const settings = { ...DEFAULT_BEAUTIFY, ...resolveStudioTemplate(template, DEFAULT_BEAUTIFY, { width: 1440, height: 900 }) };
    const layout = beautifyLayout(settings, { width: 1440, height: 900 });
    expect(layout.content.width / layout.canvas.width).toBeGreaterThan(0.7);
    expect(layout.content.height / layout.canvas.height).toBeGreaterThan(0.8);
    expect(layout.sourceRect).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  });

  it("adapts the device template to wide screenshots and contains tall mobile screens", () => {
    const template = STUDIO_TEMPLATES.find((entry) => entry.id === "frosted-app")!;
    const wide = resolveStudioTemplate(template, DEFAULT_BEAUTIFY, { width: 1440, height: 900 });
    expect(wide.mode).toBe("minimal-browser");
    const mobile = resolveStudioTemplate(template, DEFAULT_BEAUTIFY, { width: 390, height: 844 });
    expect(mobile.mode).toBe("phone");
    expect(mobile.phone?.fit).toBe("contain");
    const layout = beautifyLayout({ ...DEFAULT_BEAUTIFY, ...mobile }, { width: 390, height: 844 });
    expect(layout.sourceRect).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  });

  it("preserves user copy and editable workspace content when applying a design", () => {
    const template = STUDIO_TEMPLATES.find((entry) => entry.id === "copper-editorial")!;
    const current = { ...DEFAULT_BEAUTIFY, text: { ...DEFAULT_BEAUTIFY.text, title: "My launch" }, branding: { ...DEFAULT_BEAUTIFY.branding, assetId: "logo" }, composition: { ...DEFAULT_BEAUTIFY.composition, assetIds: ["second"] } };
    const patch = resolveStudioTemplate(template, current, { width: 1440, height: 900 });
    const next = { ...current, ...patch };
    expect(next.text.title).toBe("My launch");
    expect(next.branding.assetId).toBe("logo");
    expect(next.composition.assetIds).toEqual(["second"]);
  });
});
