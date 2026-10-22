/**
 * Preview lifecycle: Blob URLs owned by the components showing them, and preview decoding that
 * stops when the page is being left (the WebKit "Cannot load blob … due to access control
 * checks" page error during navigation).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdObjectUrl, liveObjectUrls, releaseObjectUrl } from "@/lib/object-url";
import { createWorkspaceRuntime } from "@/core/runtime/runtime";
import type { WorkerBroker } from "@/core/runtime/worker-broker";
import { FIXTURE_DIR } from "../../helpers/stitch-fixtures";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("preview Blob URLs", () => {
  let created: string[];
  let revoked: string[];
  beforeEach(() => {
    created = [];
    revoked = [];
    let n = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => { const url = `blob:test/${++n}`; created.push(url); return url; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => void revoked.push(url));
  });
  afterEach(() => vi.restoreAllMocks());

  it("revokes a URL once nothing shows it", async () => {
    const blob = new Blob(["a"]);
    const url = holdObjectUrl(blob);
    releaseObjectUrl(blob);
    expect(revoked).toEqual([]); // not synchronously — the commit may hold it again
    await tick();
    expect(revoked).toEqual([url]);
    expect(liveObjectUrls()).toBe(0);
  });

  it("survives a release and re-hold within one commit (React StrictMode, re-keyed lists)", async () => {
    const blob = new Blob(["a"]);
    const url = holdObjectUrl(blob);
    releaseObjectUrl(blob);
    expect(holdObjectUrl(blob)).toBe(url);
    await tick();
    expect(revoked).toEqual([]);
    releaseObjectUrl(blob);
    await tick();
    expect(revoked).toEqual([url]);
    expect(created).toEqual([url]);
  });

  it("shares one URL between components and keeps it until the last one stops", async () => {
    const blob = new Blob(["a"]);
    const url = holdObjectUrl(blob);
    expect(holdObjectUrl(blob)).toBe(url);
    releaseObjectUrl(blob);
    await tick();
    expect(revoked).toEqual([]);
    releaseObjectUrl(blob);
    await tick();
    expect(revoked).toEqual([url]);
  });

  it("replacing a preview revokes only the old one", async () => {
    const first = new Blob(["1"]);
    const second = new Blob(["2"]);
    const a = holdObjectUrl(first);
    const b = holdObjectUrl(second); // the new preview is shown in the same commit…
    releaseObjectUrl(first); // …as the old one stops
    await tick();
    expect(revoked).toEqual([a]);
    expect(liveObjectUrls()).toBe(1);
    releaseObjectUrl(second);
    await tick();
    expect(revoked).toEqual([a, b]);
  });

  it("repeated preview changes leave nothing behind", async () => {
    let current = new Blob(["0"]);
    holdObjectUrl(current);
    for (let i = 1; i <= 25; i++) {
      const next = new Blob([String(i)]);
      holdObjectUrl(next);
      releaseObjectUrl(current);
      current = next;
    }
    releaseObjectUrl(current);
    await tick();
    expect(created).toHaveLength(26);
    expect([...revoked].sort()).toEqual([...created].sort());
    expect(liveObjectUrls()).toBe(0);
  });

  it("ignores releases of a Blob it never handed out", () => {
    expect(() => releaseObjectUrl(new Blob(["x"]))).not.toThrow();
  });
});

describe("preview decoding while the page is being left", () => {
  const png = () => new File([readFileSync(join(FIXTURE_DIR, "chat-light/a.png"))], "a.png", { type: "image/png" });
  const CAPS = { offscreenCanvas: true, compressionStream: true, createImageBitmapResize: true };
  const fakeBitmap = () => ({ width: 10, height: 20, close: vi.fn() }) as unknown as ImageBitmap;
  const pageShow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });

  function broker(preview: () => Promise<unknown>) {
    const run = vi.fn(async (_kind: string, op: string) => {
      if (op === "image.preview") return preview();
      throw Object.assign(new Error("unsupported"), { code: "UNSUPPORTED" });
    });
    return { run, broker: { started: new Set(), run, release: vi.fn(), dispose: vi.fn() } as unknown as WorkerBroker };
  }

  let pageDecode: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    pageDecode = vi.fn(async () => fakeBitmap());
    vi.stubGlobal("createImageBitmap", pageDecode);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does not fall back to a page decode when the worker fails because the page is closing", async () => {
    const page = new EventTarget();
    let failWorker: (error: unknown) => void = () => undefined;
    const { broker: b, run } = broker(() => new Promise((_, reject) => { failWorker = reject; }));
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    const ingest = rt.ingest([png()], "picker");
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith("image", "image.preview", expect.anything())); // decode in flight
    page.dispatchEvent(new Event("pagehide")); // navigation starts…
    failWorker(Object.assign(new Error("worker gone"), { code: "WORKER_CRASHED" })); // …and tears the worker down
    const { added } = await ingest; // settles without an error
    expect(pageDecode).not.toHaveBeenCalled();
    expect(rt.store.getState().files[added[0]].previewVersion).toBe(0);
    rt.dispose();
  });

  it("starts no preview work once the page is being left", async () => {
    const page = new EventTarget();
    const { broker: b, run } = broker(async () => ({ bitmap: fakeBitmap() }));
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    page.dispatchEvent(new Event("pagehide"));
    await rt.ingest([png()], "drop");
    expect(run).not.toHaveBeenCalledWith("image", "image.preview", expect.anything());
    expect(pageDecode).not.toHaveBeenCalled();
    rt.dispose();
  });

  it("resumes interrupted previews when the page returns from the back/forward cache", async () => {
    const page = new EventTarget();
    let failFirst: (error: unknown) => void = () => undefined;
    let calls = 0;
    // The first decode is interrupted by the page being left; later ones succeed.
    const { broker: b, run } = broker(() => (++calls === 1 ? new Promise((_, reject) => { failFirst = reject; }) : Promise.resolve({ bitmap: fakeBitmap() })));
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    const ingest = rt.ingest([png()], "drop");
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    page.dispatchEvent(new Event("pagehide"));
    failFirst(Object.assign(new Error("worker gone"), { code: "WORKER_CRASHED" }));
    const { added } = await ingest;
    expect(rt.store.getState().files[added[0]].previewVersion).toBe(0);
    page.dispatchEvent(pageShow(false)); // a fresh load never reaches an old runtime; ignored
    await tick();
    expect(run).toHaveBeenCalledTimes(1);
    page.dispatchEvent(pageShow(true));
    await vi.waitFor(() => expect(rt.store.getState().files[added[0]].previewVersion).toBeGreaterThan(0));
    expect(run).toHaveBeenCalledTimes(2);
    expect(pageDecode).not.toHaveBeenCalled();
    rt.dispose();
  });

  it.each(["WORKER_CRASHED", "CANCELLED", "DECODE_FAILED"])("never decodes on the page after a %s worker failure — it marks the preview failed", async (code) => {
    const page = new EventTarget();
    const { broker: b } = broker(async () => { throw Object.assign(new Error(code), { code }); });
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    const { added } = await rt.ingest([png()], "picker");
    expect(pageDecode).not.toHaveBeenCalled();
    expect(rt.store.getState().files[added[0]].previewVersion).toBe(0);
    expect(rt.store.getState().jobs[`preview:${added[0]}`]).toMatchObject({ status: "failed" });
    rt.dispose();
  });

  it("still falls back to a page decode when the worker fails while the page stays open", async () => {
    const page = new EventTarget();
    const { broker: b } = broker(async () => { throw Object.assign(new Error("no worker decode"), { code: "UNSUPPORTED" }); });
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    const { added } = await rt.ingest([png()], "picker");
    expect(pageDecode).toHaveBeenCalledTimes(2); // full display orientation, then bounded preview
    expect(rt.store.getState().files[added[0]]).toMatchObject({ width: 10, height: 20 });
    expect(rt.store.getState().files[added[0]].previewVersion).toBeGreaterThan(0);
    rt.dispose();
  });

  it("a file that cannot be read is reported, not thrown — and is dropped silently while leaving", async () => {
    const unreadable = () => Object.assign(new File(["x"], "gone.png", { type: "image/png" }), {
      slice: () => ({ arrayBuffer: () => Promise.reject(Object.assign(new Error("The I/O read operation failed."), { name: "NotReadableError" })) }),
    }) as unknown as File;
    const page = new EventTarget();
    const { broker: b } = broker(async () => ({ bitmap: fakeBitmap() }));
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    await expect(rt.ingest([unreadable(), png()], "drop")).resolves.toMatchObject({ rejected: [{ name: "gone.png", code: "UNREADABLE" }], added: [expect.any(String)] });
    page.dispatchEvent(new Event("pagehide"));
    await expect(rt.ingest([unreadable()], "drop")).resolves.toEqual({ added: [], rejected: [] });
    rt.dispose();
  });

  it("suspends the worker broker while the page is being left and resumes it on restore", () => {
    const page = new EventTarget();
    const { broker: b } = broker(async () => ({ bitmap: fakeBitmap() }));
    const suspend = vi.fn();
    const resume = vi.fn();
    Object.assign(b, { suspend, resume });
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    page.dispatchEvent(new Event("pagehide"));
    expect(suspend).toHaveBeenCalledOnce();
    page.dispatchEvent(pageShow(true));
    expect(resume).toHaveBeenCalledOnce();
    rt.dispose();
  });

  it("stops listening for page events when disposed", () => {
    const page = new EventTarget();
    const remove = vi.spyOn(page, "removeEventListener");
    const { broker: b } = broker(async () => ({ bitmap: fakeBitmap() }));
    createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page }).dispose();
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(["beforeunload", "keydown", "pagehide", "pageshow", "pointerdown"]);
  });

  it("listens for beforeunload only while image work runs", async () => {
    const page = new EventTarget();
    const add = vi.spyOn(page, "addEventListener");
    const remove = vi.spyOn(page, "removeEventListener");
    const { broker: b } = broker(async () => ({ bitmap: fakeBitmap() }));
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false); // idle: bfcache-friendly
    await rt.ingest([png()], "picker");
    expect(add.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(1);
    rt.dispose();
  });

  it("a navigation starting (beforeunload) stops new preview work; if it does not happen, the next interaction resumes it", async () => {
    const page = new EventTarget();
    let release: (value: unknown) => void = () => undefined;
    let calls = 0;
    const { broker: b, run } = broker(() => (++calls === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({ bitmap: fakeBitmap() })));
    const rt = createWorkspaceRuntime({ broker: b, caps: CAPS, pageEvents: page });
    const ingest = rt.ingest([png(), png()], "drop");
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    page.dispatchEvent(new Event("beforeunload")); // the first preview is in flight
    release({ bitmap: fakeBitmap() }); // it finishes quietly…
    const { added } = await ingest;
    expect(run).toHaveBeenCalledTimes(1); // …and the second one never starts
    expect(rt.store.getState().files[added[0]].previewVersion).toBeGreaterThan(0);
    expect(rt.store.getState().files[added[1]].previewVersion).toBe(0);
    page.dispatchEvent(new Event("pointerdown")); // the navigation did not happen
    await vi.waitFor(() => expect(rt.store.getState().files[added[1]].previewVersion).toBeGreaterThan(0));
    expect(pageDecode).not.toHaveBeenCalled();
    rt.dispose();
  });
});
