import { describe, expect, it, vi } from "vitest";
import { COALESCE_MS, createWorkspaceStore, HISTORY_LIMIT, pairKey, selectJoinKeys, selectOriginals } from "@/core/runtime/store";
import type { StitchPair, WorkspaceDocument, WorkspaceFile } from "@/core/runtime/types";
import { flipTransform, IDENTITY_TRANSFORM, rotateTransform, withOutputWidth, withVisibleCrop } from "@/core/image-transform/transform";
import type { AnnotationObject } from "@/core/annotation/types";
import { addLine, cutsFor, defaultSplit, moveLine, removeLine } from "@/core/split/plan";

const file = (id: string, extra: Partial<WorkspaceFile> = {}): WorkspaceFile => ({
  id,
  name: `${id}.png`,
  type: "image/png",
  bytes: 100,
  width: 1000,
  height: 2000,
  source: "picker",
  kind: "original",
  addedAt: 0,
  previewVersion: 0,
  ...extra,
});

const pair = (a: string, b: string, offset = 1200): StitchPair => ({
  key: pairKey(a, b),
  a,
  b,
  status: "ready",
  autoOffset: offset,
  offset,
  confidence: "high",
  matched: true,
  bands: { top: 0, bottom: 0 },
});

function setup(ids = ["a", "b", "c"]) {
  const onRemove = vi.fn();
  const store = createWorkspaceStore(onRemove);
  store.getState().addFiles(ids.map((id) => file(id)));
  return { store, s: () => store.getState(), onRemove };
}

