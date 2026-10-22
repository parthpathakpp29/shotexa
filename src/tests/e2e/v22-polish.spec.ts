import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";
import { beautifyLayout } from "@/core/beautify/layout";
import { DEFAULT_BEAUTIFY } from "@/core/beautify/presets";

const fixtures = join(process.cwd(), "docs/v2.2/polish/fixtures");
const desktop = join(fixtures, "saas-desktop.png");
const mobile = join(fixtures, "saas-mobile.png");
const logo = join(fixtures, "northstar-logo-transparent.png");
const evidence = join(process.cwd(), "docs/v2.2/polish");
const capture = !!process.env.CAPTURE_V22_POLISH;

async function rejectAnalytics(page: Page) {
  const choice = page.getByRole("button", { name: "Reject Google Analytics" });
  if (await choice.waitFor({ state: "visible", timeout: 2_000 }).then(() => true).catch(() => false)) await choice.click();
}

async function exportImage(page: Page, name?: string): Promise<PNG> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export image" }).click()]);
  const bytes = readFileSync(await download.path());
  if (capture && name) { mkdirSync(join(evidence, "exports"), { recursive: true }); writeFileSync(join(evidence, "exports", name), bytes); }
  return PNG.sync.read(bytes);
}

async function returnToDesktopWatermark(page: Page) {
  await page.getByTestId("file-item").first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
}

function redPixels(image: PNG, rect: { x: number; y: number; width: number; height: number }, outside: boolean) {
  let count = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const within = x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
    if (within === outside) continue;
    const index = (y * image.width + x) * 4;
    if (image.data[index] > image.data[index + 1] + 60 && image.data[index] > image.data[index + 2] + 60) count++;
  }
  return count;
}

async function previewRedPixels(page: Page, rect: { x: number; y: number; width: number; height: number }, outside: boolean, output: { width: number; height: number }) {
  return page.getByTestId("beautify-canvas").evaluate((canvas: HTMLCanvasElement, args) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const rect = { x: args.rect.x * canvas.width / args.output.width, y: args.rect.y * canvas.height / args.output.height, width: args.rect.width * canvas.width / args.output.width, height: args.rect.height * canvas.height / args.output.height };
    let count = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const within = x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
      if (within === args.outside) continue;
      const index = (y * canvas.width + x) * 4;
      if (data[index] > data[index + 1] + 60 && data[index] > data[index + 2] + 60) count++;
    }
    return count;
  }, { rect, outside, output });
}

function pixel(image: PNG, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return [...image.data.subarray(index, index + 4)];
}

test("realistic screenshots keep transparent logos separate and pattern scope matches export", async ({ page }) => {
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles([desktop, mobile]);
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByTestId("watermark-add-text").click();
  await page.getByLabel("Watermark text").fill("NORTHSTAR");
  await page.getByLabel("Watermark color").fill("#ff0000");
  await page.getByLabel("Repeat across image").click();
  await expect(page.getByRole("slider", { name: "Watermark opacity" })).toHaveValue("18");
  await expect(page.getByRole("slider", { name: "Watermark rotation" })).toHaveValue("-18");
  await expect(page.getByLabel("Watermark repeat coverage")).toHaveValue("screenshot");
  await page.getByRole("slider", { name: "Watermark opacity" }).focus();
  await page.getByRole("slider", { name: "Watermark opacity" }).press("End");
  const layout = beautifyLayout(DEFAULT_BEAUTIFY, { width: 1440, height: 900 });
  const screenshotPreviewInside = await previewRedPixels(page, layout.image, false, layout.canvas);
  const screenshotPreviewOutside = await previewRedPixels(page, layout.image, true, layout.canvas);
  const screenshotOnly = await exportImage(page, "watermark-screenshot-only.png");
  expect(screenshotOnly.width).toBe(layout.canvas.width);
  expect(redPixels(screenshotOnly, layout.image, false)).toBeGreaterThan(500);
  expect(redPixels(screenshotOnly, layout.image, true)).toBe(0);
  expect(screenshotPreviewInside).toBeGreaterThan(50);
  // Preview downscaling can blend a few edge pixels beyond the exact export clip.
  expect(screenshotPreviewOutside).toBeLessThan(200);

  await returnToDesktopWatermark(page);
  await page.getByLabel("Watermark repeat coverage").selectOption("canvas");
  const canvasPreviewOutside = await previewRedPixels(page, layout.image, true, layout.canvas);
  const canvasPattern = await exportImage(page, "watermark-entire-canvas.png");
  expect(redPixels(canvasPattern, layout.image, true)).toBeGreaterThan(100);
  expect(canvasPreviewOutside).toBeGreaterThan(10);

  await returnToDesktopWatermark(page);
  const sourceLogo = PNG.sync.read(readFileSync(logo));
  expect(sourceLogo.data[3]).toBe(0);
  const screenshotsBeforeLogo = await page.getByTestId("file-item").count();
  await page.getByLabel("Upload watermark logo").setInputFiles(logo);
  await expect(page.getByTestId("file-item")).toHaveCount(screenshotsBeforeLogo);
  await expect(page.getByRole("combobox", { name: "Watermark logo image" })).toHaveValue(/.+/);
  const withLogo = await exportImage(page, "watermark-transparent-logo.png");
  const logoWidth = Math.min(layout.canvas.width, layout.canvas.height) * 0.18;
  const logoHeight = logoWidth * sourceLogo.height / sourceLogo.width;
  const left = layout.canvas.width / 2 - logoWidth / 2;
  const top = layout.canvas.height / 2 - logoHeight / 2;
  const point = (x: number, y: number) => [Math.round(left + x / sourceLogo.width * logoWidth), Math.round(top + y / sourceLogo.height * logoHeight)] as const;
  const transparent = point(0, 0);
  const opaque = point(40, 45);
  expect(pixel(withLogo, ...transparent)).toEqual(pixel(canvasPattern, ...transparent));
  expect(pixel(withLogo, ...opaque)).not.toEqual(pixel(canvasPattern, ...opaque));
});

