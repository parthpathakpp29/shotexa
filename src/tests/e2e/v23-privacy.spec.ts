import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { PNG } from "pngjs";
import { inspectBytes } from "@/core/metadata/engine-core";
import { parseImageSize } from "@/core/image/image-size";

const FACE = join(process.cwd(), "src/tests/fixtures/privacy-v23/astronaut-public-domain.png");
const ORIENTED = join(process.cwd(), "src/tests/fixtures/metadata/jpeg/orientation-6.jpg");
const EVIDENCE = join(process.cwd(), "docs/v2.3/screenshots");

async function open(page: Page, file: string) {
  await page.goto("/redact-screenshot");
  await page.getByTestId("file-input").setInputFiles(file);
  await expect(page.getByTestId("redaction-editor")).toBeVisible({ timeout: 60_000 });
}

async function save(page: Page, info: TestInfo, name: string) {
  if (info.project.name !== "chromium") return;
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE, name), fullPage: false });
}

async function clearToasts(page: Page) {
  for (let count = 0; count < 6; count++) {
    const close = page.getByRole("button", { name: /^Close / }).first();
    if (!(await close.isVisible())) break;
    await close.click();
  }
}

test.describe("V2.3 Smart Privacy Guard", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("shotexa.analytics-consent.v1", "rejected");
      localStorage.setItem("shotexa.vercel-analytics-opt-out.v1", "true");
    });
  });

  test("local face suggestion becomes editable opaque redaction and a reviewed sanitized export", async ({ page }, info) => {
    test.setTimeout(300_000);
    const uploads: string[] = [];
    page.on("request", (request) => { if (!/^(GET|HEAD)$/.test(request.method()) && request.postDataBuffer()?.length) uploads.push(request.url()); });
    await open(page, FACE);
    for (const name of ["Personal", "Financial", "Developer", "Network"]) await page.getByRole("checkbox", { name, exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "Find faces locally" }).check();
    await page.getByRole("button", { name: "Scan screenshot" }).click();
    await expect(page.getByRole("button", { name: "Scan again" })).toBeVisible({ timeout: 120_000 });
    if (info.project.name === "webkit") {
      await expect(page.getByText(/Face detection was unavailable/)).toBeVisible();
      const stage = page.getByLabel(/Screenshot redaction canvas/);
      const box = (await stage.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.30, box.y + box.height * 0.08);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.40, { steps: 6 });
      await page.mouse.up();
    } else {
      await expect(page.getByText("Possible face 1")).toBeVisible();
      await clearToasts(page);
      await save(page, info, "01-face-suggestion.png");
      await page.getByRole("button", { name: /Redact Selected/ }).click();
    }
    const region = page.getByTestId("redaction-region").first();
    await expect(region).toBeVisible();
    const x = Number(await region.getAttribute("data-source-x"));
    const y = Number(await region.getAttribute("data-source-y"));
    const w = Number(await region.getAttribute("data-source-width"));
    const h = Number(await region.getAttribute("data-source-height"));
    await region.focus(); await region.press("ArrowRight");
    await expect(region).toHaveAttribute("data-source-x", String(x + 1));
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(region).toHaveAttribute("data-source-x", String(x));
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(region).toHaveAttribute("data-source-x", String(x + 1));
    await page.getByRole("button", { name: "Prepare Safe Copy" }).click();
    await expect(page.getByLabel("Final sanitized image")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(1);
    await expect(page.getByTestId("export")).toBeDisabled();
    const previewHash = await page.getByRole("img", { name: "Final flattened and metadata-cleaned result" }).evaluate(async (image) => {
      const bytes = await (await fetch((image as HTMLImageElement).currentSrc)).arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
    });
    await clearToasts(page);
    await save(page, info, "02-final-review.png");
    await page.getByRole("checkbox", { name: /I inspected the final image/ }).check();
    await expect(page.getByTestId("file-item")).toHaveCount(2);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    const path = (await download.path())!;
    const bytes = readFileSync(path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(previewHash);
    const png = PNG.sync.read(bytes);
    const center = (Math.floor(y + h / 2) * png.width + Math.floor(x + w / 2)) * 4;
    expect([...png.data.subarray(center, center + 4)]).toEqual([0, 0, 0, 255]);
    expect(inspectBytes(new Uint8Array(bytes)).hasPrivacyMetadata).toBe(false);
    expect(uploads).toEqual([]);
    if (info.project.name === "chromium") copyFileSync(path, join(EVIDENCE, "face-redacted.png"));
    const beautifier = page.getByTestId("safe-share-result").getByRole("link", { name: /Beautifier/ });
    await expect(beautifier).toBeVisible();
    await beautifier.click();
    await expect(page).toHaveURL(/\/screenshot-beautifier$/, { timeout: 30_000 });
    await expect(page.getByTestId("file-item").getByRole("button", { name: /^\d+\. safe-copy\.png,/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("open-screenshot-packs").click();
    await expect(page.getByRole("checkbox", { name: "Include safe-copy.png in pack" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Include astronaut-public-domain\.png in pack/ })).toHaveCount(0);
  });

  test("manual plate redaction works without any detector on a mobile viewport", async ({ page, context }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const maker = await context.newPage();
    await maker.setViewportSize({ width: 900, height: 500 });
    await maker.setContent('<style>body{margin:0;background:#90a9b6;display:grid;place-items:center;height:100vh} .car{width:740px;height:270px;background:#29313d;border-radius:100px 100px 30px 30px;display:grid;place-items:end center;padding-bottom:22px;box-sizing:border-box}.plate{background:#f6f4e9;color:#111;border:7px solid #111;border-radius:9px;padding:8px 35px;font:bold 48px Arial}</style><div class="car"><div class="plate">MH12AB1234</div></div>');
    const source = info.outputPath("plate-synthetic.png");
    await maker.screenshot({ path: source }); await maker.close();
    await open(page, source);
    const stage = page.getByLabel(/Screenshot redaction canvas/);
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.27, box.y + box.height * 0.53);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.74, box.y + box.height * 0.84, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("redaction-region")).toHaveCount(1);
    const manual = page.getByTestId("redaction-region");
    const rect = {
      x: Number(await manual.getAttribute("data-source-x")), y: Number(await manual.getAttribute("data-source-y")),
      width: Number(await manual.getAttribute("data-source-width")), height: Number(await manual.getAttribute("data-source-height")),
    };
    const sourceImage = PNG.sync.read(readFileSync(source));
    const targetX = Math.floor(sourceImage.width * 0.5), targetY = Math.floor(sourceImage.height * 0.6);
    expect(rect.x).toBeLessThan(targetX);
    expect(rect.x + rect.width).toBeGreaterThan(targetX);
    expect(rect.y).toBeLessThan(targetY);
    expect(rect.y + rect.height).toBeGreaterThan(targetY);
    await clearToasts(page);
    await expect(page.getByText("1 screenshot added to workspace")).toBeHidden({ timeout: 10_000 });
    await save(page, info, "03-mobile-plate-edit.png");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByLabel("Final sanitized image")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("checkbox", { name: /I inspected the final image/ }).check();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("safe-share-result").getByRole("button", { name: "Download reviewed copy" }).click()]);
    const bytes = readFileSync((await download.path())!);
    const png = PNG.sync.read(bytes);
    const index = (targetY * png.width + targetX) * 4;
    expect([...png.data.subarray(index, index + 4)]).toEqual([0, 0, 0, 255]);
    if (info.project.name === "chromium") copyFileSync((await download.path())!, join(EVIDENCE, "plate-redacted.png"));
  });

  test("EXIF-oriented photo keeps editable regions aligned with exported pixels", async ({ page }) => {
    const raw = parseImageSize(readFileSync(ORIENTED));
    expect(raw).toMatchObject({ width: 240, height: 160 });
    await open(page, ORIENTED);
    await expect(page.getByTestId("file-item").first().getByRole("button", { name: /orientation-6\.jpg, 160 by 240 pixels/ })).toBeVisible();
    const stage = page.getByLabel(/Screenshot redaction canvas/);
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("redaction-region")).toHaveCount(1);
    await page.getByRole("button", { name: "Prepare Safe Copy" }).click();
    await expect(page.getByLabel("Final sanitized image")).toBeVisible();
    await page.getByRole("checkbox", { name: /I inspected the final image/ }).check();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    const output = PNG.sync.read(readFileSync((await download.path())!));
    expect([output.width, output.height]).toEqual([160, 240]);
    expect([...output.data.subarray((120 * output.width + 80) * 4, (120 * output.width + 80) * 4 + 4)]).toEqual([0, 0, 0, 255]);
  });
});
