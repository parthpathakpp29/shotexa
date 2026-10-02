/**
 * Phase 2I Split Long Screenshot — production route, real pointer input, real Image Worker.
 *
 * Reconstruction is verified from exported PIXELS. The fixture is "row-coded": every row y is a
 * single colour whose red + 256 × green = y. So each exported piece must consist of rows
 * y0, y0+1, …, y1-1 across its full width, and the pieces together must contain every source
 * row exactly once, in order — no missing rows, no duplicates, no off-by-one seams.
 */
import { expect, test, type Download, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

type RGB = [number, number, number];
const RED: RGB = [220, 40, 40];
const BLUE: RGB = [40, 80, 200];

const capture = !!process.env.CAPTURE_PHASE2I;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2i/screenshots");

function rowCoded(name: string, width: number, height: number) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const r = y & 255;
    const g = (y >> 8) & 255;
    for (let x = 0; x < width; x++) png.data.set([r, g, 128, 255], (y * width + x) * 4);
  }
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

function solid(name: string, width: number, height: number, c: RGB) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...c, 255], i);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

const rowOf = (png: PNG, x: number, y: number) => {
  const i = (y * png.width + x) * 4;
  return png.data[i] + 256 * png.data[i + 1];
};

/** Every row of every piece, in order, must be the next source row — checked at three columns. */
function expectReconstructs(pieces: PNG[], source: { width: number; height: number }) {
  let next = 0;
  for (const [k, png] of pieces.entries()) {
    expect(png.width, `piece ${k + 1} width`).toBe(source.width);
    for (let y = 0; y < png.height; y++, next++) {
      for (const x of [0, Math.floor(png.width / 2), png.width - 1]) {
        const got = rowOf(png, x, y);
        if (got !== next) expect(got, `piece ${k + 1}, row ${y}, column ${x}`).toBe(next);
      }
    }
  }
  expect(next, "rows covered").toBe(source.height);
}

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: false });
}

const stage = (page: Page) => page.getByTestId("split-stage");
const lines = (page: Page) => page.getByTestId("split-line");
const lineYs = async (page: Page) => (await lines(page).evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.y))));

async function openSplit(page: Page, files: Parameters<Page["setInputFiles"]>[1]) {
  await page.goto("/split-long-screenshot");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(stage(page)).toBeVisible({ timeout: 30_000 });
}

/** Scroll source row `y` into the middle of the preview and return its page coordinates. */
async function pointAt(page: Page, y: number, xFraction = 0.5) {
  return stage(page).evaluate(
    (el, [y, xFraction]) => {
      const scale = el.getBoundingClientRect().width / Number((el as HTMLElement).dataset.width);
      const scroller = el.parentElement!;
      scroller.scrollIntoView({ block: "nearest" });
      const scrollerBox = scroller.getBoundingClientRect();
      scroller.scrollTop += el.getBoundingClientRect().top + y * scale - (scrollerBox.top + scrollerBox.height / 2);
      const box = el.getBoundingClientRect();
      return { x: box.left + box.width * xFraction, y: box.top + y * scale, scale };
    },
    [y, xFraction] as const,
  );
}

async function dragLine(page: Page, index: number, toY: number) {
  const from = await pointAt(page, (await lineYs(page))[index], 0.3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + (toY - (await lineYs(page))[index]) * from.scale, { steps: 10 });
  await page.mouse.up();
}

async function setField(page: Page, testId: string, value: number) {
  const field = page.getByTestId(testId);
  await field.fill(String(value));
  await field.press("Enter");
}

