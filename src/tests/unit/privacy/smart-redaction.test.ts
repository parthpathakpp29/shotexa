import { describe, expect, it } from "vitest";
import { decodeYuNet, faceScanAllowed } from "@/core/privacy/face-detect";
import { detectPlateText } from "@/core/privacy/detectors";
import { batchEligibleImageIds } from "@/core/privacy/safe-workspace";
import type { OcrResult } from "@/core/ocr/types";
import type { WorkspaceFile } from "@/core/runtime/types";

describe("local face suggestions", () => {
  it("keeps large images in manual mode, with a lower limit on low-memory devices", () => {
    expect(faceScanAllowed({ width: 6000, height: 5000 })).toBe(false);
    expect(faceScanAllowed({ width: 4000, height: 4000 }, 4)).toBe(false);
    expect(faceScanAllowed({ width: 4000, height: 3000 }, 4)).toBe(true);
  });
  it("maps two letterboxed faces to source pixels", () => {
    const outputs: Record<string, { data: Float32Array }> = {};
    for (const stride of [8, 16, 32]) {
      const cells = (640 / stride) ** 2;
      outputs[`cls_${stride}`] = { data: new Float32Array(cells) };
      outputs[`obj_${stride}`] = { data: new Float32Array(cells) };
      outputs[`bbox_${stride}`] = { data: new Float32Array(cells * 4) };
    }
    const index = 20 * 40 + 20;
    outputs.cls_16.data[index] = 0.95;
    outputs.obj_16.data[index] = 0.96;
    outputs.bbox_16.data[index * 4 + 2] = Math.log(4);
    outputs.bbox_16.data[index * 4 + 3] = Math.log(4);
    const second = 20 * 40 + 8;
    outputs.cls_16.data[second] = 0.91;
    outputs.obj_16.data[second] = 0.92;
    outputs.bbox_16.data[second * 4 + 2] = Math.log(4);
    outputs.bbox_16.data[second * 4 + 3] = Math.log(4);
    const faces = decodeYuNet(outputs, { width: 640, height: 320 });
    expect(faces).toHaveLength(2);
    expect(faces[0].rect.x).toBeGreaterThan(270);
    expect(faces[0].rect.y).toBeGreaterThan(100);
    expect(faces[0].rect.width).toBeGreaterThan(60);
  });
});

describe("plate text suggestions", () => {
  it("uses original OCR coordinates and does not invent regions for unrelated text", () => {
    const lines = ["MH12AB1234", "WELCOME"].map((text, index) => ({
      text, bbox: { x: 50, y: 40 + index * 40, w: 180, h: 26 }, confidence: 0.95,
      words: [{ text, bbox: { x: 50, y: 40 + index * 40, w: 180, h: 26 }, confidence: 0.95 }],
    }));
    const ocr = { blocks: [{ paragraphs: [{ lines }] }] } as OcrResult;
    const findings = detectPlateText(ocr);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ detector: "plate-text", selected: false, regions: [{ x: 50, y: 40, width: 180, height: 26 }] });
  });
});

describe("sanitized workspace continuation", () => {
  it("uses a safe copy instead of its original in multi-image exports", () => {
    const file = (id: string, producedBy?: WorkspaceFile["producedBy"], derivedFrom?: string[]): WorkspaceFile => ({
      id, name: `${id}.png`, type: "image/png", bytes: 4, width: 1, height: 1,
      source: producedBy ? "artifact" : "picker", kind: producedBy ? "artifact" : "original",
      producedBy, derivedFrom, addedAt: 0, previewVersion: 0,
    });
    const files = { original: file("original"), other: file("other"), safe: file("safe", "safe-share", ["original"]) };
    expect(batchEligibleImageIds(["original", "other", "safe"], files)).toEqual(["other", "safe"]);
    expect(batchEligibleImageIds(["original", "other"], files)).toEqual(["original", "other"]);
  });
});
