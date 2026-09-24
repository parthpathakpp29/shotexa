/**
 * Spike C browser flow: upload/paste → worker OCR → text; progress; cancel; controlled
 * errors; privacy (no uploads) and lazy loading (no OCR assets before intent).
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIX = join(process.cwd(), "src", "tests", "fixtures", "ocr");
const receipt = join(FIX, "receipt", "image.png");

async function openOcr(page: Page, query = "") {
  await page.goto(`/spikes/ocr${query}`);
  await page.waitForFunction(() => !!window.spikeC, null, { timeout: 60_000 });
}

function watchNetwork(page: Page) {
  const requests: { url: string; method: string; body: number }[] = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), body: r.postDataBuffer()?.length ?? 0 }));
  return requests;
}

test.describe.configure({ timeout: 180_000 });

test("homepage loads no OCR code, workers or models", async ({ page }) => {
  const requests = watchNetwork(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(requests.filter((r) => /tesseract|tessdata|traineddata|ocr/i.test(r.url))).toEqual([]);
});

test("upload → extract text locally with progress, word boxes and copy", async ({ page }) => {
  const requests = watchNetwork(page);
  await openOcr(page);
  expect(requests.filter((r) => /tessdata|tesseract-core/.test(r.url))).toEqual([]); // lazy until intent
  await page.getByTestId("file-input").setInputFiles(receipt);
  await page.getByTestId("extract").click();
  await expect(page.getByTestId("status")).toContainText("%", { timeout: 60_000 }); // progress shown
  await expect(page.getByTestId("status")).toContainText("Done", { timeout: 120_000 });
  const text = await page.getByTestId("result-text").inputValue();
  expect(text).toContain("Corner Cafe");
  expect(text).toContain("$24.95");
  // Screenshot never leaves the page: only GETs for app code/workers/models.
  expect(requests.filter((r) => r.method !== "GET" || r.body > 0)).toEqual([]);
});

test("pasted images use the same OCR pipeline as files", async ({ page, browserName }) => {
  await openOcr(page);
  const bytes = readFileSync(receipt).toString("base64");
  if (browserName === "chromium") {
    // Real clipboard + Ctrl/Cmd+V.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }, bytes);
    await page.locator("body").click();
    await page.keyboard.press("ControlOrMeta+V");
  } else {
    // Firefox/WebKit automation cannot put images on the OS clipboard, and Firefox ignores
    // `clipboardData` in the ClipboardEvent constructor: dispatch a paste event carrying the
    // file (exercises the same paste handler and pipeline, not the OS clipboard itself).
    await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "", { type: "image/png" }));
      const e = new Event("paste", { bubbles: true });
      Object.defineProperty(e, "clipboardData", { value: dt });
      window.dispatchEvent(e);
    }, bytes);
  }
  await expect(page.getByTestId("extract")).toBeEnabled();
  await page.getByTestId("extract").click();
  await expect(page.getByTestId("status")).toContainText("Done", { timeout: 120_000 });
  expect(await page.getByTestId("result-text").inputValue()).toContain("Corner Cafe");
});

test("cancel stops a long job cleanly and the next job still works", async ({ page }) => {
  await openOcr(page);
  await page.evaluate(() => window.spikeC!.warmup("eng"));
  const long = readFileSync(join(FIX, "long-1080x10000", "image.png")).toString("base64");
  const result = page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    return window.spikeC!.extract(blob, { strips: "off" });
  }, long);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.spikeC!.cancel());
  expect(await result).toMatchObject({ ok: false, code: "OCR_CANCELLED" });
  const next = (await page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    return window.spikeC!.extract(blob, {});
  }, readFileSync(receipt).toString("base64"))) as { ok: boolean; rawText: string };
  expect(next.ok).toBe(true);
  expect(next.rawText).toContain("TOTAL");
});

test("controlled error codes", async ({ page }) => {
  await openOcr(page);
  const corrupt = await page.evaluate(() => window.spikeC!.extract(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: "image/png" })));
  expect(corrupt).toMatchObject({ ok: false, code: "OCR_DECODE_FAILED" });

  await openOcr(page, "?assets=broken-model");
  const model = await page.evaluate(async () => window.spikeC!.warmup("eng").then(() => "ok", (e) => e.code));
  expect(model).toBe("OCR_MODEL_LOAD_FAILED");

  await openOcr(page, "?assets=broken-core");
  const core = await page.evaluate(async () => window.spikeC!.warmup("eng").then(() => "ok", (e) => e.code));
  expect(core).toBe("OCR_ENGINE_LOAD_FAILED");
});
