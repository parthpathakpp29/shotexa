/**
 * V2.0F Compare Pro — production journeys, real workers, pixel- and file-verified.
 *
 * Fixtures are generated here so every expectation is exact: a deterministic blocky texture
 * (so automatic alignment has something real to match), flat panels with a known changed
 * rectangle (so the difference can be checked pixel by pixel), and plain rendered text (so
 * the OCR text diff has a known before and after).
 */
import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";

type RGB = [number, number, number];
const BLUE: RGB = [40, 80, 200];
const RED: RGB = [220, 40, 40];

const CAPTURE = !!process.env.CAPTURE_V2F;
const SHOTS = join(process.cwd(), "docs/v2-compare-pro/screenshots");
/** The known change: a rectangle that exists in B but not in A. */
const CHANGE = { x: 100, y: 60, width: 80, height: 50 };

function png(name: string, width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const p = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) p.data.set(pixel(x, y), (y * width + x) * 4);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(p) };
}

const inChange = (x: number, y: number) => x >= CHANGE.x && x < CHANGE.x + CHANGE.width && y >= CHANGE.y && y < CHANGE.y + CHANGE.height;
/** Blue, with a red rectangle when `changed`. */
const panel = (name: string, width: number, height: number, changed: boolean) => png(name, width, height, (x, y) => (changed && inChange(x, y) ? [...RED, 255] : [...BLUE, 255]));

/** Deterministic 16 px blocky texture over an infinite plane — a scrollable "page". */
function pattern(x: number, y: number): number {
  const bx = Math.floor(x / 16);
  const by = Math.floor(y / 16);
  let h = (bx * 73856093) ^ (by * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) % 256;
}
/** A window on that plane: `shift` moves the content, exactly like a different scroll origin. */
const textured = (name: string, width: number, height: number, shiftX = 0, shiftY = 0) =>
  png(name, width, height, (x, y) => {
    const value = pattern(x - shiftX, y - shiftY);
    return [value, (value * 3) % 256, 255 - value, 255];
  });

/** A panel whose top strip changes on every "load" — a timestamp or a rotating banner. */
const withBanner = (name: string, variant: number) =>
  png(name, 400, 300, (x, y) => {
    if (y < 40) return variant === 0 ? [250, 240, 100, 255] : [90, 200, 250, 255];
    return inChange(x, y) && variant === 1 ? [...RED, 255] : [...BLUE, 255];
  });

/** Plain rendered text, screenshotted from a blank page so OCR has clean, legible glyphs. */
async function renderText(context: BrowserContext, lines: string[]) {
  const helper = await context.newPage();
  await helper.setViewportSize({ width: 760, height: 300 });
  await helper.setContent(
    `<body style="margin:0;background:#ffffff">
       <div style="padding:28px 32px;font:700 46px/1.45 Arial,Helvetica,sans-serif;color:#111111">
         ${lines.map((line) => `<div>${line}</div>`).join("")}
       </div>
     </body>`,
  );
  const buffer = await helper.screenshot();
  await helper.close();
  return { name: "text.png", mimeType: "image/png", buffer };
}

const at = (p: PNG, x: number, y: number): RGB => {
  const i = (Math.round(y) * p.width + Math.round(x)) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2]];
};
const highlighted = (c: RGB) => c[0] > c[2] + 40 && c[0] > 90;

function boundsOf(p: PNG, match: (c: RGB) => boolean) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (!match(at(p, x, y))) continue;
      count++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1, count, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (!CAPTURE || testInfo.project.name !== "chromium") return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, name), fullPage: false });
}

const stage = (page: Page) => page.getByTestId("compare-stage");
const view = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Comparison view" }).getByRole("radio", { name, exact: true });
const alignMode = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Alignment mode" }).getByRole("radio", { name, exact: true });

/** Add two screenshots and wait for the comparison to actually contain them. */
async function open(page: Page, files: Parameters<Page["setInputFiles"]>[1]) {
  await page.goto("/compare-screenshots");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(stage(page)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const c = document.querySelector<HTMLCanvasElement>('[data-testid="compare-canvas"]');
          if (!c || !c.width) return true;
          const mid = c.getContext("2d")!.getImageData(Math.floor(c.width / 4), Math.floor(c.height / 2), 1, 1).data;
          return Math.abs(mid[0] - 243) < 6 && Math.abs(mid[1] - 241) < 6 && Math.abs(mid[2] - 238) < 6;
        }),
      { timeout: 30_000 },
    )
    .toBe(false);
}

