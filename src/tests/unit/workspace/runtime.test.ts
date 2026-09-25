/**
 * WorkspaceRuntime with a fake WorkerBroker: ingest validation/naming, artifact transitions
 * and worker lifetime rules. (Real engines are covered by the browser E2E suite.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceRuntime } from "@/core/runtime/runtime";
import { pairKey } from "@/core/runtime/store";
import type { WorkerBroker } from "@/core/runtime/worker-broker";
import { FIXTURE_DIR } from "../../helpers/stitch-fixtures";

const png = (rel: string) => new File([readFileSync(join(FIXTURE_DIR, rel))], rel.split("/").pop()!, { type: "image/png" });

function fakeBroker(handlers: Record<string, (input: unknown) => unknown>) {
  const calls: string[] = [];
  const released: string[] = [];
  const broker = {
    started: new Set(),
    run: vi.fn(async (kind: string, op: string, input: unknown) => {
      calls.push(`${kind}:${op}`);
      const h = handlers[op];
      if (!h) throw Object.assign(new Error("unsupported"), { code: "UNSUPPORTED" });
      return h(input);
    }),
    release: vi.fn((k: string) => released.push(k)),
    dispose: vi.fn(),
  } as unknown as WorkerBroker;
  return { broker, calls, released };
}

const CAPS = { offscreenCanvas: true, compressionStream: true, createImageBitmapResize: true };

describe("WorkspaceRuntime", () => {
  it("ingests valid screenshots with header-only sizing and rejects others", async () => {
    const { broker } = fakeBroker({}); // previews fail in Node → recorded as failed jobs
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const fake = new File([new TextEncoder().encode("not an image at all")], "notes.png", { type: "image/png" });
    const r = await rt.ingest([png("chat-light/a.png"), fake], "picker");
    expect(r.added).toHaveLength(1);
    expect(r.rejected).toEqual([{ name: "notes.png", code: expect.any(String) }]);
    const f = rt.store.getState().files[r.added[0]];
    expect(f).toMatchObject({ name: "a.png", width: 1170, height: 2532, kind: "original", source: "picker" });
    expect(rt.registry.has(f.id)).toBe(true);
    // No preview → the overlap hint waits instead of guessing.
    expect(rt.store.getState().overlapHint.status).toBe("idle");
  });

  it("names pasted screenshots sequentially", async () => {
    const { broker } = fakeBroker({});
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    await rt.ingest([png("chat-light/a.png")], "paste");
    await rt.ingest([png("chat-light/b.png")], "paste");
    expect(rt.store.getState().order.map((id) => rt.store.getState().files[id].name)).toEqual(["Pasted screenshot 1.png", "Pasted screenshot 2.png"]);
  });

  it("analyses adjacent pairs, exports an artifact and manages worker lifetime", async () => {
    const { broker, calls, released } = fakeBroker({
      "stitch.analyse": () => ({ status: "matched", offsetY: 1260, confidenceClass: "high", bands: { top: 100, bottom: 80 } }),
      "stitch.composeChain": () => ({ blob: new Blob([new Uint8Array(64)], { type: "image/png" }), width: 1170, height: 3792, strategy: "single-canvas", ms: 5 }),
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png"), png("chat-light/b.png")], "drop");
    await rt.analyseStitch();
    const key = pairKey(added[0], added[1]);
    expect(rt.store.getState().stitch.pairs[key]).toMatchObject({ status: "ready", offset: 1260, autoOffset: 1260, confidence: "high", matched: true });

    // Already-analysed pairs are not analysed again.
    await rt.analyseStitch();
    expect(calls.filter((c) => c === "vision:stitch.analyse")).toHaveLength(1);

    const plan = rt.stitchPlan()!;
    expect(plan.width).toBe(1170);
    expect(plan.tops).toEqual([0, 1260]);

    const out = await rt.exportStitch();
    expect(released).toContain("vision"); // OpenCV never coexists with composition
    const s = rt.store.getState();
    expect(s.lastArtifactId).toBe(out.id);
    expect(s.selectedId).toBe(out.id);
    expect(s.files[out.id]).toMatchObject({ kind: "artifact", producedBy: "stitch", derivedFrom: added, name: "stitched-screenshot.png", height: 3792 });
    expect(rt.registry.has(out.id)).toBe(true);
    // The result is not a stitch input.
    expect(rt.stitchPlan()!.tops).toEqual([0, 1260]);
  });

  it("stores controlled error codes for failed analysis", async () => {
    const { broker } = fakeBroker({
      "stitch.analyse": () => {
        throw Object.assign(new Error("x"), { code: "STITCH_WIDTH_MISMATCH" });
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png"), png("chat-light/b.png")], "drop");
    await rt.analyseStitch();
    expect(rt.store.getState().stitch.pairs[pairKey(added[0], added[1])]).toMatchObject({ status: "failed", error: "STITCH_WIDTH_MISMATCH" });
    expect(rt.stitchPlan()).toBeNull();
    await expect(rt.exportStitch()).rejects.toMatchObject({ code: "STITCH_NOT_READY" });
  });

  it("removing a file releases its assets; dispose releases everything", async () => {
    const { broker } = fakeBroker({});
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png"), png("chat-light/b.png")], "drop");
    rt.removeFile(added[0]);
    expect(rt.registry.has(added[0])).toBe(false);
    expect(rt.store.getState().order).toEqual([added[1]]);
    rt.dispose();
    expect(rt.registry.stats().blobs).toBe(0);
    expect(broker.dispose).toHaveBeenCalled();
  });
});
