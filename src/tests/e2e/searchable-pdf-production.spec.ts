import { expect, test, type Download, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

const A = join(FIXTURE_DIR, "chat-light/a.png");
const B = join(FIXTURE_DIR, "chat-light/b.png");
const OCR = join(process.cwd(), "src/tests/fixtures/ocr");
const RECEIPT = join(OCR, "receipt/image.png");
const LONG = join(OCR, "long-1080x5000/image.png");
const HINDI = join(OCR, "chat-mixed-en-hi/image.png");
const capture = !!process.env.CAPTURE_PHASE2D;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2d/screenshots");
const savePdfOutputs = !!process.env.SAVE_PHASE2D_PDFS;
const PDF_OUTPUTS = join(process.cwd(), "tmp/pdfs");

test.describe.configure({ timeout: 300_000 });
test.use({ viewport: { width: 1440, height: 960 } });

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: true });
}

async function savePdf(download: Download, name: string) {
  if (!savePdfOutputs) return;
  mkdirSync(PDF_OUTPUTS, { recursive: true });
  await download.saveAs(join(PDF_OUTPUTS, name));
}

async function upload(page: Page, files: string | string[]) {
  await page.goto("/screenshot-to-searchable-pdf");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByTestId("pdf-workspace")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 120_000 });
}

async function extract(page: Page) {
  await page.getByTestId("extract-for-searchable-pdf").click();
  await expect(page.getByText("Text layer ready").first()).toBeVisible({ timeout: 240_000 });
}

async function exportPdf(page: Page): Promise<{ download: Download; bytes: Uint8Array; text: string; pdf: PDFDocument }> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export").click()]);
  await expect(page.getByTestId("searchable-pdf-result")).toBeVisible({ timeout: 180_000 });
  const bytes = new Uint8Array(readFileSync((await download.path())!));
  const pdf = await PDFDocument.load(bytes);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const viewer = await pdfjs.getDocument({ data: bytes.slice(), useWorkerFetch: false }).promise;
  const text: string[] = [];
  for (let index = 1; index <= viewer.numPages; index++) {
    const content = await (await viewer.getPage(index)).getTextContent();
    text.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  await viewer.destroy();
  return { download, bytes, text: text.join("\n"), pdf };
}

test.describe("Phase 2D searchable PDF", () => {
  test("missing OCR is explicit, then export contains searchable text", async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "This host's Playwright Firefox new-page runtime fails before app code; Chromium and WebKit cover the Phase 2D flow.");
    const outbound: string[] = [];
    const errors: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => !["GET", "HEAD"].includes(request.method()) && (request.postDataBuffer()?.length ?? 0) > 0 && outbound.push(request.url()));
    await upload(page, RECEIPT);
    await expect(page.getByText("Text extraction required").first()).toBeVisible();
    await shot(page, "01-text-required.png");
    await extract(page);
    await shot(page, "02-text-layer-ready.png");
    const { download, text, pdf } = await exportPdf(page);
    await savePdf(download, "searchable-receipt.pdf");
    expect(download.suggestedFilename()).toBe("shotexa-searchable-screenshots.pdf");
    expect(text).toMatch(/TOTAL|Shotexa Market/i);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
    if (savePdfOutputs) {
      await page.getByTestId("searchable-pdf-result").getByRole("link", { name: /Open PDF/ }).click();
      await expect(page.getByTestId("pdf-workspace")).toBeVisible();
      const [normal] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export").click()]);
      await expect(page.getByTestId("pdf-result")).toBeVisible({ timeout: 180_000 });
      await savePdf(normal, "normal-receipt.pdf");
    }
  });

  test("existing OCR result is reused without another model or recognition request", async ({ page, browserName }) => {
    test.skip(browserName === "firefox");
    await page.goto("/screenshot-to-text");
    await page.getByTestId("file-input").setInputFiles(RECEIPT);
    await page.getByTestId("extract-text").click();
    await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 240_000 });
    await page.getByTestId("ocr-result").getByRole("link", { name: /Open Searchable PDF/ }).click();
    const ocrRequests: string[] = [];
    page.on("request", (request) => /tesseract|traineddata/i.test(request.url()) && ocrRequests.push(request.url()));
    await expect(page.getByText("Text layer ready").first()).toBeVisible();
    await exportPdf(page);
    expect(ocrRequests).toEqual([]);
  });

  test("long screenshot text follows Smart Pagination across pages", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await upload(page, LONG);
    await extract(page);
    const { pdf, text } = await exportPdf(page);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(text.length).toBeGreaterThan(500);
    expect(text.split("\n").filter(Boolean).length).toBeGreaterThan(2);
  });

  test("Smart Stitch result can be OCRed and exported without re-upload", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([A, B]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("stitch-result").getByRole("link", { name: /Open Extract Text/ }).click();
    await page.getByTestId("extract-text").click();
    await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 240_000 });
    await page.getByTestId("ocr-result").getByRole("link", { name: /Open Searchable PDF/ }).click();
    await expect(page.getByText("Text layer ready").first()).toBeVisible();
    await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 120_000 });
    await shot(page, "04-smart-stitch-handoff.png");
  });

  test("Safe Share artifact can be OCRed and carried into Searchable PDF", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(RECEIPT);
    const canvas = page.getByLabel(/Screenshot redaction canvas/);
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 60);
    await page.mouse.up();
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("safe-share-result").getByRole("link", { name: /Open Extract Text/ }).click();
    await page.getByTestId("extract-text").click();
    await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 240_000 });
    await page.getByTestId("ocr-result").getByRole("link", { name: /Open Searchable PDF/ }).click();
    await expect(page.getByText("Text layer ready").first()).toBeVisible();
    await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 120_000 });
    await shot(page, "05-safe-share-handoff.png");
  });

  test("English + Hindi result remains searchable in both scripts", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await upload(page, HINDI);
    await page.getByRole("radiogroup", { name: "OCR language" }).getByText("English + Hindi").click();
    await extract(page);
    const { text } = await exportPdf(page);
    expect(text).toMatch(/[A-Za-z]/);
    expect(text).toMatch(/[\u0900-\u097F]/);
  });

  test("manual break adjustment keeps the searchable layer valid", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await upload(page, LONG);
    await extract(page);
    const first = page.getByTestId("pdf-break").first();
    await first.focus();
    await first.press("Shift+ArrowDown");
    await expect(page.getByTestId("selected-pdf-break")).toContainText("Adjusted");
    const { text } = await exportPdf(page);
    expect(text.length).toBeGreaterThan(500);
  });

  test("mobile exposes OCR readiness, page preview and touch-friendly export", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await page.setViewportSize({ width: 390, height: 844 });
    await upload(page, RECEIPT);
    const settings = page.getByRole("button", { name: "PDF settings" });
    expect((await settings.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await settings.click();
    await expect(page.getByRole("dialog", { name: "PDF settings" }).getByText("Text extraction required")).toBeVisible();
    await shot(page, "03-mobile-searchable-pdf.png");
  });
});
