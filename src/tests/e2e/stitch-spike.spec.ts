/**
 * Browser benchmark + critical flow for Spike A:
 *   multiple uploads → auto stitch → manual correction → full-res export
 * Runs every fixture (incl. WebP) through the real browser path: createImageBitmap,
 * OffscreenCanvas proxies, module worker, OpenCV.js WASM.
 * Also asserts that no request carries screenshot data.
 *
 * Writes docs/spikes/results/stitch-benchmark-browser.json.
 */
import { expect, test, type Page, type Request } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DIR, loadManifest } from "../helpers/stitch-fixtures";

const TOLERANCE_PX = 1;

async function analyse(page: Page, files: string[]) {
  await page.getByTestId("stitch-result").evaluate((el) => (el.textContent = ""));
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByTestId("stitch-result")).not.toHaveText("", { timeout: 120_000 });
  return JSON.parse((await page.getByTestId("stitch-result").textContent())!);
}

test("stitch benchmark in the browser", async ({ page, browserName }) => {
  const suspicious: string[] = [];
  page.on("request", (req: Request) => {
    const body = req.postDataBuffer();
    if (req.method() !== "GET" || (body && body.length > 1024)) suspicious.push(`${req.method()} ${req.url()} ${body?.length ?? 0}B`);
  });

  await page.goto("/spikes/stitch");
  const rows = [];
  let first = true;
  for (const f of loadManifest()) {
    const t = Date.now();
    const r = await analyse(page, [join(FIXTURE_DIR, f.files.a), join(FIXTURE_DIR, f.files.b)]);
    const wallMs = Date.now() - t;
    const errorPx = f.expectedOffsetY !== null && r.detectedOffsetY !== null ? r.detectedOffsetY - f.expectedOffsetY : null;
    const correct = errorPx !== null && Math.abs(errorPx) <= TOLERANCE_PX;
    const manualReviewRequired = r.confidenceClass !== "high";
    const outcome =
      f.expect === "no-match"
        ? r.confidenceClass === "high" ? "FALSE-HIGH" : "correct-reject"
        : correct ? (manualReviewRequired ? "correct-needs-review" : "correct-auto") : r.confidenceClass === "high" ? "WRONG-HIGH" : "wrong-flagged";
    rows.push({
      id: f.id,
      format: f.format,
      size: `${f.width}x${f.height}`,
      expect: f.expect,
      expectedOverlap: f.expectedOffsetY === null ? null : f.expectedOverlap,
      detectedOverlap: r.status === "matched" ? f.height - r.detectedOffsetY : null,
      errorPx,
      confidence: +r.confidence.toFixed(3),
      confidenceClass: r.confidenceClass,
      status: r.status,
      bandHypothesis: r.bandHypothesis,
      manualReviewRequired,
      outcome,
      analyseMs: r.timings.total,
      decodeMs: r.decodeMs,
      engineLoadMs: r.engineLoadMs,
      wallMs,
      coldStart: first,
    });
    first = false;
    expect.soft(outcome, f.id).not.toMatch(/WRONG-HIGH|FALSE-HIGH/);
  }

  const out = join(process.cwd(), "docs", "spikes", "results");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, `stitch-benchmark-browser.json`),
    JSON.stringify({ environment: `${browserName} (Playwright ${test.info().project.name})`, tolerancePx: TOLERANCE_PX, rows }, null, 2) + "\n",
  );
  expect(suspicious, "no non-GET / body-carrying requests while stitching").toEqual([]);
});

test("manual correction + full-resolution export", async ({ page }) => {
  const f = loadManifest().find((x) => x.id === "non-overlap-chat")!;
  await page.goto("/spikes/stitch");
  const r = await analyse(page, [join(FIXTURE_DIR, f.files.a), join(FIXTURE_DIR, f.files.b)]);
  expect(r.status).toBe("no-match");
  expect(r.currentOffset).toBe(f.height); // end-to-end fallback

  // Manual correction via numeric input and keyboard.
  await page.getByTestId("offset-input").fill("2000");
  await page.getByLabel(/Stitch preview/).focus();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("stitch-result")).toContainText('"currentOffset":2009');

  await page.getByTestId("export").click();
  const link = page.getByTestId("download");
  await expect(link).toBeVisible({ timeout: 60_000 });
  // Output is composed from the ORIGINAL full-resolution files.
  await expect(link).toContainText(`${f.width}×${2009 + f.height}`);
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("stitched.png");
});
