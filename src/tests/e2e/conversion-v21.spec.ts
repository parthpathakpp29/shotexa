import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { PNG } from "pngjs";
import { unzipSync } from "fflate";

const FIXTURES = join(process.cwd(), "src/tests/fixtures/conversion");
const SHOTS = join(process.cwd(), "docs/v2.1/screenshots");
const capture = !!process.env.CAPTURE_V21;
async function dismissConsent(page: import("@playwright/test").Page) {
  const reject = page.getByRole("button", { name: "Reject Google Analytics" });
  if (await reject.isVisible()) await reject.click();
}
async function shot(page: import("@playwright/test").Page, name: string) { if (capture) { mkdirSync(SHOTS, { recursive: true }); await dismissConsent(page); await page.setViewportSize({ width: 1280, height: 960 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: join(SHOTS, name), fullPage: false }); } }
const validSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40"><rect x="0" y="0" width="40" height="40" fill="#e03020"/></svg>`;

test("SVG exports transparent PNG and filled JPG, rejects active content", async ({ page }) => {
  await page.goto("/svg-to-png");
  const input = page.getByLabel("SVG file");
  await input.setInputFiles({ name: "mark.svg", mimeType: "image/svg+xml", buffer: Buffer.from(validSvg) });
  await expect(page.getByAltText("Sanitized SVG preview")).toBeVisible();
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByText("80 × 40 px", { exact: false })).toBeVisible({ timeout: 45_000 });
  await shot(page, "svg-to-png.png");
  const [pngDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const png = PNG.sync.read(readFileSync((await pngDownload.path())!));
  expect([png.width, png.height]).toEqual([80, 40]);
  expect(png.data[(10 * png.width + 60) * 4 + 3]).toBe(0);
  await page.getByLabel("Output format").selectOption("jpg");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const [jpgDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const jpg = readFileSync((await jpgDownload.path())!);
  expect(jpg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  await input.setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><script>alert(1)</script></svg>`) });
  await expect(page.getByTestId("svg-to-png-converter").locator('[role="alert"]')).toContainText("Unsupported SVG element");
  await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeDisabled();
  await input.setInputFiles({ name: "external.svg", mimeType: "image/svg+xml", buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><image href="https://example.com/secret.png"/></svg>`) });
  await expect(page.getByTestId("svg-to-png-converter").locator('[role="alert"]')).toContainText("Unsupported SVG element");
});

