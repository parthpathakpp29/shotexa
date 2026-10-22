import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";

const CAPTURE = !!process.env.CAPTURE_V2E;
const SHOTS = join(process.cwd(), "docs/v2-background-removal/screenshots");

function subject(name = "subject.png", width = 420, height = 320) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const inside = x > width * .24 && x < width * .76 && y > height * .16 && y < height * .88;
    const circle = ((x - width * .5) ** 2) / (width * .22) ** 2 + ((y - height * .3) ** 2) / (height * .22) ** 2 < 1;
    const color = inside || circle ? [30, 59, 116, 255] : [244, 240, 232, 255];
    png.data.set(color, index);
  }
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

function replacementBackground() {
  const width = 260, height = 180, png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4; const stripe = Math.floor(x / 32) % 2 === 0;
    png.data.set(stripe ? [244, 179, 94, 255] : [111, 78, 171, 255], index);
  }
  return { name: "background.png", mimeType: "image/png", buffer: PNG.sync.write(png) };
}

async function capture(page: Page, name: string) { if (!CAPTURE || test.info().project.name !== "chromium") return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, name), fullPage: false }); }
async function open(page: Page, file = subject()) {
  await page.goto("/remove-background"); await page.getByTestId("file-input").setInputFiles(file); await expect(page.getByTestId("background-removal-workspace")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.getByTestId("background-removal-canvas").evaluate((canvas) => { const node = canvas as HTMLCanvasElement; const pixel = node.getContext("2d")?.getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data; return !!pixel && pixel[2] - pixel[0] > 20; })).toBe(true);
}
async function remove(page: Page) { await page.getByRole("button", { name: "Remove background", exact: true }).click(); await expect(page.getByText("Mask ready", { exact: true }).first()).toBeVisible({ timeout: 180_000 }); }

test.describe.configure({ timeout: 300_000, mode: "serial" });

