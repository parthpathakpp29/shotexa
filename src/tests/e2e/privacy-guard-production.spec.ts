import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

const MANUAL_IMAGE = join(FIXTURE_DIR, "chat-light/a.png");
const CAPTURE = !!process.env.CAPTURE_V2C;
const SHOTS = join(process.cwd(), "docs/v2-privacy-guard/screenshots");
const EMAIL = "alex@example.com";
const TOKEN = "sk-proj-SYNTHETIC1234567890ABCDEFGHIJ";

async function sensitiveFixture(context: BrowserContext, testInfo: TestInfo, lines = ["Privacy review sample", `Email: ${EMAIL}`, `API Key: ${TOKEN}`, "Customer ID: CUST-12345678", "Username: demo.user"]): Promise<string> {
  const maker = await context.newPage();
  await maker.setViewportSize({ width: 1200, height: 640 });
  await maker.setContent(`<style>body{margin:0;background:white;color:#111;font:42px/1.7 Arial,sans-serif;padding:54px}p{margin:0 0 12px}code{font-family:monospace;font-size:34px}</style>${lines.map((line) => `<p><code>${line}</code></p>`).join("")}`);
  const path = testInfo.outputPath("privacy-synthetic.png");
  await maker.screenshot({ path }); await maker.close(); return path;
}

async function openGuard(page: Page, image: string) {
  await page.goto("/redact-screenshot");
  await page.getByTestId("file-input").setInputFiles(image);
  await expect(page.getByTestId("redaction-editor")).toBeVisible({ timeout: 30_000 });
}

async function scan(page: Page) {
  await page.getByRole("button", { name: "Scan screenshot" }).click();
  await expect(page.getByTestId("privacy-review").getByText(/possible sensitive item/)).toBeVisible({ timeout: 180_000 });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  if (!CAPTURE || testInfo.project.name !== "chromium") return;
  mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, name), fullPage: false });
}

test.describe("Shotexa V2.0C Privacy Guard", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test("local scan finds synthetic email and token, reviews, flattens and exports", async ({ page, context }, testInfo) => {
    test.setTimeout(300_000);
    const image = await sensitiveFixture(context, testInfo);
    const posted: string[] = [];
    page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method()) && request.postDataBuffer()?.length) posted.push(request.url()); });
    await openGuard(page, image); await scan(page);
    await expect(page.getByText("Email", { exact: true })).toBeVisible();
    await expect(page.getByText(/Access token|API key/, { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(TOKEN);
    await expect(page.getByTestId("privacy-finding-region").first()).toBeVisible();
    await capture(page, testInfo, "01-findings-review.png");
    await page.getByRole("button", { name: /Redact Selected/ }).click();
    await expect(page.getByTestId("redaction-region").first()).toBeVisible();
    await page.getByTestId("export").click();
    await expect(page.getByLabel("Final sanitized image")).toBeVisible({ timeout: 180_000 });
    await page.getByRole("checkbox", { name: /I inspected the final image/ }).check();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export").click()]);
    expect(download.suggestedFilename()).toMatch(/^safe-copy\.(png|jpg|webp)$/);
    await expect(page.getByTestId("safe-share-result")).toContainText("metadata removed");
    expect(posted).toEqual([]);
    await capture(page, testInfo, "02-verification.png");
  });

  test("low-confidence finding can be ignored and restored", async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    await openGuard(page, await sensitiveFixture(context, testInfo, ["Username: demo.user"])); await scan(page);
    const item = page.getByText("Username", { exact: true }).locator("xpath=ancestor::li");
    await expect(item).toContainText("low");
    await item.getByRole("button", { name: /Ignore Username/ }).click();
    await expect(page.getByRole("button", { name: "Restore ignored" })).toBeVisible();
    await page.getByRole("button", { name: "Restore ignored" }).click();
    await expect(page.getByText("Username", { exact: true })).toBeVisible();
  });

  test("custom local rule finds a labelled customer identifier", async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    await openGuard(page, await sensitiveFixture(context, testInfo, ["Customer ID: CUST-12345678"]));
    await page.getByText("Custom detection rules").click();
    await page.getByPlaceholder("Customer ID").fill("Support customer ID");
    await page.getByPlaceholder("CUST-[0-9]{8}").fill("CUST-[0-9]{8}");
    await page.getByRole("button", { name: "Add local rule" }).click();
    await scan(page);
    await expect(page.getByRole("button", { name: /Support customer ID high/ })).toBeVisible();
  });

  test("manual redaction remains fully usable without scanning", async ({ page }) => {
    await openGuard(page, MANUAL_IMAGE);
    const stage = page.getByLabel(/Screenshot redaction canvas/); const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.mouse.move(box.x + 180, box.y + 100, { steps: 5 }); await page.mouse.up();
    await expect(page.getByTestId("redaction-region")).toHaveCount(1);
  });

  test("a running scan can be cancelled without losing manual editing", async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);
    await openGuard(page, await sensitiveFixture(context, testInfo));
    await page.getByRole("button", { name: "Scan screenshot" }).click();
    const cancel = page.getByRole("button", { name: "Cancel scan" });
    await expect(cancel).toBeVisible(); await cancel.click();
    await expect(page.getByRole("button", { name: /Scan screenshot|Scan again/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(/Screenshot redaction canvas/)).toBeVisible();
  });
});

test.describe("Shotexa V2.0C Privacy Guard mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px findings sheet exposes scan, categories, review and redaction", async ({ page, context }, testInfo) => {
    test.setTimeout(300_000);
    await openGuard(page, await sensitiveFixture(context, testInfo));
    await page.getByTestId("mobile-inspector-trigger").click();
    const sheet = page.getByRole("dialog", { name: "Safe Share controls" });
    await sheet.getByRole("button", { name: "Scan screenshot" }).click();
    await expect(sheet.getByText(/possible sensitive item/)).toBeVisible({ timeout: 180_000 });
    await expect(sheet.getByRole("checkbox", { name: "Developer" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Redact Selected/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, testInfo, "03-mobile-findings.png");
    for (const viewport of [{ width: 320, height: 700 }, { width: 360, height: 800 }, { width: 414, height: 896 }]) {
      await page.setViewportSize(viewport);
      await expect(sheet.getByRole("checkbox", { name: "Developer" })).toBeVisible();
      await expect(sheet.getByRole("button", { name: /Redact Selected/ })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
});
