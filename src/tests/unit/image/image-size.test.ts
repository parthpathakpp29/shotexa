import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseImageSize } from "@/core/image/image-size";
import { FIXTURE_DIR, loadManifest } from "../../helpers/stitch-fixtures";

describe("parseImageSize", () => {
  it("reads PNG/JPEG/WebP dimensions from real fixtures", () => {
    for (const f of loadManifest()) {
      const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, f.files.a)));
      expect(parseImageSize(bytes), f.id).toEqual({ format: f.format, width: f.width, height: f.height });
    }
  });
  it("returns null for unknown data", () => {
    expect(parseImageSize(new TextEncoder().encode("<svg></svg> padding padding padding"))).toBeNull();
  });
});
