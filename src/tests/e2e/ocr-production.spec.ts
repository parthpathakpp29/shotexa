import { expect, test, type Download, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

const OCR_FIX = join(process.cwd(), "src/tests/fixtures/ocr");
const RECEIPT = join(OCR_FIX, "receipt/image.png");
const MIXED = join(OCR_FIX, "chat-mixed-en-hi/image.png");
const LONG = join(OCR_FIX, "long-1080x10000/image.png");
const STITCH_A = join(FIXTURE_DIR, "chat-light/a.png");
const STITCH_B = join(FIXTURE_DIR, "chat-light/b.png");
const capture = !!process.env.CAPTURE_PHASE2B;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2b/screenshots");

test.describe.configure({ timeout: 240_000 });
test.use({ viewport: { width: 1440, height: 960 } });

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: true });
}

async function upload(page: Page, file = RECEIPT) {
  await page.goto("/screenshot-to-text");
  await page.getByTestId("file-input").setInputFiles(file);
  await expect(page.getByTestId("ocr-workspace")).toBeVisible({ timeout: 30_000 });
}

async function extract(page: Page) {
  await page.getByTestId("extract-text").click();
  await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 180_000 });
  return page.getByTestId("ocr-result-text");
}

async function downloadedText(download: Download) {
  return readFileSync((await download.path())!, "utf8");
}

test.describe("Phase 2B production OCR", () => {
  test("upload → local OCR → edit → copy, with no screenshot or OCR text upload", async ({ page, browserName }) => {
    const outbound: string[] = [];
    const errors: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (!["GET", "HEAD"].includes(request.method()) && (request.postDataBuffer()?.length ?? 0) > 0) outbound.push(request.url());
    });
    if (browserName === "chromium") await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await upload(page);
    await expect(page.getByRole("radio", { name: "English", exact: true })).toHaveAttribute("aria-checked", "true");
    const editor = await extract(page);
    expect(await editor.inputValue()).toContain("Corner Cafe");
    const text = `${await editor.inputValue()}\nReviewed locally`;
    await editor.fill(text);
    await page.getByTestId("copy-text").click();
    if (browserName === "chromium") {
      expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(text.replace(/\r\n/g, "\n"));
    } else {
      await expect(page.getByTestId("copy-text")).toContainText("Copied");
    }
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
    await shot(page, "01-screenshot-to-text.png");
  });

  test("OCR result downloads as UTF-8 TXT with edited content", async ({ page }) => {
    await upload(page);
    const editor = await extract(page);
    await editor.fill("Edited receipt\nTOTAL $24.95");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-txt").click()]);
    expect(download.suggestedFilename()).toBe("image-text.txt");
    expect(await downloadedText(download)).toBe("Edited receipt\nTOTAL $24.95");
  });

  test("Smart Stitch result opens in OCR without re-upload", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The cross-browser production OCR path is covered by the extraction smoke test.");
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([STITCH_A, STITCH_B]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("stitch-result").getByRole("link", { name: /Extract Text/ }).click();
    await expect(page).toHaveURL(/\/screenshot-to-text$/);
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(page.getByTestId("file-item").last()).toContainText("stitched-screenshot.png");
    expect((await (await extract(page)).inputValue()).trim().length).toBeGreaterThan(20);
    await shot(page, "02-stitch-to-ocr.png");
  });

  test("Safe Share result opens in OCR without re-upload", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Safe Share cross-browser coverage remains in its production suite.");
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(STITCH_A);
    const stage = page.getByLabel(/Screenshot redaction canvas/);
    await expect(stage).toBeVisible({ timeout: 30_000 });
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.08);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.14);
    await page.mouse.up();
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("safe-share-result").getByRole("link", { name: /Extract Text/ }).click();
    await expect(page).toHaveURL(/\/screenshot-to-text$/);
    await expect(page.getByTestId("file-item").last()).toContainText("safe-copy.png");
    expect((await (await extract(page)).inputValue()).trim().length).toBeGreaterThan(10);
    await shot(page, "03-safe-share-to-ocr.png");
  });

  test("English + Hindi loads only when selected and recognises mixed text", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Spike C already validates Tesseract cross-browser language loading.");
    const modelRequests: string[] = [];
    page.on("request", (request) => /traineddata/.test(request.url()) && modelRequests.push(request.url()));
    await upload(page, MIXED);
    expect(modelRequests).toEqual([]);
    await page.getByRole("radio", { name: "English + Hindi" }).click();
    const text = await (await extract(page)).inputValue();
    expect(modelRequests.some((url) => /hin\.traineddata/.test(url))).toBe(true);
    expect(text).toMatch(/[\u0900-\u097F]/);
    expect(text).toMatch(/[A-Za-z]/);
  });

  test("cancel stops OCR and retry succeeds", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Spike C validates cancellation in every Playwright engine.");
    await upload(page, LONG);
    await page.getByTestId("extract-text").click();
    await expect(page.getByTestId("cancel-ocr")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("cancel-ocr").click();
    await expect(page.getByText("Extraction cancelled")).toBeVisible();
    await page.getByTestId("file-input").setInputFiles(RECEIPT);
    await page.getByTestId("file-item").last().locator("button").first().click();
    expect((await (await extract(page)).inputValue())).toContain("Corner Cafe");
  });

  test("controlled model failure shows a useful error and retry works", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "One browser is sufficient for the production retry state.");
    await page.route("**/vendor/tessdata/**/eng.traineddata.gz", async (route) => {
      if (route.request().method() === "HEAD") await route.fulfill({ status: 404 });
      else await route.continue();
    });
    await upload(page);
    await page.getByTestId("extract-text").click();
    await expect(page.getByText("The selected OCR language couldn't load. Check your connection and try again.")).toBeVisible({ timeout: 30_000 });
    await page.unroute("**/vendor/tessdata/**/eng.traineddata.gz");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 180_000 });
  });

  test("mobile OCR keeps preview, editable result and controls touch-accessible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await upload(page);
    const extractButton = page.getByTestId("extract-text");
    expect((await extractButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await extractButton.click();
    await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 180_000 });
    const controls = page.getByRole("button", { name: "OCR controls" });
    expect((await controls.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await controls.click();
    await expect(page.getByRole("dialog", { name: "OCR controls" })).toBeVisible();
    await expect(page.getByRole("dialog").getByText("English + Hindi")).toBeVisible();
    await shot(page, "04-mobile-ocr.png");
  });
});
