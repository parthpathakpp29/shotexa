/**
 * Phase 2G Screenshot Editor — production routes, real Image Worker export.
 *
 * Orientation is verified from exported PIXELS, not just sizes: a 120×80 test image has four
 * coloured quadrants, so every crop, rotation, flip and resize has a hand-computed expected
 * colour layout (red top-left, green top-right, blue bottom-left, yellow bottom-right).
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

type RGB = [number, number, number];
const RED: RGB = [220, 40, 40];
const GREEN: RGB = [40, 170, 70];
const BLUE: RGB = [40, 80, 200];
const YELLOW: RGB = [230, 200, 40];
const BLACK: RGB = [0, 0, 0];

const capture = !!process.env.CAPTURE_PHASE2G;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2g/screenshots");

/** Default 120×80: red TL, green TR, blue BL, yellow BR — four equal quadrants. */
function quadrants(name = "quad.png", width = 120, height = 80) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = y < height / 2 ? (x < width / 2 ? RED : GREEN) : x < width / 2 ? BLUE : YELLOW;
      png.data.set([...c, 255], (y * width + x) * 4);
    }
  }
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

function solid(name: string, width: number, height: number, c: RGB) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...c, 255], i);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

function colourAt(png: PNG, x: number, y: number): RGB {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

/** Assert quadrant colours at named points; sampling away from edges tolerates smoothing. */
function expectColours(png: PNG, samples: [number, number, RGB][]) {
  for (const [x, y, want] of samples) {
    const got = colourAt(png, x, y);
    const distance = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
    expect(distance, `pixel (${x}, ${y}) is rgb(${got}) — expected rgb(${want})`).toBeLessThanOrEqual(24);
  }
}

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: false });
}

async function openEditor(page: Page, files: Parameters<Page["setInputFiles"]>[1] = quadrants()) {
  await page.goto("/screenshot-editor");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 30_000 });
}

/** Typed values commit on Enter — one undoable edit per field. */
async function setField(page: Page, testId: string, value: number) {
  const field = page.getByTestId(testId);
  await field.fill(String(value));
  await field.press("Enter");
}

async function exportEdited(page: Page, trigger = page.getByTestId("export")): Promise<PNG> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), trigger.click()]);
  await expect(page.getByTestId("editor-result")).toBeVisible({ timeout: 120_000 });
  expect(download.suggestedFilename()).toMatch(/^edited-.+\.png$/);
  return PNG.sync.read(readFileSync((await download.path())!));
}

const outputSize = (page: Page) => page.getByTestId("editor-output-size");

test.describe.configure({ timeout: 180_000 });

