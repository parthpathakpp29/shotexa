/**
 * Optional parameter sweep (not part of the default run):
 *   STITCH_SWEEP=1 npx vitest run src/tests/benchmark/stitch-sweep.test.ts
 */
import { it } from "vitest";
import { analyseStitch } from "@/core/stitch/analyse";
import { createOpenCvMatcher } from "@/core/stitch/opencv-matcher";
import { createRgbaSource } from "@/core/stitch/sources";
import { decodeFixture, loadManifest, loadOpenCvNode } from "../helpers/stitch-fixtures";

it.runIf(process.env.STITCH_SWEEP)("proxy width sweep", async () => {
  const matcher = createOpenCvMatcher(await loadOpenCvNode());
  const fixtures = loadManifest()
    .map((f) => ({ f, a: decodeFixture(f.files.a), b: decodeFixture(f.files.b) }))
    .filter((x) => x.a && x.b);
  for (const proxyMaxWidth of [240, 360, 480, 640]) {
    let exact = 0, high = 0, wrongHigh = 0, ms = 0;
    const misses: string[] = [];
    for (const { f, a, b } of fixtures) {
      const r = await analyseStitch(createRgbaSource(a!.data, a!.width, a!.height), createRgbaSource(b!.data, b!.width, b!.height), matcher, { config: { proxyMaxWidth } });
      ms += r.timings.total;
      const ok = f.expect === "no-match" ? r.confidenceClass !== "high" : r.detectedOffsetY !== null && Math.abs(r.detectedOffsetY - f.expectedOffsetY!) <= 1;
      if (ok) exact++; else misses.push(f.id);
      if (r.confidenceClass === "high") { high++; if (!ok) wrongHigh++; }
    }
    console.log(`proxy=${proxyMaxWidth} correct=${exact}/${fixtures.length} high=${high} wrongHigh=${wrongHigh} totalMs=${Math.round(ms)} misses=${misses.join(",")}`);
  }
});