describe("workspace store — files", () => {
  it("adds files in order and selects the first", () => {
    const { s } = setup();
    expect(s().order).toEqual(["a", "b", "c"]);
    expect(s().selectedId).toBe("a");
    s().addFiles([file("d")]);
    expect(s().order).toEqual(["a", "b", "c", "d"]);
    expect(s().selectedId).toBe("a"); // adding more keeps the selection
  });

  it("adding files re-arms the overlap hint", () => {
    const { s } = setup();
    s().setOverlapHint({ status: "unlikely", dismissed: true });
    s().addFiles([file("d")]);
    expect(s().overlapHint).toMatchObject({ status: "idle", dismissed: false });
  });

  it("removes a file: order, selection, pairs, history and the registry callback", () => {
    const { s, onRemove } = setup();
    s().setPair(pair("a", "b"));
    s().setPair(pair("b", "c"));
    s().select("b");
    s().reorder(0, 2);
    s().removeFile("b");
    expect(s().order).toEqual(["c", "a"]);
    expect(s().selectedId).toBe("c");
    expect(Object.keys(s().stitch.pairs)).toEqual([]);
    expect(s().history.past).toEqual([]);
    expect(onRemove).toHaveBeenCalledWith("b");
    s().removeFile("missing");
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("clear() releases every asset and resets state", () => {
    const { s, onRemove } = setup();
    s().clear();
    expect(s().order).toEqual([]);
    expect(onRemove.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
  });
});

describe("workspace store — ordering and history", () => {
  it("reorders, and undo/redo replay the move", () => {
    const { s } = setup();
    s().reorder(2, 0);
    expect(s().order).toEqual(["c", "a", "b"]);
    s().undo();
    expect(s().order).toEqual(["a", "b", "c"]);
    s().redo();
    expect(s().order).toEqual(["c", "a", "b"]);
  });

  it("ignores no-op and out-of-range moves", () => {
    const { s } = setup();
    s().reorder(1, 1);
    s().reorder(-1, 0);
    s().reorder(0, 5);
    expect(s().history.past).toHaveLength(0);
  });

  it("reordering resets the hint and the active join", () => {
    const { s } = setup();
    s().setOverlapHint({ status: "likely" });
    s().setActiveJoin(1);
    s().reorder(0, 1);
    expect(s().overlapHint.status).toBe("idle");
    expect(s().stitch.activeJoin).toBe(0);
  });

  it("a new edit clears the redo stack", () => {
    const { s } = setup();
    s().reorder(0, 1);
    s().undo();
    expect(s().history.future).toHaveLength(1);
    s().reorder(1, 2);
    expect(s().history.future).toHaveLength(0);
  });

  it("caps history", () => {
    const { s } = setup();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s().reorder(0, 1);
    expect(s().history.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe("workspace store — Combine settings", () => {
  it("records layout settings as logical undoable state", () => {
    const { s } = setup(["a", "b"]);
    s().setCombineSettings({ layout: "grid", gap: 24, gridColumns: 2 });
    expect(s().combine).toMatchObject({ layout: "grid", gap: 24, gridColumns: 2 });
    s().undo();
    expect(s().combine).toMatchObject({ layout: "vertical", gap: 16, gridColumns: "auto" });
    s().redo();
    expect(s().combine).toMatchObject({ layout: "grid", gap: 24, gridColumns: 2 });
  });
});

describe("workspace store — stitch offsets", () => {
  it("records offset edits as undoable operations", () => {
    const { s } = setup(["a", "b"]);
    const k = pairKey("a", "b");
    s().setPair(pair("a", "b", 1200));
    s().setPairOffset(k, 1210, { now: 0 });
    s().setPairOffset(k, 1220, { now: 10_000 });
    expect(s().stitch.pairs[k].offset).toBe(1220);
    s().undo();
    expect(s().stitch.pairs[k].offset).toBe(1210);
    s().undo();
    expect(s().stitch.pairs[k].offset).toBe(1200);
    s().redo();
    expect(s().stitch.pairs[k].offset).toBe(1210);
  });

  it("coalesces rapid drag edits into one undo step only when asked", () => {
    const { s } = setup(["a", "b"]);
    const k = pairKey("a", "b");
    s().setPair(pair("a", "b", 1200));
    s().setPairOffset(k, 1201, { coalesce: true, now: 1000 });
    s().setPairOffset(k, 1205, { coalesce: true, now: 1000 + COALESCE_MS - 1 });
    expect(s().history.past).toHaveLength(1);
    s().setPairOffset(k, 1210, { coalesce: true, now: 1000 + 3 * COALESCE_MS });
    expect(s().history.past).toHaveLength(2);
    s().setPairOffset(k, 1211, { now: 1000 + 3 * COALESCE_MS + 1 }); // not a drag
    expect(s().history.past).toHaveLength(3);
    s().undo();
    s().undo();
    expect(s().stitch.pairs[k].offset).toBe(1205);
    s().undo();
    expect(s().stitch.pairs[k].offset).toBe(1200);
  });

  it("record:false edits don't touch history; unchanged values are ignored", () => {
    const { s } = setup(["a", "b"]);
    const k = pairKey("a", "b");
    s().setPair(pair("a", "b", 1200));
    s().setPairOffset(k, 1200);
    s().setPairOffset(k, 1300, { record: false });
    expect(s().history.past).toHaveLength(0);
    expect(s().stitch.pairs[k].offset).toBe(1300);
  });

  it("resetPairs returns every join to its automatic offset (undoable)", () => {
    const { s } = setup();
    s().setPair(pair("a", "b", 1200));
    s().setPair(pair("b", "c", 900));
    s().setPairOffset(pairKey("a", "b"), 1250);
    s().setPairOffset(pairKey("b", "c"), 950);
    s().resetPairs();
    expect(s().stitch.pairs[pairKey("a", "b")].offset).toBe(1200);
    expect(s().stitch.pairs[pairKey("b", "c")].offset).toBe(900);
    s().undo();
    expect(s().stitch.pairs[pairKey("b", "c")].offset).toBe(950);
  });
});

describe("workspace store — production PDF", () => {
  it("stores page settings and input order as lightweight state", () => {
    const { s } = setup(["a", "b"]);
    s().setPdfInputs(["b", "a"]);
    s().setPdfSettings({ paper: "letter", marginPt: 36, smart: false, imageFormat: "png" });
    expect(s().pdf).toMatchObject({ inputIds: ["b", "a"], paper: "letter", marginPt: 36, smart: false, imageFormat: "png" });
    expect(s().pdf).not.toHaveProperty("signals");
  });

  it("records page-break changes for undo/redo and coalesces a drag", () => {
    const { s } = setup(["a"]);
    s().setPdfBreakEdit("a", { manual: [1500] }, { coalesce: true, now: 1000 });
    s().setPdfBreakEdit("a", { manual: [1510] }, { coalesce: true, now: 1000 + COALESCE_MS - 1 });
    expect(s().history.past).toHaveLength(1);
    expect(s().pdf.edits.a.manual).toEqual([1510]);
    s().undo();
    expect(s().pdf.edits.a.manual).toEqual([]);
    s().redo();
    expect(s().pdf.edits.a.manual).toEqual([1510]);
    s().resetPdfBreaks("a");
    expect(s().pdf.edits.a).toEqual({ manual: [] });
  });

  it("keeps PDF outputs outside the image order and releases them", () => {
    const { s, onRemove } = setup(["a"]);
    const document: WorkspaceDocument = { id: "pdf-1", name: "shotexa-screenshots.pdf", type: "application/pdf", bytes: 1234, pageCount: 3, sourceIds: ["a"], producedBy: "pdf", addedAt: 1 };
    s().addDocument(document);
    expect(s().order).toEqual(["a"]);
    expect(s().documentOrder).toEqual(["pdf-1"]);
    expect(s().pdf.lastDocumentId).toBe("pdf-1");
    s().removeDocument("pdf-1");
    expect(s().documents["pdf-1"]).toBeUndefined();
    expect(onRemove).toHaveBeenCalledWith("pdf-1");
  });
});

describe("workspace store — artifacts", () => {
  it("adds a tool result as a selected artifact that is not a stitch input", () => {
    const { s } = setup(["a", "b"]);
    s().addArtifact(file("r", { kind: "artifact", producedBy: "stitch", derivedFrom: ["a", "b"], source: "artifact" }));
    expect(s().order).toEqual(["a", "b", "r"]);
    expect(s().selectedId).toBe("r");
    expect(s().lastArtifactId).toBe("r");
    expect(selectOriginals(s()).map((f) => f.id)).toEqual(["a", "b"]);
    expect(selectJoinKeys(s())).toEqual([pairKey("a", "b")]);
    s().removeFile("r");
    expect(s().lastArtifactId).toBeNull();
  });

  it("join keys follow the original order", () => {
    const { s } = setup();
    expect(selectJoinKeys(s())).toEqual(["a|b", "b|c"]);
    s().reorder(2, 0);
    expect(selectJoinKeys(s())).toEqual(["c|a", "a|b"]);
  });
});

describe("workspace store — OCR state", () => {
  it("tracks language, progress and editable text without structured OCR boxes", () => {
    const { s } = setup(["a"]);
    s().setOcrLanguage("eng+hin");
    s().beginOcr("a");
    s().setOcrProgress("a", 0.42, "recognizing text");
    expect(s().ocr.byAsset.a).toMatchObject({ status: "running", language: "eng+hin", progress: 0.42 });
    s().completeOcr("a", { resultId: "result-1", editedText: "Hello नमस्ते", confidence: 0.9, durationMs: 1200 });
    s().setOcrEditedText("a", "Hello, corrected");
    expect(s().ocr.byAsset.a).toEqual(expect.objectContaining({ status: "done", resultId: "result-1", editedText: "Hello, corrected" }));
    expect(s().ocr.byAsset.a).not.toHaveProperty("blocks");
    expect(s().ocr.byAsset.a).not.toHaveProperty("words");
  });

  it("records controlled cancellation/failure and removes state with the asset", () => {
    const { s } = setup(["a"]);
    s().beginOcr("a", "eng");
    s().cancelOcr("a");
    expect(s().ocr.byAsset.a).toMatchObject({ status: "cancelled", error: "OCR_CANCELLED" });
    s().beginOcr("a", "eng");
    s().failOcr("a", "OCR_ENGINE_LOAD_FAILED");
    expect(s().ocr.byAsset.a).toMatchObject({ status: "failed", error: "OCR_ENGINE_LOAD_FAILED" });
    s().removeFile("a");
    expect(s().ocr.byAsset.a).toBeUndefined();
  });
});

describe("workspace store — Screenshot Editor", () => {
  const source = { width: 1000, height: 2000 };

  it("records each transform change as one undoable step, without touching the file", () => {
    const { s } = setup(["a"]);
    const cropped = withVisibleCrop(IDENTITY_TRANSFORM, source, { x: 100, y: 200, width: 400, height: 300 });
    const turned = rotateTransform(cropped, "cw");
    const flipped = flipTransform(turned, "horizontal");
    s().setEditTransform("a", cropped);
    s().setEditTransform("a", turned);
    s().setEditTransform("a", flipped);
    expect(s().history.past).toHaveLength(3);
    expect(s().editor.byAsset.a).toEqual(flipped);
    s().undo();
    expect(s().editor.byAsset.a).toEqual(turned);
    s().undo();
    s().undo();
    expect(s().editor.byAsset.a).toEqual(IDENTITY_TRANSFORM);
    s().redo();
    s().redo();
    expect(s().editor.byAsset.a).toEqual(turned);
    // The source file is logical metadata only and never changes.
    expect(s().files.a).toMatchObject({ width: 1000, height: 2000, kind: "original" });
  });

  it("makes reset undoable and ignores no-op changes", () => {
    const { s } = setup(["a"]);
    const t = rotateTransform(IDENTITY_TRANSFORM, "cw");
    s().setEditTransform("a", t);
    s().setEditTransform("a", t); // unchanged
    expect(s().history.past).toHaveLength(1);
    s().resetEditTransform("a");
    expect(s().editor.byAsset.a).toEqual(IDENTITY_TRANSFORM);
    s().undo();
    expect(s().editor.byAsset.a).toEqual(t);
  });

  it("coalesces rapid typed edits of one asset only when asked", () => {
    const { s } = setup(["a", "b"]);
    const w = (n: number) => withOutputWidth(IDENTITY_TRANSFORM, source, n);
    s().setEditTransform("a", w(900), { coalesce: true, now: 1000 });
    s().setEditTransform("a", w(800), { coalesce: true, now: 1000 + COALESCE_MS - 1 });
    expect(s().history.past).toHaveLength(1);
    s().setEditTransform("b", w(700), { coalesce: true, now: 1000 + COALESCE_MS - 1 }); // other asset
    expect(s().history.past).toHaveLength(2);
    s().setEditTransform("a", w(600), { now: 1000 + COALESCE_MS - 1 }); // not coalescing
    expect(s().history.past).toHaveLength(3);
    s().undo();
    s().undo();
    s().undo();
    expect(s().editor.byAsset.a).toEqual(IDENTITY_TRANSFORM);
  });

  it("interleaves with other tools' history, and drops an asset's edits when it is removed", () => {
    const { s } = setup(["a", "b"]);
    s().setEditTransform("a", rotateTransform(IDENTITY_TRANSFORM, "cw"));
    s().reorder(0, 1);
    s().undo(); // undoes the reorder, not the edit
    expect(s().order).toEqual(["a", "b"]);
    expect(s().editor.byAsset.a.rotation).toBe(90);
    s().removeFile("a");
    expect(s().editor.byAsset.a).toBeUndefined();
    s().setEditTransform("missing", rotateTransform(IDENTITY_TRANSFORM, "cw"));
    expect(s().editor.byAsset.missing).toBeUndefined();
  });
});

describe("workspace store — Annotation", () => {
  const arrow = (id: string, x = 10): AnnotationObject => ({ id, type: "arrow", color: "#e5383b", from: { x, y: 10 }, to: { x: x + 50, y: 10 }, width: 4 });

  it("makes add, move, restyle, delete and clear each one undoable step", () => {
    const { s } = setup(["a"]);
    const added = [arrow("x")];
    const moved = [arrow("x", 40)];
    const restyled = [{ ...moved[0], color: "#16a34a" }];
    s().setAnnotations("a", added, { select: "x" });
    s().setAnnotations("a", moved);
    s().setAnnotations("a", restyled);
    s().setAnnotations("a", []); // delete / clear
    expect(s().history.past).toHaveLength(4);
    s().undo();
    expect(s().annotation.byAsset.a).toEqual(restyled);
    s().undo();
    s().undo();
    expect(s().annotation.byAsset.a).toEqual(added);
    s().redo();
    expect(s().annotation.byAsset.a).toEqual(moved);
    // Pixels were never involved: the file is untouched.
    expect(s().files.a).toMatchObject({ width: 1000, height: 2000, kind: "original" });
  });

  it("clears a selection that undo removes, and never records a no-op", () => {
    const { s } = setup(["a"]);
    s().setAnnotations("a", [arrow("x")], { select: "x" });
    expect(s().annotation.selectedId).toBe("x");
    s().undo();
    expect(s().annotation.selectedId).toBeNull();
    s().redo();
    s().setAnnotations("a", [arrow("x")]); // unchanged
    expect(s().history.past).toHaveLength(1);
  });

  it("coalesces a burst of typing into one step, only when asked", () => {
    const { s } = setup(["a"]);
    const text = (t: string): AnnotationObject[] => [{ id: "t", type: "text", color: "#000", at: { x: 0, y: 0 }, text: t, size: 20 }];
    s().setAnnotations("a", text("H"), { now: 0 });
    s().setAnnotations("a", text("He"), { coalesce: "text:t", now: 100 });
    s().setAnnotations("a", text("Hey"), { coalesce: "text:t", now: 200 });
    expect(s().history.past).toHaveLength(2);
    s().undo();
    expect(s().annotation.byAsset.a).toEqual(text("H"));
  });

  it("never folds an unrelated quick action into a typing step", () => {
    const { s } = setup(["a"]);
    s().setAnnotations("a", [arrow("x")], { now: 0 }); // add an arrow…
    s().setAnnotations("a", [arrow("x", 20)], { coalesce: "nudge:x", now: 100 }); // …then nudge it
    s().setAnnotations("a", [arrow("x", 30)], { coalesce: "nudge:x", now: 200 });
    s().setAnnotations("a", [arrow("x", 30), arrow("y")], { coalesce: "text:y", now: 300 }); // different gesture
    expect(s().history.past).toHaveLength(3); // add · nudges · other
    s().undo();
    s().undo();
    expect(s().annotation.byAsset.a).toEqual([arrow("x")]); // the add survived
  });

  it("keeps tool and style out of history, and drops an asset's marks when it is removed", () => {
    const { s } = setup(["a"]);
    s().setAnnotationTool("step");
    s().setAnnotationStyle({ color: "#2563eb" });
    expect(s().history.past).toHaveLength(0);
    expect(s().annotation).toMatchObject({ tool: "step", style: { color: "#2563eb" } });
    s().setAnnotations("a", [arrow("x")]);
    s().removeFile("a");
    expect(s().annotation.byAsset.a).toBeUndefined();
    s().setAnnotations("missing", [arrow("y")]);
    expect(s().annotation.byAsset.missing).toBeUndefined();
  });
});

describe("workspace store — Split", () => {
  const H = 2000; // file() height
  let n = 0;
  const id = () => `line${++n}`;

  it("records add, move, delete, count, target height and reset as separate undo steps", () => {
    const { s } = setup(["a"]);
    const start = defaultSplit({ width: 1000, height: H });
    s().setSplit("a", { ...start, count: 4 }); // count
    s().setSplit("a", { ...s().split.byAsset.a, by: "height", height: 700 }); // target height
    const added = addLine(s().split.byAsset.a, 300, H, id); // add (converts to custom)
    s().setSplit("a", added);
    const moved = moveLine(added, added.lines[0].id, 350, H);
    s().setSplit("a", moved); // move (one drag = one commit)
    s().setSplit("a", removeLine(moved, moved.lines[1].id)); // delete
    s().setSplit("a", null); // reset
    expect(s().history.past.filter((op) => op.type === "SPLIT_SET")).toHaveLength(6);
    expect(s().split.byAsset.a).toBeUndefined();

    s().undo(); // reset
    expect(cutsFor(s().split.byAsset.a, H)).toEqual([350, 1400]);
    s().undo(); // delete
    expect(cutsFor(s().split.byAsset.a, H)).toEqual([350, 700, 1400]);
    s().undo(); // move
    expect(cutsFor(s().split.byAsset.a, H)).toEqual([300, 700, 1400]);
    s().undo(); // add
    expect(s().split.byAsset.a).toMatchObject({ mode: "equal", by: "height", height: 700 });
    s().undo(); // target height
    expect(s().split.byAsset.a).toMatchObject({ mode: "equal", by: "count", count: 4 });
    s().undo(); // count → never split (the page shows the default split again)
    expect(s().split.byAsset.a).toBeUndefined();
    for (let i = 0; i < 6; i++) s().redo();
    expect(s().split.byAsset.a).toBeUndefined();
  });

  it("coalesces only the same gesture key and skips no-ops", () => {
    const { s } = setup(["a"]);
    const base = defaultSplit({ width: 1000, height: H });
    s().setSplit("a", { ...base, count: 3 }, { coalesce: "count", now: 1000 });
    s().setSplit("a", { ...base, count: 4 }, { coalesce: "count", now: 1100 });
    s().setSplit("a", { ...base, count: 5 }, { coalesce: "count", now: 1200 });
    s().setSplit("a", { ...base, count: 5 }, { coalesce: "count", now: 1300 }); // no-op
    expect(s().history.past).toHaveLength(1);
    s().setSplit("a", { ...base, count: 5, by: "height" }, { coalesce: "by", now: 1250 });
    expect(s().history.past).toHaveLength(2);
    s().setSplit("a", { ...base, count: 6, by: "height" }, { coalesce: "count", now: 1300 + COALESCE_MS });
    expect(s().history.past).toHaveLength(3);
    s().undo();
    s().undo();
    expect(s().split.byAsset.a.count).toBe(5);
    s().undo();
    expect(s().split.byAsset.a).toBeUndefined();
  });

  it("removing a file drops its split and adding pieces selects the first", () => {
    const { s } = setup(["a", "b"]);
    s().setSplit("a", defaultSplit({ width: 1000, height: H }));
    s().removeFile("a");
    expect(s().split.byAsset.a).toBeUndefined();
    s().addArtifacts([file("p1", { kind: "artifact", producedBy: "split" }), file("p2", { kind: "artifact", producedBy: "split" })]);
    expect(s().order).toEqual(["b", "p1", "p2"]);
    expect(s().selectedId).toBe("p1");
    expect(s().lastArtifactId).toBe("p1");
    s().setSplit("missing", defaultSplit({ width: 1, height: 100 }));
    expect(s().split.byAsset.missing).toBeUndefined();
  });
});
