import { describe, expect, it } from "vitest";
import { clampRect, displayToImage, imageToDisplay, rectFromPoints } from "@/core/redaction/geometry";
import { createWorkspaceStore } from "@/core/runtime/store";
import type { WorkspaceFile } from "@/core/runtime/types";

const file: WorkspaceFile = {
  id: "image",
  name: "image.png",
  type: "image/png",
  bytes: 100,
  width: 1000,
  height: 2000,
  source: "picker",
  kind: "original",
  addedAt: 0,
  previewVersion: 0,
};

function setup() {
  const store = createWorkspaceStore();
  store.getState().addFiles([file]);
  return store;
}

describe("redaction geometry", () => {
  it("maps display coordinates to source pixels independently of zoom", () => {
    const fit = { imageWidth: 1000, imageHeight: 2000, displayWidth: 250, displayHeight: 500 };
    const full = { ...fit, displayWidth: 1000, displayHeight: 2000 };
    expect(displayToImage({ x: 25, y: 100 }, fit)).toEqual({ x: 100, y: 400 });
    expect(displayToImage({ x: 100, y: 400 }, full)).toEqual({ x: 100, y: 400 });
    expect(imageToDisplay({ x: 100, y: 400, width: 300, height: 200 }, fit)).toEqual({ x: 25, y: 100, width: 75, height: 50 });
  });

  it("normalises drag direction and clamps move/resize to image bounds", () => {
    expect(rectFromPoints({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 60 });
    expect(clampRect({ x: 950, y: 1980, width: 200, height: 200 }, 1000, 2000, 2)).toEqual({ x: 950, y: 1980, width: 50, height: 20 });
  });
});

describe("redaction operation history", () => {
  it("adds and deletes multiple logical redactions with undo/redo", () => {
    const store = setup();
    const s = () => store.getState();
    const first = s().addRedaction("image", { x: 10, y: 20, width: 100, height: 80 }, "blackout");
    const second = s().addRedaction("image", { x: 200, y: 300, width: 120, height: 90 }, "blur");
    expect(s().redaction.byAsset.image.map((r) => r.mode)).toEqual(["blackout", "blur"]);
    s().deleteRedaction("image", first);
    expect(s().redaction.byAsset.image.map((r) => r.id)).toEqual([second]);
    s().undo();
    expect(s().redaction.byAsset.image).toHaveLength(2);
    s().undo();
    expect(s().redaction.byAsset.image).toHaveLength(1);
    s().redo();
    expect(s().redaction.byAsset.image).toHaveLength(2);
  });

  it("moves, resizes and changes mode without raster snapshots", () => {
    const store = setup();
    const s = () => store.getState();
    const id = s().addRedaction("image", { x: 10, y: 20, width: 100, height: 80 }, "blackout");
    s().updateRedaction("image", id, { rect: { x: 980, y: 1990, width: 100, height: 100 }, mode: "pixelate", intensity: 24 });
    expect(s().redaction.byAsset.image[0]).toMatchObject({ mode: "pixelate", intensity: 24, rect: { x: 980, y: 1990, width: 20, height: 10 } });
    expect(JSON.stringify(s().history)).not.toContain("ImageData");
    s().undo();
    expect(s().redaction.byAsset.image[0]).toMatchObject({ mode: "blackout", rect: { x: 10, y: 20, width: 100, height: 80 } });
  });

  it("clears all regions as one undoable operation and removes state with its asset", () => {
    const store = setup();
    const s = () => store.getState();
    s().addRedaction("image", { x: 10, y: 20, width: 100, height: 80 });
    s().addRedaction("image", { x: 200, y: 220, width: 100, height: 80 });
    s().clearRedactions("image");
    expect(s().redaction.byAsset.image).toEqual([]);
    s().undo();
    expect(s().redaction.byAsset.image).toHaveLength(2);
    s().removeFile("image");
    expect(s().redaction.byAsset.image).toBeUndefined();
  });
});
