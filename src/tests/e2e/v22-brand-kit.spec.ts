import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";

const evidence = join(process.cwd(), "docs/v2.2/screenshots");
const png = new PNG({ width: 360, height: 220 });
for (let i = 0; i < png.data.length; i += 4) png.data.set([230, 236, 245, 255], i);
const screenshot = { name: "kit-screen.png", mimeType: "image/png", buffer: PNG.sync.write(png) };

async function rejectAnalytics(page: Page) {
  const button = page.getByRole("button", { name: "Reject Google Analytics" });
  const visible = await button.waitFor({ state: "visible", timeout: 2_000 }).then(() => true).catch(() => false);
  if (visible) await button.click();
}

test("Brand Kit persists across reload and remains editable", async ({ page }) => {
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles(screenshot);
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByTestId("watermark-add-text").click();
  await page.getByLabel("Watermark text").fill("ACME");
  await page.getByLabel("Watermark color").fill("#1c1714");
  await page.getByRole("button", { name: "Brand Kit" }).click();
  await page.getByLabel("Brand name").fill("Acme Launch");
  await page.getByTestId("brand-save").click();
  await expect(page.getByTestId("brand-kit-panel").getByRole("status")).toContainText("Brand saved");
  if (process.env.CAPTURE_V22) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, "brand-kit.png") }); }
  await page.reload();
  await page.getByTestId("file-input").setInputFiles(screenshot);
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Brand Kit" }).click({ force: true });
  await page.getByRole("combobox", { name: "Saved brand kit" }).selectOption({ label: "Acme Launch" });
  await page.getByTestId("brand-apply").click();
  await expect(page.getByTestId("brand-kit-panel").getByRole("status")).toContainText("applied");
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await expect(page.getByLabel("Watermark text")).toHaveValue("ACME");
  await page.getByLabel("Watermark text").fill("ACME EDITED");
  await expect(page.getByLabel("Watermark text")).toHaveValue("ACME EDITED");
});

test("saved brand watermark renders across a screenshot pack", async ({ page }) => {
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles([screenshot, { ...screenshot, name: "kit-second.png" }]);
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
  await page.getByTestId("watermark-add-text").click();
  await page.getByLabel("Watermark text").fill("PACKMARK");
  await page.getByLabel("Watermark color").fill("#ff0000");
  await page.getByRole("button", { name: "Brand Kit" }).click();
  await page.getByLabel("Brand name").fill("Pack identity");
  await page.getByTestId("brand-save").click();
  await expect(page.getByTestId("brand-kit-panel").getByRole("status")).toContainText("Brand saved");

  await page.getByTestId("open-screenshot-packs").click();
  await page.getByLabel("Brand Kit").selectOption({ label: "Pack identity" });
  await page.getByTestId("pack-apply-brand").click();
  await page.getByTestId("pack-render-selected").click();
  await expect(page.getByTestId("pack-results")).toContainText("2 images rendered", { timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ZIP" }).click()]);
  const archive = unzipSync(new Uint8Array(await (await import("node:fs/promises")).readFile(await download.path())));
  expect(Object.keys(archive)).toHaveLength(2);
  for (const bytes of Object.values(archive)) {
    const image = PNG.sync.read(Buffer.from(bytes));
    let markedPixels = 0;
    for (let index = 0; index < image.data.length; index += 4) {
      if (image.data[index] > image.data[index + 1] + 70 && image.data[index] > image.data[index + 2] + 70) markedPixels++;
    }
    expect(markedPixels).toBeGreaterThan(20);
  }
});