test("saved branding survives reload, supports per-image overrides and ZIP export", async ({ page }) => {
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles([desktop, mobile]);
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByTestId("watermark-add-text").click();
  await page.getByLabel("Watermark text").fill("NORTHSTAR");
  await page.getByLabel("Upload watermark logo").setInputFiles(logo);
  await page.getByRole("button", { name: "Brand Kit" }).click();
  await page.getByLabel("Brand name").fill("Northstar launch");
  await page.getByTestId("brand-save").click();
  await expect(page.getByTestId("brand-kit-panel").getByRole("status")).toContainText("saved");
  if (capture) { mkdirSync(join(evidence, "after"), { recursive: true }); await page.screenshot({ path: join(evidence, "after", "brand-kit.png") }); }
  await page.reload();
  await expect(page.getByTestId("file-item")).toHaveCount(0);
  await page.getByTestId("file-input").setInputFiles([desktop, mobile]);
  await page.getByTestId("open-screenshot-packs").click();
  await page.getByLabel("Brand Kit").selectOption({ label: "Northstar launch" });
  await page.getByTestId("pack-apply-brand").click();
  await expect(page.getByTestId("file-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Preview saas-mobile.png" }).click();
  await page.getByRole("button", { name: "Selected image" }).click();
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByRole("combobox", { name: "Selected watermark layer" }).selectOption({ label: "1. NORTHSTAR" });
  await page.getByLabel("Watermark text").fill("MOBILE ONLY");
  await page.getByRole("button", { name: "Preview saas-desktop.png" }).click();
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByRole("combobox", { name: "Selected watermark layer" }).selectOption({ label: "1. NORTHSTAR" });
  await expect(page.getByLabel("Watermark text")).toHaveValue("NORTHSTAR");
  await page.getByRole("button", { name: "Pack style" }).click();
  await page.getByTestId("pack-render-selected").click();
  await expect(page.getByTestId("pack-results")).toContainText("2 images rendered", { timeout: 90_000 });
  if (capture) { mkdirSync(join(evidence, "after"), { recursive: true }); await page.getByTestId("pack-results").screenshot({ path: join(evidence, "after", "pack-results.png") }); }
  const [individual] = await Promise.all([page.waitForEvent("download"), page.getByTestId("pack-results").getByRole("button", { name: "Download", exact: true }).first().click()]);
  expect(PNG.sync.read(readFileSync(await individual.path())).width).toBeGreaterThan(1440);
  const [archiveDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ZIP" }).click()]);
  const zipBytes = readFileSync(await archiveDownload.path());
  const entries = unzipSync(new Uint8Array(zipBytes));
  expect(Object.keys(entries).sort()).toEqual(["pack-saas-desktop.png", "pack-saas-mobile.png"]);
  for (const [name, bytes] of Object.entries(entries)) {
    expect(PNG.sync.read(Buffer.from(bytes)).width).toBeGreaterThan(390);
    if (capture) { mkdirSync(join(evidence, "exports"), { recursive: true }); writeFileSync(join(evidence, "exports", name), bytes); }
  }
  if (capture) writeFileSync(join(evidence, "exports", "northstar-pack.zip"), zipBytes);
});

test("mobile inspector edits a screenshot and keeps undo and redo available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles(mobile);
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByTestId("watermark-add-text").click();
  await page.getByLabel("Watermark text").fill("MOBILE");
  await page.getByLabel("Watermark X position").fill("62");
  await expect(page.getByLabel("Watermark X position")).toHaveValue("62");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await expect(page.getByLabel("Watermark X position")).toHaveValue("62");
  if (capture) { mkdirSync(join(evidence, "after"), { recursive: true }); await page.screenshot({ path: join(evidence, "after", "mobile-editing.png") }); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});
