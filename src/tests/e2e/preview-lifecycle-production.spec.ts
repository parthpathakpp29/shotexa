import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

/**
 * Leaving a page while previews are still being made must not raise a page error (WebKit:
 * "Cannot load blob … due to access control checks"), and preview Blob URLs must be released
 * when their image goes away — including when a preview is replaced while it is loading.
 */
const img = (name: string, rel: string) => ({ name, mimeType: "image/png", buffer: readFileSync(join(FIXTURE_DIR, rel)) });
const ONE = [img("first.png", "chat-light/a.png")];
const TWO = [img("first.png", "chat-light/a.png"), img("second.png", "chat-light/b.png")];

/** Count the page's live Blob URLs (main thread only — the previews live there). */
async function trackBlobUrls(page: Page) {
  await page.addInitScript(() => {
    const live = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => { const url = create(object); live.add(url); return url; };
    URL.revokeObjectURL = (url: string) => { live.delete(url); revoke(url); };
    (window as unknown as { __liveBlobUrls: () => number }).__liveBlobUrls = () => live.size;
  });
}
const liveBlobUrls = (page: Page) => page.evaluate(() => (window as unknown as { __liveBlobUrls: () => number }).__liveBlobUrls());

function pageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    const text = `${error.name}: ${error.message}`;
    // Next.js prefetches the routes a page links to; WebKit reports those requests as errors
    // when a navigation cancels them — on any page, including ones with no Shotexa work at all.
    // They are the router's, not the previews', so they are the one thing not counted here.
    if (/^Fetch API cannot load/.test(text) && /[?&]_rsc=/.test(text)) return;
    errors.push(`${page.url()}: ${text}`);
  });
  // Blob loads only: WebKit also logs Next.js route prefetches that a navigation cancels
  // ("Fetch API cannot load …?_rsc=…"), which are the router's own requests, not page errors.
  page.on("console", (message) => { if (message.type() === "error" && /blob:/i.test(message.text())) errors.push(`${page.url()}: ${message.text()}`); });
  return errors;
}

/** Leave by client-side navigation, so the workspace (and its runtime) stays alive. */
async function leaveToHome(page: Page) {
  await page.getByRole("link", { name: "Shotexa home" }).first().click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("Preview lifecycle", () => {
  test("leaving a page while its previews are still being made raises no page error", async ({ page }) => {
    test.setTimeout(420_000);
    const errors = pageErrors(page);
    const routes: [string, typeof ONE][] = [
      ["/compress-screenshot", ONE], ["/convert-screenshot", ONE], ["/split-long-screenshot", ONE], ["/batch-screenshots", TWO],
      ["/stitch-screenshots", TWO], ["/screenshot-beautifier", ONE], ["/screenshot-editor", ONE], ["/compare-screenshots", TWO],
    ];
    for (let round = 0; round < 3; round++) {
      for (const [route, files] of routes) {
        await page.goto(route);
        await page.getByTestId("file-input").setInputFiles(files);
        // The screenshot is in the workspace and its preview is still being decoded: leave now.
        await expect(page.getByTestId("workspace-drop-zone")).toBeVisible({ timeout: 30_000 });
      }
    }
    // Compress/Convert: leave while the encoded result is being made and its image loads.
    for (const route of ["/compress-screenshot", "/convert-screenshot", "/compress-screenshot", "/convert-screenshot"]) {
      await page.goto(route);
      await page.getByTestId("file-input").setInputFiles(ONE);
      await page.getByRole("button", { name: "Check file size" }).first().click();
    }
    // Split: leave while the piece thumbnails load.
    for (let round = 0; round < 2; round++) {
      await page.goto("/split-long-screenshot");
      await page.getByTestId("file-input").setInputFiles(ONE);
      await page.getByTestId("export").click();
      await expect(page.getByTestId("split-result")).toBeVisible({ timeout: 120_000 });
    }
    await page.goto("/alternatives/xnapper");
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test("Compress: a preview replaced while loading, again and again, keeps one URL and releases it on leaving", async ({ page }) => {
    test.setTimeout(240_000);
    await trackBlobUrls(page);
    const errors = pageErrors(page);
    await page.goto("/compress-screenshot");
    await page.getByTestId("file-input").setInputFiles(ONE);
    const run = page.getByRole("button", { name: /Check file size|Check again/ }).first();
    await run.click();
    await expect(page.getByTestId("encode-result-image")).toBeVisible({ timeout: 120_000 });
    expect(await liveBlobUrls(page)).toBe(1);

    const formats = page.getByRole("radiogroup", { name: "Output format" });
    for (const format of ["WebP", "JPEG", "WebP", "PNG", "JPEG"]) {
      await formats.getByRole("radio", { name: format }).click();
      // Run as soon as the previous result has been placed — its image may still be decoding.
      await page.getByRole("button", { name: /Check file size|Check again|Check new size/ }).first().click();
      // A finished encode shows its size; a stale result shows only the target format.
      await expect(page.getByTestId("encode-result-meta")).toHaveText(new RegExp(`^${format}.*\\d+(\\.\\d)? (KB|MB)$`), { timeout: 120_000 });
      await expect.poll(() => liveBlobUrls(page)).toBe(1);
    }

    await leaveToHome(page);
    await expect.poll(() => liveBlobUrls(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("Split: piece previews are released when the result is left, even mid-load", async ({ page }) => {
    test.setTimeout(240_000);
    await trackBlobUrls(page);
    const errors = pageErrors(page);
    await page.goto("/split-long-screenshot");
    await page.getByTestId("file-input").setInputFiles(ONE);
    await page.getByTestId("export").click();
    await expect(page.getByTestId("split-result")).toBeVisible({ timeout: 120_000 });
    const pieces = await page.getByTestId("split-piece").count();
    expect(pieces).toBeGreaterThan(1);
    await expect.poll(() => liveBlobUrls(page)).toBe(pieces);
    // Leave immediately, while the lazily loaded thumbnails are still arriving.
    await leaveToHome(page);
    await expect.poll(() => liveBlobUrls(page)).toBe(0);
    expect(errors).toEqual([]);
  });
});
