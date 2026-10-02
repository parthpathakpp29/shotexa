/**
 * Phase 2M Compare Screenshots — production route, real Image Worker, pixel-verified.
 *
 * The fixtures are flat colours with a known changed rectangle, so every export can be checked
 * directly: where each screenshot landed, what the divider revealed, how opaque the overlay is,
 * and that the difference highlights exactly the pixels that changed — in exactly their place.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

type RGB = [number, number, number];
const BLUE: RGB = [40, 80, 200];
const RED: RGB = [220, 40, 40];
const GREEN: RGB = [40, 170, 70];
const PAPER: RGB = [243, 241, 238];

const capture = !!process.env.CAPTURE_PHASE2M;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2m/screenshots");
/** The known change: a rectangle that exists in B but not in A. */
const CHANGE = { x: 100, y: 60, width: 80, height: 50 };

function png(name: string, width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const p = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) p.data.set(pixel(x, y), (y * width + x) * 4);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(p) };
}
const solid = (name: string, width: number, height: number, c: RGB) => png(name, width, height, () => [...c, 255]);
const inChange = (x: number, y: number) => x >= CHANGE.x && x < CHANGE.x + CHANGE.width && y >= CHANGE.y && y < CHANGE.y + CHANGE.height;
/** Blue, with a red rectangle when `changed`. */
const panel = (name: string, width: number, height: number, changed: boolean) => png(name, width, height, (x, y) => (changed && inChange(x, y) ? [...RED, 255] : [...BLUE, 255]));

const at = (p: PNG, x: number, y: number): RGB => {
  const i = (Math.round(y) * p.width + Math.round(x)) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2]];
};
const near = (got: number[], want: number[], tolerance = 12) => want.every((v, i) => Math.abs(got[i] - v) <= tolerance);
/** The difference renderer tints changed pixels warm; everything else stays dim and grey. */
const highlighted = (c: RGB) => c[0] > c[2] + 40 && c[0] > 90;

function boundsOf(p: PNG, match: (c: RGB) => boolean) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, count = 0;
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

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: false });
}

const stage = (page: Page) => page.getByTestId("compare-stage");
const mode = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Comparison mode" }).getByRole("radio", { name, exact: true });
const fit = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Fit" }).getByRole("radio", { name, exact: true });

/** Add the two screenshots and wait for the comparison to be drawn. */
async function open(page: Page, files: Parameters<Page["setInputFiles"]>[1]) {
  await page.goto("/compare-screenshots");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(stage(page)).toBeVisible({ timeout: 30_000 });
  // Wait for the screenshots themselves, not just the background fill: the preview bitmaps are
  // generated after the files are added, and until then only the background is painted.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const c = document.querySelector<HTMLCanvasElement>('[data-testid="compare-canvas"]');
          if (!c || !c.width) return true;
          // A quarter of the way in, clear of the divider line that sits at the centre.
          const mid = c.getContext("2d")!.getImageData(Math.floor(c.width / 4), Math.floor(c.height / 2), 1, 1).data;
          // The paper background is #f3f1ee; any screenshot pixel differs from it.
          return Math.abs(mid[0] - 243) < 6 && Math.abs(mid[1] - 241) < 6 && Math.abs(mid[2] - 238) < 6;
        }),
      { timeout: 30_000 },
    )
    .toBe(false);
}

/** Labels are drawn into the image; turn them off when checking pixels. */
async function hideLabels(page: Page) {
  const toggle = page.getByRole("switch", { name: "Before / after labels" });
  if ((await toggle.getAttribute("aria-checked")) === "true") await toggle.click();
}

async function exportCompare(page: Page, trigger = page.getByTestId("export")): Promise<{ name: string; png: PNG }> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), trigger.click()]);
  await expect(page.getByTestId("compare-result")).toBeVisible({ timeout: 180_000 });
  return { name: download.suggestedFilename(), png: PNG.sync.read(readFileSync((await download.path())!)) };
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

test.describe.configure({ timeout: 240_000 });