test.describe("Phase 2G Screenshot Editor", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test.beforeEach(({ browserName }) => {
    // Same host limitation as Phases 2D/2E: this machine's Playwright Firefox fails to create a
    // page before app code loads. Chromium and WebKit (main-thread fallback) cover the flows.
    test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  });

  test("upload → crop → export, locally and without console errors", async ({ page }) => {
    const outbound: string[] = [];
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!["GET", "HEAD"].includes(r.method()) && (r.postDataBuffer()?.length ?? 0) > 0) outbound.push(r.url());
    });
    await openEditor(page);
    await expect(page.getByTestId("export")).toBeDisabled(); // nothing to export yet
    await shot(page, "01-editor-crop.png");

    // A real pointer drag on the corner handle shrinks the crop inside the image.
    const handle = page.getByTestId("crop-handle-se");
    const box = (await handle.boundingBox())!;
    const stage = (await page.getByTestId("editor-stage").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2, { steps: 10 });
    await page.mouse.up();
    const crop = page.getByTestId("editor-crop");
    await expect(crop).toHaveAttribute("data-width", /^(5[6-9]|6[0-4])$/); // ≈ half of 120
    await expect(crop).toHaveAttribute("data-x", "0");

    // Exact framing: straddle the red/green boundary so position is verifiable.
    await setField(page, "crop-x", 30);
    await setField(page, "crop-y", 0);
    await setField(page, "crop-width", 60);
    await setField(page, "crop-height", 40);
    await expect(outputSize(page)).toHaveText("60 × 40 px");

    const png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([60, 40]);
    expectColours(png, [
      [10, 20, RED],
      [50, 20, GREEN],
    ]);
    // Non-destructive: the source is still in the workspace, unchanged.
    await expect(page.getByTestId("file-item")).toHaveCount(2);
    await expect(page.getByTestId("file-item").first()).toContainText("quad.png");
    await expect(page.getByTestId("file-item").first()).toContainText("120 × 80");
    await expect(page.getByTestId("file-item").last()).toContainText("60 × 40");
    await shot(page, "02-editor-result.png");
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("resize with a locked aspect ratio → export", async ({ page }) => {
    await openEditor(page);
    await setField(page, "resize-width", 60);
    await expect(page.getByTestId("resize-height")).toHaveValue("40"); // followed the lock
    await expect(outputSize(page)).toHaveText("60 × 40 px");
    const png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([60, 40]);
    expectColours(png, [
      [15, 10, RED],
      [45, 10, GREEN],
      [15, 30, BLUE],
      [45, 30, YELLOW],
    ]);
  });

  test("resize unlocked changes one side only", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Aspect ratio locked" }).click();
    await setField(page, "resize-width", 240);
    await expect(outputSize(page)).toHaveText("240 × 80 px");
    await expect(page.getByText("will look stretched")).toBeVisible();
    await expect(page.getByText("Enlarging adds pixels but not detail")).toBeVisible();
  });

  test("rotate right swaps dimensions and turns the picture clockwise", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Rotate right" }).click();
    await expect(outputSize(page)).toHaveText("80 × 120 px");
    await expect(page.getByTestId("orientation-status")).toHaveText("Rotated 90° right");
    await page.getByRole("radio", { name: "Result" }).click();
    await expect(page.getByTestId("editor-stage")).toHaveAttribute("data-view", "result");
    await shot(page, "03-editor-rotated-result.png");
    const png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([80, 120]);
    // Clockwise: bottom-left comes to the top-left, top-left goes to the top-right.
    expectColours(png, [
      [20, 30, BLUE],
      [60, 30, RED],
      [20, 90, YELLOW],
      [60, 90, GREEN],
    ]);
  });

  test("flip horizontal and vertical mirror the exported pixels", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Flip horizontal" }).click();
    let png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([120, 80]);
    expectColours(png, [
      [30, 20, GREEN],
      [90, 20, RED],
      [30, 60, YELLOW],
      [90, 60, BLUE],
    ]);

    // Edit the original again: select it, undo the flip, flip vertically instead.
    await page.getByTestId("file-item").first().locator("button").first().click();
    await page.getByRole("button", { name: "Reset all edits" }).click();
    await page.getByRole("button", { name: "Flip vertical" }).click();
    await expect(page.getByTestId("orientation-status")).toHaveText("Flipped vertically");
    png = await exportEdited(page);
    expectColours(png, [
      [30, 20, BLUE],
      [90, 20, YELLOW],
      [30, 60, RED],
      [90, 60, GREEN],
    ]);
  });

  test("crop + rotate + resize combine in a fixed order", async ({ page }) => {
    await openEditor(page);
    // Right half: green over yellow, 60×80.
    await setField(page, "crop-x", 60);
    await setField(page, "crop-width", 60);
    await expect(outputSize(page)).toHaveText("60 × 80 px");
    await page.getByRole("button", { name: "Rotate right" }).click();
    await expect(outputSize(page)).toHaveText("80 × 60 px");
    await setField(page, "resize-width", 40);
    await expect(outputSize(page)).toHaveText("40 × 30 px");
    const png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([40, 30]);
    // Clockwise turn of (green over yellow) puts yellow on the left, green on the right.
    expectColours(png, [
      [10, 15, YELLOW],
      [30, 15, GREEN],
    ]);
  });

  test("undo and redo step through several transforms", async ({ page }) => {
    await openEditor(page);
    const undo = page.getByRole("button", { name: "Undo" }).first();
    const redo = page.getByRole("button", { name: "Redo" }).first();
    await page.getByRole("button", { name: "Rotate right" }).click();
    await page.getByRole("button", { name: "Flip horizontal" }).click();
    await setField(page, "resize-width", 40);
    await expect(outputSize(page)).toHaveText("40 × 60 px");

    await undo.click();
    await expect(outputSize(page)).toHaveText("80 × 120 px");
    await expect(page.getByTestId("orientation-status")).toHaveText("Rotated 90° · Mirrored");
    await undo.click();
    await expect(page.getByTestId("orientation-status")).toHaveText("Rotated 90° right");
    await undo.click();
    await expect(outputSize(page)).toHaveText("120 × 80 px");
    await expect(page.getByTestId("export")).toBeDisabled();

    await redo.click();
    await redo.click();
    await redo.click();
    await expect(outputSize(page)).toHaveText("40 × 60 px");
    const png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([40, 60]);
    // Rotate right then mirror: red top-left, blue top-right, green bottom-left, yellow bottom-right.
    expectColours(png, [
      [10, 15, RED],
      [30, 15, BLUE],
      [10, 45, GREEN],
      [30, 45, YELLOW],
    ]);
  });

  test("Smart Stitch result → Editor without re-upload", async ({ page }) => {
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([join(FIXTURE_DIR, "chat-light/a.png"), join(FIXTURE_DIR, "chat-light/b.png")]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("stitch-result")).toBeVisible({ timeout: 120_000 });

    await page.getByTestId("stitch-result").getByRole("link", { name: /Edit/ }).click();
    await expect(page).toHaveURL(/\/screenshot-editor$/, { timeout: 60_000 });
    await expect(page.getByTestId("editor-stage")).toBeVisible();
    await expect(page.getByTestId("file-item")).toHaveCount(3); // 2 originals + stitched result
    await expect(outputSize(page)).toHaveText("1170 × 3792 px");

    await setField(page, "crop-height", 1000);
    const png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([1170, 1000]);
    await expect(page.getByTestId("editor-result")).toContainText("edited-stitched-screenshot.png");
    await expect(page.getByTestId("file-item")).toHaveCount(4);
  });

  test("Combine result → Editor without re-upload", async ({ page }) => {
    await page.goto("/combine-screenshots");
    await page.getByTestId("file-input").setInputFiles([solid("red.png", 120, 60, RED), solid("blue.png", 80, 100, BLUE)]);
    await expect(page.getByTestId("combine-preview")).toBeVisible({ timeout: 30_000 });
    await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("combine-result")).toBeVisible({ timeout: 120_000 });

    await page.getByTestId("combine-result").getByRole("link", { name: /Edit/ }).click();
    await expect(page).toHaveURL(/\/screenshot-editor$/, { timeout: 60_000 });
    await expect(outputSize(page)).toHaveText("120 × 176 px"); // 60 + 16 gap + 100
    await page.getByRole("button", { name: "Rotate right" }).click();
    const png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([176, 120]);
    // Clockwise: the top (red) band moves to the right, the bottom (blue) band to the left.
    expectColours(png, [
      [150, 60, RED],
      [56, 60, BLUE],
    ]);
  });

  test("Safe Share result → Editor keeps the redaction", async ({ page }) => {
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(quadrants());
    const canvas = page.getByLabel(/Screenshot redaction canvas/);
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const b = (await canvas.boundingBox())!;
    // Black out a band inside the red quadrant (x 12–48, y 8–24 of 120×80).
    await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.3, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("redaction-region")).toHaveCount(1);
    await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("safe-share-result")).toBeVisible();

    await page.getByTestId("safe-share-result").getByRole("link", { name: /Edit/ }).click();
    await expect(page).toHaveURL(/\/screenshot-editor$/, { timeout: 60_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(2);
    await setField(page, "crop-width", 60);
    await setField(page, "crop-height", 40);
    const png = await exportEdited(page);
    expect([png.width, png.height]).toEqual([60, 40]);
    expectColours(png, [
      [30, 16, BLACK], // the redaction survived the edit
      [5, 35, RED],
    ]);
  });

  test("mobile: large preview, controls in a sheet, sticky export", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Screenshot-sized input: Fit never enlarges past 100%, so a tiny image would stay tiny.
    await openEditor(page, quadrants("phone.png", 600, 400));
    for (const name of ["Files (1)", "Edit settings", "Undo", "Redo"]) {
      const target = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(target.height, name).toBeGreaterThanOrEqual(44);
    }
    const handle = (await page.getByTestId("crop-handle-se").boundingBox())!;
    expect(handle.width).toBeGreaterThanOrEqual(44);
    const stage = (await page.getByTestId("editor-stage").boundingBox())!;
    expect(stage.width).toBeGreaterThan(300); // the preview uses the screen, not a sliver
    await shot(page, "04-editor-mobile.png");

    await page.getByRole("button", { name: "Edit settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit settings" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Rotate right" }).click();
    await expect(sheet.getByTestId("editor-output-size")).toHaveText("400 × 600 px");
    await shot(page, "05-editor-mobile-sheet.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    const png = await exportEdited(page, page.getByRole("button", { name: "Export", exact: true }));
    expect([png.width, png.height]).toEqual([400, 600]);
    expectColours(png, [
      [100, 150, BLUE],
      [300, 150, RED],
    ]);
  });
});
