import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { PNG } from "pngjs";

const evidence = join(process.cwd(), "docs/seo-expansion");
const capture = !!process.env.CAPTURE_SEO_EXPANSION;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("shotexa.analytics-consent.v1", "rejected"));
});

async function saveScreenshot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(join(evidence, "screenshots"), { recursive: true });
  await page.screenshot({ path: join(evidence, "screenshots", name), fullPage: false });
}

async function saveExport(name: string, bytes: Buffer) {
  if (!capture) return;
  mkdirSync(join(evidence, "exports"), { recursive: true });
  writeFileSync(join(evidence, "exports", name), bytes);
}

async function dismissConsent(page: Page) {
  const reject = page.getByRole("button", { name: "Reject Google Analytics" });
  if (await reject.isVisible()) await reject.click();
}

async function browserImage(page: Page, type: "image/jpeg" | "image/webp") {
  const data = await page.evaluate(async (mime) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 128, 80);
    ctx.fillStyle = "#1976d2"; ctx.fillRect(32, 0, 96, 80);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result!), mime, 0.93));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { mime: blob.type, bytes: Array.from(bytes) };
  }, type);
  expect(data.mime).toBe(type);
  return Buffer.from(data.bytes);
}

function pngSource() {
  const png = new PNG({ width: 128, height: 80 });
  for (let y = 0; y < 80; y++) for (let x = 0; x < 128; x++) {
    const offset = (y * 128 + x) * 4;
    png.data.set(x < 32 ? [0, 0, 0, 0] : [25, 118, 210, 255], offset);
  }
  return PNG.sync.write(png);
}

