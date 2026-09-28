import { describe, expect, it, vi } from "vitest";
import { COALESCE_MS, createWorkspaceStore, HISTORY_LIMIT, pairKey, selectJoinKeys, selectOriginals } from "@/core/runtime/store";
import type { StitchPair, WorkspaceDocument, WorkspaceFile } from "@/core/runtime/types";

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
