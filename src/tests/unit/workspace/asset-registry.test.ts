import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetRegistry } from "@/core/runtime/asset-registry";

const bitmap = () => ({ width: 10, height: 10, close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };

describe("AssetRegistry lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stores blobs and reports counts only", () => {
    const r = new AssetRegistry();
    r.put("a", new Blob([new Uint8Array(10)]));
    r.put("b", new Blob([new Uint8Array(5)]));
    expect(r.has("a")).toBe(true);
    expect(r.stats()).toEqual({ blobs: 2, previews: 0, urls: 0, bytes: 15 });
  });

  it("closes a replaced preview and a preview for a removed asset", () => {
    const r = new AssetRegistry();
    r.put("a", new Blob(["x"]));
    const p1 = bitmap();
    const p2 = bitmap();
    r.setPreview("a", p1);
    r.setPreview("a", p2);
    expect(p1.close).toHaveBeenCalledOnce();
    expect(r.preview("a")).toBe(p2);
    const late = bitmap();
    r.setPreview("gone", late);
    expect(late.close).toHaveBeenCalledOnce();
    expect(r.preview("gone")).toBeUndefined();
  });

  it("creates one object URL lazily and revokes it on remove", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:1");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const r = new AssetRegistry();
    r.put("a", new Blob(["x"]));
    expect(r.objectUrl("a")).toBe("blob:1");
    expect(r.objectUrl("a")).toBe("blob:1");
    expect(create).toHaveBeenCalledOnce();
    const p = bitmap();
    r.setPreview("a", p);
    r.remove("a");
    expect(revoke).toHaveBeenCalledWith("blob:1");
    expect(p.close).toHaveBeenCalledOnce();
    expect(r.stats()).toEqual({ blobs: 0, previews: 0, urls: 0, bytes: 0 });
    expect(r.objectUrl("a")).toBeUndefined();
  });

  it("put() over an existing id releases the old resources", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:old");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const r = new AssetRegistry();
    r.put("a", new Blob(["x"]));
    r.objectUrl("a");
    const p = bitmap();
    r.setPreview("a", p);
    r.put("a", new Blob(["y"]));
    expect(revoke).toHaveBeenCalledWith("blob:old");
    expect(p.close).toHaveBeenCalled();
  });

  it("clear() releases everything", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const r = new AssetRegistry();
    const ps = [bitmap(), bitmap()];
    ["a", "b"].forEach((id, i) => {
      r.put(id, new Blob(["x"]));
      r.setPreview(id, ps[i]);
      r.objectUrl(id);
    });
    r.clear();
    expect(r.stats().blobs).toBe(0);
    for (const p of ps) expect(p.close).toHaveBeenCalledOnce();
  });
});
