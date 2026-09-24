import { describe, expect, it } from "vitest";
import { sniffImageType, validateImageHeader } from "@/core/image/validate";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');

describe("image validation (extension + MIME + signature)", () => {
  it("sniffs PNG/JPEG/WebP", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(SVG)).toBeNull();
  });
  it("accepts consistent files and clipboard images without a name", () => {
    expect(validateImageHeader("a.PNG", "image/png", PNG)).toEqual({ ok: true, type: "image/png" });
    expect(validateImageHeader("", "image/png", PNG)).toEqual({ ok: true, type: "image/png" });
  });
  it("rejects SVG, mismatches and empty files", () => {
    expect(validateImageHeader("x.svg", "image/svg+xml", SVG)).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT" });
    expect(validateImageHeader("x.png", "image/png", JPG)).toMatchObject({ ok: false, code: "SIGNATURE_MISMATCH" });
    expect(validateImageHeader("x.jpg", "image/png", JPG)).toMatchObject({ ok: false, code: "SIGNATURE_MISMATCH" });
    expect(validateImageHeader("x.png", "image/png", new Uint8Array())).toMatchObject({ ok: false, code: "EMPTY_FILE" });
  });
});