/** Export, then save every piece with "Download all". */
async function exportAll(page: Page, trigger = page.getByTestId("export")): Promise<{ pngs: PNG[]; names: string[] }> {
  await trigger.click();
  const result = page.getByTestId("split-result");
  await expect(result).toBeVisible({ timeout: 120_000 });
  const count = await page.getByTestId("split-piece").count();
  const downloads: Download[] = [];
  const done = new Promise<void>((resolve) => {
    page.on("download", (d) => {
      downloads.push(d);
      if (downloads.length === count) resolve();
    });
  });
  await page.getByTestId("split-download-all").click();
  await done;
  const names = downloads.map((d) => d.suggestedFilename());
  const pngs = await Promise.all(downloads.map(async (d) => PNG.sync.read(readFileSync((await d.path())!))));
  return { pngs, names };
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

const heights = (pngs: PNG[]) => pngs.map((p) => p.height);

test.describe.configure({ timeout: 240_000 });

test.describe("Phase 2I Split Long Screenshot", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test.beforeEach(({ browserName }) => {
    // Same host limitation as Phases 2D–2H: this machine's Playwright Firefox fails to create a
    // page before app code loads. Chromium and WebKit (main-thread fallback) cover the flows.
    test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  });

  test("very long screenshot → 2 equal sections → reconstructs row for row", async ({ page }) => {
    const { errors, outbound } = watch(page);
    // 600 × 60,000: each half is 18 MP, above the single-canvas ceiling, so pieces stream as tiled PNG.
    await openSplit(page, rowCoded("very-long.png", 600, 60_000));
    await expect(stage(page)).toHaveAttribute("data-pieces", "2");
    expect(await lineYs(page)).toEqual([30_000]);
    await expect(page.getByTestId("split-piece-count")).toHaveText("2");
    await shot(page, "01-split-equal.png");

    const { pngs, names } = await exportAll(page);
    expect(names).toEqual(["shotexa-split-01.png", "shotexa-split-02.png"]);
    expect(heights(pngs)).toEqual([30_000, 30_000]);
    expectReconstructs(pngs, { width: 600, height: 60_000 });

    // Nothing is added to the workspace until asked; the source is unchanged.
    await expect(page.getByTestId("file-item")).toHaveCount(1);
    await expect(page.getByTestId("file-item").first()).toContainText("600 × 60000");
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("4 equal sections, individual download, then add pieces and continue", async ({ page }) => {
    await openSplit(page, rowCoded("tall.png", 400, 3001));
    await setField(page, "split-count", 4);
    await expect(stage(page)).toHaveAttribute("data-pieces", "4");
    expect(await lineYs(page)).toEqual([750, 1501, 2251]);
    await expect(page.getByTestId("split-section")).toHaveCount(4);

    const { pngs } = await exportAll(page);
    expect(heights(pngs)).toEqual([750, 751, 750, 750]); // near-equal, never more than 1 px apart
    expectReconstructs(pngs, { width: 400, height: 3001 });

    // One piece on its own.
    const [single] = await Promise.all([page.waitForEvent("download"), page.getByTestId("split-piece-download").nth(2).click()]);
    expect(single.suggestedFilename()).toBe("shotexa-split-03.png");
    expect(PNG.sync.read(readFileSync((await single.path())!)).height).toBe(750);
    await shot(page, "02-split-result.png");

    // Add to workspace → pieces become artifacts → Continue with Annotate, no re-upload.
    await page.getByTestId("split-add-to-workspace").click();
    await expect(page.getByTestId("file-item")).toHaveCount(5);
    await expect(page.getByTestId("file-item").first()).toContainText("400 × 3001"); // source unchanged
    await page.getByTestId("split-result").getByRole("link", { name: /Annotate/ }).click();
    await expect(page).toHaveURL(/\/annotate-screenshot$/, { timeout: 60_000 });
    await expect(page.getByTestId("annotate-stage")).toHaveAttribute("data-out-height", "750");
  });

  test("target height: every N px, the last piece takes the remainder", async ({ page }) => {
    await openSplit(page, rowCoded("tall.png", 300, 3500));
    await page.getByRole("radio", { name: "Height" }).click();
    await setField(page, "split-height", 1000);
    expect(await lineYs(page)).toEqual([1000, 2000, 3000]);
    const { pngs } = await exportAll(page);
    expect(heights(pngs)).toEqual([1000, 1000, 1000, 500]);
    expectReconstructs(pngs, { width: 300, height: 3500 });

    // A sliver remainder joins the last piece rather than becoming its own image.
    await setField(page, "split-height", 1160);
    expect(await lineYs(page)).toEqual([1160, 2320]); // 3500 − 3480 = 20 px would be a sliver
  });

  test("custom: click the image to add a split", async ({ page }) => {
    await openSplit(page, rowCoded("tall.png", 400, 3000));
    await page.getByRole("radio", { name: "Custom" }).click();
    await expect(stage(page)).toHaveAttribute("data-mode", "custom");
    expect(await lineYs(page)).toEqual([1500]); // starts from the equal split
    const p = await pointAt(page, 600);
    await page.mouse.click(p.x, p.y);
    await expect(lines(page)).toHaveCount(2);
    const ys = await lineYs(page);
    expect(Math.abs(ys[0] - 600)).toBeLessThanOrEqual(2);
    expect(ys[1]).toBe(1500);
    // Too close to an existing line: rejected, nothing changes.
    const near = await pointAt(page, 1510);
    await page.mouse.click(near.x, near.y);
    await expect(lines(page)).toHaveCount(2);
    await shot(page, "03-split-custom.png");

    const { pngs } = await exportAll(page);
    expect(heights(pngs)).toEqual([ys[0], 1500 - ys[0], 1500]);
    expectReconstructs(pngs, { width: 400, height: 3000 });
  });

  test("drag a split line; it cannot pass its neighbour", async ({ page }) => {
    await openSplit(page, rowCoded("tall.png", 400, 3000));
    await setField(page, "split-count", 3);
    expect(await lineYs(page)).toEqual([1000, 2000]);
    await dragLine(page, 0, 1300);
    await expect(stage(page)).toHaveAttribute("data-mode", "custom"); // an equal line became custom
    let ys = await lineYs(page);
    expect(Math.abs(ys[0] - 1300)).toBeLessThanOrEqual(3);
    expect(ys[1]).toBe(2000);

    // Dragged past its neighbour: it stops 24 px short and the order never changes.
    await dragLine(page, 0, 2400);
    ys = await lineYs(page);
    expect(ys).toEqual([1976, 2000]);

    // Keyboard nudge.
    await lines(page).nth(0).focus();
    await page.keyboard.press("Shift+ArrowUp");
    await page.keyboard.press("ArrowUp");
    expect(await lineYs(page)).toEqual([1965, 2000]);

    const { pngs } = await exportAll(page);
    expect(heights(pngs)).toEqual([1965, 35, 1000]);
    expectReconstructs(pngs, { width: 400, height: 3000 });
  });

  test("delete a split line with the keyboard and the toolbar", async ({ page }) => {
    await openSplit(page, rowCoded("tall.png", 400, 3000));
    await setField(page, "split-count", 4);
    expect(await lineYs(page)).toEqual([750, 1500, 2250]);
    await lines(page).nth(1).focus();
    await page.keyboard.press("Delete");
    expect(await lineYs(page)).toEqual([750, 2250]);
    await lines(page).nth(0).focus();
    await page.getByRole("button", { name: "Delete split" }).click();
    expect(await lineYs(page)).toEqual([2250]);
    const { pngs } = await exportAll(page);
    expect(heights(pngs)).toEqual([2250, 750]);
    expectReconstructs(pngs, { width: 400, height: 3000 });
  });

  test("undo and redo step through split edits; reset", async ({ page }) => {
    await openSplit(page, rowCoded("tall.png", 400, 3000));
    const undo = page.getByRole("button", { name: "Undo" }).first();
    const redo = page.getByRole("button", { name: "Redo" }).first();

    await setField(page, "split-count", 3); // 1 count
    await page.getByRole("button", { name: "Add split" }).click(); // 2 add (halves the tallest piece)
    expect(await lineYs(page)).toEqual([500, 1000, 2000]);
    await dragLine(page, 2, 2600); // 3 move
    const moved = await lineYs(page);
    expect(Math.abs(moved[2] - 2600)).toBeLessThanOrEqual(3);
    await lines(page).nth(0).focus();
    await page.keyboard.press("Delete"); // 4 delete
    expect(await lineYs(page)).toEqual([1000, moved[2]]);
    await page.getByTestId("split-reset").click(); // 5 reset
    expect(await lineYs(page)).toEqual([1500]);

    await undo.click();
    expect(await lineYs(page)).toEqual([1000, moved[2]]);
    await undo.click();
    expect(await lineYs(page)).toEqual(moved);
    await undo.click();
    expect(await lineYs(page)).toEqual([500, 1000, 2000]);
    await undo.click();
    expect(await lineYs(page)).toEqual([1000, 2000]);
    await undo.click();
    expect(await lineYs(page)).toEqual([1500]);
    await expect(undo).toBeDisabled();

    for (let i = 0; i < 4; i++) await redo.click();
    expect(await lineYs(page)).toEqual([1000, moved[2]]);
    const { pngs } = await exportAll(page);
    expect(heights(pngs)).toEqual([1000, moved[2] - 1000, 3000 - moved[2]]);
    expectReconstructs(pngs, { width: 400, height: 3000 });
  });

  test("Smart Stitch result → Split without re-upload; pieces restack to the stitched image", async ({ page }) => {
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([join(FIXTURE_DIR, "chat-light/a.png"), join(FIXTURE_DIR, "chat-light/b.png")]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    const [stitched] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("stitch-result")).toBeVisible({ timeout: 120_000 });
    const whole = PNG.sync.read(readFileSync((await stitched.path())!));

    await page.getByTestId("stitch-result").getByRole("link", { name: /Split/ }).click();
    await expect(page).toHaveURL(/\/split-long-screenshot$/, { timeout: 60_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(stage(page)).toHaveAttribute("data-height", String(whole.height));
    await setField(page, "split-count", 3);
    const { pngs } = await exportAll(page);
    expect(pngs.reduce((n, p) => n + p.height, 0)).toBe(whole.height);
    // Stacked back together, the pieces are byte-for-byte the stitched image.
    const stacked = Buffer.concat(pngs.map((p) => p.data));
    expect(stacked.equals(whole.data)).toBe(true);
  });

  test("Combine result → Split without re-upload", async ({ page }) => {
    await page.goto("/combine-screenshots");
    await page.getByTestId("file-input").setInputFiles([solid("red.png", 120, 60, RED), solid("blue.png", 80, 100, BLUE)]);
    await expect(page.getByTestId("combine-preview")).toBeVisible({ timeout: 30_000 });
    const [combined] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("combine-result")).toBeVisible({ timeout: 120_000 });
    const whole = PNG.sync.read(readFileSync((await combined.path())!));

    await page.getByTestId("combine-result").getByRole("link", { name: /Split/ }).click();
    await expect(page).toHaveURL(/\/split-long-screenshot$/, { timeout: 60_000 });
    await expect(stage(page)).toHaveAttribute("data-height", "176"); // 60 + 16 gap + 100
    const { pngs } = await exportAll(page);
    expect(heights(pngs)).toEqual([88, 88]);
    expect(Buffer.concat(pngs.map((p) => p.data)).equals(whole.data)).toBe(true);
  });

  test("mobile: long preview, touch-size lines, settings sheet, sticky export", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = watch(page);
    await openSplit(page, rowCoded("phone.png", 360, 4000));
    const box = (await stage(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(300); // the preview uses the screen width
    const line = (await lines(page).first().boundingBox())!;
    expect(line.height).toBeGreaterThanOrEqual(44);
    for (const name of ["Split settings", "Undo", "Redo", "Previous split", "Next split", "Add split"]) {
      const target = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(target.height, name).toBeGreaterThanOrEqual(44);
    }
    await shot(page, "04-split-mobile.png");

    await page.getByRole("button", { name: "Split settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Split settings" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "More sections" }).click();
    await expect(sheet.getByTestId("split-piece-count")).toHaveText("3");
    await shot(page, "05-split-mobile-sheet.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // Navigate to the second line and drag it with the pointer.
    await page.getByRole("button", { name: "Next split", exact: true }).click();
    await page.getByRole("button", { name: "Next split", exact: true }).click();
    await expect(page.getByTestId("split-position")).toHaveText("2 / 2");
    await expect(lines(page).nth(1)).toBeFocused();
    await expect(lines(page).nth(1)).toBeInViewport();
    await page.waitForTimeout(600); // let the smooth scroll to the line finish before grabbing it
    await dragLine(page, 1, 3000);
    const ys = await lineYs(page);
    expect(Math.abs(ys[1] - 3000)).toBeLessThanOrEqual(6);

    const { pngs } = await exportAll(page, page.getByRole("button", { name: "Export", exact: true }));
    expect(heights(pngs)).toEqual([ys[0], ys[1] - ys[0], 4000 - ys[1]]);
    expectReconstructs(pngs, { width: 360, height: 4000 });
    const download = (await page.getByTestId("split-piece-download").first().boundingBox())!;
    expect(download.height).toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
  });
});

test("touch: a finger drag moves a split line and scrolls nothing else (Chromium)", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "Touch input is dispatched through the Chromium DevTools protocol.");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await openSplit(page, rowCoded("phone.png", 360, 4000));
    const from = await pointAt(page, 2000, 0.3);
    const scrollTop = () => stage(page).evaluate((el) => [el.parentElement!.scrollTop, window.scrollY]);
    const before = await scrollTop();
    const cdp = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: from.x, y }] });
    await touch("touchStart", from.y);
    for (let i = 1; i <= 10; i++) await touch("touchMove", from.y + (300 * from.scale * i) / 10);
    await touch("touchEnd", from.y + 300 * from.scale);
    await expect.poll(async () => Math.abs((await lineYs(page))[0] - 2300)).toBeLessThanOrEqual(6);
    await expect(stage(page)).toHaveAttribute("data-mode", "custom");
    expect(await scrollTop()).toEqual(before); // the finger moved the line, not the page
    // One gesture, one undo step.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect(await lineYs(page)).toEqual([2000]);
  } finally {
    await context.close();
  }
});

test("homepage does not load the split tool", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  const scripts: string[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") scripts.push(await r.text().catch(() => ""));
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  expect(scripts.length).toBeGreaterThan(0);
  // A string only the Split tool's UI contains (its engine is imported on demand).
  expect(scripts.filter((s) => s.includes("Every row of the original is in exactly one piece"))).toEqual([]);
});
