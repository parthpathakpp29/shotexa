import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";

const CAPTURE = !!process.env.CAPTURE_V2D;
const SHOTS = join(process.cwd(), "docs/v2-structured-data/screenshots");

async function fixture(context: BrowserContext, testInfo: TestInfo, kind: "table" | "document" | "fields" | "multiple" = "table") {
  const maker = await context.newPage(); await maker.setViewportSize({ width: 1200, height: 760 });
  const content = kind === "table" ? `<div class="row head"><b>Product</b><b>Price</b><b>Revenue</b></div><div class="row"><span>Starter</span><span>$10</span><span>$4,200</span></div><div class="row"><span>Pro</span><span>$29</span><span>$8,100</span></div>`
    : kind === "fields" ? `<div class="field"><b>Name:</b><span>Parth Pathak</span></div><div class="field"><b>Email:</b><span>example@example.test</span></div><div class="field"><b>Plan:</b><span>Pro</span></div><div class="field"><b>Status:</b><span>Active</span></div>`
    : kind === "document" ? `<h1>Release Notes</h1><p>Shotexa keeps processing local.</p><p>- Faster review</p><p>- Editable output</p><pre>const privateMode = true;</pre>`
    : `<h2>Quarter one</h2><div class="row head"><b>Plan</b><b>Users</b></div><div class="row"><span>Free</span><span>120</span></div><div class="gap"></div><h2>Quarter two</h2><div class="row head"><b>Plan</b><b>Users</b></div><div class="row"><span>Pro</span><span>80</span></div>`;
  await maker.setContent(`<style>body{margin:0;padding:58px;background:white;color:#171310;font:38px/1.45 Arial,sans-serif}.row{display:grid;grid-template-columns:330px 220px 300px;gap:36px;margin:22px 0}.field{display:grid;grid-template-columns:230px 600px;gap:30px;margin:24px 0}h1,h2{margin:0 0 28px}p{margin:18px 0}pre{font:32px/1.5 monospace;margin-top:28px}.gap{height:150px}</style>${content}`);
  const path = testInfo.outputPath(`structured-${kind}.png`); await maker.screenshot({ path }); await maker.close(); return path;
}
async function open(page: Page, image: string) { await page.goto("/screenshot-to-data"); await page.getByTestId("file-input").setInputFiles(image); await expect(page.getByTestId("structured-workspace")).toBeVisible({ timeout: 30_000 }); }
async function analyze(page: Page) { await page.getByTestId("extract-structured").click(); await expect(page.getByRole("table", { name: "Editable extracted table" }).or(page.getByLabel("Structured output editor").locator("textarea").first())).toBeVisible({ timeout: 180_000 }); }
async function shot(page: Page, testInfo: TestInfo, name: string) { if (!CAPTURE || testInfo.project.name !== "chromium") return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, name), fullPage: false }); }