test.describe("Shotexa V2.0E Background Remover", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("homepage does not load the model, ONNX runtime or removal worker", async ({ page }) => {
    const requests: string[] = []; page.on("request", (request) => requests.push(request.url()));
    await page.goto("/", { waitUntil: "networkidle" });
    expect(requests.filter((url) => /u2net|onnxruntime|background\.worker|ort-wasm/i.test(url))).toEqual([]);
  });

  test("local removal → transparent preview → brush refinement → PNG export", async ({ page }) => {
    const posted: string[] = []; page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method()) && request.postDataBuffer()?.length) posted.push(request.url()); });
    await open(page); await capture(page, "00-original.png"); await remove(page);
    const diagnostics = page.getByTestId("background-removal-diagnostics");
    const firstLoadMs = Number(await diagnostics.getAttribute("data-model-load-ms")); const firstInferenceMs = Number(await diagnostics.getAttribute("data-inference-ms"));
    expect(firstLoadMs).toBeGreaterThan(0); expect(firstInferenceMs).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Run again", exact: true }).click(); await expect(diagnostics).toHaveAttribute("data-session-reused", "true", { timeout: 180_000 });
    const subsequentInferenceMs = Number(await diagnostics.getAttribute("data-inference-ms")); expect(subsequentInferenceMs).toBeGreaterThan(0);
    console.log(`background remover timings: first model load ${firstLoadMs}ms, first inference ${firstInferenceMs}ms, cached-session inference ${subsequentInferenceMs}ms`);
    await page.getByRole("button", { name: "Mask", exact: true }).click(); await capture(page, "01-mask-view.png");
    await page.getByRole("button", { name: "Removed", exact: true }).click();
    const canvas = page.getByTestId("background-removal-canvas"); const box = (await canvas.boundingBox())!;
    await page.getByRole("button", { name: "Erase", exact: true }).click(); await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2); await page.mouse.down(); await page.mouse.move(box.x + box.width * .3, box.y + box.height * .25, { steps: 5 }); await page.mouse.up();
    await page.getByRole("button", { name: "Undo mask stroke" }).click(); await page.getByRole("button", { name: "Redo mask stroke" }).click();
    await capture(page, "02-refined-transparent.png");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    const output = PNG.sync.read(readFileSync((await download.path())!));
    let minAlpha = 255, maxAlpha = 0;
    for (let index = 3; index < output.data.length; index += 4) { minAlpha = Math.min(minAlpha, output.data[index]); maxAlpha = Math.max(maxAlpha, output.data[index]); }
    expect(minAlpha).toBeLessThan(255); expect(maxAlpha).toBeGreaterThan(0); expect(posted).toEqual([]);
    await expect(page.getByTestId("background-removal-result")).toBeVisible();
    await capture(page, "05-export-complete.png");
    const handoffStarted = Date.now();
    await page.getByRole("link", { name: /Open Beautifier/ }).click();
    // Cold route loading after two model runs can exceed the default 5 s on WebKit.
    // Keep the URL and retained-workspace assertions; record latency for diagnosis.
    await expect(page).toHaveURL(/screenshot-beautifier/, { timeout: 60_000 });
    await expect(page.getByTestId("beautify-workspace")).toBeVisible({ timeout: 60_000 });
    console.log(`background remover handoff: ${Date.now() - handoffStarted}ms`);
    await capture(page, "06-beautifier-handoff.png");
  });

  test("gradient and custom-image replacement produce explicit JPEG output", async ({ page }) => {
    await open(page); await remove(page);
    await page.getByRole("button", { name: "Gradient", exact: true }).click(); await page.getByRole("button", { name: "JPEG", exact: true }).click();
    await capture(page, "03-gradient-replacement.png");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    expect(download.suggestedFilename()).toMatch(/\.jpg$/); const bytes = readFileSync((await download.path())!); expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    const inspector = page.getByTestId("background-removal-inspector").filter({ visible: true }); await inspector.getByRole("button", { name: "Image", exact: true }).click(); await inspector.locator('input[type="file"]').setInputFiles(replacementBackground()); await capture(page, "04-custom-background.png");
    const [customDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]); expect(readFileSync((await customDownload.path())!).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  test("custom Workflow and Batch expose the shared background-removal action", async ({ page }) => {
    await page.goto("/workflows"); await page.getByRole("button", { name: /^Custom workflow/ }).click(); await page.getByLabel("Workflow name").fill("Cutout workflow");
    await page.getByLabel("Workflow action").selectOption("remove-background"); await page.getByRole("button", { name: "Add step" }).click(); await expect(page.getByTestId("custom-step").filter({ hasText: "Remove Background" })).toBeVisible();
    await page.goto("/batch-screenshots"); await page.getByTestId("file-input").setInputFiles([subject("one.png", 180, 140), subject("two.png", 160, 180)]); await page.getByRole("radiogroup", { name: "Batch operation" }).getByRole("radio", { name: "Remove background", exact: true }).click();
    await page.getByTestId("export").click(); await expect(page.getByTestId("batch-results")).toContainText("2 files ready", { timeout: 240_000 });
    const [zip] = await Promise.all([page.waitForEvent("download"), page.getByTestId("batch-results").getByRole("button", { name: "Download ZIP" }).click()]);
    expect(Object.keys(unzipSync(readFileSync((await zip.path())!)))).toEqual(["background-removed-one.png", "background-removed-two.png"]);
  });

  test("model load failure is explained and retry remains available", async ({ page }) => {
    await page.route("**/u2netp.onnx", (route) => route.abort()); await open(page);
    await page.getByRole("button", { name: "Remove background", exact: true }).click();
    await expect(page.getByText("Could not finish", { exact: true }).first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("button", { name: "Remove background", exact: true })).toBeEnabled();
  });
});

test.describe("Shotexa V2.0E mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px exposes removal, brush, edges, backgrounds and export without overflow", async ({ page }) => {
    await open(page); await page.getByTestId("mobile-inspector-trigger").click(); const sheet = page.getByRole("dialog", { name: "Background removal settings" });
    await sheet.getByRole("button", { name: "Remove background", exact: true }).click(); await expect(sheet.getByText(/Mask ready\. Review/)).toBeVisible({ timeout: 180_000 });
    for (const name of ["Restore", "Erase", "Transparent", "Gradient", "PNG", "WebP", "JPEG"]) await expect(sheet.getByRole("button", { name, exact: true })).toBeVisible();
    for (const name of ["Brush size", "Feather", "Scale"]) await expect(sheet.getByRole("slider", { name })).toBeVisible();
    await expect(sheet.getByRole("combobox", { name: "Edge preset" })).toHaveValue("natural");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, "04-mobile-settings.png");
    for (const viewport of [{ width: 320, height: 700 }, { width: 360, height: 800 }, { width: 414, height: 896 }]) { await page.setViewportSize(viewport); await expect(sheet.getByRole("button", { name: "Export image" })).toBeVisible(); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  });
});
