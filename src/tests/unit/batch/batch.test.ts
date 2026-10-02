import { describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import { createBatchZip } from "@/core/archive/zip";
import { uniqueOutputNames } from "@/core/batch/naming";
import { runSequential } from "@/core/batch/runner";
import { batchFormat, batchOutputName, DEFAULT_BATCH_SETTINGS, resizeOutput, resizeTransform } from "@/core/batch/settings";
import type { BatchResult, BatchSource } from "@/core/batch/types";
import { BatchResultRegistry } from "@/core/runtime/batch-result-registry";
import { outputSize } from "@/core/image-transform/transform";

const source = (patch: Partial<BatchSource> = {}): BatchSource => ({ id: "a", name: "shot.png", type: "image/png", bytes: 100, width: 1600, height: 900, ...patch });

describe("batch resize planning", () => {
  it("resizes by width and height without changing aspect ratio", () => {
    const width = resizeOutput(source(), { ...DEFAULT_BATCH_SETTINGS.resize, mode: "width", width: 800 });
    expect(width.size).toEqual({ width: 800, height: 450 });
    const height = resizeOutput(source(), { ...DEFAULT_BATCH_SETTINGS.resize, mode: "height", height: 450 });
    expect(height.size).toEqual({ width: 800, height: 450 });
  });

  it("supports percentage and fit-within, with enlargement off by default", () => {
    expect(resizeOutput(source(), { ...DEFAULT_BATCH_SETTINGS.resize, mode: "percentage", percentage: 25 }).size).toEqual({ width: 400, height: 225 });
    expect(resizeOutput(source(), { ...DEFAULT_BATCH_SETTINGS.resize, mode: "fit", fitWidth: 1000, fitHeight: 1000 }).size).toEqual({ width: 1000, height: 563 });
    const small = source({ width: 200, height: 100 });
    expect(outputSize(resizeTransform(small, { ...DEFAULT_BATCH_SETTINGS.resize, mode: "fit", fitWidth: 1000, fitHeight: 1000 }), small)).toEqual({ width: 200, height: 100 });
    expect(resizeOutput(small, { ...DEFAULT_BATCH_SETTINGS.resize, mode: "fit", fitWidth: 1000, fitHeight: 1000, allowEnlarge: true }).size).toEqual({ width: 1000, height: 500 });
  });

  it("maps output formats and names without changing source dimensions for encode jobs", () => {
    expect(batchFormat("compress", source(), DEFAULT_BATCH_SETTINGS)).toBe("png");
    expect(batchFormat("convert", source(), DEFAULT_BATCH_SETTINGS)).toBe("webp");
    expect(batchOutputName("compress", "screen.png", "webp")).toBe("compressed-screen.webp");
    expect(batchOutputName("convert", "screen.png", "jpeg")).toBe("screen.jpg");
    expect(batchOutputName("resize", "screen.png", "png")).toBe("resized-screen.png");
    expect(batchOutputName("privacy", "screen.jpg", "jpeg")).toBe("privacy-clean-screen.jpg");
  });
});

describe("sequential runner", () => {
  it("never runs more than one full-resolution job at once and preserves order", async () => {
    let active = 0;
    let peak = 0;
    const seen: string[] = [];
    const result = await runSequential(["a", "b", "c"], async (id) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      seen.push(id);
      active--;
      return id;
    }, { aborted: false });
    expect(result).toEqual({ completed: 3, failed: 0, cancelled: 0 });
    expect(peak).toBe(1);
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("isolates a failure and continues with later files", async () => {
    const success: string[] = [];
    const failed: string[] = [];
    const result = await runSequential(["a", "bad", "c"], async (id) => {
      if (id === "bad") throw Object.assign(new Error("bad"), { code: "BAD_FILE" });
      return id;
    }, { aborted: false }, { success: (id) => success.push(id), failure: (id) => failed.push(id) });
    expect(result).toEqual({ completed: 2, failed: 1, cancelled: 0 });
    expect(success).toEqual(["a", "c"]);
    expect(failed).toEqual(["bad"]);
  });

  it("stops before the next file and marks the remainder cancelled", async () => {
    const signal = { aborted: false };
    const cancelled: string[] = [];
    const result = await runSequential(["a", "b", "c"], async (id) => { if (id === "a") signal.aborted = true; return id; }, signal, { cancelled: (id) => cancelled.push(id) });
    expect(result).toEqual({ completed: 0, failed: 0, cancelled: 3 });
    expect(cancelled).toEqual(["a", "b", "c"]);
  });
});

describe("batch result registry and ZIP", () => {
  const result = (id: string, name: string, bytes: number[]): BatchResult => ({ id, sourceId: id, sourceName: name, outputName: name, blob: new Blob([new Uint8Array(bytes)], { type: "image/png" }), bytes: bytes.length, originalBytes: bytes.length, type: "image/png", format: "png", width: 1, height: 1, operation: "convert" });

  it("resolves duplicate names deterministically", () => {
    expect(uniqueOutputNames(["image.png", "IMAGE.png", "image.png", "other"])).toEqual(["image.png", "IMAGE-2.png", "image-3.png", "other"]);
  });

  it("owns object URLs and releases them on reset", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const registry = new BatchResultRegistry();
    registry.put(result("1", "a.png", [1]));
    expect(registry.objectUrl("1")).toBe("blob:test");
    expect(registry.objectUrl("1")).toBe("blob:test");
    registry.clear();
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:test");
    expect(registry.stats()).toEqual({ results: 0, urls: 0, bytes: 0 });
    create.mockRestore(); revoke.mockRestore();
  });

  it("creates a valid ZIP containing only supplied successful outputs with exact bytes", async () => {
    const { blob, names } = await createBatchZip([result("1", "same.png", [1, 2, 3]), result("2", "same.png", [4, 5])]);
    expect(names).toEqual(["same.png", "same-2.png"]);
    const extracted = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(extracted)).toEqual(names);
    expect([...extracted["same.png"]]).toEqual([1, 2, 3]);
    expect([...extracted["same-2.png"]]).toEqual([4, 5]);
  });
});
