import { expect, test, type Download, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

const A = join(FIXTURE_DIR, "chat-light/a.png");
const B = join(FIXTURE_DIR, "chat-light/b.png");
const PDF_FIX = join(process.cwd(), "src/tests/fixtures/pdf");
const ARTICLE = join(PDF_FIX, "article/image.png");
const PHOTOS = join(PDF_FIX, "photos/image.png");
const RECEIPT = join(process.cwd(), "src/tests/fixtures/ocr/receipt/image.png");
const capture = !!process.env.CAPTURE_PHASE2C;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2c/screenshots");

test.describe.configure({ timeout: 240_000 });
test.use({ viewport: { width: 1440, height: 960 } });

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: true });
}

async function upload(page: Page, files: string | string[]) {
  await page.goto("/screenshot-to-pdf");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByTestId("pdf-workspace")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 120_000 });
}

async function exportPdf(page: Page): Promise<{ download: Download; pdf: PDFDocument }> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
  await expect(page.getByTestId("pdf-result")).toBeVisible({ timeout: 120_000 });
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  return { download, pdf: await PDFDocument.load(bytes) };
}

test.describe("Phase 2C production PDF", () => {
  test("single screenshot → normal A4 PDF → local export", async ({ page }) => {
    const outbound: string[] = [];
    const errors: string[] = [];
    const heavy: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (!['GET', 'HEAD'].includes(request.method()) && (request.postDataBuffer()?.length ?? 0) > 0) outbound.push(request.url());
      if (/tesseract|traineddata/i.test(request.url())) heavy.push(request.url());
    });
    await upload(page, A);
    await page.getByRole("switch", { name: "Smart Pagination" }).click();
    await expect(page.getByText(/page ready|pages ready/).first()).toBeVisible();
    await shot(page, "01-screenshot-to-pdf.png");
    const { download, pdf } = await exportPdf(page);
    expect(download.suggestedFilename()).toBe("shotexa-screenshots.pdf");
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    for (const p of pdf.getPages()) {
      expect(p.getWidth()).toBeCloseTo(595.28, 1);
      expect(p.getHeight()).toBeCloseTo(841.89, 1);
    }
    expect(outbound).toEqual([]);
    expect(heavy).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("multiple screenshots reorder and export in one PDF", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Multi-image worker export is covered cross-browser by Spike D.");
    await upload(page, [A, B]);
    const items = page.getByTestId("file-item");
    await expect(items).toHaveCount(2);
    await items.nth(1).getByRole("button", { name: /Move .* up/ }).click();
    await expect(items.first()).toContainText("b.png");
    await expect(page.getByTestId("pdf-preview")).toBeVisible();
    const { pdf } = await exportPdf(page);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
  });

  test("long screenshot uses Smart Pagination and exports valid pages", async ({ page }) => {
    await upload(page, ARTICLE);
    await expect(page.getByRole("switch", { name: "Smart Pagination" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("pdf-break").first()).toBeVisible();
    const { pdf } = await exportPdf(page);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
  });

  test("review-recommended break can be moved before export", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The deterministic planner is covered in every engine by Spike D.");
    await upload(page, PHOTOS);
    await expect(page.getByText(/page breaks? need review/).first()).toBeVisible();
    const risky = page.locator('[data-testid="pdf-break"][data-confidence="low"], [data-testid="pdf-break"][data-confidence="medium"]').first();
    await risky.focus();
    await risky.press("ArrowUp");
    await expect(page.getByTestId("selected-pdf-break")).toContainText("Adjusted");
    await shot(page, "02-smart-pagination-review.png");
    const { pdf } = await exportPdf(page);
    expect(pdf.getPageCount()).toBeGreaterThan(4);
  });

  test("add, delete and reset page breaks", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Production editing state is exercised once; pure operations have unit coverage.");
    await upload(page, ARTICLE);
    const breaks = page.getByTestId("pdf-break");
    const initial = await breaks.count();
    await page.getByRole("button", { name: "Add page break" }).click();
    await expect(breaks).toHaveCount(initial + 1);
    await page.getByRole("button", { name: "Delete this break" }).click();
    await expect(breaks).toHaveCount(initial);
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(breaks).toHaveCount(initial);
  });

  test("Smart Stitch result enters PDF without re-upload", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Cross-browser stitching and PDF engines are covered by their spike suites.");
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([A, B]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("stitch-result").getByRole("link", { name: /Open PDF/ }).click();
    await expect(page).toHaveURL(/\/screenshot-to-pdf$/);
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 120_000 });
    const { pdf } = await exportPdf(page);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    await shot(page, "04-stitch-to-pdf.png");
  });

  test("Safe Share result enters PDF without re-upload", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Safe Share has its own cross-browser production suite.");
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(A);
    const stage = page.getByLabel(/Screenshot redaction canvas/);
    await expect(stage).toBeVisible({ timeout: 30_000 });
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.08);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.14, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("redaction-region")).toHaveCount(1);
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("safe-share-result").getByRole("link", { name: /Open PDF/ }).click();
    await expect(page.getByTestId("file-item").last()).toContainText("safe-copy.png");
    await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 120_000 });
    await shot(page, "03-safe-share-to-pdf.png");
  });

  test("OCR source enters PDF without starting OCR again", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "OCR model loading is already covered cross-browser in Phase 2B.");
    await page.goto("/screenshot-to-text");
    await page.getByTestId("file-input").setInputFiles(RECEIPT);
    await page.getByTestId("extract-text").click();
    await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 180_000 });
    await page.getByTestId("ocr-result").getByRole("link", { name: /Open PDF/ }).click();
    const ocrRequests: string[] = [];
    page.on("request", (request) => /tesseract|traineddata/i.test(request.url()) && ocrRequests.push(request.url()));
    await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 120_000 });
    await exportPdf(page);
    expect(ocrRequests).toEqual([]);
  });

  test("mobile PDF keeps preview, markers and settings touch-accessible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await upload(page, ARTICLE);
    await expect(page.getByTestId("pdf-break").first()).toBeVisible();
    const controls = page.getByRole("button", { name: "PDF settings" });
    expect((await controls.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await controls.click();
    const dialog = page.getByRole("dialog", { name: "PDF settings" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("switch", { name: "Smart Pagination" })).toBeVisible();
    await shot(page, "05-mobile-pdf.png");
  });
});
