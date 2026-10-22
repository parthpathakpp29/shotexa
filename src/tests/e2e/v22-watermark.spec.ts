import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const evidence = join(process.cwd(), "docs/v2.2/screenshots");
function image(name: string, width: number, height: number, color: [number, number, number, number]) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) png.data.set(color, (y * width + x) * 4);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}
async function rejectAnalytics(page: Page) {
  const button = page.getByRole("button", { name: "Reject Google Analytics" });
  const visible = await button.waitFor({ state: "visible", timeout: 2_000 }).then(() => true).catch(() => false);
  if (visible) await button.click();
}

test("text and logo marks can be positioned, undone and exported", async ({ page }) => {
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles(image("screen.png", 480, 280, [236, 240, 245, 255]));
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByTestId("watermark-add-text").click();
  await page.getByRole("textbox", { name: "Watermark text" }).fill("SHOTEXA");
  await page.getByLabel("Watermark color").fill("#111111");
  await page.getByLabel("Watermark X position").fill("40");
  await page.getByLabel("Watermark Y position").fill("35");
  await expect(page.getByTestId("watermark-layer-controls")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByLabel("Upload watermark logo").setInputFiles(image("logo.png", 30, 20, [219, 48, 54, 190]));
  await expect(page.getByRole("combobox", { name: "Selected watermark layer" })).toBeVisible();
  await page.getByLabel("Repeat across image").click();
  await page.getByRole("slider", { name: "Watermark opacity" }).focus();
  await page.getByRole("slider", { name: "Watermark opacity" }).press("End");
  const preview = page.getByTestId("beautify-canvas");
  await expect.poll(async () => preview.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > data[i + 1] + 60 && data[i] > data[i + 2] + 60) red++;
    return red;
  }), { timeout: 30_000 }).toBeGreaterThan(50);
  if (process.env.CAPTURE_V22) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, "watermark-stamp-pro.png") }); }
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export image" }).click()]);
  const path = await download.path();
  const bytes = await import("node:fs").then((fs) => fs.readFileSync(path));
  const exported = PNG.sync.read(bytes);
  let red = 0;
  for (let i = 0; i < exported.data.length; i += 4) if (exported.data[i] > exported.data[i + 1] + 60 && exported.data[i] > exported.data[i + 2] + 60) red++;
  expect(red).toBeGreaterThan(200);
  if (process.env.CAPTURE_V22) writeFileSync(join(evidence, "watermark-export.png"), bytes);
});

test("canvas handles drag, resize and rotate a watermark", async ({ page }) => {
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles(image("handles.png", 480, 280, [230, 235, 242, 255]));
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByTestId("watermark-add-text").click();
  const handle = page.locator('[data-testid^="watermark-handle-"]').first();
  await expect(handle).toBeVisible();
  let box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 36, box!.y + box!.height / 2 + 18, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => Number(await page.getByLabel("Watermark X position").inputValue())).toBeGreaterThan(50);
  const sizeBefore = Number(await page.getByRole("slider", { name: "Watermark size" }).inputValue());
  box = await page.getByRole("button", { name: "Resize watermark" }).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => Number(await page.getByRole("slider", { name: "Watermark size" }).inputValue())).toBeGreaterThan(sizeBefore);
  box = await page.getByRole("button", { name: "Rotate watermark" }).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 35, box!.y + box!.height / 2 + 10, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => Number(await page.getByRole("slider", { name: "Watermark rotation" }).inputValue())).not.toBe(0);
  await handle.focus();
  const xBefore = Number(await page.getByLabel("Watermark X position").inputValue());
  await handle.press("ArrowRight");
  await expect.poll(async () => Number(await page.getByLabel("Watermark X position").inputValue())).toBeGreaterThan(xBefore);
});
