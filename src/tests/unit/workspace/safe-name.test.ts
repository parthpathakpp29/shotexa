/**
 * V2.0 hardening — the one place a screenshot's name is made safe. Every later use (the file
 * tray, derived artifact names, the download attribute, ZIP entries) relies on this, so the
 * rules are pinned here: ordinary names must survive untouched.
 */
import { describe, expect, it } from "vitest";
import { safeFileName } from "@/core/runtime/safe-name";

describe("safeFileName", () => {
  it("leaves an ordinary screenshot name exactly as it was", () => {
    for (const name of ["screenshot.png", "Screen Shot 2026-10-09 at 14.22.31.png", "chat (1).jpeg", "ümlaut-ünicode.webp", "a.b.c.png", "日本語.png"]) {
      expect(safeFileName(name)).toBe(name);
    }
  });

  it("keeps only the last path component", () => {
    expect(safeFileName("../../etc/passwd.png")).toBe("passwd.png");
    expect(safeFileName("C:\\Users\\me\\secret.png")).toBe("secret.png");
    expect(safeFileName("folder/sub/shot.png")).toBe("shot.png");
    expect(safeFileName("/absolute/shot.png")).toBe("shot.png");
  });

  it("removes characters that break archives, Windows paths or terminals", () => {
    expect(safeFileName('a:b*c?d"e<f>g|h.png')).toBe("a-b-c-d-e-f-g-h.png");
    expect(safeFileName("line\nbreak\u0000null.png")).toBe("line-break-null.png");
  });

  it("falls back when nothing usable is left", () => {
    expect(safeFileName("")).toBe("screenshot.png");
    expect(safeFileName("..")).toBe("screenshot.png");
    expect(safeFileName("///")).toBe("screenshot.png");
    expect(safeFileName("   ", "pasted.webp")).toBe("pasted.webp");
    expect(safeFileName(undefined as unknown as string)).toBe("screenshot.png");
  });

  it("never produces a hidden file or a reserved device name", () => {
    expect(safeFileName(".hidden.png")).toBe("hidden.png");
    expect(safeFileName("CON.png")).toBe("file-CON.png");
    expect(safeFileName("lpt1")).toBe("file-lpt1");
    // A name that merely starts with those letters is ordinary.
    expect(safeFileName("console-log.png")).toBe("console-log.png");
  });

  it("shortens absurd names but keeps the extension", () => {
    const long = `${"x".repeat(400)}.png`;
    const result = safeFileName(long);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result.endsWith(".png")).toBe(true);
    // A very long "extension" is not treated as one.
    const noExt = safeFileName("y".repeat(300));
    expect(noExt.length).toBe(120);
  });
});