test("PDF selection renders real page pixels and ZIP", async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 100]).drawRectangle({ x: 0, y: 0, width: 200, height: 100, color: rgb(1, 0, 0) });
  pdf.addPage([300, 150]).drawRectangle({ x: 0, y: 0, width: 300, height: 150, color: rgb(0, 0, 1) });
  await page.goto("/pdf-to-jpg");
  await page.getByLabel("PDF file").setInputFiles({ name: "two-pages.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
  await expect(page.getByText("two-pages.pdf · 2 pages")).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("checkbox", { name: "Page 2" }).check();
  await page.getByLabel("Resolution").selectOption("1");
  await page.getByLabel("Output format").selectOption("png");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByText("300 × 150 px", { exact: false })).toBeVisible();
  await shot(page, "pdf-to-jpg.png");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const png = PNG.sync.read(readFileSync((await download.path())!));
  expect([png.width, png.height]).toEqual([300, 150]);
  expect(png.data[2]).toBeGreaterThan(220);
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const [zipDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ZIP" }).click()]);
  const pages = unzipSync(readFileSync((await zipDownload.path())!));
  expect(Object.keys(pages).sort()).toEqual(["two-pages-page-01.png", "two-pages-page-02.png"]);
  expect(PNG.sync.read(Buffer.from(pages["two-pages-page-01.png"])).data[0]).toBeGreaterThan(220);
  await page.getByLabel("Output format").selectOption("jpg");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Results (2/2)" })).toBeVisible({ timeout: 45_000 });
  const [jpgZipDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ZIP" }).click()]);
  const jpgPages = unzipSync(readFileSync((await jpgZipDownload.path())!));
  expect(Object.keys(jpgPages).sort()).toEqual(["two-pages-page-01.jpg", "two-pages-page-02.jpg"]);
  for (const bytes of Object.values(jpgPages)) expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  await page.getByRole("link", { name: /Open Editor/ }).click();
  await expect(page).toHaveURL(/screenshot-editor/);
  await expect(page.getByTestId("editor-workspace")).toBeVisible();
  await page.goto("/pdf-to-jpg");
  await page.getByLabel("PDF file").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nnot a PDF") });
  await expect(page.getByTestId("pdf-to-jpg-converter").locator('[role="alert"]')).toContainText("could not be opened", { timeout: 30_000 });
  await page.getByLabel("PDF file").setInputFiles(join(FIXTURES, "locked.pdf"));
  await expect(page.getByTestId("pdf-to-jpg-converter").locator('[role="alert"]')).toContainText("password protected", { timeout: 30_000 });
});

test("SVG replacement releases the preview and converted result continues into Editor", async ({ page }) => {
  await page.goto("/svg-to-png");
  await page.evaluate(() => {
    const original = URL.revokeObjectURL.bind(URL);
    (window as Window & { revokedUrls?: string[] }).revokedUrls = [];
    URL.revokeObjectURL = (url) => {
      (window as Window & { revokedUrls?: string[] }).revokedUrls!.push(url);
      original(url);
    };
  });
  const input = page.getByLabel("SVG file");
  await input.setInputFiles({ name: "first.svg", mimeType: "image/svg+xml", buffer: Buffer.from(validSvg) });
  const firstUrl = await page.getByAltText("Sanitized SVG preview").getAttribute("src");
  expect(firstUrl).toMatch(/^blob:/);
  await input.setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg><script /></svg>") });
  await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeDisabled();
  expect(await page.evaluate((url) => (window as Window & { revokedUrls?: string[] }).revokedUrls?.includes(url), firstUrl!)).toBe(true);
  await input.setInputFiles({ name: "mark.svg", mimeType: "image/svg+xml", buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"><rect width="200" height="100" fill="#e03020"/></svg>`) });
  await expect(page.getByLabel("Width")).toHaveValue("200");
  await expect(page.getByLabel("Height")).toHaveValue("100");
  await page.getByLabel("Width").fill("160");
  await expect(page.getByLabel("Height")).toHaveValue("80");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByText("160 × 80 px", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: /Open Editor/ }).click();
  await expect(page).toHaveURL(/screenshot-editor/, { timeout: 30_000 });
  await expect(page.getByTestId("editor-workspace")).toBeVisible();
});

test("deferred HEIC is unavailable from public discovery and routing", async ({ page, request }) => {
  for (const route of ["/", "/tools", "/pdf-to-jpg", "/svg-to-png", "/screenshot-beautifier"]) {
    await page.goto(route);
    await expect(page.locator('a[href="/heic-to-jpg"]')).toHaveCount(0);
  }
  const route = await request.get("/heic-to-jpg");
  expect(route.status()).toBe(404);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain("/heic-to-jpg");
  expect((await request.get("/licenses/HEIC-NOTICES.txt")).status()).toBe(404);
});

test.skip("HEIC converts actual pixels, preserves orientation, and enters workspace", async ({ page }) => {
  await page.goto("/heic-to-jpg");
  await page.getByLabel("HEIC or HEIF files").setInputFiles(join(FIXTURES, "orientation-6.heic"));
  await page.getByLabel("Output format").selectOption("png");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByText("1200 × 800 px", { exact: false })).toBeVisible({ timeout: 90000 });
  await shot(page, "heic-to-jpg.png");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const png = PNG.sync.read(readFileSync((await download.path())!));
  expect([png.width, png.height]).toEqual([1200, 800]);
  if (capture) writeFileSync(join(SHOTS, "heic-orientation-export.png"), PNG.sync.write(png));
  await page.getByRole("link", { name: /Open Editor/ }).click();
  await expect(page).toHaveURL(/screenshot-editor/, { timeout: 30000 });
  await expect(page.getByTestId("editor-workspace")).toBeVisible();
});

test.skip("HEIC batch exports JPG files and reports invalid input", async ({ page }) => {
  await page.goto("/heic-to-jpg");
  const input = page.getByLabel("HEIC or HEIF files");
  await input.setInputFiles([join(FIXTURES, "basic-8bit-srgb.heic"), join(FIXTURES, "orientation-6.heic")]);
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Results (2/2)" })).toBeVisible({ timeout: 90000 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ZIP" }).click()]);
  const images = unzipSync(readFileSync((await download.path())!));
  expect(Object.keys(images).sort()).toEqual(["basic-8bit-srgb.jpg", "orientation-6.jpg"]);
  for (const bytes of Object.values(images)) expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  await input.setInputFiles({ name: "fake.heic", mimeType: "image/heic", buffer: Buffer.from("not a HEIC image") });
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByText("This is not a supported HEIC/HEIF file.")).toBeVisible();
});

