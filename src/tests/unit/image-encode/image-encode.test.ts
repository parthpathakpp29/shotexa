/**
 * Phase 2J shared encoder — format/MIME mapping, quality handling, JPEG background flattening,
 * format limits, size comparison and honest suggestions, error mapping, settings resolution.
 * Real encoding (pixels, transparency, dimensions) is verified in the browser E2E suite.
 */
import { describe, expect, it, vi } from "vitest";
import { compareSize, suggest, SUGGESTED_QUALITY } from "@/core/image-encode/compare";
import { DEFAULT_BACKGROUND, encodeCanvas, prepareBackground } from "@/core/image-encode/encode";
import { clampQuality, encoderQuality, FORMAT_EXT, FORMAT_MIME, formatOfMime, supportsAlpha, supportsQuality, withExtension } from "@/core/image-encode/formats";
import { encodeIssue } from "@/core/image-encode/limits";
import { assertEncodable, toEncodeError } from "@/core/image-encode/reencode";
import { autoTarget, DEFAULT_ENCODE_SETTINGS, encodedName, normaliseSettings, resolveFormat } from "@/core/image-encode/settings";
import { scanAlpha } from "@/core/image-encode/alpha";
import { EncodeError } from "@/core/image-encode/types";
import { EditorError } from "@/core/image-transform/types";

describe("formats", () => {
  it("maps formats, MIME types and extensions both ways", () => {
    expect(FORMAT_MIME).toEqual({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" });
    expect(FORMAT_EXT).toEqual({ png: "png", jpeg: "jpg", webp: "webp" });
    expect(formatOfMime("image/png")).toBe("png");
    expect(formatOfMime("image/jpeg")).toBe("jpeg");
    expect(formatOfMime("image/jpg")).toBe("jpeg");
    expect(formatOfMime("image/webp")).toBe("webp");
    expect(formatOfMime("image/avif")).toBeNull(); // not supported in this phase
    expect(withExtension("shot.final.png", "jpeg")).toBe("shot.final.jpg");
    expect(withExtension("noext", "webp")).toBe("noext.webp");
  });

  it("only JPEG and WebP have a quality; only JPEG lacks transparency", () => {
    expect([supportsQuality("png"), supportsQuality("jpeg"), supportsQuality("webp")]).toEqual([false, true, true]);
    expect([supportsAlpha("png"), supportsAlpha("jpeg"), supportsAlpha("webp")]).toEqual([true, false, true]);
    expect(encoderQuality("png", 0.3)).toBeUndefined(); // never pretend PNG takes a quality
    expect(encoderQuality("jpeg", 0.8)).toBe(0.8);
    expect(encoderQuality("webp", 7)).toBe(1);
  });

  it("clamps quality to 50–100% in whole percent", () => {
    expect(clampQuality(0.1)).toBe(0.5);
    expect(clampQuality(1.4)).toBe(1);
    expect(clampQuality(0.834)).toBe(0.83);
    expect(clampQuality(Number.NaN)).toBe(0.8);
  });
});

describe("encoding helpers", () => {
  it("passes the MIME type and a quality only where it means something", async () => {
    const convertToBlob = vi.fn(async (o: { type: string; quality?: number }) => new Blob([o.type]));
    const canvas = { convertToBlob } as unknown as OffscreenCanvas;
    await encodeCanvas(canvas, "jpeg", 0.7);
    await encodeCanvas(canvas, "webp", 0.9);
    await encodeCanvas(canvas, "png", 0.7);
    expect(convertToBlob.mock.calls.map((c) => c[0])).toEqual([
      { type: "image/jpeg", quality: 0.7 },
      { type: "image/webp", quality: 0.9 },
      { type: "image/png", quality: undefined },
    ]);
  });

  it("paints the chosen background under JPEG, and keeps PNG/WebP transparent", () => {
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string) {
        calls.push(`fill ${v}`);
      },
      fillRect: (...a: number[]) => calls.push(`fillRect ${a.join(",")}`),
      clearRect: (...a: number[]) => calls.push(`clearRect ${a.join(",")}`),
    } as unknown as CanvasRenderingContext2D;
    prepareBackground(ctx, "jpeg", 10, 5);
    prepareBackground(ctx, "jpeg", 10, 5, "#f7f1e3");
    prepareBackground(ctx, "png", 10, 5, "#000000");
    prepareBackground(ctx, "webp", 10, 5, "#000000");
    expect(calls).toEqual([`fill ${DEFAULT_BACKGROUND}`, "fillRect 0,0,10,5", "fill #f7f1e3", "fillRect 0,0,10,5", "clearRect 0,0,10,5", "clearRect 0,0,10,5"]);
    expect(DEFAULT_BACKGROUND).toBe("#ffffff"); // never black by accident
  });

  it("detects transparent pixels", () => {
    expect(scanAlpha(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
    expect(scanAlpha(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254]))).toBe(true);
    expect(scanAlpha(new Uint8ClampedArray([0, 0, 0, 0]))).toBe(true);
  });
});