test("raster format pages preselect and export real target pixels", async ({ page, browserName }) => {
  for (const [route, sourceMime, sourceName, target] of [
    ["webp-to-png", "image/webp", "sample.webp", "PNG"],
    ["webp-to-jpg", "image/webp", "sample.webp", "JPEG"],
    ["png-to-jpg", "image/png", "sample.png", "JPEG"],
    ["jpg-to-png", "image/jpeg", "sample.jpg", "PNG"],
  ] as const) {
    await page.goto(`/${route}`);
    await dismissConsent(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await saveScreenshot(page, `${route}-${browserName}-before.png`);
    const buffer = sourceMime === "image/png" ? pngSource() : await browserImage(page, sourceMime);
    await page.getByTestId("file-input").setInputFiles({ name: sourceName, mimeType: sourceMime, buffer });
    await expect(page.getByTestId("encode-workspace")).toBeVisible();
    const selected = page.getByRole("radiogroup", { name: "Output format" }).getByRole("radio", { name: target });
    await expect(selected).toHaveAttribute("aria-checked", "true");
    if (route === "webp-to-jpg") {
      await page.getByRole("radiogroup", { name: "Output format" }).getByRole("radio", { name: "PNG" }).click();
      await page.getByRole("button", { name: "Reset settings" }).click();
      await expect(selected).toHaveAttribute("aria-checked", "true");
    }
    await saveScreenshot(page, `${route}-${browserName}-editor.png`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    const output = readFileSync((await download.path())!);
    if (target === "PNG") {
      const decoded = PNG.sync.read(output);
      expect([decoded.width, decoded.height]).toEqual([128, 80]);
      if (sourceMime === "image/webp") expect(decoded.data[3]).toBe(0);
      await saveExport(`${route}.png`, output);
    } else {
      expect(output.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      const pixels = await page.evaluate(async (bytes) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
        const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!; ctx.drawImage(bitmap, 0, 0);
        const result = { width: bitmap.width, height: bitmap.height, fill: [...ctx.getImageData(0, 0, 1, 1).data] };
        bitmap.close(); return result;
      }, Array.from(output));
      expect([pixels.width, pixels.height]).toEqual([128, 80]);
      expect(pixels.fill.slice(0, 3).every((value) => value > 235)).toBe(true);
      await saveExport(`${route}.jpg`, output);
    }
    await expect(page.getByTestId("file-item")).toHaveCount(2);
  }
});

test("format page blocks an unrelated workspace source and retains it", async ({ page }) => {
  await page.goto("/jpg-to-png");
  await page.getByTestId("file-input").setInputFiles({ name: "source.png", mimeType: "image/png", buffer: pngSource() });
  await expect(page.getByText("JPG to PNG needs the right source format")).toBeVisible();
  await expect(page.getByTestId("export")).toBeDisabled();
  await expect(page.getByTestId("file-item")).toHaveCount(1);
});

test("converted image continues to Editor with original and result available", async ({ page }) => {
  await page.goto("/png-to-jpg");
  await page.getByTestId("file-input").setInputFiles({ name: "source.png", mimeType: "image/png", buffer: pngSource() });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
  expect(download.suggestedFilename()).toMatch(/\.jpg$/);
  await page.getByRole("link", { name: /Open Editor/ }).click();
  await expect(page).toHaveURL(/\/screenshot-editor$/);
  await expect(page.getByTestId("editor-workspace")).toBeVisible();
  await expect(page.getByTestId("file-item")).toHaveCount(2);
});

test("a documentation screenshot produces a readable real JPEG export", async ({ page, browserName }) => {
  await page.goto("/png-to-jpg");
  await page.getByTestId("file-input").setInputFiles(join(process.cwd(), "src/tests/fixtures/pdf/settings/image.png"));
  await expect(page.getByTestId("encode-workspace")).toBeVisible();
  await saveScreenshot(page, `png-to-jpg-${browserName}-documentation.png`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  expect(bytes.length).toBeGreaterThan(5_000);
  await saveExport("documentation-screenshot.jpg", bytes);
});

test("PDF to PNG selects PNG, renders selected page, and SVG to JPG fills transparency", async ({ page, browserName }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([160, 90]).drawRectangle({ x: 0, y: 0, width: 160, height: 90, color: rgb(0.1, 0.3, 0.9) });
  await page.goto("/pdf-to-png");
  await dismissConsent(page);
  await expect(page.getByLabel("Output format")).toHaveValue("png");
  await saveScreenshot(page, `pdf-to-png-${browserName}-before.png`);
  await page.getByLabel("PDF file").setInputFiles({ name: "one-page.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
  await expect(page.getByText("one-page.pdf · 1 pages")).toBeVisible();
  await page.getByLabel("Resolution").selectOption("1");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const [pngDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const pngBytes = readFileSync((await pngDownload.path())!);
  const decoded = PNG.sync.read(pngBytes);
  expect([decoded.width, decoded.height]).toEqual([160, 90]);
  expect(decoded.data[2]).toBeGreaterThan(200);
  await saveExport("pdf-to-png.png", pngBytes);
  await saveScreenshot(page, `pdf-to-png-${browserName}-result.png`);

  await page.goto("/svg-to-jpg");
  await dismissConsent(page);
  await expect(page.getByLabel("Output format")).toHaveValue("jpg");
  await saveScreenshot(page, `svg-to-jpg-${browserName}-before.png`);
  await page.getByLabel("SVG file").setInputFiles({ name: "mark.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="40" height="40" fill="#e03020"/></svg>') });
  await page.getByLabel("JPG background color").fill("#3366cc");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const [jpgDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const jpgBytes = readFileSync((await jpgDownload.path())!);
  expect(jpgBytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  const fill = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(bitmap, 0, 0);
    const pixel = [...ctx.getImageData(60, 20, 1, 1).data]; bitmap.close(); return pixel;
  }, Array.from(jpgBytes));
  expect(fill.slice(0, 3).every((value, index) => Math.abs(value - [51, 102, 204][index]) < 24)).toBe(true);
  await saveExport("svg-to-jpg.jpg", jpgBytes);
  await saveScreenshot(page, `svg-to-jpg-${browserName}-result.png`);
});

test("comparison pages and format pages have self canonicals, sitemap entries and mobile layout", async ({ page, request, browserName }) => {
  const routes = ["pdf-to-png", "svg-to-jpg", "webp-to-png", "webp-to-jpg", "png-to-jpg", "jpg-to-png", "alternatives/freeconvert", "alternatives/convertio", "alternatives/ilovepdf"];
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const route of routes) {
    await page.goto(`/${route}`);
    expect(await page.title()).toContain("Shotexa");
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(new RegExp(`/${route}$`));
    expect(sitemap).toContain(`/${route}<`);
    await expect(page.locator("h1")).toHaveCount(1);
    if (route.startsWith("alternatives/")) {
      await expect(page.getByText("Published by Shotexa", { exact: false }).first()).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible();
    }
    await saveScreenshot(page, `${route.replace("/", "-")}-${browserName}.png`);
  }
  expect(sitemap).not.toContain("heic-to-jpg");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/webp-to-png");
  await dismissConsent(page);
  await expect(page.getByRole("heading", { name: "Convert a WebP Image to PNG" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await saveScreenshot(page, `webp-to-png-${browserName}-mobile.png`);
  await page.goto("/alternatives/freeconvert");
  await expect(page.getByRole("heading", { name: "Shotexa vs FreeConvert" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await saveScreenshot(page, `alternatives-freeconvert-${browserName}-mobile.png`);
});
