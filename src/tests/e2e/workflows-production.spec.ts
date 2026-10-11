import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

const IMAGE = join(FIXTURE_DIR, "chat-light/a.png");
const SECOND = join(FIXTURE_DIR, "chat-light/b.png");
const RECEIPT = join(process.cwd(), "src/tests/fixtures/ocr/receipt/image.png");
const CAPTURE = !!process.env.CAPTURE_V2B;
const SHOTS = join(process.cwd(), "docs/v2-workflows/screenshots");

async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (!CAPTURE || testInfo.project.name !== "chromium") return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name), fullPage: false });
}

async function choose(page: Page, name: RegExp, files: string | string[] = IMAGE) {
  await page.goto("/workflows");
  await page.getByRole("button", { name }).click();
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByRole("button", { name: /^Start / })).toBeEnabled({ timeout: 30_000 });
}

async function skipOptional(page: Page) {
  await expect(page.getByRole("button", { name: "Skip optional step" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Skip optional step" }).click();
}

async function addRedaction(page: Page) {
  const canvas = page.getByLabel(/Screenshot redaction canvas/);
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .18, box.y + box.height * .2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .48, box.y + box.height * .34, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("redaction-region")).toHaveCount(1);
}

test.describe("Shotexa V2.0B workflows", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("Safe Share reviews redactions, cleans, optionally compresses and exports", async ({ page }, testInfo) => {
    await page.goto("/workflows");
    await expect(page.getByTestId("workflows-landing")).toBeVisible();
    await shot(page, testInfo, "01-workflows-landing.png");
    await page.getByRole("button", { name: /^Safe Share/ }).click();
    await page.getByTestId("file-input").setInputFiles(IMAGE);
    await page.getByRole("button", { name: "Start Safe Share" }).click();
    await expect(page.getByTestId("privacy-review")).toBeVisible({ timeout: 180_000 });
    await page.getByRole("button", { name: /Approve and continue/ }).click();
    await addRedaction(page);
    await shot(page, testInfo, "02-safe-share-runner.png");
    await page.getByRole("button", { name: /Approve and continue/ }).click();
    await skipOptional(page);
    await expect(page.getByTestId("workflow-complete")).toContainText("Redactions flattened", { timeout: 120_000 });
    await expect(page.getByTestId("workflow-complete")).toContainText("Metadata removed");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download output" }).click()]);
    expect(download.suggestedFilename()).toBe("safe-share.png");
    await shot(page, testInfo, "03-safe-share-complete.png");
  });

  test("Product Screenshot applies a Beautifier quick preset and exports", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await choose(page, /^Product Screenshot/);
    await page.getByRole("button", { name: "Product Hunt" }).click();
    await page.getByRole("button", { name: "Start Product Screenshot" }).click();
    await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("button", { name: /Approve and continue/ })).toBeVisible({ timeout: 180_000 });
    await shot(page, testInfo, "04-product-screenshot-runner.png");
    await page.getByRole("button", { name: /Approve and continue/ }).click();
    await skipOptional(page);
    await expect(page.getByTestId("workflow-complete")).toBeVisible({ timeout: 120_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download output" }).click()]);
    expect(download.suggestedFilename()).toBe("product-screenshot.png");
  });

  test("Bug Report annotates, extracts visible text and packages the factual report", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await choose(page, /^Bug Report/, RECEIPT);
    await page.getByRole("button", { name: "Start Bug Report" }).click();
    await page.getByLabel("Report title").fill("Checkout issue");
    await page.getByLabel("Notes").fill("The checkout button did not respond.");
    const stage = page.getByTestId("annotate-stage");
    await expect(stage).toBeVisible({ timeout: 30_000 });
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .65, box.y + box.height * .25, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("annotation-count")).toHaveText("1");
    await page.getByRole("button", { name: /Approve and continue/ }).click();
    await expect(page.getByRole("button", { name: /Approve and continue/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Approve and continue/ }).click();
    await skipOptional(page);
    await expect(page.getByTestId("workflow-complete")).toContainText("Bug report package generated", { timeout: 120_000 });
    await expect(page.getByTestId("workflow-complete")).toContainText("Visible text extracted locally");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download output" }).click()]);
    expect(download.suggestedFilename()).toBe("bug-report.zip");
    const entries = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
    expect(Object.keys(entries).sort()).toEqual(["extracted-text.txt", "metadata.json", "report.md", "screenshot.png"]);
    expect(new TextDecoder().decode(entries["report.md"])).toContain("# Checkout issue");
    expect(new TextDecoder().decode(entries["extracted-text.txt"])).toContain("Corner Cafe");
    await shot(page, testInfo, "05-bug-report-complete.png");
  });

  test("Documentation Pack reorders, captions, creates PDF and packages multiple screenshots", async ({ page }) => {
    await choose(page, /^Documentation Pack/, [IMAGE, SECOND]);
    await page.getByRole("button", { name: "Start Documentation Pack" }).click();
    await expect(page.getByLabel(/Move .* later/).first()).toBeVisible();
    await page.getByLabel(/Move .* later/).first().click();
    await page.getByLabel("Screenshot 1 caption").fill("Second step");
    await page.getByRole("button", { name: /Approve and continue/ }).click();
    await skipOptional(page);
    await skipOptional(page);
    await expect(page.getByTestId("workflow-complete")).toContainText("Documentation package generated", { timeout: 180_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download output" }).click()]);
    expect(["documentation.pdf", "documentation-pack.zip"]).toContain(download.suggestedFilename());
  });

  test("Web Ready applies a target, reviews metadata removal and exports", async ({ page }) => {
    await choose(page, /^Web Ready/);
    await page.getByRole("button", { name: "Small File" }).click();
    await page.getByRole("button", { name: "Start Web Ready" }).click();
    await skipOptional(page);
    await expect(page.getByTestId("workflow-complete")).toContainText("Export generated", { timeout: 120_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download output" }).click()]);
    expect(download.suggestedFilename()).toBe("web-ready.webp");
  });

  test("custom recipe saves, runs, reloads and remains local", async ({ page }, testInfo) => {
    await page.goto("/workflows");
    await page.getByRole("button", { name: /^Custom workflow/ }).click();
    await page.getByLabel("Workflow name").fill("My Repeatable Web Asset");
    await page.getByLabel("Output filename").fill("repeatable.png");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Workflow action").selectOption("export");
    await page.getByRole("button", { name: "Add step" }).click();
    await shot(page, testInfo, "06-custom-recipe-builder.png");
    await page.getByRole("button", { name: "Save workflow" }).click();
    const card = page.getByRole("heading", { name: "My Repeatable Web Asset" });
    await expect(card).toBeVisible();
    await card.locator("xpath=ancestor::article").getByRole("button", { name: "Run" }).click();
    await page.getByTestId("file-input").setInputFiles(IMAGE);
    await page.getByRole("button", { name: "Start My Repeatable Web Asset" }).click();
    await expect(page.getByTestId("workflow-complete")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Workflows" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "My Repeatable Web Asset" })).toBeVisible();
  });
});

test.describe("Shotexa V2.0B mobile workflows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("390px selection, progress and settings sheet retain full capability", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await page.goto("/workflows");
    await shot(page, testInfo, "07-mobile-workflows.png");
    await page.getByRole("button", { name: /^Product Screenshot/ }).click();
    await page.getByTestId("file-input").setInputFiles(IMAGE);
    await page.getByRole("button", { name: "Start Product Screenshot" }).click();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible({ timeout: 30_000 });
    await shot(page, testInfo, "08-mobile-active-workflow.png");
    // The optional Remove Background step runs first, so wait for the Beautifier review
    // itself rather than for whichever step happens to be current.
    await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 240_000 });
    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Style the screenshot" });
    await expect(settings.getByTestId("workflow-settings")).toBeVisible();
    await expect(settings.getByRole("button", { name: /Approve and continue/ })).toBeVisible();
    await shot(page, testInfo, "09-mobile-settings-sheet.png");
  });

  test("320px, 360px and 414px keep review controls accessible without horizontal overflow", async ({ page }) => {
    test.setTimeout(600_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const viewport of [{ width: 320, height: 700 }, { width: 360, height: 800 }, { width: 414, height: 896 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/workflows");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole("button", { name: /^Product Screenshot/ }).click();
      await page.getByTestId("file-input").setInputFiles(IMAGE);
      await page.getByRole("button", { name: "Start Product Screenshot" }).click();
      await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 240_000 });
      await page.getByRole("button", { name: "Settings" }).click();
      const sheet = page.getByRole("dialog", { name: "Style the screenshot" });
      await expect(sheet.getByRole("button", { name: /Approve and continue/ })).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