test.describe("Phase 2M Compare Screenshots", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test.beforeEach(({ browserName }) => {
    // Same host limitation as Phases 2D–2L: this machine's Playwright Firefox cannot create a
    // page before app code loads. Chromium and WebKit (main-thread fallback) cover the flows.
    test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  });

  test("same-size screenshots side by side, exported with both in place", async ({ page }) => {
    const { errors, outbound } = watch(page);
    await open(page, [solid("before.png", 400, 300, BLUE), solid("after.png", 400, 300, GREEN)]);
    // Two images in the workspace are chosen automatically, in order.
    await expect(page.getByTestId("compare-pick-a")).toHaveValue(/.+/);
    await mode(page, "Side by side").click();
    await hideLabels(page);
    await page.getByRole("slider", { name: "Gap between screenshots" }).fill("0");
    await shot(page, "01-side-by-side.png");

    await expect(stage(page)).toHaveAttribute("data-canvas-width", "800");
    await expect(stage(page)).toHaveAttribute("data-canvas-height", "300");
    const { name, png: out } = await exportCompare(page);
    expect(name).toBe("compare-side-by-side.png");
    expect([out.width, out.height]).toEqual([800, 300]);
    expect(near(at(out, 200, 150), BLUE)).toBe(true); // before on the left
    expect(near(at(out, 600, 150), GREEN)).toBe(true); // after on the right
    const blue = boundsOf(out, (c) => near(c, BLUE));
    expect([blue.x0, blue.y0, blue.width, blue.height]).toEqual([0, 0, 400, 300]);

    // Non-destructive: both originals are still in the workspace, unchanged.
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(page.getByTestId("file-item").first()).toContainText("400 × 300");
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("different-size screenshots share one frame and neither is stretched", async ({ page }) => {
    await open(page, [solid("wide.png", 600, 200, BLUE), solid("tall.png", 200, 400, GREEN)]);
    await mode(page, "Side by side").click();
    await hideLabels(page);
    await page.getByRole("slider", { name: "Gap between screenshots" }).fill("0");
    // The cell holds either screenshot at its natural size: 600 × 400 each.
    await expect(stage(page)).toHaveAttribute("data-canvas-width", "1200");
    await expect(stage(page)).toHaveAttribute("data-canvas-height", "400");
    await shot(page, "02-different-sizes.png");

    const { png: out } = await exportCompare(page);
    expect([out.width, out.height]).toEqual([1200, 400]);
    const blue = boundsOf(out, (c) => near(c, BLUE));
    const green = boundsOf(out, (c) => near(c, GREEN));
    // Fit: the wide one spans the cell width, the tall one the cell height — both unstretched.
    expect(blue.width / blue.height).toBeCloseTo(3, 1);
    expect(green.width / green.height).toBeCloseTo(0.5, 1);
    expect(green.x0).toBeGreaterThanOrEqual(600);
    // The uncovered part of each cell shows the background.
    expect(near(at(out, 300, 8), PAPER)).toBe(true);
  });

  test("before/after slider: the divider decides what each side shows", async ({ page }) => {
    await open(page, [solid("before.png", 400, 300, BLUE), solid("after.png", 400, 300, GREEN)]);
    await expect(stage(page)).toHaveAttribute("data-mode", "slider"); // the default
    await expect(stage(page)).toHaveAttribute("data-divider", "50");
    await hideLabels(page);
    await shot(page, "03-slider.png");

    const { name, png: half } = await exportCompare(page);
    expect(name).toBe("compare-before-after.png");
    expect([half.width, half.height]).toEqual([400, 300]);
    expect(near(at(half, 100, 150), BLUE)).toBe(true); // before, left of the divider
    expect(near(at(half, 300, 150), GREEN)).toBe(true); // after, right of it
    const green = boundsOf(half, (c) => near(c, GREEN));
    expect(green.x0).toBeGreaterThanOrEqual(199);
    expect(green.x1).toBe(399);

    // The extremes show one screenshot only.
    await page.getByTestId("file-item").first().locator("button").first().click();
    await page.getByRole("slider", { name: "Divider position" }).fill("0");
    await expect(stage(page)).toHaveAttribute("data-divider", "0");
    // Everything but the thin divider line itself, which marks where the split is.
    const allAfter = (await exportCompare(page)).png;
    expect(boundsOf(allAfter, (c) => near(c, GREEN)).count).toBeGreaterThanOrEqual(400 * 300 - 2 * 300);
    expect(near(at(allAfter, 10, 150), GREEN)).toBe(true);
    await page.getByTestId("file-item").first().locator("button").first().click();
    await page.getByRole("slider", { name: "Divider position" }).fill("100");
    const allBefore = (await exportCompare(page)).png;
    expect(boundsOf(allBefore, (c) => near(c, BLUE)).count).toBeGreaterThanOrEqual(400 * 300 - 2 * 300);
    expect(near(at(allBefore, 390, 150), BLUE)).toBe(true);
  });

  test("dragging the divider is one undo step and exports where it was left", async ({ page }) => {
    await open(page, [solid("before.png", 400, 300, BLUE), solid("after.png", 400, 300, GREEN)]);
    await hideLabels(page);
    const box = (await stage(page).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    for (const f of [0.4, 0.3, 0.25]) await page.mouse.move(box.x + box.width * f, box.y + box.height * 0.5, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => Number(await stage(page).getAttribute("data-divider"))).toBeLessThanOrEqual(27);
    const dragged = Number(await stage(page).getAttribute("data-divider"));
    expect(dragged).toBeGreaterThanOrEqual(23);

    const { png: out } = await exportCompare(page);
    const green = boundsOf(out, (c) => near(c, GREEN));
    expect(green.x0).toBeGreaterThanOrEqual(Math.round((dragged / 100) * 400) - 2);
    expect(green.x0).toBeLessThanOrEqual(Math.round((dragged / 100) * 400) + 2);

    // One gesture, one undo step: back to the default divider.
    await page.getByTestId("file-item").first().locator("button").first().click();
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(stage(page)).toHaveAttribute("data-divider", "50");
  });

  test("overlay blends after over before at the chosen opacity", async ({ page }) => {
    await open(page, [solid("before.png", 400, 300, BLUE), solid("after.png", 400, 300, GREEN)]);
    await mode(page, "Overlay").click();
    await hideLabels(page);
    await shot(page, "04-overlay.png");
    const half = (await exportCompare(page)).png;
    const mid = at(half, 200, 150);
    // 50 %: halfway between the two colours, on every channel.
    for (const [i, v] of BLUE.entries()) expect(Math.abs(mid[i] - (v + GREEN[i]) / 2), `channel ${i}`).toBeLessThanOrEqual(3);

    await page.getByTestId("file-item").first().locator("button").first().click();
    await page.getByRole("slider", { name: "After opacity" }).fill("0");
    const none = (await exportCompare(page)).png;
    expect(near(at(none, 200, 150), BLUE)).toBe(true); // only before

    await page.getByTestId("file-item").first().locator("button").first().click();
    await page.getByRole("slider", { name: "After opacity" }).fill("100");
    const full = (await exportCompare(page)).png;
    expect(near(at(full, 200, 150), GREEN)).toBe(true); // only after
  });

  test("difference highlights exactly the rectangle that changed, in its exact place", async ({ page }) => {
    await open(page, [panel("before.png", 400, 300, false), panel("after.png", 400, 300, true)]);
    await mode(page, "Difference").click();
    await hideLabels(page);
    await shot(page, "05-difference.png");

    const { name, png: out } = await exportCompare(page);
    expect(name).toBe("compare-difference.png");
    expect([out.width, out.height]).toEqual([400, 300]);
    // The critical check: the highlight covers the changed rectangle and nothing else.
    const marked = boundsOf(out, highlighted);
    expect([marked.x0, marked.y0, marked.width, marked.height]).toEqual([CHANGE.x, CHANGE.y, CHANGE.width, CHANGE.height]);
    expect(marked.count).toBe(CHANGE.width * CHANGE.height);
    // Unchanged areas are subdued, never bright.
    const quiet = at(out, 20, 20);
    expect(highlighted(quiet)).toBe(false);
    expect(Math.max(...quiet)).toBeLessThan(110);
  });

  test("identical screenshots show no difference at all", async ({ page }) => {
    await open(page, [panel("one.png", 400, 300, true), panel("two.png", 400, 300, true)]);
    await mode(page, "Difference").click();
    await hideLabels(page);
    const { png: out } = await exportCompare(page);
    expect(boundsOf(out, highlighted).count).toBe(0);
  });

  test("difference copes with different dimensions", async ({ page }) => {
    const { errors } = watch(page);
    await open(page, [solid("small.png", 300, 200, BLUE), solid("big.png", 600, 400, BLUE)]);
    await mode(page, "Difference").click();
    await hideLabels(page);
    await fit(page, "Fit").click();
    // Both are scaled into the 600 × 400 frame; the same colour means almost nothing changed.
    await expect(stage(page)).toHaveAttribute("data-canvas-width", "600");
    const { png: fitted } = await exportCompare(page);
    expect([fitted.width, fitted.height]).toEqual([600, 400]);
    expect(boundsOf(fitted, highlighted).count).toBeLessThan(600 * 400 * 0.02);

    // Actual size: the smaller screenshot covers only part of the frame, and the rest is
    // compared against the background — a defined result, not noise.
    await page.getByTestId("file-item").first().locator("button").first().click();
    await fit(page, "Actual").click();
    const { png: actual } = await exportCompare(page);
    expect([actual.width, actual.height]).toEqual([600, 400]);
    const marked = boundsOf(actual, highlighted);
    expect(marked.count).toBeGreaterThan(0); // where only one screenshot has pixels
    expect(marked.count).toBeLessThan(600 * 400);
    expect(errors).toEqual([]);
  });

  test("swapping exchanges before and after", async ({ page }) => {
    await open(page, [solid("before.png", 400, 300, BLUE), solid("after.png", 400, 300, GREEN)]);
    await hideLabels(page);
    const a = await page.getByTestId("compare-pick-a").inputValue();
    const b = await page.getByTestId("compare-pick-b").inputValue();
    await page.getByTestId("compare-swap").click();
    expect(await page.getByTestId("compare-pick-a").inputValue()).toBe(b);
    expect(await page.getByTestId("compare-pick-b").inputValue()).toBe(a);

    const { png: out } = await exportCompare(page);
    expect(near(at(out, 100, 150), GREEN)).toBe(true); // green is now "before", on the left
    expect(near(at(out, 300, 150), BLUE)).toBe(true);
    // Undo puts them back.
    await page.getByTestId("file-item").first().locator("button").first().click();
    await page.getByRole("button", { name: "Undo" }).first().click();
    expect(await page.getByTestId("compare-pick-a").inputValue()).toBe(a);
  });

  test("the preview shows the same comparison as the exported file", async ({ page }) => {
    await open(page, [panel("before.png", 400, 300, false), panel("after.png", 400, 300, true)]);
    await page.getByRole("slider", { name: "Divider position" }).fill("35");
    await expect(stage(page)).toHaveAttribute("data-divider", "35");
    // The canvas must hold the comparison itself, not just the background it starts with.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const c = document.querySelector<HTMLCanvasElement>('[data-testid="compare-canvas"]')!;
          const p = c.getContext("2d")!.getImageData(Math.floor(c.width / 4), Math.floor(c.height / 2), 1, 1).data;
          return [p[0], p[1], p[2]].join(",");
        }),
      )
      .toBe("40,80,200");
    await shot(page, "06-parity.png");
    // Keep the preview's pixels in the page: exporting re-renders the stage.
    await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="compare-canvas"]')!;
      (window as unknown as { __preview: ImageData }).__preview = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    });
    const { png: out } = await exportCompare(page);
    const diff = await page.evaluate(async (b64: string) => {
      const shown = (window as unknown as { __preview: ImageData }).__preview;
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/png" }));
      const ref = document.createElement("canvas");
      ref.width = shown.width;
      ref.height = shown.height;
      const rc = ref.getContext("2d")!;
      rc.imageSmoothingQuality = "high";
      rc.drawImage(bitmap, 0, 0, ref.width, ref.height);
      bitmap.close();
      const b = rc.getImageData(0, 0, ref.width, ref.height).data;
      ref.width = 0;
      const a = shown.data;
      let differing = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 40) differing++;
      }
      return differing / (a.length / 4);
    }, PNG.sync.write(out).toString("base64"));
    expect(diff).toBeLessThan(0.02);
  });

  test("Editor result compared against its original, without re-upload", async ({ page }) => {
    await page.goto("/screenshot-editor");
    await page.getByTestId("file-input").setInputFiles(panel("screen.png", 400, 300, true));
    await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Flip horizontal" }).click();
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("editor-result").getByRole("link", { name: /Compare/ }).click();
    await expect(page).toHaveURL(/\/compare-screenshots$/, { timeout: 60_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(2);

    await mode(page, "Difference").click();
    await hideLabels(page);
    const { png: out } = await exportCompare(page);
    expect([out.width, out.height]).toEqual([400, 300]);
    // The mirrored copy differs from the original in two places: the rectangle and its mirror.
    // Two marked regions — the rectangle and its mirror — so the box spans both.
    const marked = boundsOf(out, highlighted);
    expect(marked.count).toBe(CHANGE.width * CHANGE.height * 2);
    expect(marked.x0).toBe(CHANGE.x);
    expect(marked.x1).toBe(400 - CHANGE.x - 1);
    expect(marked.y0).toBe(CHANGE.y);
  });

  test("Beautifier result compared against its source", async ({ page }) => {
    await page.goto("/screenshot-beautifier");
    await page.getByTestId("file-input").setInputFiles(solid("shot.png", 400, 300, BLUE));
    await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "Large" }).click();
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("beautify-result").getByRole("link", { name: /Compare/ }).click();
    await expect(page).toHaveURL(/\/compare-screenshots$/, { timeout: 60_000 });

    await mode(page, "Side by side").click();
    await hideLabels(page);
    // The beautified copy is larger (400 × 300 plus 20 % padding), so the shared cell is too.
    await expect(stage(page)).toHaveAttribute("data-canvas-height", "420");
    const { name, png: out } = await exportCompare(page);
    expect(name).toBe("compare-side-by-side.png");
    expect(out.height).toBe(420);
    expect(out.width).toBeGreaterThan(1040);
    expect(boundsOf(out, (c) => near(c, BLUE)).count).toBeGreaterThan(0);
  });

  test("mobile: pickers, mode, divider drag and sticky export", async ({ page, browserName }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = watch(page);
    await open(page, [solid("before.png", 400, 300, BLUE), solid("after.png", 400, 300, GREEN)]);
    const box = (await stage(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(300);
    for (const name of ["Comparison settings", "Export"]) {
      const target = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(target.height, name).toBeGreaterThanOrEqual(44);
    }
    const handle = (await page.getByTestId("compare-divider").boundingBox())!;
    expect(handle.width).toBeGreaterThanOrEqual(44);
    await shot(page, "07-mobile.png");

    // A real finger drag moves the divider and must not scroll the page. Touch events are
    // dispatched through the Chromium DevTools protocol; the pointer path is covered everywhere.
    const before = await page.evaluate(() => window.scrollY);
    const y = box.y + box.height / 2;
    if (browserName === "chromium") {
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
      await touch("touchStart", box.x + box.width * 0.5);
      for (const f of [0.4, 0.3, 0.22]) await touch("touchMove", box.x + box.width * f);
      await touch("touchEnd", box.x + box.width * 0.22);
    } else {
      await page.mouse.move(box.x + box.width * 0.5, y);
      await page.mouse.down();
      for (const f of [0.4, 0.3, 0.22]) await page.mouse.move(box.x + box.width * f, y, { steps: 3 });
      await page.mouse.up();
    }
    await expect.poll(async () => Number(await stage(page).getAttribute("data-divider"))).toBeLessThan(30);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);

    await page.getByRole("button", { name: "Comparison settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Comparison settings" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radiogroup", { name: "Comparison mode" }).getByRole("radio", { name: "Overlay", exact: true }).click();
    await expect(stage(page)).toHaveAttribute("data-mode", "overlay");
    await sheet.getByTestId("compare-swap").click();
    await shot(page, "08-mobile-sheet.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    const { png: out } = await exportCompare(page, page.getByRole("button", { name: "Export", exact: true }));
    expect([out.width, out.height]).toEqual([400, 300]);
    expect(errors).toEqual([]);
  });
});

test("homepage does not load Compare", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  const scripts: string[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") scripts.push(await r.text().catch(() => ""));
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  expect(scripts.length).toBeGreaterThan(0);
  // Strings only the Compare UI contains.
  expect(scripts.filter((s) => s.includes("Drag the divider, or focus it and use") || s.includes("Higher sensitivity marks smaller changes"))).toEqual([]);
});
