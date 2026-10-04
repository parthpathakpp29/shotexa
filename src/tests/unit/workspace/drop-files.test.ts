import { describe, expect, it } from "vitest";
import { dedupeDroppedFiles, type FileIdentity } from "@/core/runtime/drop-files";

const file = (name: string, overrides: Partial<FileIdentity> = {}): FileIdentity => ({
  name,
  size: 1024,
  type: "image/png",
  lastModified: 100,
  ...overrides,
});

describe("drop file handling", () => {
  it("removes duplicate browser file identities while keeping the first order", () => {
    const first = file("one.png");
    const second = file("two.png");
    expect(dedupeDroppedFiles([first, first, second])).toEqual([first, second]);
  });

  it("keeps distinct files even when their metadata is identical", () => {
    const files = [file("shot.png"), file("shot.png")];
    expect(dedupeDroppedFiles(files)).toEqual(files);
  });

  it("keeps files whose metadata differs", () => {
    const files = [
      file("shot.png"),
      file("shot.png", { size: 2048 }),
      file("shot.png", { lastModified: 101 }),
      file("shot.png", { type: "image/webp" }),
    ];
    expect(dedupeDroppedFiles(files)).toEqual(files);
  });
});
