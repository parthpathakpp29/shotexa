import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

const A = join(FIXTURE_DIR, "chat-light/a.png");
const B = join(FIXTURE_DIR, "chat-light/b.png");
const PHONE_VIEWPORTS = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
];

const CONTENT_ROUTES = [
  "/",
  "/tools",
  "/privacy",
  "/alternatives",
  "/alternatives/xnapper",
  "/alternatives/cleanshot-x",
  "/alternatives/snagit",
  "/alternatives/pika",
  "/alternatives/shots-so",
  "/stitch-screenshots",
  "/combine-screenshots",
  "/redact-screenshot",
  "/blur-screenshot",
  "/screenshot-to-text",
  "/screenshot-to-pdf",
  "/screenshot-to-searchable-pdf",
  "/screenshot-editor",
  "/annotate-screenshot",
  "/split-long-screenshot",
  "/compress-screenshot",
  "/convert-screenshot",
  "/screenshot-beautifier",
  "/compare-screenshots",
  "/remove-image-metadata",
  "/batch-screenshots",
];

async function expectNoPageOverflow(page: Page) {
  const horizontalScroll = await page.evaluate(() => {
    window.scrollTo({ left: 10_000 });
    const value = window.scrollX;
    window.scrollTo({ left: 0 });
    return value;
  });
  expect(horizontalScroll).toBe(0);
}

async function openSettings(page: Page) {
  const trigger = page.getByTestId("mobile-inspector-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  const sheet = page.getByRole("dialog").last();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close" })).toBeVisible();
  await expectNoPageOverflow(page);
  return sheet;
}

async function upload(page: Page, route: string, files: string | string[]) {
  await page.goto(route);
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByTestId("mobile-inspector-trigger")).toBeVisible({ timeout: 30_000 });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const directory = process.env.MOBILE_AUDIT_SCREENSHOTS_DIR;
  if (directory) mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: directory ? join(directory, name) : testInfo.outputPath(name), fullPage: false });
}

test.describe.configure({ timeout: 180_000 });