test.describe("Shotexa V2.0D Screenshot to Data", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test("table → source-linked edit → CSV, JSON and lazy XLSX exports", async ({ page, context }, testInfo) => {
    test.setTimeout(300_000); const posted: string[] = []; page.on("request", (request) => { if (!['GET', 'HEAD'].includes(request.method()) && request.postDataBuffer()?.length) posted.push(request.url()); });
    await open(page, await fixture(context, testInfo)); await analyze(page);
    const table = page.getByRole("table", { name: "Editable extracted table" }); await expect(table).toBeVisible();
    const starter = table.getByRole("textbox", { name: /row 2 column 1/i }); await starter.fill("Starter edited");
    await expect(page.getByTestId("structured-source").locator("div.absolute").last()).toBeVisible();
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]); expect(csv.suggestedFilename()).toMatch(/\.csv$/); expect(readFileSync((await csv.path())!, "utf8")).toContain("Starter edited");
    await page.getByRole("button", { name: "JSON", exact: true }).click(); const jsonPreview = page.getByTestId("structured-export-preview"); await expect(jsonPreview).toContainText("Starter edited"); await jsonPreview.scrollIntoViewIfNeeded(); await shot(page, testInfo, "02-json-preview.png"); const [json] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]); expect(JSON.parse(readFileSync((await json.path())!, "utf8").replace(/^\uFEFF/, ""))[0].product).toBe("Starter edited");
    await page.getByRole("button", { name: "XLSX", exact: true }).click(); const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]); const archive = unzipSync(new Uint8Array(readFileSync((await xlsx.path())!))); expect(Object.keys(archive)).toContain("xl/worksheets/sheet1.xml");
    expect(posted).toEqual([]); await shot(page, testInfo, "01-table-editor.png");
  });

  test("document and key/value screenshots produce editable Markdown and JSON", async ({ page, context }, testInfo) => {
    test.setTimeout(300_000); await open(page, await fixture(context, testInfo, "document")); await page.getByLabel("Extraction mode").selectOption("document"); await page.getByRole("button", { name: "Analyze screenshot" }).click(); await expect(page.getByLabel("Structured output editor").locator("textarea").first()).toBeVisible({ timeout: 180_000 });
    const first = page.getByLabel("Structured output editor").locator("textarea").first(); await first.fill("Release Notes Edited"); await page.getByRole("button", { name: "Markdown", exact: true }).click(); const markdownPreview = page.getByLabel("Markdown export preview"); await expect(markdownPreview).toContainText("Release Notes Edited"); await markdownPreview.scrollIntoViewIfNeeded(); await shot(page, testInfo, "03-markdown-preview.png"); const [markdown] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]); expect(readFileSync((await markdown.path())!, "utf8")).toContain("Release Notes Edited");
    await open(page, await fixture(context, testInfo, "fields")); await page.getByLabel("Extraction mode").selectOption("key-value"); await page.getByRole("button", { name: "Analyze screenshot" }).click(); await expect(page.getByLabel("Key 1")).toBeVisible({ timeout: 180_000 }); await page.getByRole("button", { name: "JSON", exact: true }).click(); const [json] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]); expect(readFileSync((await json.path())!, "utf8")).toContain('"plan"');
  });

  test("region selection, multiple tables and uncertainty review stay available", async ({ page, context }, testInfo) => {
    test.setTimeout(300_000); await open(page, await fixture(context, testInfo, "multiple")); await page.getByRole("button", { name: "Select region" }).click(); const source = page.getByTestId("structured-source"); const box = (await source.boundingBox())!; await page.mouse.move(box.x + 5, box.y + 5); await page.mouse.down(); await page.mouse.move(box.x + box.width * .92, box.y + box.height * .45, { steps: 6 }); await page.mouse.up(); await page.getByTestId("extract-structured").click(); await expect(page.getByLabel("Structured output editor").getByRole("textbox").first()).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/confidence/).first()).toBeVisible(); await shot(page, testInfo, "04-region-review.png");
    await page.getByRole("button", { name: "Use entire screenshot" }).click(); await page.getByRole("button", { name: "Analyze screenshot" }).click(); await expect(page.getByRole("tab", { name: "Table 2" })).toBeVisible({ timeout: 180_000 }); await page.getByRole("tab", { name: "Table 2" }).click(); await shot(page, testInfo, "05-multiple-tables.png");
    await page.getByRole("checkbox", { name: "Export every table as a ZIP" }).check(); const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]); const archive = unzipSync(new Uint8Array(readFileSync((await download.path())!))); expect(Object.keys(archive)).toHaveLength(2);
  });

  test("custom workflow reuses structured extraction and CSV adapters", async ({ page, context }, testInfo) => {
    test.setTimeout(300_000); const image = await fixture(context, testInfo);
    await page.goto("/workflows"); await page.getByRole("button", { name: /^Custom workflow/ }).click(); await page.getByLabel("Workflow name").fill("Extract my table");
    await page.getByLabel("Workflow action").selectOption("structured-extract"); await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Workflow action").selectOption("export-csv"); await page.getByRole("button", { name: "Add step" }).click(); await page.getByRole("button", { name: "Save workflow" }).click();
    const card = page.getByRole("heading", { name: "Extract my table" }).locator("xpath=ancestor::article"); await card.getByRole("button", { name: "Run" }).click(); await page.getByTestId("file-input").setInputFiles(image); await page.getByRole("button", { name: "Start Extract my table" }).click();
    await expect(page.getByTestId("workflow-complete")).toContainText("Structured data detected as table", { timeout: 180_000 }); await expect(page.getByTestId("workflow-complete")).toContainText("CSV generated");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download output" }).click()]); expect(download.suggestedFilename()).toBe("extracted-data.csv");
  });
});

test.describe("Shotexa V2.0D mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px exposes source, scrolling table editor, review and every export format", async ({ page, context }, testInfo) => {
    test.setTimeout(300_000); await open(page, await fixture(context, testInfo)); await analyze(page); await expect(page.getByTestId("structured-table-scroll")).toBeVisible(); await page.getByTestId("mobile-inspector-trigger").click(); const sheet = page.getByRole("dialog", { name: "Data settings" });
    for (const name of ["CSV", "TSV", "XLSX", "JSON", "Markdown", "Text"]) await expect(sheet.getByRole("button", { name, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await shot(page, testInfo, "06-mobile-data.png");
    for (const viewport of [{ width: 320, height: 700 }, { width: 360, height: 800 }, { width: 414, height: 896 }]) { await page.setViewportSize(viewport); await expect(sheet.getByRole("button", { name: "XLSX", exact: true })).toBeVisible(); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  });
});