describe("browser limits", () => {
  it("keeps WebP within 16,383 px and JPEG/WebP within one canvas", () => {
    expect(encodeIssue({ width: 1170, height: 2532 }, "webp")).toBeNull();
    expect(encodeIssue({ width: 1170, height: 16_384 }, "webp")).toBe("format-dimension");
    expect(encodeIssue({ width: 1170, height: 16_384 }, "png")).toBeNull(); // PNG streams in tiles
    expect(encodeIssue({ width: 1170, height: 20_000 }, "jpeg")).toBe("too-large"); // > one canvas, no streaming JPEG
    expect(encodeIssue({ width: 1170, height: 20_000 }, "png")).toBeNull();
    expect(encodeIssue({ width: 1170, height: 20_000 }, "png", false)).toBe("too-large"); // no CompressionStream
    expect(encodeIssue({ width: 10_000, height: 10_000 }, "png")).toBe("source-too-large");
  });

  it("fails with a controlled code before decoding anything", () => {
    expect(() => assertEncodable({ width: 1170, height: 16_384 }, "webp", true)).toThrow(expect.objectContaining({ code: "ENCODE_FORMAT_TOO_LARGE" }));
    expect(() => assertEncodable({ width: 1170, height: 20_000 }, "jpeg", true)).toThrow(expect.objectContaining({ code: "ENCODE_TOO_LARGE" }));
    expect(() => assertEncodable({ width: 1170, height: 2532 }, "jpeg", true)).not.toThrow();
  });

  it("maps pipeline errors to encode codes", () => {
    expect(toEncodeError(new EditorError("EDITOR_DECODE_FAILED")).code).toBe("ENCODE_DECODE_FAILED");
    expect(toEncodeError(new EditorError("EDITOR_EXPORT_VERIFY_FAILED")).code).toBe("ENCODE_VERIFY_FAILED");
    expect(toEncodeError(new EditorError("EDITOR_EXPORT_TOO_LARGE")).code).toBe("ENCODE_TOO_LARGE");
    expect(toEncodeError(new RangeError("x")).code).toBe("ENCODE_MEMORY_PRESSURE");
    const own = new EncodeError("ENCODE_CANCELLED");
    expect(toEncodeError(own)).toBe(own);
  });
});

describe("size comparison", () => {
  it("reports bytes and whole percent saved", () => {
    expect(compareSize(4_800_000, 1_600_000)).toEqual({ original: 4_800_000, output: 1_600_000, delta: -3_200_000, saved: 3_200_000, percent: 67, outcome: "smaller" });
  });

  it("never reports savings for a larger result", () => {
    const c = compareSize(1000, 1250);
    expect(c).toMatchObject({ outcome: "larger", saved: 0, delta: 250, percent: 25 });
    expect(compareSize(1000, 1000)).toMatchObject({ outcome: "same", saved: 0, percent: 0 });
    expect(compareSize(0, 10).percent).toBe(0);
  });
});

describe("suggestions", () => {
  const cmp = (o: number, n: number) => compareSize(o, n);

  it("PNG: quotes a measured WebP size when it is clearly smaller", () => {
    const s = suggest({ format: "png", quality: 0.8, comparison: cmp(1000, 950), probe: { format: "webp", quality: 0.8, bytes: 300 } });
    expect(s).toEqual({ message: "WebP at 80% would be 70% smaller than the original.", apply: { format: "webp", quality: 0.8 } });
  });

  it("PNG that grows: explains why and suggests WebP; no suggestion when PNG already wins", () => {
    expect(suggest({ format: "png", quality: 0.8, comparison: cmp(1000, 1100) })?.apply).toEqual({ format: "webp", quality: SUGGESTED_QUALITY });
    expect(suggest({ format: "png", quality: 0.8, comparison: cmp(1000, 600), probe: { format: "webp", quality: 0.8, bytes: 590 } })).toBeNull();
  });

  it("JPEG/WebP larger than the original: lower quality first, then WebP", () => {
    expect(suggest({ format: "jpeg", quality: 0.92, comparison: cmp(1000, 1200) })?.apply).toEqual({ format: "jpeg", quality: 0.8 });
    expect(suggest({ format: "jpeg", quality: 0.8, comparison: cmp(1000, 1200) })).toEqual({ message: "Try WebP for a smaller file.", apply: { format: "webp", quality: 0.8 } });
    expect(suggest({ format: "webp", quality: 0.8, comparison: cmp(1000, 1200) })?.apply).toBeUndefined();
    expect(suggest({ format: "jpeg", quality: 0.8, comparison: cmp(1000, 400) })).toBeNull();
  });
});

describe("settings", () => {
  it("Compress keeps the input format unless the user picks one", () => {
    expect(DEFAULT_ENCODE_SETTINGS.compress).toEqual({ format: "same", quality: 0.8, background: "#ffffff" });
    expect(resolveFormat("compress", "same", "image/png")).toBe("png");
    expect(resolveFormat("compress", "same", "image/jpeg")).toBe("jpeg");
    expect(resolveFormat("compress", "webp", "image/png")).toBe("webp");
  });

  it("Convert defaults to the natural target and never to the same format", () => {
    expect([autoTarget("png"), autoTarget("jpeg"), autoTarget("webp")]).toEqual(["jpeg", "png", "png"]);
    expect(resolveFormat("convert", "auto", "image/webp")).toBe("png");
    expect(resolveFormat("convert", "webp", "image/png")).toBe("webp");
    expect(resolveFormat("convert", "png", "image/png")).toBe("jpeg"); // same as input → the natural target
  });

  it("normalises quality and background colours", () => {
    expect(normaliseSettings({ format: "jpeg", quality: 3, background: "#ABCDEF" })).toEqual({ format: "jpeg", quality: 1, background: "#abcdef" });
    expect(normaliseSettings({ format: "jpeg", quality: 0.8, background: "red" }).background).toBe("#ffffff");
  });

  it("names results", () => {
    expect(encodedName("compress", "shot.png", "png")).toBe("compressed-shot.png");
    expect(encodedName("compress", "compressed-shot.png", "jpeg")).toBe("compressed-shot.jpg");
    expect(encodedName("convert", "shot.png", "webp")).toBe("shot.webp");
  });
});