test.describe("mobile production usability", () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  });

  test("all public and tool landing pages fit 320px, 360px, 390px, and 414px", async ({ page }) => {
    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const route of CONTENT_ROUTES) {
        await page.goto(route);
        await expect(page.locator("body")).toBeVisible();
        await expectNoPageOverflow(page);
      }
    }
  });

  test("the phone menu exposes tools, alternatives, and privacy", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORTS[0]);
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet.getByRole("link", { name: "All tools" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Alternatives" })).toBeVisible();
    await sheet.locator("div.overflow-y-auto").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(sheet.getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test("wide comparison tables scroll inside their own container instead of moving the page", async ({ page }, testInfo) => {
    await page.setViewportSize(PHONE_VIEWPORTS[0]);
    await page.goto("/");
    const table = page.getByRole("table", { name: "How Shotexa compares with upload-based image tools" });
    const controlledScroll = await table.evaluate((element) => {
      const container = element.parentElement!;
      container.scrollLeft = container.scrollWidth;
      return { scrollable: container.scrollWidth > container.clientWidth, moved: container.scrollLeft > 0 };
    });
    expect(controlledScroll).toEqual({ scrollable: true, moved: true });
    await expectNoPageOverflow(page);
    await capture(page, testInfo, "homepage-mobile.png");
  });

  test("workspace settings retain Advanced Options, all formats, and the primary export action on a phone", async ({ page }, testInfo) => {
    await page.setViewportSize(PHONE_VIEWPORTS[2]);
    await upload(page, "/screenshot-beautifier", A);
    const sheet = await openSettings(page);
    await sheet.getByRole("button", { name: "Advanced options" }).last().click();
    const formats = sheet.getByRole("radiogroup", { name: "Image export format" });
    await expect(formats.getByRole("radio", { name: "PNG" })).toBeVisible();
    await expect(formats.getByRole("radio", { name: "JPEG" })).toBeVisible();
    await expect(formats.getByRole("radio", { name: "WebP" })).toBeVisible();
    await formats.getByRole("radio", { name: "WebP" }).click();
    await expect(sheet.getByRole("slider", { name: "Image quality" })).toBeVisible();
    await expect(sheet.getByTestId("mobile-sheet-export")).toBeVisible();
    await capture(page, testInfo, "beautifier-settings-mobile.png");
  });

  test("editor, compare, safe share, stitch, split, PDF, batch, compress, and convert controls remain reachable", async ({ page }, testInfo) => {
    await page.setViewportSize(PHONE_VIEWPORTS[2]);
    const errors: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));

    await upload(page, "/screenshot-editor", A);
    let sheet = await openSettings(page);
    await sheet.getByRole("button", { name: "Advanced options" }).last().click();
    await expect(sheet.getByRole("radiogroup", { name: "Image export format" }).getByRole("radio", { name: "WebP" })).toBeVisible();
    await capture(page, testInfo, "editor-settings-mobile.png");

    await upload(page, "/compare-screenshots", [A, B]);
    sheet = await openSettings(page);
    await expect(sheet.getByRole("radiogroup", { name: "Comparison mode" })).toBeVisible();
    await expect(sheet.getByRole("radiogroup", { name: "Fit" })).toBeVisible();
    await capture(page, testInfo, "compare-settings-mobile.png");

    await upload(page, "/redact-screenshot", A);
    sheet = await openSettings(page);
    await sheet.getByRole("button", { name: "Advanced options" }).click();
    await expect(sheet.getByRole("radiogroup", { name: "Export format" }).getByRole("radio", { name: "WebP" })).toBeVisible();

    await upload(page, "/stitch-screenshots", [A, B]);
    sheet = await openSettings(page);
    await sheet.getByRole("button", { name: "Advanced options" }).click();
    await expect(sheet.getByRole("radiogroup", { name: "Export format" })).toBeVisible();

    await upload(page, "/split-long-screenshot", A);
    sheet = await openSettings(page);
    await sheet.getByRole("button", { name: "Advanced options" }).click();
    await expect(sheet.getByRole("radiogroup", { name: "Image export format" })).toBeVisible();

    await upload(page, "/screenshot-to-pdf", A);
    sheet = await openSettings(page);
    await expect(sheet.getByRole("radiogroup", { name: "PDF page size" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Add page break" })).toBeVisible();

    await upload(page, "/compress-screenshot", A);
    sheet = await openSettings(page);
    await expect(sheet.getByRole("radiogroup", { name: "Output format" }).getByRole("radio", { name: "WebP" })).toBeVisible();

    await upload(page, "/convert-screenshot", A);
    sheet = await openSettings(page);
    const convertFormats = sheet.getByRole("radiogroup", { name: "Output format" });
    await convertFormats.getByRole("radio", { name: "WebP" }).click();
    await expect(sheet.getByRole("slider", { name: "WebP quality" })).toBeVisible();
    await expect(sheet.getByTestId("convert-filename")).toBeVisible();
    await capture(page, testInfo, "convert-export-mobile.png");

    await upload(page, "/batch-screenshots", [A, B]);
    sheet = await openSettings(page);
    await expect(sheet.getByRole("radiogroup", { name: "Batch operation" })).toBeVisible();
    await expect(sheet.getByTestId("batch-filename-prefix")).toBeVisible();
    await expect(sheet.getByTestId("mobile-sheet-export")).toBeVisible();
    await capture(page, testInfo, "batch-mobile.png");

    await page.goto("/alternatives/xnapper");
    await expectNoPageOverflow(page);
    await capture(page, testInfo, "alternatives-mobile.png");
    expect(errors).toEqual([]);
  });

  test("mobile inspector sheets scroll and preserve their sticky export action", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORTS[0]);
    await upload(page, "/screenshot-beautifier", A);
    await expect(page.getByTestId("mobile-inspector-trigger")).toHaveText("Settings");
    const sheet = await openSettings(page);
    const scroller = sheet.locator("div.overflow-y-auto");
    const scrollState = await scroller.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
    await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(sheet.getByTestId("mobile-sheet-export")).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test("landscape phone layouts keep workspace controls reachable", async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await upload(page, "/screenshot-beautifier", A);
    const sheet = await openSettings(page);
    await expect(sheet.getByRole("button", { name: "Advanced options" })).toBeVisible();
    await expect(sheet.getByTestId("mobile-sheet-export")).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
