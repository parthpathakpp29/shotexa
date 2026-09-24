/**
 * Smart Stitch benchmark (Node path: pngjs/jpeg-js decode + area-average proxies +
 * OpenCV.js WASM). The browser path is measured separately by the Playwright spec.
 *
 *   npm run bench:stitch
 *
 * Writes docs/spikes/results/stitch-benchmark-node.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyseStitch } from "@/core/stitch/analyse";
import { DEFAULT_STITCH_CONFIG } from "@/core/stitch/config";
import { createOpenCvMatcher } from "@/core/stitch/opencv-matcher";
import { createRgbaSource } from "@/core/stitch/sources";
import type { TemplateMatcher } from "@/core/stitch/matcher";
import { decodeFixture, loadManifest, loadOpenCvNode } from "../helpers/stitch-fixtures";

/** Offsets within this many full-res px count as correct. */
const TOLERANCE_PX = 1;

interface Row {
  id: string;
  format: string;
  size: string;
  expect: string;
  expectedOverlap: number | null;
  detectedOverlap: number | null;
  errorPx: number | null;
  confidence: number;
  confidenceClass: string;
  status: string;
  manualReviewRequired: boolean;
  outcome: string;
  analyseMs: number;
}

const rows: Row[] = [];
let matcher: TemplateMatcher;
let cvInitMs = 0;

beforeAll(async () => {
  const t = performance.now();
  matcher = createOpenCvMatcher(await loadOpenCvNode());
  cvInitMs = performance.now() - t;
});

describe("Smart Stitch benchmark", () => {
  for (const f of loadManifest()) {
    it(f.id, async (ctx) => {
      const a = decodeFixture(f.files.a);
      const b = decodeFixture(f.files.b);
      if (!a || !b) {
        ctx.skip(); // WebP: browser benchmark only
        return;
      }
      const res = await analyseStitch(createRgbaSource(a.data, a.width, a.height), createRgbaSource(b.data, b.width, b.height), matcher);

      const detectedOverlap = res.detectedOffsetY === null ? null : f.height - res.detectedOffsetY;
      const errorPx = f.expectedOffsetY !== null && res.detectedOffsetY !== null ? res.detectedOffsetY - f.expectedOffsetY : null;
      const correct = errorPx !== null && Math.abs(errorPx) <= TOLERANCE_PX;
      const manualReviewRequired = res.confidenceClass !== "high";

      let outcome: string;
      if (f.expect === "no-match") outcome = res.confidenceClass === "high" ? "FALSE-HIGH" : "correct-reject";
      else if (correct) outcome = manualReviewRequired ? "correct-needs-review" : "correct-auto";
      else outcome = res.confidenceClass === "high" ? "WRONG-HIGH" : "wrong-flagged";

      rows.push({
        id: f.id,
        format: f.format,
        size: `${f.width}x${f.height}`,
        expect: f.expect,
        expectedOverlap: f.expectedOffsetY === null ? null : f.expectedOverlap,
        detectedOverlap: res.status === "matched" ? detectedOverlap : null,
        errorPx,
        confidence: +res.confidence.toFixed(3),
        confidenceClass: res.confidenceClass,
        status: res.status,
        manualReviewRequired,
        outcome,
        analyseMs: res.timings.total,
      });

      // Safety property: a high-confidence result must never be wrong.
      expect(outcome).not.toBe("WRONG-HIGH");
      expect(outcome).not.toBe("FALSE-HIGH");
    });
  }
});

afterAll(() => {
  const out = join(process.cwd(), "docs", "spikes", "results");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "stitch-benchmark-node.json"),
    JSON.stringify({ environment: `node ${process.version}`, matcher: matcher?.name, cvInitMs: Math.round(cvInitMs), tolerancePx: TOLERANCE_PX, config: DEFAULT_STITCH_CONFIG, rows }, null, 2) + "\n",
  );
  console.table(
    rows.map((r) => ({ id: r.id, expOv: r.expectedOverlap, detOv: r.detectedOverlap, err: r.errorPx, conf: r.confidence, cls: r.confidenceClass, outcome: r.outcome, ms: r.analyseMs })),
  );
  console.log(`OpenCV init ${Math.round(cvInitMs)} ms`);
});
