import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";

const evidence = join(process.cwd(), "docs/v2.2/screenshots");
function screenshot(name: string, color: [number, number, number]) {
  const png = new PNG({ width: 320, height: 190 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...color, 255], i);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}
async function rejectAnalytics(page: Page) {
  const button = page.getByRole("button", { name: "Reject Google Analytics" });
  const visible = await button.waitFor({ state: "visible", timeout: 2_000 }).then(() => true).catch(() => false);
  if (visible) await button.click();
}

test("Screenshot Pack renders two styled images and a valid ZIP", async ({ page }) => {
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles([screenshot("product-a.png", [220, 45, 55]), screenshot("product-b.png", [36, 85, 205])]);
  await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("open-screenshot-packs").click();
  await expect(page.getByTestId("screenshot-pack-workspace")).toBeVisible();
  await page.getByLabel("Beautifier template").selectOption({ index: 1 });
  await page.getByTestId("pack-apply-template").click();
  await page.getByTestId("pack-render-selected").click();
  await expect(page.getByTestId("pack-results")).toContainText("2 images rendered", { timeout: 90_000 });
  if (process.env.CAPTURE_V22) {
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, "screenshot-packs.png") });
    await page.getByTestId("pack-results").screenshot({ path: join(evidence, "screenshot-packs-results.png") });
  }
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ZIP" }).click()]);
  const archive = readFileSync(await download.path());
  const entries = unzipSync(new Uint8Array(archive));
  expect(Object.keys(entries).sort()).toEqual(["pack-product-a.png", "pack-product-b.png"]);
  for (const contents of Object.values(entries)) {
    const image = PNG.sync.read(Buffer.from(contents));
    expect(image.width).toBeGreaterThan(320);
    expect(image.height).toBeGreaterThan(190);
  }
  if (process.env.CAPTURE_V22) writeFileSync(join(evidence, "screenshot-pack.zip"), archive);
});

test("pack controls remain usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/screenshot-beautifier");
  await rejectAnalytics(page);
  await page.getByTestId("file-input").setInputFiles([screenshot("mobile-a.png", [220, 45, 55]), screenshot("mobile-b.png", [36, 85, 205])]);
  await expect(page.getByTestId("open-screenshot-packs")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("open-screenshot-packs").click();
  await expect(page.getByTestId("screenshot-pack-workspace")).toBeVisible();
  await page.getByRole("button", { name: "Pack controls" }).click();
  await expect(page.getByRole("button", { name: "Selected image" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  if (process.env.CAPTURE_V22) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, "screenshot-packs-mobile.png") }); }
});
