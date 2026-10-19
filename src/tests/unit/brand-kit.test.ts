import { describe, expect, it } from "vitest";
import { captureBrandSettings, restoreBrandSettings } from "@/core/brand-kit/storage";
import { DEFAULT_BEAUTIFY } from "@/core/beautify/presets";

describe("Brand Kit session asset mapping", () => {
  it("saves selected logos without persisting screenshot compositions", () => {
    const logo = new Blob(["logo"], { type: "image/png" });
    const settings = { ...DEFAULT_BEAUTIFY, composition: { ...DEFAULT_BEAUTIFY.composition, layout: "side-by-side" as const, assetIds: ["screenshot-2"] }, branding: { ...DEFAULT_BEAUTIFY.branding, assetId: "logo-1" }, watermarks: [{ id: "w", kind: "image" as const, text: "", assetId: "logo-1", x: 30, y: 40, size: 15, rotation: 20, opacity: 60, color: "#ffffff", font: "system" as const, letterSpacing: 0, tiled: true, tileGap: 20 }] };
    const captured = captureBrandSettings(settings, (id) => id === "logo-1" ? logo : undefined, () => "logo.png");
    expect(captured.assets).toHaveLength(1);
    expect(captured.settings.composition.assetIds).toEqual([]);
    expect(captured.settings.branding.assetId).toBe("kit-asset-0");
    expect(captured.settings.watermarks?.[0].assetId).toBe("kit-asset-0");
    const restored = restoreBrandSettings(captured.settings, { "kit-asset-0": "new-session-id" });
    expect(restored.branding.assetId).toBe("new-session-id");
    expect(restored.watermarks?.[0].assetId).toBe("new-session-id");
  });

  it("refuses to silently save missing brand images", () => {
    expect(() => captureBrandSettings({ ...DEFAULT_BEAUTIFY, branding: { ...DEFAULT_BEAUTIFY.branding, assetId: "missing" } }, () => undefined, () => undefined)).toThrow(/unavailable/);
  });
});
