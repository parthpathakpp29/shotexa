import { describe, expect, it } from "vitest";
import { beautifyLayout } from "@/core/beautify/layout";
import { DEFAULT_BEAUTIFY } from "@/core/beautify/presets";
import { watermarkCoverage, watermarkGeometry } from "@/core/beautify/watermark";
import type { WatermarkLayer } from "@/core/beautify/types";

describe("watermark output geometry", () => {
  it("keeps relative image placement and size when export resolution doubles", () => {
    const layer: WatermarkLayer = { id: "logo", kind: "image", text: "", assetId: "logo", x: 34, y: 71, size: 18, rotation: -20, opacity: 64, color: "#ffffff", font: "system", letterSpacing: 0, tiled: false, tileGap: 20 };
    const source = { width: 800, height: 500 };
    const one = beautifyLayout({ ...DEFAULT_BEAUTIFY, watermarks: [layer] }, source);
    const two = beautifyLayout({ ...DEFAULT_BEAUTIFY, exportScale: 2, watermarks: [layer] }, source);
    const resource = { id: "logo", image: {} as CanvasImageSource, imageScale: 1, source: { width: 100, height: 40 } };
    const a = watermarkGeometry({} as CanvasRenderingContext2D, one, layer, resource);
    const b = watermarkGeometry({} as CanvasRenderingContext2D, two, layer, resource);
    expect(b).toEqual({ x: a.x * 2, y: a.y * 2, width: a.width * 2, height: a.height * 2 });
  });

  it("clips new screenshot patterns to image pixels and keeps legacy patterns on the canvas", () => {
    const layout = beautifyLayout(DEFAULT_BEAUTIFY, { width: 800, height: 500 });
    const layer: WatermarkLayer = { id: "text", kind: "text", text: "BRAND", assetId: null, x: 50, y: 50, size: 7, rotation: -18, opacity: 18, color: "#343b50", font: "system", letterSpacing: 0, tiled: true, tileScope: "screenshot", tileGap: 28 };
    expect(watermarkCoverage(layout, layer)).toEqual(layout.image);
    expect(watermarkCoverage(layout, { ...layer, tileScope: undefined })).toEqual({ x: 0, y: 0, width: layout.canvas.width, height: layout.canvas.height });
    const scaled = beautifyLayout({ ...DEFAULT_BEAUTIFY, exportScale: 2 }, { width: 800, height: 500 });
    const a = watermarkCoverage(layout, layer);
    const b = watermarkCoverage(scaled, layer);
    expect(b).toEqual({ x: a.x * 2, y: a.y * 2, width: a.width * 2, height: a.height * 2 });
  });
});
