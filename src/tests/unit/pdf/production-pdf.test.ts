import { describe, expect, it } from "vitest";
import { PdfAnalysisRegistry } from "@/core/runtime/pdf-analysis-registry";
import type { RowSignals } from "@/core/pdf/signals";

const signals = (): RowSignals => ({
  rows: 2,
  scaleY: 0.5,
  background: 255,
  content: new Float32Array([0, 1]),
  edges: new Float32Array([0, 1]),
  transition: new Float32Array([0, 1]),
  clearUp: new Int32Array([1, 0]),
  clearDown: new Int32Array([1, 0]),
});

describe("production PDF analysis storage", () => {
  it("keeps row signals in an opaque runtime registry and releases them per asset", () => {
    const registry = new PdfAnalysisRegistry();
    registry.put("asset-a", { width: 1080, height: 5000, signals: signals(), safeYs: [1500] });
    expect(registry.hasSignals("asset-a")).toBe(true);
    expect(registry.get("asset-a")?.safeYs).toEqual([1500]);
    expect(registry.stats()).toEqual({ analyses: 1 });
    registry.remove("asset-a");
    expect(registry.stats()).toEqual({ analyses: 0 });
  });

  it("distinguishes a dimensions-only normal-PDF entry from Smart Pagination signals", () => {
    const registry = new PdfAnalysisRegistry();
    registry.put("asset-a", { width: 1080, height: 1920, safeYs: [] });
    expect(registry.hasSignals("asset-a")).toBe(false);
    registry.clear();
    expect(registry.stats().analyses).toBe(0);
  });
});
