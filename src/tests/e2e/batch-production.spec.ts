/** Phase 2N Batch + ZIP — real image worker, sequential queue and extracted ZIP validation. */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";

const capture = !!process.env.CAPTURE_PHASE2N;
const SHOTS = join(process.cwd(), "docs/phase-2n/screenshots");
const META = join(process.cwd(), "src/tests/fixtures/metadata");
const STITCH = join(process.cwd(), "src/tests/fixtures/stitch/chat-light");

function image(name: string, width: number, height: number, rgba: [number, number, number, number]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set(rgba, i);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, name), fullPage: false });
}

function watch(page: Page) {
  const errors: string[] = [];
  const outbound: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method()) && (r.postDataBuffer()?.length ?? 0) > 0) outbound.push(r.url());
  });
  return { errors, outbound };
}

async function open(page: Page, files: Parameters<Page["setInputFiles"]>[1]) {
  await page.goto("/batch-screenshots");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByTestId("batch-file-list")).toBeVisible({ timeout: 30_000 });
}

async function processBatch(page: Page) {
  await page.getByTestId("export").click();
  await expect(page.getByTestId("batch-results")).toBeVisible({ timeout: 180_000 });
}

async function downloadZip(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByTestId("batch-results").getByRole("button", { name: "Download ZIP" }).click()]);
  expect(download.suggestedFilename()).toBe("shotexa-batch.zip");
  return unzipSync(readFileSync((await download.path())!));
}

const operation = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Batch operation" }).getByRole("radio", { name, exact: true });
const format = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Output format" }).getByRole("radio", { name, exact: true });

test.describe.configure({ timeout: 240_000 });

