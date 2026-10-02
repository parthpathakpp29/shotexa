/**
 * Phase 2H Annotation — production route, real pointer input, real Image Worker export.
 *
 * Every flow is verified from exported PIXELS: annotations are drawn on plain or four-colour
 * test images, so each mark has a hand-computed expected location in the flattened output.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [220, 40, 40];
const GREEN: RGB = [40, 170, 70];
const BLUE: RGB = [40, 80, 200];
const YELLOW: RGB = [230, 200, 40];
/** Annotation colours (see src/core/annotation/objects.ts). */
const MARK: RGB = [229, 56, 59];
const INK: RGB = [28, 23, 20];
/** Yellow highlighter (#ffe14d) multiplied over white at 50%. */
const HIGHLIGHT_ON_WHITE: RGB = [255, 240, 166];

const capture = !!process.env.CAPTURE_PHASE2H;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2h/screenshots");

function solid(name: string, width: number, height: number, c: RGB) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...c, 255], i);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

/** Red TL, green TR, blue BL, yellow BR — four equal quadrants. */
function quadrants(name = "quad.png", width = 600, height = 400) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = y < height / 2 ? (x < width / 2 ? RED : GREEN) : x < width / 2 ? BLUE : YELLOW;
      png.data.set([...c, 255], (y * width + x) * 4);
    }
  }
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

const blank = () => solid("page.png", 600, 400, WHITE);

function colourAt(png: PNG, x: number, y: number): RGB {
  const i = (Math.round(y) * png.width + Math.round(x)) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

const near = (got: RGB, want: RGB, tolerance = 28) => Math.max(...got.map((v, i) => Math.abs(v - want[i]))) <= tolerance;

function expectColours(png: PNG, samples: [number, number, RGB][], tolerance = 28) {
  for (const [x, y, want] of samples) {
    const got = colourAt(png, x, y);
    expect(near(got, want, tolerance), `pixel (${x}, ${y}) is rgb(${got}) — expected rgb(${want})`).toBe(true);
  }
}

/** Pixels in a box that are close to a colour — for marks whose exact outline is antialiased. */
function countNear(png: PNG, box: { x: number; y: number; width: number; height: number }, want: RGB, tolerance = 40) {
  let n = 0;
  for (let y = Math.max(0, box.y); y < Math.min(png.height, box.y + box.height); y++) {
    for (let x = Math.max(0, box.x); x < Math.min(png.width, box.x + box.width); x++) if (near(colourAt(png, x, y), want, tolerance)) n++;
  }
  return n;
}

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: false });
}

const stage = (page: Page) => page.getByTestId("annotate-stage");
const count = (page: Page) => page.getByTestId("annotation-count");
const selection = (page: Page) => page.getByTestId("annotation-selection");

async function openAnnotate(page: Page, files: Parameters<Page["setInputFiles"]>[1] = blank()) {
  await page.goto("/annotate-screenshot");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(stage(page)).toBeVisible({ timeout: 30_000 });
}

/** Output-pixel point → page point, through the stage's current on-screen scale. */
async function toPage(page: Page, p: { x: number; y: number }) {
  const el = stage(page);
  const box = (await el.boundingBox())!;
  const outWidth = Number(await el.getAttribute("data-out-width"));
  const s = box.width / outWidth;
  return { x: box.x + p.x * s, y: box.y + p.y * s };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  const a = await toPage(page, from);
  const b = await toPage(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

async function clickAt(page: Page, p: { x: number; y: number }) {
  const a = await toPage(page, p);
  await page.mouse.click(a.x, a.y);
}

async function dragHandle(page: Page, handle: Locator, to: { x: number; y: number }) {
  const box = (await handle.boundingBox())!;
  const b = await toPage(page, to);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

/** A numeric data attribute, within ±1 px (pointer positions are sub-pixel). */
async function expectAttrNear(el: Locator, name: string, want: number) {
  await expect.poll(async () => Math.abs(Number(await el.getAttribute(name)) - want)).toBeLessThanOrEqual(1);
}

async function dblclickAt(page: Page, p: { x: number; y: number }) {
  const a = await toPage(page, p);
  await page.mouse.dblclick(a.x, a.y);
}

const tool = (page: Page, name: string) => page.getByTestId("annotate-tools").getByRole("radio", { name, exact: true });

async function exportAnnotated(page: Page, trigger = page.getByTestId("export")): Promise<PNG> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), trigger.click()]);
  await expect(page.getByTestId("annotate-result")).toBeVisible({ timeout: 120_000 });
  expect(download.suggestedFilename()).toMatch(/^annotated-.+\.png$/);
  return PNG.sync.read(readFileSync((await download.path())!));
}