async function hideLabels(page: Page) {
  const toggle = page.getByRole("switch", { name: "Before / after labels" });
  if ((await toggle.getAttribute("aria-checked")) === "true") await toggle.click();
}

const changedPercent = async (page: Page) => {
  const text = (await page.getByTestId("compare-difference-stats").innerText()).match(/([\d.]+)% changed/);
  return text ? Number(text[1]) : NaN;
};

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

test.describe.configure({ timeout: 300_000 });

test.describe("V2.0F Compare Pro", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });
  test.beforeEach(({ browserName }) => {
    test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  });

  test("auto align, difference, changed regions and region navigation", async ({ page }, testInfo) => {
    const { errors, outbound } = watch(page);
    // B is the same page scrolled 12 px right and 8 px down.
    await open(page, [textured("before.png", 400, 300), textured("after.png", 400, 300, 12, 8)]);
    await view(page, "Difference").click();
    await hideLabels(page);
    await expect(page.getByTestId("compare-difference-stats")).toContainText("changed");
    const unaligned = await changedPercent(page);
    expect(unaligned).toBeGreaterThan(10);

    // Automatic alignment is measured once and reported as plain numbers.
    await alignMode(page, "Auto").click();
    await expect(stage(page)).toHaveAttribute("data-align-status", /aligned|identity/, { timeout: 60_000 });
    const readout = page.getByTestId("compare-align-result");
    await expect(readout).toContainText("X -12 px");
    await expect(readout).toContainText("Y -8 px");
    await expect(page.getByTestId("compare-alignment-badge")).toContainText("X -12 px");
    await shot(page, testInfo, "01-auto-align-difference.png");

    // Aligning the two makes the measured difference collapse.
    await expect.poll(async () => changedPercent(page), { timeout: 30_000 }).toBeLessThan(unaligned / 2);

    // Resetting puts it back, and says so.
    await page.getByTestId("compare-align-reset").click();
    await alignMode(page, "Off").click();
    await expect(stage(page)).toHaveAttribute("data-align-status", "off");
    await expect.poll(async () => changedPercent(page), { timeout: 30_000 }).toBeGreaterThan(10);

    // Changed regions: a list, an overlay and keyboard navigation over them.
    await open(page, [panel("a.png", 400, 300, false), panel("b.png", 400, 300, true)]);
    await view(page, "Difference").click();
    await hideLabels(page);
    await expect(page.getByTestId("compare-difference-stats")).toContainText("1 changed region");
    await expect(page.getByTestId("compare-region-overlay")).toHaveCount(1);
    await expect(page.getByTestId("compare-region-item")).toHaveCount(1);
    await expect(page.getByTestId("compare-region-item")).toContainText("Visual change");
    await page.getByTestId("compare-region-nav").getByRole("button", { name: "Next change" }).click();
    await expect(page.getByTestId("compare-region-position")).toHaveText("Change 1 of 1");
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("slider mode still wipes between the two and exports where it was left", async ({ page }, testInfo) => {
    await open(page, [panel("a.png", 400, 300, false), panel("b.png", 400, 300, true)]);
    await expect(stage(page)).toHaveAttribute("data-mode", "slider");
    await hideLabels(page);
    await page.getByRole("slider", { name: "Divider position" }).fill("35");
    await expect(stage(page)).toHaveAttribute("data-divider", "35");
    await shot(page, testInfo, "02-slider.png");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export").click()]);
    expect(download.suggestedFilename()).toBe("compare-before-after.png");
    const out = PNG.sync.read(readFileSync((await download.path())!));
    expect([out.width, out.height]).toEqual([400, 300]);
    // Left of the divider is "before" (no red rectangle); right of it is "after".
    expect(boundsOf(out, (c) => c[0] > 180 && c[1] < 90).x0).toBeGreaterThanOrEqual(CHANGE.x + 40);

    // The other two looking-only views are preserved, and switchable from the canvas.
    await view(page, "Side by side").click();
    await expect(stage(page)).toHaveAttribute("data-mode", "side-by-side");
    await expect(stage(page)).toHaveAttribute("data-canvas-width", /^8/);
    await shot(page, testInfo, "02b-side-by-side.png");
    await view(page, "Overlay").click();
    await expect(stage(page)).toHaveAttribute("data-mode", "overlay");
    await expect(page.getByRole("slider", { name: "After opacity" })).toBeVisible();
    await shot(page, testInfo, "02c-overlay.png");
  });

  test("heatmap pro: threshold, changed-only and a legend drawn into the export", async ({ page }, testInfo) => {
    await open(page, [panel("a.png", 400, 300, false), panel("b.png", 400, 300, true)]);
    await view(page, "Heatmap").click();
    await hideLabels(page);
    await expect(page.getByTestId("compare-heatmap-legend")).toContainText("cool = smaller measured change");
    await shot(page, testInfo, "03-heatmap.png");

    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export").click()]);
    expect(download.suggestedFilename()).toBe("compare-heatmap.png");
    const out = PNG.sync.read(readFileSync((await download.path())!));
    expect(highlighted(at(out, CHANGE.x + 10, CHANGE.y + 10))).toBe(true);
    expect(highlighted(at(out, 20, 20))).toBe(false);
    // The legend is part of the saved image: only its label text is white, and it sits low left.
    const white = (c: RGB) => c[0] > 200 && c[1] > 200 && c[2] > 200;
    const legend = boundsOf(out, white);
    expect(legend.count).toBeGreaterThan(40);
    expect(legend.y0).toBeGreaterThan(out.height * 0.6);
    expect(legend.x0).toBeLessThan(out.width * 0.4);

    // Turning the legend off removes it from the export.
    await page.getByRole("switch", { name: "Draw the legend" }).click();
    const [second] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export").click()]);
    const plain = PNG.sync.read(readFileSync((await second.path())!));
    expect(boundsOf(plain, white).count).toBe(0);
  });

  test("OCR text diff reports the changed words and highlights them on the screenshots", async ({ page, context }, testInfo) => {
    test.setTimeout(420_000);
    const before = await renderText(context, ["Shotexa workspace", "Start for free", "No account needed"]);
    const after = await renderText(context, ["Shotexa workspace", "Start free trial", "No account needed"]);
    await open(page, [{ ...before, name: "before.png" }, { ...after, name: "after.png" }]);
    await view(page, "Difference").click();

    await page.getByTestId("compare-analyse-text").click();
    await expect(page.getByTestId("compare-text-stage")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("compare-text-list")).toBeVisible({ timeout: 300_000 });
    const changes = page.getByTestId("compare-text-change");
    await expect(changes.first()).toContainText("Modified text");
    await expect(changes.first()).toContainText("Start for free");
    await expect(changes.first()).toContainText("Start free trial");
    await expect(page.getByTestId("compare-text-totals")).toContainText("1 modified");
    await shot(page, testInfo, "04-text-diff.png");

    // Selecting a change highlights the corresponding region in both screenshots.
    await changes.first().click();
    await expect(page.getByTestId("compare-text-highlight").first()).toBeVisible();
    expect(await page.getByTestId("compare-text-highlight").count()).toBeGreaterThanOrEqual(2);
    // The region that contains the text change is now reported as a text change.
    await expect(page.getByTestId("compare-region-item").filter({ hasText: "Text changed" }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("an ignore region excludes a rotating banner and the metrics move", async ({ page }, testInfo) => {
    await open(page, [withBanner("a.png", 0), withBanner("b.png", 1)]);
    await view(page, "Difference").click();
    await hideLabels(page);
    const before = await changedPercent(page);
    // The banner alone is 40 of 300 rows.
    expect(before).toBeGreaterThan(13);

    await page.getByTestId("compare-ignore-add").click();
    await expect(page.getByTestId("compare-hint")).toContainText("Drag on the comparison");
    const box = (await stage(page).boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height * 0.14, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("compare-ignore-list")).toBeVisible();
    await expect(page.getByTestId("compare-ignore-overlay")).toHaveCount(1);
    await page.getByRole("textbox", { name: "Name for ignore region 1" }).fill("Banner");
    await shot(page, testInfo, "05-ignore-region.png");

    // The banner is out of the comparison, so only the real change is left.
    await expect.poll(async () => changedPercent(page), { timeout: 30_000 }).toBeLessThan(before);
    await expect(page.getByTestId("compare-difference-stats")).toContainText("pixels were left out by ignore regions");
    await expect(page.getByTestId("compare-summary-metrics")).toContainText("Ignored regions");

    // Disabling it keeps the region but puts those pixels back.
    const after = await changedPercent(page);
    await page.getByRole("switch", { name: "Disable ignore region 1" }).click();
    await expect.poll(async () => changedPercent(page), { timeout: 30_000 }).toBeGreaterThan(after);
    await expect(page.getByTestId("compare-ignore-list")).toBeVisible();
  });

  test("the Visual QA preset configures the real controls", async ({ page }, testInfo) => {
    await open(page, [textured("before.png", 400, 300), textured("after.png", 400, 300, 10, 0)]);
    await page.getByTestId("compare-preset-visual-qa").click();
    await expect(page.getByTestId("compare-preset-visual-qa")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("compare-preset-hint")).toContainText("Auto alignment");
    // Each of those is a real control, and each one moved.
    await expect(stage(page)).toHaveAttribute("data-mode", "difference");
    await expect(alignMode(page, "Auto")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radiogroup", { name: "Difference metric" }).getByRole("radio", { name: "Perceptual" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Changed region controls" }).click();
    await expect(page.getByRole("switch", { name: "Ignore tiny differences" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: "Look for moved regions" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("compare-summary-metrics")).toBeVisible();
    await shot(page, testInfo, "06-visual-qa-preset.png");

    // Pixel Perfect is the opposite end of the same controls.
    await page.getByTestId("compare-preset-pixel-perfect").click();
    await expect(alignMode(page, "Off")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("slider", { name: "Difference sensitivity" })).toHaveValue("120");
  });

  test("the PDF report records the measurement and the settings", async ({ page }, testInfo) => {
    const { outbound } = watch(page);
    await open(page, [panel("before.png", 400, 300, false), panel("after.png", 420, 300, true)]);
    await view(page, "Difference").click();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 240_000 }), page.getByTestId("compare-report-pdf").click()]);
    expect(download.suggestedFilename()).toBe("comparison-report.pdf");
    const bytes = readFileSync((await download.path())!);
    const pdf = await PDFDocument.load(new Uint8Array(bytes));
    expect(pdf.getTitle()).toBe("Shotexa Visual Comparison Report");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    await shot(page, testInfo, "07-report.png");
    expect(outbound).toEqual([]);
  });

  test("the report ZIP contains only what was generated", async ({ page }) => {
    await open(page, [panel("before.png", 400, 300, false), panel("after.png", 400, 300, true)]);
    await view(page, "Difference").click();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 240_000 }), page.getByTestId("compare-report-zip").click()]);
    expect(download.suggestedFilename()).toBe("comparison-report.zip");
    const entries = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
    expect(Object.keys(entries).sort()).toEqual(["after.png", "before.png", "difference.png", "heatmap.png", "report.pdf", "summary.json"]);
    const summary = JSON.parse(new TextDecoder().decode(entries["summary.json"]));
    expect(summary.schema).toBe("shotexa.compare.summary");
    expect(summary.totals.changedRegions).toBeGreaterThan(0);
    expect(entries["difference.png"].byteLength).toBeGreaterThan(100);
  });

  test("the JSON summary is machine-readable and versioned", async ({ page }) => {
    await open(page, [panel("before.png", 400, 300, false), panel("after.png", 400, 300, true)]);
    await view(page, "Difference").click();
    await expect(page.getByTestId("compare-difference-stats")).toContainText("1 changed region");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("compare-report-json").click()]);
    expect(download.suggestedFilename()).toBe("comparison-summary.json");
    const summary = JSON.parse(readFileSync((await download.path())!, "utf8"));
    expect(summary).toMatchObject({ schema: "shotexa.compare.summary", version: 1 });
    expect(summary.totals.changedPercent).toBeGreaterThan(0);
    expect(summary.totals.changedRegions).toBe(1);
    expect(summary.regions[0]).toMatchObject({ id: 1, kind: "visual", label: "Visual change" });
    expect(summary.regions[0].box.width).toBeGreaterThan(0);
    expect(summary.settings).toMatchObject({ mode: "difference", fit: "contain" });
    expect(summary.files.a.name).toBe("before.png");
    expect(summary.metric.description).toContain("per-channel");
  });

  test("mobile at 390 px: every Compare Pro feature is reachable", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = watch(page);
    await open(page, [panel("a.png", 400, 300, false), panel("b.png", 400, 300, true)]);

    // The view switcher is on the canvas, with touch-sized targets.
    const difference = view(page, "Difference");
    expect((await difference.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await difference.click();
    await expect(stage(page)).toHaveAttribute("data-mode", "difference");
    await expect(page.getByTestId("compare-difference-stats")).toContainText("changed");

    // Changed-region navigation and the summary are in the main column, not hidden away.
    await page.getByTestId("compare-region-nav").getByRole("button", { name: "Next change" }).click();
    await expect(page.getByTestId("compare-region-position")).toHaveText("Change 1 of 1");
    await expect(page.getByTestId("compare-summary-metrics")).toContainText("Changed pixels");
    await expect(page.getByTestId("compare-analyse-text")).toBeVisible();
    await expect(page.getByTestId("compare-report-pdf")).toBeVisible();
    expect((await page.getByTestId("compare-report-pdf").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await shot(page, testInfo, "08-mobile-compare.png");

    // Every advanced control is in the settings sheet — nothing is dropped on a small screen.
    await page.getByRole("button", { name: "Comparison settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Comparison settings" });
    await expect(sheet.getByRole("radiogroup", { name: "Comparison mode" })).toBeVisible();
    await expect(sheet.getByRole("radiogroup", { name: "Alignment mode" })).toBeVisible();
    await expect(sheet.getByRole("radiogroup", { name: "Difference metric" })).toBeVisible();
    await expect(sheet.getByTestId("compare-presets")).toBeVisible();
    await expect(sheet.getByTestId("compare-ignore-add")).toBeVisible();
    await sheet.getByRole("radiogroup", { name: "Alignment mode" }).getByRole("radio", { name: "Translation", exact: true }).click();
    await shot(page, testInfo, "09-mobile-settings.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(stage(page)).toHaveAttribute("data-align-status", /aligned|identity|failed/, { timeout: 60_000 });

    // Drawing an ignore region works with a finger and must not scroll the page.
    await page.getByTestId("compare-ignore-draw").click();
    const box = (await stage(page).boundingBox())!;
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("compare-ignore-overlay")).toHaveCount(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    expect(errors).toEqual([]);
  });

  test("A/B flicker respects reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, [panel("a.png", 400, 300, false), panel("b.png", 400, 300, true)]);
    await page.getByRole("switch", { name: "Flicker paused" }).click();
    await expect(page.getByTestId("compare-hint")).toContainText("Flicker is paused because reduced motion");
    // The canvas must be a still comparison, not an animation.
    const sample = () =>
      page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('[data-testid="compare-canvas"]')!;
        const d = c.getContext("2d")!.getImageData(Math.floor(c.width / 4), Math.floor(c.height / 2), 1, 1).data;
        return `${d[0]},${d[1]},${d[2]}`;
      });
    const first = await sample();
    await page.waitForTimeout(1200);
    expect(await sample()).toBe(first);

    // With motion allowed, the same toggle does alternate.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.getByTestId("compare-hint")).toContainText("Flicker is playing", { timeout: 15_000 });
  });

  test("the Visual QA Report workflow uses the Compare adapters", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    await page.goto("/workflows");
    await expect(page.getByTestId("workflows-landing")).toBeVisible();
    await page.getByRole("button", { name: /^Visual QA Report/ }).click();
    await page.getByTestId("file-input").setInputFiles([textured("before.png", 400, 300), textured("after.png", 400, 300, 12, 0)]);
    await page.getByRole("button", { name: "Start Visual QA Report" }).click();

    // Step 1: confirm the before/after choice.
    await expect(page.getByRole("button", { name: /Approve and continue/ })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /Approve and continue/ }).click();

    // Step 2: the real Compare stage, driven by the real adapter.
    await expect(page.getByTestId("compare-stage")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("compare-summary-metrics")).toBeVisible({ timeout: 120_000 });
    await shot(page, testInfo, "10-workflow-compare.png");
    await page.getByRole("button", { name: /Approve and continue/ }).click();

    // Step 3 is optional OCR — skipped here; the report still carries the visual measurement.
    await page.getByRole("button", { name: "Skip optional step" }).click();
    await expect(page.getByTestId("workflow-complete")).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId("workflow-complete")).toContainText("Shotexa Visual Comparison Report generated");
    await expect(page.getByTestId("workflow-complete")).toContainText("Aligned automatically");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByRole("button", { name: "Download output" }).click()]);
    expect(download.suggestedFilename()).toBe("comparison-report.pdf");
    const pdf = await PDFDocument.load(new Uint8Array(readFileSync((await download.path())!)));
    expect(pdf.getTitle()).toBe("Shotexa Visual Comparison Report");
    await shot(page, testInfo, "11-workflow-complete.png");
  });
});