test.describe("Phase 2N Batch + ZIP", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test.beforeEach(({ browserName }) => test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host."));

  test("Batch Compress 3 images → one verified ZIP, entirely local", async ({ page }) => {
    const privacy = watch(page);
    await open(page, [image("one.png", 120, 80, [220, 40, 40, 255]), image("two.png", 90, 140, [40, 80, 200, 255]), image("three.png", 64, 64, [40, 170, 70, 255])]);
    await expect(page.getByText("3 selected", { exact: true })).toBeVisible();
    await shot(page, "01-batch-ready.png");
    await processBatch(page);
    await expect(page.getByTestId("batch-results")).toContainText("3 files ready");
    const zip = await downloadZip(page);
    expect(Object.keys(zip)).toEqual(["compressed-one.png", "compressed-two.png", "compressed-three.png"]);
    expect(PNG.sync.read(Buffer.from(zip["compressed-one.png"])).width).toBe(120);
    expect(PNG.sync.read(Buffer.from(zip["compressed-two.png"])).height).toBe(140);
    expect(privacy.outbound).toEqual([]);
    expect(privacy.errors).toEqual([]);
    await shot(page, "02-batch-results.png");
  });

  test("mixed images → WebP, with deterministic duplicate names", async ({ page }) => {
    await open(page, [image("same.png", 80, 60, [1, 2, 3, 255]), image("same.png", 100, 70, [5, 6, 7, 255]), image("other.png", 50, 50, [9, 10, 11, 255])]);
    await operation(page, "Convert").click();
    await format(page, "WebP").click();
    await processBatch(page);
    const zip = await downloadZip(page);
    expect(Object.keys(zip)).toEqual(["same.webp", "same-2.webp", "other.webp"]);
    for (const bytes of Object.values(zip)) {
      expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("RIFF");
      expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe("WEBP");
    }
  });

  test("filename affixes, aggregate savings and result filters stay consistent", async ({ page }) => {
    await open(page, [image("one.png", 120, 80, [220, 40, 40, 255]), image("two.png", 90, 140, [40, 80, 200, 255])]);
    await page.getByTestId("batch-filename-prefix").fill("client:");
    await page.getByTestId("batch-filename-suffix").fill("-ready?");
    await processBatch(page);
    await expect(page.getByTestId("batch-summary")).toContainText("Original total");
    await expect(page.getByTestId("batch-summary")).toContainText("Output total");
    await page.getByRole("radiogroup", { name: "Batch result filter" }).getByRole("radio", { name: "Successful" }).click();
    await expect(page.getByTestId("batch-result-list").locator("li")).toHaveCount(2);
    const zip = await downloadZip(page);
    expect(Object.keys(zip)).toEqual(["client-compressed-one-ready-.png", "client-compressed-two-ready-.png"]);
  });

  test("transparent PNG → JPEG uses the selected cream background", async ({ page }) => {
    await open(page, [image("alpha-a.png", 80, 50, [0, 0, 0, 0]), image("alpha-b.png", 60, 60, [0, 0, 0, 0])]);
    await operation(page, "Convert").click();
    await format(page, "JPEG").click();
    await page.getByRole("button", { name: "Cream" }).click();
    await processBatch(page);
    const zip = await downloadZip(page);
    expect(Object.keys(zip)).toEqual(["alpha-a.jpg", "alpha-b.jpg"]);
    for (const bytes of Object.values(zip)) expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  test("Batch Resize Fit Within preserves each aspect ratio and never enlarges", async ({ page }) => {
    await open(page, [image("wide.png", 400, 200, [220, 40, 40, 255]), image("tall.png", 200, 400, [40, 80, 200, 255]), image("small.png", 40, 20, [40, 170, 70, 255])]);
    await operation(page, "Resize").click();
    await page.getByRole("radiogroup", { name: "Resize method" }).getByRole("radio", { name: "Fit" }).click();
    await page.getByLabel("Fit width").fill("100");
    await page.getByLabel("Fit height").fill("100");
    await processBatch(page);
    const zip = await downloadZip(page);
    const wide = PNG.sync.read(Buffer.from(zip["resized-wide.png"]));
    const tall = PNG.sync.read(Buffer.from(zip["resized-tall.png"]));
    const small = PNG.sync.read(Buffer.from(zip["resized-small.png"]));
    expect([wide.width, wide.height]).toEqual([100, 50]);
    expect([tall.width, tall.height]).toEqual([50, 100]);
    expect([small.width, small.height]).toEqual([40, 20]);
  });

  test("Batch Privacy Clean verifies outputs and preserves a metadata-free file", async ({ page }) => {
    await open(page, [join(META, "jpeg/kitchen-sink.jpg"), join(META, "jpeg/clean.jpg")]);
    await operation(page, "Privacy Clean").click();
    await processBatch(page);
    await expect(page.getByTestId("batch-results")).toContainText("no private metadata found; original bytes retained");
    const zip = await downloadZip(page);
    expect(Object.keys(zip)).toEqual(["privacy-clean-kitchen-sink.jpg", "clean.jpg"]);
    expect(zip["privacy-clean-kitchen-sink.jpg"].length).toBeLessThan(readFileSync(join(META, "jpeg/kitchen-sink.jpg")).length);
    expect(Buffer.from(zip["clean.jpg"])).toEqual(readFileSync(join(META, "jpeg/clean.jpg")));
  });

  test("one format-limited image fails, completed outputs survive, then Retry failed uses new settings", async ({ page }) => {
    await open(page, [image("ok-a.png", 60, 60, [1, 2, 3, 255]), image("too-tall.png", 2, 17000, [4, 5, 6, 255]), image("ok-b.png", 50, 50, [7, 8, 9, 255])]);
    await operation(page, "Convert").click();
    await format(page, "WebP").click();
    await processBatch(page);
    await expect(page.getByTestId("batch-results")).toContainText("2 completed · 1 failed");
    await format(page, "PNG").click();
    await page.getByRole("button", { name: "Retry failed" }).click();
    await expect(page.getByTestId("batch-results")).toContainText("3 files ready", { timeout: 180_000 });
    const zip = await downloadZip(page);
    expect(Object.keys(zip)).toEqual(["ok-a.webp", "too-tall.png", "ok-b.webp"]);
  });

  test("Add results is explicit and Continue With keeps the first artifact selected", async ({ page }) => {
    await open(page, [image("one.png", 80, 60, [1, 2, 3, 255]), image("two.png", 90, 70, [4, 5, 6, 255])]);
    await processBatch(page);
    await expect(page.getByTestId("file-item")).toHaveCount(2);
    await page.getByRole("button", { name: "Add results to workspace" }).click();
    await expect(page.getByTestId("file-item")).toHaveCount(4);
    await page.getByTestId("batch-results").getByRole("link", { name: /Open Editor/ }).click();
    await expect(page).toHaveURL(/\/screenshot-editor$/);
    await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("file-item").nth(2)).toContainText("compressed-one.png");
  });

  test("Cancel stops before later files and leaves no half-made output", async ({ page }) => {
    await open(page, [join(STITCH, "a.png"), join(STITCH, "b.png"), join(STITCH, "a.png"), join(STITCH, "b.png")]);
    // Queue the click inside the page before work starts. On WebKit the first file uses the
    // main-thread fallback, so this fires at the explicit between-file yield and proves the
    // second full decode does not begin.
    await page.evaluate(() => {
      const timer = window.setInterval(() => {
        const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "Cancel") as HTMLButtonElement | undefined;
        if (button) { window.clearInterval(timer); button.click(); }
      }, 5);
    });
    await page.getByTestId("export").click();
    await expect(page.getByText("Not processed").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("4 files ready")).toHaveCount(0);
  });

  test("mobile: selection, settings, progress/results and ZIP download remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, [image("one.png", 120, 80, [1, 2, 3, 255]), image("two.png", 90, 140, [4, 5, 6, 255])]);
    for (const name of ["Files (2)", "Batch settings", "Export"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Batch settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Batch settings" });
    await sheet.getByRole("radiogroup", { name: "Batch operation" }).getByRole("radio", { name: "Resize" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByTestId("batch-results")).toBeVisible({ timeout: 180_000 });
    await shot(page, "03-mobile-batch.png");
    expect(Object.keys(await downloadZip(page))).toHaveLength(2);
  });
});

test.describe("Phase 2N lazy loading", () => {
  test.beforeEach(({ browserName }) => test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host."));

  test("homepage does not load Batch or client-zip", async ({ page }) => {
    const scripts: string[] = [];
    page.on("response", async (response) => { if (response.request().resourceType() === "script") scripts.push(await response.text().catch(() => "")); });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    expect(scripts.join("\n")).not.toContain("One Safe Queue");
    expect(scripts.join("\n")).not.toContain("client-zip");
    expect(scripts.join("\n")).not.toContain("ZIP version 4.5");
  });
});