test("Beautifier studio template uses the shared preview and export renderer", async ({ page }) => {
  const source = new PNG({ width: 320, height: 200 });
  for (let i = 0; i < source.data.length; i += 4) source.data.set([36, 96, 194, 255], i);
  await page.goto("/screenshot-beautifier");
  await page.getByTestId("file-input").setInputFiles({ name: "product.png", mimeType: "image/png", buffer: PNG.sync.write(source) });
  await expect(page.getByTestId("beautify-template-gallery")).toBeVisible();
  await page.getByTestId("beautify-template-gallery").getByTestId("beautify-template-gallery-portfolio").click();
  await expect(page.getByTestId("beautify-stage")).toBeVisible();
  await page.getByRole("radiogroup", { name: "Export resolution scale" }).getByRole("radio", { name: "2×" }).click();
  await shot(page, "beautifier-studio.png");
  const preview = await page.getByTestId("beautify-canvas").evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    return [...c.getContext("2d")!.getImageData(3, 3, 1, 1).data];
  });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
  const output = PNG.sync.read(readFileSync((await download.path())!));
  const pixel = [...output.data.subarray((3 * output.width + 3) * 4, (3 * output.width + 3) * 4 + 4)];
  expect(pixel.slice(0, 3).every((value, i) => Math.abs(value - preview[i]) < 14)).toBeTruthy();
  expect(output.width).toBeGreaterThan(320);
});

test("converter layouts and SVG controls remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/svg-to-png");
  await page.getByLabel("SVG file").setInputFiles({ name: "mark.svg", mimeType: "image/svg+xml", buffer: Buffer.from(validSvg) });
  await expect(page.getByLabel("Width")).toBeVisible();
  await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBeTruthy();
});

test("capture Beautifier Studio with a genuine local Shotexa screenshot", async ({ page }) => {
  test.skip(!capture, "Only needed when refreshing review screenshots");
  await page.addInitScript(() => localStorage.setItem("shotexa.analytics-consent.v1", "rejected"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  const source = await page.screenshot();
  await page.goto("/screenshot-beautifier");
  await page.getByTestId("file-input").setInputFiles({ name: "shotexa-home.png", mimeType: "image/png", buffer: source });
  await expect(page.getByTestId("beautify-template-gallery")).toBeVisible();
  await page.getByTestId("beautify-template-orbit-launch").click();
  await expect(page.getByTestId("beautify-stage")).toBeVisible();
  await expect.poll(() => page.getByTestId("beautify-canvas").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const pixel = canvas.getContext("2d")!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    return pixel[3];
  })).toBe(255);
  await dismissConsent(page);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, "beautifier-studio.png"), fullPage: false });
  await page.getByTestId("beautify-background-gallery").locator("p").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, "beautifier-backgrounds.png"), fullPage: false });
});
