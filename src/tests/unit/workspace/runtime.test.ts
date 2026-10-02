/**
 * WorkspaceRuntime with a fake WorkerBroker: ingest validation/naming, artifact transitions
 * and worker lifetime rules. (Real engines are covered by the browser E2E suite.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceRuntime } from "@/core/runtime/runtime";
import { planCombine } from "@/core/combine/layout";
import { flipTransform, IDENTITY_TRANSFORM, rotateTransform, withVisibleCrop } from "@/core/image-transform/transform";
import type { ImageTransform } from "@/core/image-transform/types";
import type { AnnotationObject } from "@/core/annotation/types";
import { pairKey } from "@/core/runtime/store";
import type { WorkerBroker } from "@/core/runtime/worker-broker";
import type { OcrService } from "@/core/ocr/ocr-service";
import type { OcrResult } from "@/core/ocr/types";
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
  it("runs batch jobs sequentially, isolates failures and adds successful results only on request", async () => {
    let encodeCalls = 0;
    let active = 0;
    let peak = 0;
    const { broker } = fakeBroker({
      "image.encode": async () => {
        const call = encodeCalls++;
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        if (call === 1) throw Object.assign(new Error("bad image"), { code: "ENCODE_FORMAT_TOO_LARGE" });
        return { blob: new Blob([new Uint8Array([call + 1])], { type: "image/png" }), width: 1170, height: 2532, format: "png", strategy: "single-canvas", ms: 1 };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png"), png("chat-light/b.png"), png("chat-light/a.png")], "drop");
    rt.store.getState().setBatchSelection(added);
    const summary = await rt.runBatch();
    expect(summary).toEqual({ completed: 2, failed: 1, cancelled: 0 });
    expect(peak).toBe(1);
    expect(rt.batchResults.stats().results).toBe(2);
    expect(rt.store.getState().order).toEqual(added); // processing does not flood the workspace
    expect(rt.store.getState().batch.items[added[1]]).toMatchObject({ status: "failed", error: "ENCODE_FORMAT_TOO_LARGE" });

    const artifacts = rt.addBatchResults();
    expect(artifacts).toHaveLength(2);
    expect(rt.store.getState().selectedId).toBe(artifacts[0]);
    expect(artifacts.map((id) => rt.store.getState().files[id].producedBy)).toEqual(["batch", "batch"]);
    expect(artifacts.map((id) => rt.store.getState().files[id].derivedFrom)).toEqual([[added[0]], [added[2]]]);
    expect(rt.addBatchResults()).toEqual([]); // explicit action is idempotent
    rt.removeFile(added[0]);
    expect(rt.batchResults.list().every((result) => result.sourceId !== added[0])).toBe(true);
    rt.dispose();
    expect(rt.batchResults.stats().results).toBe(0);
  });

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

  it("exports a verified Combine artifact through the Image Worker", async () => {
    let composeInput: unknown;
    const combined = new Blob([new Uint8Array(96)], { type: "image/png" });
    const { broker, calls } = fakeBroker({
      "combine.compose": (input) => {
        composeInput = input;
        return { blob: combined, width: 1170, height: 5080, strategy: "single-canvas", ms: 8 };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png"), png("chat-light/b.png")], "drop");
    const plan = planCombine(added.map((id) => {
      const file = rt.store.getState().files[id];
      return { width: file.width, height: file.height };
    }), { layout: "vertical", gap: 16 });

    const output = await rt.exportCombine(added, plan);
    expect(calls).toContain("image:combine.compose");
    expect((composeInput as { images: Blob[]; plan: { placements: unknown[] } }).images).toHaveLength(2);
    expect((composeInput as { plan: { placements: unknown[] } }).plan.placements).toHaveLength(2);
    expect(rt.store.getState().files[output.id]).toMatchObject({
      kind: "artifact", producedBy: "combine", derivedFrom: added,
      name: "combined-screenshots.png", width: 1170, height: 5080,
    });
    expect(rt.registry.blob(output.id)).toBe(combined);
  });

  it("exports an edit as a new artifact and leaves the source untouched", async () => {
    let exportInput: { image: Blob; transform: ImageTransform; source: { width: number; height: number }; format: string } | undefined;
    const edited = new Blob([new Uint8Array(48)], { type: "image/png" });
    const { broker, calls } = fakeBroker({
      "transform.export": (input) => {
        exportInput = input as typeof exportInput;
        return { blob: edited, width: 2532, height: 1170, strategy: "single-canvas", ms: 5 };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const original = png("chat-light/a.png");
    const { added } = await rt.ingest([original], "picker");
    const sourceId = added[0];

    // Nothing changed yet: exporting would only re-encode, so it is refused.
    await expect(rt.exportEdit(sourceId)).rejects.toMatchObject({ code: "EDITOR_INVALID_TRANSFORM" });

    const transform = rotateTransform(IDENTITY_TRANSFORM, "cw");
    rt.store.getState().setEditTransform(sourceId, transform);
    const out = await rt.exportEdit(sourceId);

    expect(calls).toContain("image:transform.export");
    expect(exportInput!.image).toBe(original); // the ORIGINAL file, never the preview
    expect(exportInput!.transform).toEqual(transform);
    expect(exportInput!.source).toEqual({ width: 1170, height: 2532 });
    const s = rt.store.getState();
    expect(s.files[out.id]).toMatchObject({ kind: "artifact", producedBy: "editor", derivedFrom: [sourceId], name: "edited-a.png", width: 2532, height: 1170 });
    expect(s.selectedId).toBe(out.id);
    expect(s.lastArtifactId).toBe(out.id);
    expect(rt.registry.blob(out.id)).toBe(edited);
    // Non-destructive: the source keeps its blob, dimensions and pending transform.
    expect(rt.registry.blob(sourceId)).toBe(original);
    expect(s.files[sourceId]).toMatchObject({ kind: "original", width: 1170, height: 2532 });
    expect(s.editor.byAsset[sourceId]).toEqual(transform);
    expect(out).toMatchObject({ sourceId, width: 2532, height: 1170 });
  });

  it("edits another tool's result without re-upload, and names repeat edits cleanly", async () => {
    const { broker } = fakeBroker({
      "combine.compose": () => ({ blob: new Blob([new Uint8Array(8)], { type: "image/png" }), width: 1170, height: 5080, strategy: "single-canvas", ms: 1 }),
      "transform.export": (input) => {
        const { source } = input as { source: { width: number; height: number } };
        return { blob: new Blob([new Uint8Array(8)], { type: "image/png" }), width: source.width, height: 100, strategy: "single-canvas", ms: 1 };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png"), png("chat-light/b.png")], "drop");
    const sizes = added.map((id) => rt.store.getState().files[id]);
    const combined = await rt.exportCombine(added, planCombine(sizes, { layout: "vertical" }));

    const cropped = withVisibleCrop(IDENTITY_TRANSFORM, { width: 1170, height: 5080 }, { x: 0, y: 0, width: 1170, height: 100 });
    rt.store.getState().setEditTransform(combined.id, cropped);
    const first = await rt.exportEdit(combined.id);
    expect(rt.store.getState().files[first.id]).toMatchObject({ derivedFrom: [combined.id], producedBy: "editor", name: "edited-combined-screenshots.png" });

    // Editing the edited result does not stack prefixes.
    rt.store.getState().setEditTransform(first.id, flipTransform(IDENTITY_TRANSFORM, "horizontal"));
    const second = await rt.exportEdit(first.id);
    expect(rt.store.getState().files[second.id].name).toBe("edited-combined-screenshots.png");
  });

  it("flattens annotations on top of the pending edit into a new artifact, leaving the source alone", async () => {
    let input: { image: Blob; transform: ImageTransform; annotations: AnnotationObject[]; source: { width: number; height: number } } | undefined;
    const flattened = new Blob([new Uint8Array(32)], { type: "image/png" });
    const { broker, calls } = fakeBroker({
      "annotation.export": (i) => {
        input = i as typeof input;
        return { blob: flattened, width: 2532, height: 1170, strategy: "single-canvas", ms: 3 };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const original = png("chat-light/a.png");
    const [sourceId] = (await rt.ingest([original], "picker")).added;

    await expect(rt.exportAnnotated(sourceId)).rejects.toMatchObject({ code: "ANNOTATION_EMPTY" });

    const marks: AnnotationObject[] = [{ id: "s1", type: "step", color: "#e5383b", at: { x: 100, y: 200 }, n: 1, radius: 30 }];
    const turned = rotateTransform(IDENTITY_TRANSFORM, "cw");
    rt.store.getState().setEditTransform(sourceId, turned);
    rt.store.getState().setAnnotations(sourceId, marks);
    const out = await rt.exportAnnotated(sourceId);

    expect(calls).toContain("image:annotation.export");
    expect(input!.image).toBe(original); // the original file, never a preview
    expect(input!.transform).toEqual(turned); // the pending edit travels with the marks
    expect(input!.annotations).toEqual(marks); // stored in source pixels
    const s = rt.store.getState();
    expect(s.files[out.id]).toMatchObject({ kind: "artifact", producedBy: "annotate", derivedFrom: [sourceId], name: "annotated-a.png", width: 2532, height: 1170 });
    expect(s.selectedId).toBe(out.id);
    expect(rt.registry.blob(out.id)).toBe(flattened);
    // Non-destructive: blob, annotations and pending transform of the source are untouched.
    expect(rt.registry.blob(sourceId)).toBe(original);
    expect(s.annotation.byAsset[sourceId]).toEqual(marks);
    expect(s.editor.byAsset[sourceId]).toEqual(turned);
    // The flattened result starts clean.
    expect(s.annotation.byAsset[out.id]).toBeUndefined();
  });

  it("annotates another tool's result without re-upload", async () => {
    const { broker } = fakeBroker({
      "transform.export": () => ({ blob: new Blob([new Uint8Array(8)], { type: "image/png" }), width: 500, height: 400, strategy: "single-canvas", ms: 1 }),
      "annotation.export": () => ({ blob: new Blob([new Uint8Array(8)], { type: "image/png" }), width: 500, height: 400, strategy: "single-canvas", ms: 1 }),
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const [sourceId] = (await rt.ingest([png("chat-light/a.png")], "drop")).added;
    rt.store.getState().setEditTransform(sourceId, flipTransform(IDENTITY_TRANSFORM, "horizontal"));
    const edited = await rt.exportEdit(sourceId);
    rt.store.getState().setAnnotations(edited.id, [{ id: "r", type: "rectangle", color: "#000", rect: { x: 1, y: 1, width: 9, height: 9 }, width: 2 }]);
    const annotated = await rt.exportAnnotated(edited.id);
    expect(rt.store.getState().files[annotated.id]).toMatchObject({ derivedFrom: [edited.id], name: "annotated-edited-a.png" });
    expect(rt.store.getState().order).toHaveLength(3);
  });

  it("splits from the original file, returns pieces, and adds them only when asked", async () => {
    let input: { image: Blob; pieces: { index: number; y0: number; y1: number }[]; source: { width: number; height: number }; format: string } | undefined;
    const { broker, calls } = fakeBroker({
      "split.export": (i) => {
        input = i as typeof input;
        return {
          pieces: input!.pieces.map((p) => ({ blob: new Blob([new Uint8Array(4 + p.index)], { type: "image/png" }), width: input!.source.width, height: p.y1 - p.y0 })),
          strategy: "single-canvas",
          ms: 2,
        };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const original = png("chat-light/a.png");
    const [sourceId] = (await rt.ingest([original], "picker")).added;
    const f = rt.store.getState().files[sourceId];

    // No settings yet: the default equal split into two.
    const first = await rt.exportSplit(sourceId);
    expect(calls).toContain("image:split.export");
    expect(input!.image).toBe(original); // the original file, never a preview
    expect(input!.pieces).toEqual([
      { index: 0, y0: 0, y1: Math.round(f.height / 2) },
      { index: 1, y0: Math.round(f.height / 2), y1: f.height },
    ]);
    expect(first.pieces.map((p) => p.name)).toEqual(["shotexa-split-01.png", "shotexa-split-02.png"]);
    expect(rt.store.getState().order).toEqual([sourceId]); // nothing added yet

    rt.store.getState().setSplit(sourceId, { mode: "custom", by: "count", count: 2, height: 500, lines: [{ id: "x", y: 300, source: "manual" }, { id: "y", y: 900, source: "manual" }] });
    const result = await rt.exportSplit(sourceId);
    expect(result.pieces.map((p) => [p.y0, p.y1, p.height])).toEqual([
      [0, 300, 300],
      [300, 900, 600],
      [900, f.height, f.height - 900],
    ]);
    const ids = rt.addSplitPieces(result);
    const s = rt.store.getState();
    expect(ids).toHaveLength(3);
    expect(s.order).toEqual([sourceId, ...ids]);
    expect(s.selectedId).toBe(ids[0]);
    expect(ids.map((i) => s.files[i])).toMatchObject([
      { name: "shotexa-split-01.png", kind: "artifact", producedBy: "split", derivedFrom: [sourceId], height: 300 },
      { name: "shotexa-split-02.png", height: 600 },
      { name: "shotexa-split-03.png", height: f.height - 900 },
    ]);
    expect(rt.registry.blob(ids[1])).toBe(result.pieces[1].blob);
    // Non-destructive: the source keeps its blob and its split lines.
    expect(rt.registry.blob(sourceId)).toBe(original);
    expect(s.split.byAsset[sourceId].lines.map((l) => l.y)).toEqual([300, 900]);
    // A piece is an ordinary image: it can be split again without re-upload.
    rt.store.getState().setSplit(ids[1], { mode: "equal", by: "count", count: 3, height: 100, lines: [] });
    const again = await rt.exportSplit(ids[1]);
    expect(input!.image).toBe(result.pieces[1].blob);
    expect(again.pieces.map((p) => p.height)).toEqual([200, 200, 200]);
  });

  it("Compress and Convert re-encode the original, and save only when asked", async () => {
    const inputs: { image: Blob; format: string; quality: number; background: string; probe?: unknown; source: { width: number; height: number } }[] = [];
    const { broker, calls } = fakeBroker({
      "image.encode": (i) => {
        const input = i as (typeof inputs)[number];
        inputs.push(input);
        return { blob: new Blob([new Uint8Array(input.format === "png" ? 900 : 300)], { type: `image/${input.format}` }), width: input.source.width, height: input.source.height, format: input.format, strategy: "single-canvas", ms: 1, probe: input.probe ? { ...(input.probe as object), bytes: 200 } : undefined };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const original = png("chat-light/a.png");
    const [sourceId] = (await rt.ingest([original], "picker")).added;
    const f = rt.store.getState().files[sourceId];

    // Compress keeps PNG (never switches format by itself) and measures WebP for a factual hint.
    const kept = await rt.encodeAsset("compress", sourceId);
    expect(calls).toContain("image:image.encode");
    expect(inputs[0]).toMatchObject({ image: original, format: "png", quality: 0.8, background: "#ffffff", probe: { format: "webp", quality: 0.8 }, source: { width: f.width, height: f.height } });
    expect(kept).toMatchObject({ tool: "compress", name: "compressed-a.png", type: "image/png", width: f.width, height: f.height, bytes: 900, originalBytes: f.bytes, probe: { format: "webp", bytes: 200 } });
    expect(rt.store.getState().order).toEqual([sourceId]); // nothing added yet

    // Convert: PNG → JPEG by default, on the chosen background.
    rt.store.getState().setEncodeSettings("convert", { background: "#F7F1E3", quality: 0.7 });
    const converted = await rt.encodeAsset("convert", sourceId);
    expect(inputs[1]).toMatchObject({ format: "jpeg", quality: 0.7, background: "#f7f1e3" });
    expect(inputs[1].probe).toBeUndefined();
    expect(converted).toMatchObject({ name: "a.jpg", type: "image/jpeg", format: "jpeg" });

    const id = rt.saveEncoded(converted);
    const s = rt.store.getState();
    expect(s.selectedId).toBe(id);
    expect(s.files[id]).toMatchObject({ name: "a.jpg", type: "image/jpeg", kind: "artifact", producedBy: "convert", derivedFrom: [sourceId], width: f.width, height: f.height, bytes: 300 });
    expect(rt.registry.blob(id)).toBe(converted.blob);
    expect(rt.registry.blob(sourceId)).toBe(original); // the source is untouched

    // A saved result is an ordinary image: compress it again, without re-upload.
    rt.store.getState().setEncodeSettings("compress", { format: "webp" });
    const again = await rt.encodeAsset("compress", id);
    expect(inputs[2]).toMatchObject({ image: converted.blob, format: "webp" });
    expect(again.name).toBe("compressed-a.webp");
    expect(await rt.hasTransparency(id)).toBe(false); // JPEG cannot be transparent
  });

  it("compares two screenshots into one artifact that records both parents", async () => {
    let input: { imageA: Blob; imageB: Blob; settings: { mode: string }; a: { width: number }; b: { width: number } } | undefined;
    const composed = new Blob([new Uint8Array(64)], { type: "image/png" });
    const { broker, calls } = fakeBroker({
      "compare.export": (i) => {
        input = i as typeof input;
        return { blob: composed, width: 2400, height: 1200, ms: 4 };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const first = png("chat-light/a.png");
    const second = png("chat-light/b.png");
    const [idA, idB] = (await rt.ingest([first, second], "picker")).added;

    await expect(rt.exportCompare()).rejects.toMatchObject({ code: "COMPARE_NEEDS_TWO" }); // nothing chosen yet
    rt.store.getState().setCompare({ ...rt.store.getState().compare, a: idA, b: idB, mode: "difference" });
    const out = await rt.exportCompare();

    expect(calls).toContain("image:compare.export");
    expect(input!.imageA).toBe(first); // the original files, never previews
    expect(input!.imageB).toBe(second);
    expect(input!.settings.mode).toBe("difference");
    const s = rt.store.getState();
    expect(s.files[out.id]).toMatchObject({
      name: "compare-difference.png",
      kind: "artifact",
      producedBy: "compare",
      derivedFrom: [idA, idB], // both parents kept, in order
      width: 2400,
      height: 1200,
    });
    expect(s.selectedId).toBe(out.id);
    expect(rt.registry.blob(out.id)).toBe(composed);
    // Non-destructive: both sources keep their blobs and the comparison settings are untouched.
    expect(rt.registry.blob(idA)).toBe(first);
    expect(rt.registry.blob(idB)).toBe(second);
    expect(s.compare).toMatchObject({ a: idA, b: idB });

    // The comparison itself is an ordinary image: it can be compared again.
    rt.store.getState().setCompare({ ...s.compare, a: out.id, b: idB, mode: "slider" });
    const again = await rt.exportCompare();
    expect(input!.imageA).toBe(composed);
    expect(rt.store.getState().files[again.id]).toMatchObject({ name: "compare-before-after.png", derivedFrom: [out.id, idB] });
  });

  it("reports a controlled Compare error and adds nothing", async () => {
    const { broker } = fakeBroker({
      "compare.export": () => {
        throw Object.assign(new Error("x"), { code: "COMPARE_TOO_LARGE" });
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png"), png("chat-light/b.png")], "drop");
    rt.store.getState().setCompare({ ...rt.store.getState().compare, a: added[0], b: added[1] });
    await expect(rt.exportCompare()).rejects.toMatchObject({ code: "COMPARE_TOO_LARGE" });
    expect(Object.values(rt.store.getState().jobs).find((j) => j.kind === "compare-export")).toMatchObject({ status: "failed", error: "COMPARE_TOO_LARGE" });
    expect(rt.store.getState().order).toEqual(added);
  });

  it("reports a controlled encode error and adds nothing", async () => {
    const { broker } = fakeBroker({
      "image.encode": () => {
        throw Object.assign(new Error("x"), { code: "ENCODE_FORMAT_TOO_LARGE" });
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png")], "drop");
    await expect(rt.encodeAsset("convert", added[0])).rejects.toMatchObject({ code: "ENCODE_FORMAT_TOO_LARGE" });
    expect(Object.values(rt.store.getState().jobs).find((j) => j.kind === "encode")).toMatchObject({ status: "failed", error: "ENCODE_FORMAT_TOO_LARGE" });
    expect(rt.store.getState().order).toEqual(added);
  });

  it("reports a controlled Split error and adds nothing", async () => {
    const { broker } = fakeBroker({
      "split.export": () => {
        throw Object.assign(new Error("x"), { code: "SPLIT_INVALID" });
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png")], "drop");
    await expect(rt.exportSplit(added[0])).rejects.toMatchObject({ code: "SPLIT_INVALID" });
    expect(Object.values(rt.store.getState().jobs).find((j) => j.kind === "split-export")).toMatchObject({ status: "failed", error: "SPLIT_INVALID" });
    expect(rt.store.getState().order).toEqual(added);
  });

  it("surfaces the renderer's controlled error code", async () => {
    const { broker } = fakeBroker({
      "transform.export": () => {
        throw Object.assign(new Error("x"), { code: "EDITOR_EXPORT_TOO_LARGE" });
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png")], "drop");
    rt.store.getState().setEditTransform(added[0], flipTransform(IDENTITY_TRANSFORM, "vertical"));
    await expect(rt.exportEdit(added[0])).rejects.toMatchObject({ code: "EDITOR_EXPORT_TOO_LARGE" });
    const job = Object.values(rt.store.getState().jobs).find((j) => j.kind === "editor-export");
    expect(job).toMatchObject({ status: "failed", error: "EDITOR_EXPORT_TOO_LARGE" });
    expect(rt.store.getState().order).toEqual(added); // no half-made artifact
  });

  it("exports Blur, Pixelate and Blackout operations as one verified Safe Share artifact", async () => {
    let exportInput: unknown;
    const safeBlob = new Blob([new Uint8Array(96)], { type: "image/png" });
    const { broker, calls } = fakeBroker({
      "redaction.export": (input) => {
        exportInput = input;
        return {
          blob: safeBlob,
          width: 1170,
          height: 2532,
          verification: {
            redactionsFlattened: true,
            privacyMetadataRemoved: true,
            outputVerified: true,
            dimensionsMatch: true,
            formatMatch: true,
          },
          removedCategories: ["exif", "xmp"],
          ms: { render: 4, clean: 1, verifyDecode: 1, total: 6 },
        };
      },
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png")], "picker");
    const s = rt.store.getState();
    s.setActiveTool("safe-share");
    s.addRedaction(added[0], { x: 10, y: 20, width: 100, height: 80 }, "blur");
    s.addRedaction(added[0], { x: 150, y: 200, width: 120, height: 90 }, "pixelate");
    s.addRedaction(added[0], { x: 300, y: 400, width: 140, height: 100 }, "blackout");

    const out = await rt.exportSafeShare();
    expect(calls).toContain("image:redaction.export");
    expect((exportInput as { operations: { mode: string }[] }).operations.map((op) => op.mode)).toEqual(["blur", "pixelate", "blackout"]);
    expect(out.verification).toMatchObject({ redactionsFlattened: true, privacyMetadataRemoved: true, outputVerified: true });
    expect(rt.store.getState().files[out.id]).toMatchObject({
      kind: "artifact",
      producedBy: "safe-share",
      derivedFrom: [added[0]],
      name: "safe-copy.png",
      width: 1170,
      height: 2532,
    });
    expect(rt.store.getState().selectedId).toBe(out.id);
    expect(rt.registry.blob(out.id)).toBe(safeBlob);
  });

  it("keeps metadata inspection and container cleaning behind the image worker", async () => {
    const output = new Blob([new Uint8Array(48)], { type: "image/png" });
    const { broker, calls } = fakeBroker({
      "metadata.inspect": () => ({ inspection: { format: "png", width: 1170, height: 2532, bytes: 100, categories: [], privacyFindings: [], hasPrivacyMetadata: false, preservedMetadata: [], warnings: [] } }),
      "metadata.clean": () => ({
        changed: true,
        output,
        before: { width: 1170, height: 2532 },
        verification: { passed: true, dimensionsMatch: true, outputValid: true, unexpectedRemainingPrivacyMetadata: [] },
      }),
    });
    const rt = createWorkspaceRuntime({ broker, caps: CAPS });
    const { added } = await rt.ingest([png("chat-light/a.png")], "picker");
    await rt.inspectMetadata(added[0]);
    const cleaned = await rt.cleanMetadata(added[0]);
    expect(calls).toContain("image:metadata.inspect");
    expect(calls).toContain("image:metadata.clean");
    expect(cleaned.artifactId).toBeTruthy();
    expect(rt.store.getState().files[cleaned.artifactId!]).toMatchObject({ kind: "artifact", producedBy: "metadata", derivedFrom: [added[0]] });
    expect(rt.registry.blob(cleaned.artifactId!)).toBe(output);
  });

  it("lazy-creates OCR, stores structured output outside Zustand and preserves edited text", async () => {
    const { broker, released } = fakeBroker({});
    const create = vi.fn(async () => ({
      extract: vi.fn(async (_blob: Blob, options: Parameters<OcrService["extract"]>[1]) => {
        options?.onProgress?.(0.5, "recognizing text");
        return {
          rawText: "Hello नमस्ते",
          editedText: "Hello नमस्ते",
          language: options?.languages?.join("+") ?? "eng",
          confidence: 0.93,
          blocks: [{ bbox: { x: 0, y: 0, w: 10, h: 10 }, confidence: 0.93, paragraphs: [] }],
          durationMs: 900,
          image: { width: 1170, height: 2532 },
          readingOrder: "auto" as const,
          preprocessing: [],
          engine: { name: "fake", version: "1" },
          timings: { validateMs: 1, prepareMs: 2, initMs: 3, recogniseMs: 894, totalMs: 900 },
          parts: 1,
          fallbacks: [],
        };
      }),
      cancel: vi.fn(),
      dispose: vi.fn(),
      warmup: vi.fn(),
      engineLoaded: false,
    } as unknown as OcrService));
    const rt = createWorkspaceRuntime({ broker, caps: CAPS, createOcrService: create });
    const { added } = await rt.ingest([png("chat-light/a.png")], "picker");
    expect(create).not.toHaveBeenCalled();
    const output = await rt.extractText(added[0], "eng+hin");
    expect(create).toHaveBeenCalledTimes(1);
    expect(released).toEqual(expect.arrayContaining(["vision", "document"]));
    expect(rt.ocrResults.get(output.resultId)?.blocks).toHaveLength(1);
    const state = rt.store.getState().ocr.byAsset[added[0]];
    expect(state).toMatchObject({ status: "done", language: "eng+hin", editedText: "Hello नमस्ते", progress: 1 });
    expect(state).not.toHaveProperty("blocks");
    rt.store.getState().setOcrEditedText(added[0], "Corrected text");
    expect(rt.store.getState().ocr.byAsset[added[0]].editedText).toBe("Corrected text");
    rt.removeFile(added[0]);
    expect(rt.ocrResults.stats().results).toBe(0);
  });

  it("cancels an active OCR job and leaves a controlled state", async () => {
    let rejectExtract: ((reason: unknown) => void) | undefined;
    const cancel = vi.fn(async () => rejectExtract?.(Object.assign(new Error("cancelled"), { code: "OCR_CANCELLED" })));
    const service = {
      extract: vi.fn(() => new Promise<OcrResult>((_resolve, reject) => { rejectExtract = reject; })) as unknown as OcrService["extract"],
      cancel,
      dispose: vi.fn(),
      warmup: vi.fn(),
      engineLoaded: false,
    } as unknown as OcrService;
    const { broker } = fakeBroker({});
    const rt = createWorkspaceRuntime({ broker, caps: CAPS, createOcrService: async () => service });
    const { added } = await rt.ingest([png("chat-light/a.png")], "picker");
    const pending = rt.extractText(added[0]);
    await vi.waitFor(() => expect(service.extract).toHaveBeenCalled());
    await rt.cancelOcr(added[0]);
    await expect(pending).rejects.toMatchObject({ code: "OCR_CANCELLED" });
    expect(cancel).toHaveBeenCalled();
    expect(rt.store.getState().ocr.byAsset[added[0]]).toMatchObject({ status: "cancelled", error: "OCR_CANCELLED" });
  });

  it("stops a stalled OCR job with the production timeout code", async () => {
    let rejectExtract: ((reason: unknown) => void) | undefined;
    const service = {
      extract: vi.fn(() => new Promise<OcrResult>((_resolve, reject) => { rejectExtract = reject; })) as unknown as OcrService["extract"],
      cancel: vi.fn(async () => rejectExtract?.(Object.assign(new Error("cancelled"), { code: "OCR_CANCELLED" }))),
      dispose: vi.fn(), warmup: vi.fn(), engineLoaded: false,
    } as unknown as OcrService;
    const { broker } = fakeBroker({});
    const rt = createWorkspaceRuntime({ broker, caps: CAPS, createOcrService: async () => service, ocrTimeoutMs: 10 });
    const { added } = await rt.ingest([png("chat-light/a.png")], "picker");
    await expect(rt.extractText(added[0])).rejects.toMatchObject({ code: "OCR_TIMEOUT" });
    expect(rt.store.getState().ocr.byAsset[added[0]]).toMatchObject({ status: "failed", error: "OCR_TIMEOUT" });
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