/** Collects console errors and any request that carries a body (an upload). */
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

test.describe.configure({ timeout: 180_000 });

test.describe("Phase 2H Annotation", () => {
  // 1 device px per CSS px, so the on-screen canvas can be compared with the export 1:1.
  test.use({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  test.beforeEach(({ browserName }) => {
    // Same host limitation as Phases 2D–2G: this machine's Playwright Firefox fails to create a
    // page before app code loads. Chromium and WebKit (main-thread fallback) cover the flows.
    test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  });

  test("arrow → export, source unchanged, no uploads, no console errors", async ({ page }) => {
    const { errors, outbound } = watch(page);
    await openAnnotate(page);
    await expect(page.getByTestId("export")).toBeDisabled(); // nothing to export yet
    await expect(tool(page, "Arrow")).toHaveAttribute("aria-checked", "true"); // the default tool

    await drag(page, { x: 100, y: 300 }, { x: 400, y: 100 });
    await expect(count(page)).toHaveText("1");
    await expect(page.getByTestId("annotation-handle-from")).toBeVisible();
    await expect(page.getByTestId("annotation-handle-to")).toBeVisible();
    await shot(page, "01-annotate-arrow.png");

    const png = await exportAnnotated(page);
    expect([png.width, png.height]).toEqual([600, 400]);
    expectColours(png, [
      [250, 200, MARK], // on the shaft
      [175, 250, MARK],
      [500, 350, WHITE], // away from it
      [100, 100, WHITE],
    ]);
    // The head is wider than the shaft, near the tip.
    expect(countNear(png, { x: 370, y: 100, width: 30, height: 30 }, MARK)).toBeGreaterThan(80);

    // Non-destructive: the original is still first, unchanged, and still editable.
    await expect(page.getByTestId("file-item")).toHaveCount(2);
    await expect(page.getByTestId("file-item").first()).toContainText("page.png");
    await expect(page.getByTestId("file-item").first()).toContainText("600 × 400");
    await expect(page.getByTestId("file-item").last()).toContainText("600 × 400");
    await expect(page.getByTestId("annotate-result")).toContainText("annotated-page.png");
    // The result is now selected and starts with no annotations of its own.
    await expect(count(page)).toHaveText("0");
    await page.getByTestId("file-item").first().locator("button").first().click();
    await expect(count(page)).toHaveText("1");
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("rectangle and highlight, including a one-event fast drag", async ({ page }) => {
    await openAnnotate(page);
    await tool(page, "Rectangle").click();
    await drag(page, { x: 50, y: 50 }, { x: 250, y: 150 });
    await expect(selection(page)).toBeVisible();

    await tool(page, "Highlight").click();
    // A single move event, straight to the end: the commit must use the latest pointer value.
    await drag(page, { x: 300, y: 200 }, { x: 500, y: 300 }, 1);
    await expect(count(page)).toHaveText("2");
    await expect(page.getByTestId("annotation-properties")).toHaveAttribute("data-type", "highlight");
    await expect(selection(page)).toHaveAttribute("data-width", /^(199|200|201)$/);
    await expect(selection(page)).toHaveAttribute("data-height", /^(99|100|101)$/);

    const png = await exportAnnotated(page);
    expectColours(png, [
      [150, 50, MARK], // top edge of the box (auto stroke 3 px on a 600×400 image)
      [50, 100, MARK],
      [150, 100, WHITE], // a box is an outline, not a fill
      [400, 250, HIGHLIGHT_ON_WHITE], // translucent multiply, not opaque paint
      [310, 210, HIGHLIGHT_ON_WHITE],
      [490, 290, HIGHLIGHT_ON_WHITE],
      [520, 250, WHITE],
    ]);
  });

  test("text: place, type, move and edit", async ({ page }) => {
    await openAnnotate(page);
    await tool(page, "Text").click();
    await clickAt(page, { x: 60, y: 60 });
    const input = page.getByTestId("annotation-text-input");
    await expect(input).toBeFocused();
    await input.fill("Hello");
    await input.press("Enter");
    await expect(input).toBeHidden();
    await expect(count(page)).toHaveText("1");
    await expect(page.getByTestId("annotation-text-field")).toHaveValue("Hello");

    // Move it with the Select tool: 200 px right, 150 px down.
    await tool(page, "Select").click();
    const x0 = Number(await selection(page).getAttribute("data-x"));
    const y0 = Number(await selection(page).getAttribute("data-y"));
    await drag(page, { x: 75, y: 70 }, { x: 275, y: 220 });
    await expectAttrNear(selection(page), "data-x", x0 + 200);
    await expectAttrNear(selection(page), "data-y", y0 + 150);

    // Edit in place (double-click), then from the inspector.
    await dblclickAt(page, { x: 275, y: 220 });
    await expect(input).toBeFocused();
    await input.fill("Hello world");
    await input.press("Enter");
    await expect(page.getByTestId("annotation-text-field")).toHaveValue("Hello world");
    await shot(page, "02-annotate-text.png");

    const png = await exportAnnotated(page);
    expect(countNear(png, { x: 40, y: 40, width: 150, height: 60 }, MARK)).toBe(0); // gone from the old spot
    expect(countNear(png, { x: x0 + 200, y: y0 + 150, width: 260, height: 40 }, MARK)).toBeGreaterThan(150);
  });

  test("freehand drawing follows the pointer", async ({ page }) => {
    await openAnnotate(page);
    await tool(page, "Draw").click();
    const points = Array.from({ length: 40 }, (_, i) => ({ x: 100 + i * 10, y: 200 + (i % 2 ? 40 : -40) }));
    const first = await toPage(page, points[0]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const p of points.slice(1)) {
      const q = await toPage(page, p);
      await page.mouse.move(q.x, q.y, { steps: 3 });
    }
    await page.mouse.up();
    await expect(count(page)).toHaveText("1");
    await expect(page.getByTestId("annotation-properties")).toHaveAttribute("data-type", "freehand");

    const png = await exportAnnotated(page);
    // Smoothing passes through the midpoints between samples (the samples are control points).
    for (const i of [4, 11, 20, 27, 37]) {
      const p = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
      expect(countNear(png, { x: p.x - 6, y: p.y - 6, width: 12, height: 12 }, MARK), `near (${p.x}, ${p.y})`).toBeGreaterThan(8);
    }
    expectColours(png, [
      [50, 200, WHITE],
      [300, 350, WHITE],
    ]);
  });

  test("numbered steps: 1, 2, 3, predictable after deletion, then renumber", async ({ page }) => {
    await openAnnotate(page);
    await tool(page, "Step").click();
    for (const x of [100, 300, 500]) await clickAt(page, { x, y: 200 });
    await expect(count(page)).toHaveText("3");
    await expect(page.getByTestId("step-number")).toHaveText("3");

    // Delete step 2 with the keyboard; the next marker is max + 1, never a silent reshuffle.
    await tool(page, "Select").click();
    await clickAt(page, { x: 300, y: 200 });
    await expect(page.getByTestId("step-number")).toHaveText("2");
    await page.keyboard.press("Delete");
    await expect(count(page)).toHaveText("2");
    await tool(page, "Step").click();
    await clickAt(page, { x: 300, y: 320 });
    await expect(page.getByTestId("step-number")).toHaveText("4");

    await page.getByRole("button", { name: /Renumber steps 1–3/ }).click();
    await expect(page.getByRole("button", { name: /Renumber steps/ })).toBeHidden();
    await expect(page.getByTestId("step-number")).toHaveText("3"); // the newest is now 3
    await shot(page, "03-annotate-steps.png");

    const png = await exportAnnotated(page);
    for (const [x, y] of [
      [100, 200],
      [500, 200],
      [300, 320],
    ]) {
      expect(countNear(png, { x: x - 16, y: y - 16, width: 32, height: 32 }, MARK), `marker at (${x}, ${y})`).toBeGreaterThan(150);
    }
    expect(countNear(png, { x: 284, y: 184, width: 32, height: 32 }, MARK)).toBe(0); // the deleted one
  });

  test("mixed annotations: the preview and the export draw identical pixels", async ({ page }) => {
    await openAnnotate(page, quadrants());
    await drag(page, { x: 40, y: 40 }, { x: 200, y: 160 });
    await tool(page, "Rectangle").click();
    await drag(page, { x: 330, y: 30 }, { x: 560, y: 150 });
    await tool(page, "Highlight").click();
    await drag(page, { x: 330, y: 240 }, { x: 560, y: 300 });
    await tool(page, "Draw").click();
    await drag(page, { x: 60, y: 330 }, { x: 250, y: 360 });
    await tool(page, "Step").click();
    await clickAt(page, { x: 460, y: 350 });
    await tool(page, "Text").click();
    await clickAt(page, { x: 60, y: 250 });
    await page.getByTestId("annotation-text-input").fill("Shotexa");
    await page.getByTestId("annotation-text-input").press("Enter");
    await expect(count(page)).toHaveText("6");
    await expect(selection(page)).toBeVisible(); // the new text is selected…
    await page.keyboard.press("Escape"); // …and the canvas still has the keyboard
    await expect(selection(page)).toBeHidden();
    await tool(page, "Select").click();
    await shot(page, "04-annotate-mixed.png");

    // The on-screen canvas at 1 device px per output px — same renderer, same numbers.
    const preview = await page.getByTestId("annotate-canvas").evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      return { width: c.width, height: c.height, data: Array.from(d) };
    });
    const png = await exportAnnotated(page);
    expect([preview.width, preview.height]).toEqual([png.width, png.height]);
    let differing = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const d = Math.max(Math.abs(png.data[i] - preview.data[i]), Math.abs(png.data[i + 1] - preview.data[i + 1]), Math.abs(png.data[i + 2] - preview.data[i + 2]));
      if (d > 48) differing++;
    }
    // Only antialiasing may differ; any misplaced mark would differ over thousands of pixels.
    expect(differing / (png.width * png.height)).toBeLessThan(0.002);
  });

  test("select, move, resize and delete, with undo and redo", async ({ page }) => {
    await openAnnotate(page);
    await tool(page, "Rectangle").click();
    await drag(page, { x: 100, y: 100 }, { x: 200, y: 200 });
    await tool(page, "Select").click();
    await expect(selection(page)).toHaveAttribute("data-x", /^(98|99|100)$/);

    // Move: one gesture, one undo step. Grab the body — the edge midpoints are resize handles.
    await drag(page, { x: 150, y: 130 }, { x: 300, y: 130 }, 12);
    await expect(selection(page)).toHaveAttribute("data-x", /^(248|249|250)$/);
    // Resize from the bottom-right handle.
    await dragHandle(page, page.getByTestId("annotation-handle-se"), { x: 450, y: 300 });
    await expect(selection(page)).toHaveAttribute("data-width", /^(199|200|201|202|203)$/);
    // Delete.
    await page.keyboard.press("Delete");
    await expect(count(page)).toHaveText("0");
    await expect(page.getByTestId("export")).toBeDisabled();

    const undo = page.getByRole("button", { name: "Undo" }).first();
    const redo = page.getByRole("button", { name: "Redo" }).first();
    await undo.click();
    await expect(count(page)).toHaveText("1");
    await tool(page, "Select").click();
    await clickAt(page, { x: 250, y: 150 });
    await expect(selection(page)).toHaveAttribute("data-width", /^(199|200|201|202|203)$/);
    await undo.click(); // undo the resize
    await expect(selection(page)).toHaveAttribute("data-width", /^(99|100|101|102|103)$/);
    await undo.click(); // undo the move
    await expect(selection(page)).toHaveAttribute("data-x", /^(98|99|100)$/);
    await redo.click();
    await redo.click();
    await expect(selection(page)).toHaveAttribute("data-width", /^(199|200|201|202|203)$/);

    const png = await exportAnnotated(page);
    expectColours(png, [
      [350, 100, MARK], // top edge of the moved, resized box (250,100)–(450,300)
      [450, 200, MARK],
      [150, 100, WHITE], // nothing left at the original spot
    ]);
  });

  test("Editor result → Annotation without re-upload", async ({ page }) => {
    await page.goto("/screenshot-editor");
    await page.getByTestId("file-input").setInputFiles(quadrants());
    await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Rotate right" }).click();
    await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("editor-result")).toBeVisible({ timeout: 120_000 });

    await page.getByTestId("editor-result").getByRole("link", { name: /Annotate/ }).click();
    await expect(page).toHaveURL(/\/annotate-screenshot$/, { timeout: 60_000 });
    await expect(stage(page)).toHaveAttribute("data-out-width", "400");
    await expect(stage(page)).toHaveAttribute("data-out-height", "600");
    await expect(page.getByTestId("file-item")).toHaveCount(2);

    await tool(page, "Step").click();
    await clickAt(page, { x: 100, y: 150 }); // in the (rotated) blue quadrant
    const png = await exportAnnotated(page);
    expect([png.width, png.height]).toEqual([400, 600]);
    await expect(page.getByTestId("annotate-result")).toContainText("annotated-edited-quad.png");
    expect(countNear(png, { x: 84, y: 134, width: 32, height: 32 }, MARK)).toBeGreaterThan(150);
    expectColours(png, [
      [40, 40, BLUE],
      [300, 150, RED],
    ]);
  });

  test("Combine result → Annotation without re-upload", async ({ page }) => {
    await page.goto("/combine-screenshots");
    await page.getByTestId("file-input").setInputFiles([solid("red.png", 120, 60, RED), solid("blue.png", 80, 100, BLUE)]);
    await expect(page.getByTestId("combine-preview")).toBeVisible({ timeout: 30_000 });
    await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("combine-result")).toBeVisible({ timeout: 120_000 });

    await page.getByTestId("combine-result").getByRole("link", { name: /Annotate/ }).click();
    await expect(page).toHaveURL(/\/annotate-screenshot$/, { timeout: 60_000 });
    await expect(stage(page)).toHaveAttribute("data-out-height", "176"); // 60 + 16 gap + 100
    await tool(page, "Highlight").click();
    await drag(page, { x: 10, y: 10 }, { x: 110, y: 50 });
    const png = await exportAnnotated(page);
    expect([png.width, png.height]).toEqual([120, 176]);
    // Yellow at 50% multiplied over red darkens green/blue channels only a little: still red-ish, not pure red.
    const c = colourAt(png, 60, 30);
    expect(c[0]).toBeGreaterThan(180);
    expect(near(c, RED, 6)).toBe(false);
    expectColours(png, [[60, 5, RED]]);
  });

  test("Smart Stitch result → Annotation without re-upload", async ({ page }) => {
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([join(FIXTURE_DIR, "chat-light/a.png"), join(FIXTURE_DIR, "chat-light/b.png")]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("stitch-result")).toBeVisible({ timeout: 120_000 });

    await page.getByTestId("stitch-result").getByRole("link", { name: /Annotate/ }).click();
    await expect(page).toHaveURL(/\/annotate-screenshot$/, { timeout: 60_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(stage(page)).toHaveAttribute("data-out-width", "1170");
    await expect(stage(page)).toHaveAttribute("data-out-height", "3792");
    await tool(page, "Rectangle").click();
    // Near the top: the fitted 3792 px-tall preview is taller than the viewport.
    await drag(page, { x: 100, y: 300 }, { x: 1000, y: 700 });
    const png = await exportAnnotated(page);
    expect([png.width, png.height]).toEqual([1170, 3792]); // full resolution, not the preview
    // Auto stroke on a 1170 px-wide image is 6 px; the fitted preview is ~6 output px per CSS px,
    // so look for the edges in bands rather than at single pixels.
    expect(countNear(png, { x: 300, y: 285, width: 500, height: 30 }, MARK)).toBeGreaterThan(500 * 4);
    expect(countNear(png, { x: 985, y: 400, width: 30, height: 200 }, MARK)).toBeGreaterThan(200 * 4);
    expect(countNear(png, { x: 300, y: 400, width: 500, height: 200 }, MARK)).toBe(0); // an outline
    await expect(page.getByTestId("annotate-result")).toContainText("annotated-stitched-screenshot.png");
  });

  test("annotations stay on the same content through crop and rotation", async ({ page }) => {
    await openAnnotate(page, quadrants());
    await tool(page, "Step").click();
    // Ink markers, so they stand out on every quadrant colour.
    await page.getByRole("radiogroup", { name: "Annotation colour" }).getByRole("radio", { name: "Ink" }).click();
    await clickAt(page, { x: 450, y: 100 }); // centre of green
    await clickAt(page, { x: 150, y: 300 }); // centre of blue — will be cropped away
    await expect(count(page)).toHaveText("2");

    // To the Editor (tool switcher): keep the right half (green over yellow), turn it right.
    await page.getByRole("button", { name: "Annotate", exact: true }).click();
    await page.getByRole("menuitem", { name: "Editor" }).click();
    await expect(page).toHaveURL(/\/screenshot-editor$/);
    await expect(page.getByTestId("editor-annotation-note")).toContainText("2 annotations");
    for (const [id, v] of [
      ["crop-x", 300],
      ["crop-width", 300],
    ] as const) {
      await page.getByTestId(id).fill(String(v));
      await page.getByTestId(id).press("Enter");
    }
    await page.getByRole("button", { name: "Rotate right" }).click();
    await expect(page.getByTestId("editor-output-size")).toHaveText("400 × 300 px");

    await page.getByTestId("editor-annotation-note").getByRole("link", { name: "Annotate" }).click();
    await expect(page).toHaveURL(/\/annotate-screenshot$/);
    await expect(stage(page)).toHaveAttribute("data-out-width", "400");
    await expect(stage(page)).toHaveAttribute("data-out-height", "300");
    await expect(page.getByTestId("annotate-editor-note")).toBeVisible();
    // A marker added after the rotation, in yellow (now the left half).
    await tool(page, "Step").click();
    await clickAt(page, { x: 100, y: 150 });
    await expect(count(page)).toHaveText("3");
    await shot(page, "05-annotate-after-crop-rotate.png");

    const png = await exportAnnotated(page);
    expect([png.width, png.height]).toEqual([400, 300]);
    expectColours(png, [
      [300, 40, GREEN], // clockwise: green right, yellow left
      [100, 40, YELLOW],
    ]);
    // Green centre (450,100) → crop (150,100) → clockwise in 400×300 → (300,150).
    expect(countNear(png, { x: 284, y: 134, width: 32, height: 32 }, INK)).toBeGreaterThan(150);
    expect(countNear(png, { x: 84, y: 134, width: 32, height: 32 }, INK)).toBeGreaterThan(150);
    // Nothing else is dark: the blue-quadrant marker was cropped away, not moved somewhere else.
    expect(countNear(png, { x: 0, y: 0, width: 400, height: 300 }, INK)).toBeLessThan(2 * 32 * 32);
  });

  test("mobile: large canvas, tools, settings sheet, sticky export", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = watch(page);
    await openAnnotate(page, solid("phone.png", 1170, 2532, WHITE));
    const box = (await stage(page).boundingBox())!;
    expect(box.height).toBeGreaterThan(400); // the canvas uses the screen, not a sliver
    for (const name of ["Select", "Arrow", "Rectangle", "Highlight", "Text", "Draw", "Step"]) {
      const target = (await tool(page, name).boundingBox())!;
      expect(target.height, name).toBeGreaterThanOrEqual(44);
      expect(target.width, name).toBeGreaterThanOrEqual(44);
    }
    for (const name of ["Annotation settings", "Undo", "Redo"]) {
      const target = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(target.height, name).toBeGreaterThanOrEqual(44);
    }

    await tool(page, "Rectangle").click();
    await drag(page, { x: 200, y: 400 }, { x: 900, y: 900 });
    const handle = (await page.getByTestId("annotation-handle-se").boundingBox())!;
    expect(handle.width).toBeGreaterThanOrEqual(44);
    await shot(page, "06-annotate-mobile.png");

    await page.getByRole("button", { name: "Annotation settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Annotation settings" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radio", { name: "Blue" }).click();
    await shot(page, "07-annotate-mobile-sheet.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    const png = await exportAnnotated(page, page.getByRole("button", { name: "Export", exact: true }));
    expect([png.width, png.height]).toEqual([1170, 2532]);
    const blue: RGB = [37, 99, 235];
    // The recoloured box edge at full resolution (the preview is ~4 output px per CSS px).
    expect(countNear(png, { x: 400, y: 385, width: 300, height: 30 }, blue)).toBeGreaterThan(300 * 4);
    expect(countNear(png, { x: 0, y: 0, width: 1170, height: 2532 }, MARK)).toBe(0);
    expectColours(png, [[550, 650, WHITE]]);
    expect(errors).toEqual([]);
  });
});

test("homepage does not load the annotation editor", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  const scripts: string[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") scripts.push(await r.text().catch(() => ""));
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  expect(scripts.length).toBeGreaterThan(0);
  // A string only the annotation canvas contains.
  expect(scripts.filter((s) => s.includes("annotation canvas"))).toEqual([]);
});
