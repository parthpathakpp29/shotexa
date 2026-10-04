/**
 * Phase 2L Screenshot Beautifier — production route, real Image Worker, pixel-verified.
 *
 * The fixtures are flat colours, so every exported file can be checked directly: where the
 * background is, where the screenshot's pixels are, that the drawn rectangle still has the
 * screenshot's own proportions, and that the preview shows the same composition as the file.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

type RGB = [number, number, number];
const RED: RGB = [220, 40, 40];
const BLUE: RGB = [40, 80, 200];
const CREAM: RGB = [247, 241, 227];
const WHITE: RGB = [255, 255, 255];

const capture = !!process.env.CAPTURE_PHASE2L || !!process.env.CAPTURE_PHASE3C || !!process.env.CAPTURE_PHASE3D;
const SCREENSHOTS = join(process.cwd(), process.env.CAPTURE_PHASE3D ? "docs/phase-3d/screenshots" : process.env.CAPTURE_PHASE3C ? "docs/phase-3c/screenshots" : "docs/phase-2l/screenshots");

function png(name: string, width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const p = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) p.data.set(pixel(x, y), (y * width + x) * 4);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(p) };
}
const solid = (name: string, width: number, height: number, c: RGB) => png(name, width, height, () => [...c, 255]);
/** Left half red, right half blue — so a crop or a mirror is visible. */
const halves = (name: string, width: number, height: number) => png(name, width, height, (x) => (x < width / 2 ? [...RED, 255] : [...BLUE, 255]));

const at = (p: PNG, x: number, y: number): RGB => {
  const i = (Math.round(y) * p.width + Math.round(x)) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2]];
};
const near = (got: number[], want: number[], tolerance = 12) => want.every((v, i) => Math.abs(got[i] - v) <= tolerance);

/** Bounding box of every pixel close to `want` — used to measure where the screenshot landed. */
function boundsOf(p: PNG, want: RGB, tolerance = 30) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, count = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (!near(at(p, x, y), want, tolerance)) continue;
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

const stage = (page: Page) => page.getByTestId("beautify-stage");
const style = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Composition style" }).getByRole("radio", { name, exact: true });

async function open(page: Page, files: Parameters<Page["setInputFiles"]>[1]) {
  await page.goto("/screenshot-beautifier");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(stage(page)).toBeVisible({ timeout: 30_000 });
  // The composition is drawn from the workspace preview; wait for it to arrive.
  await expect.poll(async () => page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="beautify-canvas"]');
    if (!c || !c.width) return 0;
    return c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.filter((v, i) => i % 4 === 3 && v > 0).length;
  }), { timeout: 30_000 }).toBeGreaterThan(0);
}

/** The canvas size the tool says it will export. */
async function outputSize(page: Page) {
  const el = stage(page);
  return { width: Number(await el.getAttribute("data-canvas-width")), height: Number(await el.getAttribute("data-canvas-height")) };
}

async function exportImage(page: Page, trigger = page.getByTestId("export")): Promise<{ name: string; png: PNG }> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), trigger.click()]);
  await expect(page.getByTestId("beautify-result")).toBeVisible({ timeout: 180_000 });
  return { name: download.suggestedFilename(), png: PNG.sync.read(readFileSync((await download.path())!)) };
}

async function setSlider(page: Page, name: string, value: number) {
  await page.getByRole("slider", { name }).fill(String(value));
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

test.describe("Phase 2L Screenshot Beautifier", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test.beforeEach(({ browserName }) => {
    // Same host limitation as Phases 2D–2K: this machine's Playwright Firefox cannot create a
    // page before app code loads. Chromium and WebKit (main-thread fallback) cover the flows.
    test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  });

  test("clean mode: background and padding around the screenshot, exported at full size", async ({ page }) => {
    const { errors, outbound } = watch(page);
    await open(page, solid("shot.png", 600, 400, RED));
    await page.getByTestId("beautify-bg-cream").click();
    await page.getByRole("radiogroup", { name: "Background type" }).getByRole("radio", { name: "Solid" }).click();
    await page.getByRole("radiogroup", { name: "Shadow" }).getByRole("radio", { name: "None" }).click();
    await setSlider(page, "Corner radius", 0);
    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "Large" }).click();
    await shot(page, "01-clean.png");

    // Large padding is 20 % of the screenshot's short side: 400 × 0.2 = 80 px on every side.
    expect(await outputSize(page)).toEqual({ width: 760, height: 560 });
    const { name, png: out } = await exportImage(page);
    expect(name).toBe("beautified-shot.png");
    expect([out.width, out.height]).toEqual([760, 560]);
    expect(near(at(out, 380, 280), RED)).toBe(true); // the screenshot, centred
    expect(near(at(out, 80, 80), RED)).toBe(true); // its top-left corner
    expect(near(at(out, 79, 79), CREAM)).toBe(true); // one pixel outside it: background
    expect(near(at(out, 5, 5), CREAM)).toBe(true);
    expect(near(at(out, 755, 555), CREAM)).toBe(true);
    const red = boundsOf(out, RED);
    expect([red.x0, red.y0, red.width, red.height]).toEqual([80, 80, 600, 400]); // exact placement

    // Non-destructive: the original is still in the workspace, unchanged.
    await expect(page.getByTestId("file-item")).toHaveCount(2);
    await expect(page.getByTestId("file-item").first()).toContainText("600 × 400");
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("rounded corners and a shadow are drawn, and scale with the output", async ({ page }) => {
    await open(page, solid("shot.png", 600, 400, RED));
    await page.getByTestId("beautify-bg-paper").click();
    await page.getByRole("radiogroup", { name: "Background type" }).getByRole("radio", { name: "Solid" }).click();
    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "Large" }).click();
    await setSlider(page, "Corner radius", 100);
    await page.getByRole("radiogroup", { name: "Shadow" }).getByRole("radio", { name: "Strong" }).click();
    await shot(page, "02-corners-shadow.png");
    const { png: out } = await exportImage(page);

    // The corner is rounded away: the screenshot's own corner pixel is no longer red.
    expect(near(at(out, 81, 81), RED)).toBe(false);
    expect(near(at(out, 380, 280), RED)).toBe(true); // but the middle still is
    expect(near(at(out, 380, 81), RED)).toBe(true); // and the top edge away from the corner
    // The shadow darkens the background below the card, but not the far top corner.
    const belowCard = at(out, 380, 495);
    expect(belowCard[0]).toBeLessThan(250);
    expect(near(at(out, 8, 8), WHITE, 6)).toBe(true);
  });

  test("gradient background runs across the canvas", async ({ page }) => {
    await open(page, solid("shot.png", 600, 400, RED));
    await page.getByTestId("beautify-bg-sky").click();
    await page.getByRole("radiogroup", { name: "Background type" }).getByRole("radio", { name: "Gradient" }).click();
    await page.getByRole("radiogroup", { name: "Gradient direction" }).getByRole("radio", { name: "Down right" }).click();
    await page.getByRole("radiogroup", { name: "Shadow" }).getByRole("radio", { name: "None" }).click();
    await shot(page, "03-gradient.png");
    const { png: out } = await exportImage(page);
    const start = at(out, 4, 4);
    const end = at(out, out.width - 5, out.height - 5);
    expect(near(start, [219, 234, 254])).toBe(true); // first stop
    expect(near(end, [147, 197, 253])).toBe(true); // second stop
    expect(near(start, end)).toBe(false);
    // A "Right" gradient instead: the two top corners differ, the left edge does not.
    await page.getByRole("radiogroup", { name: "Gradient direction" }).getByRole("radio", { name: "Right", exact: true }).click();
    const across = (await exportImage(page)).png;
    expect(near(at(across, 4, 4), at(across, 4, across.height - 5))).toBe(true);
    expect(near(at(across, 4, 4), at(across, across.width - 5, 4))).toBe(false);
  });

  test("browser frame adds a window above the screenshot, with window dots", async ({ page }) => {
    await open(page, solid("shot.png", 1200, 700, RED));
    await style(page, "Browser").click();
    await expect(stage(page)).toHaveAttribute("data-mode", "browser");
    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "None" }).click();
    await setSlider(page, "Corner radius", 0);
    await page.getByRole("radiogroup", { name: "Shadow" }).getByRole("radio", { name: "None" }).click();
    await shot(page, "04-browser.png");

    const chrome = Math.round(1200 * 0.055); // 66 px
    expect(await outputSize(page)).toEqual({ width: 1200, height: 700 + chrome });
    const { png: out } = await exportImage(page);
    expect([out.width, out.height]).toEqual([1200, 766]);
    // The screenshot starts exactly below the chrome strip and is not scaled.
    const red = boundsOf(out, RED);
    expect([red.x0, red.y0, red.width, red.height]).toEqual([0, chrome, 1200, 700]);
    // Three coloured window dots sit in the chrome; the strip itself is light.
    expect(near(at(out, 600, 10), [247, 245, 242])).toBe(true);
    const dots = boundsOf(out, [229, 114, 106], 40);
    expect(dots.count).toBeGreaterThan(50);
    expect(dots.y1).toBeLessThan(chrome);
  });

  test("browser address bar shows the text that was typed, and nothing from the image", async ({ page }) => {
    await open(page, solid("shot.png", 1200, 700, BLUE));
    await style(page, "Browser").click();
    await expect(page.getByTestId("beautify-address")).toHaveValue("example.com"); // neutral placeholder
    await page.getByTestId("beautify-address").fill("shotexa.app/pricing");
    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "None" }).click();
    await shot(page, "05-browser-address.png");
    const withBar = (await exportImage(page)).png;
    // The pill is a light rounded bar inside the dark-free chrome, with darker text pixels in it.
    const chrome = Math.round(1200 * 0.055);
    const band = { x: 200, y: 8, width: 900, height: chrome - 16 };
    let barPixels = 0;
    let textPixels = 0;
    for (let y = band.y; y < band.y + band.height; y++) {
      for (let x = band.x; x < band.x + band.width; x++) {
        const c = at(withBar, x, y);
        if (near(c, WHITE, 8)) barPixels++;
        else if (c[0] < 160 && c[1] < 160) textPixels++;
      }
    }
    expect(barPixels).toBeGreaterThan(1000);
    expect(textPixels).toBeGreaterThan(80); // the typed address is drawn

    // Exporting selects the new artifact, so go back to the source to keep editing it.
    await page.getByTestId("file-item").first().locator("button").first().click();
    await expect(page.getByTestId("beautify-address")).toHaveValue("shotexa.app/pricing"); // settings kept per image
    await page.getByRole("switch", { name: "Address bar" }).click();
    const without = (await exportImage(page)).png;
    let whiteAfter = 0;
    for (let y = band.y; y < band.y + band.height; y++) for (let x = band.x; x < band.x + band.width; x++) if (near(at(without, x, y), WHITE, 8)) whiteAfter++;
    expect(whiteAfter).toBeLessThan(barPixels / 4);
  });

  test("phone frame wraps the screenshot in a shell with a screen", async ({ page }) => {
    await open(page, solid("shot.png", 1170, 2532, RED));
    await style(page, "Phone").click();
    await expect(stage(page)).toHaveAttribute("data-mode", "phone");
    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "None" }).click();
    await page.getByRole("radiogroup", { name: "Shadow" }).getByRole("radio", { name: "None" }).click();
    await page.getByRole("radiogroup", { name: "Device colour" }).getByRole("radio", { name: "Graphite" }).click();
    await shot(page, "06-phone.png");
    const size = await outputSize(page);
    const { png: out } = await exportImage(page);
    expect([out.width, out.height]).toEqual([size.width, size.height]);
    // Graphite shell around the edges, screenshot in the middle.
    expect(near(at(out, Math.round(out.width / 2), 3), [28, 23, 20], 20)).toBe(true);
    expect(near(at(out, Math.round(out.width / 2), Math.round(out.height / 2)), RED)).toBe(true);
    const red = boundsOf(out, RED);
    expect(red.width).toBeLessThan(out.width); // inset by the bezel on both sides
    expect(red.width).toBeGreaterThan(out.width * 0.9);
    expect(red.x0).toBeGreaterThan(2);
  });

  test("an unusual aspect ratio is fitted into the phone, never stretched", async ({ page }) => {
    // A very wide strip: 7.5:1, nothing like a 9:19.5 phone screen.
    await open(page, solid("wide.png", 3000, 400, RED));
    await style(page, "Phone").click();
    await page.getByRole("radiogroup", { name: "Screenshot fit" }).getByRole("radio", { name: "Fit whole" }).click();
    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "None" }).click();
    await shot(page, "07-phone-wide.png");
    const contain = (await exportImage(page)).png;
    const band = boundsOf(contain, RED);
    // The whole strip is shown, at its own proportions, with screen above and below it.
    expect(band.width / band.height).toBeCloseTo(3000 / 400, 1);
    expect(band.width).toBe(3000);
    expect(band.height).toBe(400);
    expect(band.y0).toBeGreaterThan(400); // letterboxed, not stretched to the screen
    expect(near(at(contain, Math.round(contain.width / 2), band.y0 - 50), [0, 0, 0], 20)).toBe(true);

    // Filling the screen instead crops the sides; it still is not stretched.
    // (Exporting selected the new artifact, so go back to the source to keep editing it.)
    await page.getByTestId("file-item").first().locator("button").first().click();
    await expect(stage(page)).toHaveAttribute("data-mode", "phone");
    await page.getByRole("radiogroup", { name: "Screenshot fit" }).getByRole("radio", { name: "Fill screen" }).click();
    const cover = (await exportImage(page)).png;
    const filled = boundsOf(cover, RED);
    expect(filled.width / filled.height).toBeCloseTo(9 / 19.5, 1); // the screen's shape
    expect(filled.width).toBeLessThan(3000); // the strip's sides were trimmed
  });

  test("output presets give exact shapes without cropping the composition", async ({ page }) => {
    await open(page, solid("shot.png", 1170, 2532, RED));
    await page.getByRole("radiogroup", { name: "Shadow" }).getByRole("radio", { name: "None" }).click();
    await setSlider(page, "Corner radius", 0);

    await page.getByRole("radiogroup", { name: "Output size" }).getByRole("radio", { name: "1:1", exact: true }).click();
    const square = await outputSize(page);
    expect(square.width).toBe(square.height);
    const squareOut = (await exportImage(page)).png;
    expect(squareOut.width).toBe(squareOut.height);
    const inSquare = boundsOf(squareOut, RED);
    expect([inSquare.width, inSquare.height]).toEqual([1170, 2532]); // the screenshot's own pixels
    await shot(page, "08-preset-square.png");

    await page.getByRole("radiogroup", { name: "Output size" }).getByRole("radio", { name: "16:9", exact: true }).click();
    const wide = (await exportImage(page)).png;
    expect(wide.width / wide.height).toBeCloseTo(16 / 9, 2);
    const inWide = boundsOf(wide, RED);
    expect([inWide.width, inWide.height]).toEqual([1170, 2532]);

    // A fixed social size is exact, and the composition is scaled to fit inside it.
    await page.getByRole("radiogroup", { name: "Output size" }).getByRole("radio", { name: "Landscape 1200" }).click();
    const landscape = (await exportImage(page)).png;
    expect([landscape.width, landscape.height]).toEqual([1200, 630]);
    const inLandscape = boundsOf(landscape, RED);
    expect(inLandscape.height).toBeLessThanOrEqual(630);
    expect(inLandscape.width / inLandscape.height).toBeCloseTo(1170 / 2532, 1); // not distorted
  });

  test("style recipes, auto layout and local screenshot-colour sampling keep the normal renderer", async ({ page }) => {
    const { errors, outbound } = watch(page);
    await open(page, solid("shot.png", 600, 400, RED));
    await page.getByTestId("beautify-style-launch").click();
    await expect(stage(page)).toHaveAttribute("data-mode", "browser");
    await page.getByTestId("beautify-auto-layout").click();
    expect((await outputSize(page)).width / (await outputSize(page)).height).toBeCloseTo(16 / 9, 2);
    await page.getByTestId("beautify-auto-background").click();
    await page.getByRole("radiogroup", { name: "Background type" }).getByRole("radio", { name: "Gradient" }).click();
    await shot(page, "10-power-tools.png");
    const expected = await outputSize(page);
    const out = (await exportImage(page)).png;
    expect([out.width, out.height]).toEqual([expected.width, expected.height]);
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("blurred screenshot, title, glass border, custom canvas and 2× export share one renderer", async ({ page }) => {
    await open(page, halves("hero.png", 640, 400));
    await page.getByRole("radiogroup", { name: "Background type" }).getByRole("radio", { name: "Blurred shot" }).click();
    await page.getByRole("slider", { name: "Background blur" }).fill("28");
    await page.getByTestId("beautify-title").fill("Launch faster");
    await page.getByTestId("beautify-subtitle").fill("Polished locally in your browser");
    await page.getByRole("radiogroup", { name: "Border style" }).getByRole("radio", { name: "Glass" }).click();
    await page.getByRole("radiogroup", { name: "Output size" }).getByRole("radio", { name: "Custom" }).click();
    await page.getByTestId("beautify-custom-width").fill("1000");
    await page.getByTestId("beautify-custom-width").press("Enter");
    await page.getByRole("radiogroup", { name: "Export resolution scale" }).getByRole("radio", { name: "2×" }).click();
    await expect(page.getByTestId("beautify-final-dimensions")).toContainText("2000 ×");
    await shot(page, "01-beautifier-wow.png");
    const expected = await outputSize(page);
    const out = (await exportImage(page)).png;
    expect([out.width, out.height]).toEqual([expected.width, expected.height]);
  });

  test("the preview shows the same composition as the exported file", async ({ page }) => {
    await open(page, halves("halves.png", 400, 300));
    await style(page, "Browser").click();
    await page.getByTestId("beautify-bg-ember").click();
    await setSlider(page, "Composition scale", 70);
    await setSlider(page, "Horizontal position", -60);
    await shot(page, "09-parity.png");

    // Keep the preview's pixels inside the page: exporting re-renders the stage, and moving a
    // million values across the wire is far slower than comparing them here.
    await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="beautify-canvas"]')!;
      (window as unknown as { __preview: ImageData }).__preview = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    });
    const { png: out } = await exportImage(page);
    // Scale the export down to the preview's size and compare: only antialiasing may differ.
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
    // Any misplaced element would differ over a large share of the canvas.
    expect(diff).toBeLessThan(0.02);
  });

  test("undo and redo step through composition changes", async ({ page }) => {
    await open(page, solid("shot.png", 600, 400, RED));
    const undo = page.getByRole("button", { name: "Undo" }).first();
    const redo = page.getByRole("button", { name: "Redo" }).first();
    await expect(undo).toBeDisabled();

    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "Large" }).click();
    expect(await outputSize(page)).toEqual({ width: 760, height: 560 });
    await style(page, "Browser").click();
    await expect(stage(page)).toHaveAttribute("data-mode", "browser");
    await page.getByRole("radiogroup", { name: "Output size" }).getByRole("radio", { name: "1:1", exact: true }).click();
    const square = await outputSize(page);
    expect(square.width).toBe(square.height);

    await undo.click();
    expect((await outputSize(page)).width).not.toBe((await outputSize(page)).height);
    await undo.click();
    await expect(stage(page)).toHaveAttribute("data-mode", "clean");
    await undo.click();
    expect(await outputSize(page)).toEqual({ width: 600 + 2 * 48, height: 400 + 2 * 48 }); // back to the default 12 %
    await expect(undo).toBeDisabled();
    await redo.click();
    expect(await outputSize(page)).toEqual({ width: 760, height: 560 });
    await redo.click();
    await expect(stage(page)).toHaveAttribute("data-mode", "browser");

    // A slider drag is one step: several quick changes collapse.
    const before = await page.evaluate(() => document.querySelectorAll("button").length);
    expect(before).toBeGreaterThan(0);
    await setSlider(page, "Composition scale", 90);
    await setSlider(page, "Composition scale", 80);
    await setSlider(page, "Composition scale", 70);
    await undo.click();
    await expect(page.getByRole("slider", { name: "Composition scale" })).toHaveValue("100");
  });

  test("Editor → Annotate result → Beautifier, without re-upload", async ({ page }) => {
    await page.goto("/screenshot-editor");
    await page.getByTestId("file-input").setInputFiles(halves("screen.png", 800, 600));
    await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Rotate right" }).click();
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("editor-result").getByRole("link", { name: /Annotate/ }).click();
    await expect(page.getByTestId("annotate-stage")).toHaveAttribute("data-out-width", "600");
    const box = (await page.getByTestId("annotate-stage").boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 160, { steps: 6 });
    await page.mouse.up();
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);

    await page.getByTestId("annotate-result").getByRole("link", { name: /Beautifier/ }).click();
    await expect(page).toHaveURL(/\/screenshot-beautifier$/, { timeout: 60_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(stage(page)).toHaveAttribute("data-content-width", "600");
    await expect(stage(page)).toHaveAttribute("data-content-height", "800");
    await page.getByRole("radiogroup", { name: "Padding" }).getByRole("radio", { name: "None" }).click();
    await page.getByRole("radiogroup", { name: "Shadow" }).getByRole("radio", { name: "None" }).click();
    await setSlider(page, "Corner radius", 0);
    const { name, png: out } = await exportImage(page);
    expect(name).toBe("beautified-annotated-edited-screen.png");
    expect([out.width, out.height]).toEqual([600, 800]);
    // Rotated clockwise: the red left half is now the top half.
    expect(near(at(out, 300, 100), RED, 30)).toBe(true);
    expect(near(at(out, 300, 700), BLUE, 30)).toBe(true);
    await expect(page.getByTestId("file-item").last().locator("button").first()).toHaveAttribute("aria-pressed", "true");
  });

  test("Smart Stitch result → Beautifier, without re-upload", async ({ page }) => {
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([join(FIXTURE_DIR, "chat-light/a.png"), join(FIXTURE_DIR, "chat-light/b.png")]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
    await expect(page.getByTestId("stitch-result")).toBeVisible({ timeout: 120_000 });

    await page.getByTestId("stitch-result").getByRole("link", { name: /Beautifier/ }).click();
    await expect(page).toHaveURL(/\/screenshot-beautifier$/, { timeout: 60_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(stage(page)).toHaveAttribute("data-content-width", "1170");
    await expect(stage(page)).toHaveAttribute("data-content-height", "3792");
    await style(page, "Phone").click();
    const size = await outputSize(page);
    const { name, png: out } = await exportImage(page);
    expect(name).toBe("beautified-stitched-screenshot.png");
    expect([out.width, out.height]).toEqual([size.width, size.height]);
    // Filling the screen crops a long stitch to the phone's shape — it is never squashed.
    expect(out.height).toBeLessThan(3792);
    expect((out.width - 2 * 150) / (out.height - 2 * 150)).toBeCloseTo(1252 / 2617, 1);

    // Fitting the whole thing instead keeps every row, letterboxed on a taller screen.
    await page.getByTestId("file-item").last().locator("button").first().click();
    await expect(page.getByTestId("file-item").last()).toContainText("beautified-stitched-screenshot.png");
    await page.getByTestId("file-item").nth(2).locator("button").first().click();
    await expect(stage(page)).toHaveAttribute("data-content-width", /\d+/);
    await page.getByRole("radiogroup", { name: "Screenshot fit" }).getByRole("radio", { name: "Fit whole" }).click();
    const whole = (await exportImage(page)).png;
    expect(whole.height).toBeGreaterThan(3792);
  });

  test("mobile: preview, settings sheet, sticky export", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = watch(page);
    await open(page, solid("phone.png", 1170, 2532, RED));
    const box = (await stage(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(120);
    expect(box.height).toBeGreaterThan(260);
    for (const name of ["Beautifier settings", "Undo", "Redo", "Export"]) {
      const target = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(target.height, name).toBeGreaterThanOrEqual(44);
    }
    await shot(page, "10-mobile.png");

    await page.getByRole("button", { name: "Beautifier settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Beautifier settings" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radiogroup", { name: "Composition style" }).getByRole("radio", { name: "Phone", exact: true }).click();
    await expect(stage(page)).toHaveAttribute("data-mode", "phone");
    for (const radio of await sheet.getByRole("radiogroup", { name: "Background preset" }).getByRole("radio").all()) {
      expect((await radio.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await sheet.getByTestId("beautify-bg-slate").click();
    await shot(page, "11-mobile-sheet.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    const size = await outputSize(page);
    const { png: out } = await exportImage(page, page.getByRole("button", { name: "Export", exact: true }));
    expect([out.width, out.height]).toEqual([size.width, size.height]);
    expect(near(at(out, 4, 4), [28, 23, 20], 20)).toBe(true); // the slate background
    expect(errors).toEqual([]);
  });
});

test("homepage does not load the Beautifier", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  const scripts: string[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") scripts.push(await r.text().catch(() => ""));
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  expect(scripts.length).toBeGreaterThan(0);
  // Strings only the Beautifier's UI contains.
  expect(scripts.filter((s) => s.includes("The preview shows exactly what will be exported") || s.includes("The phone shell keeps its own rounding"))).toEqual([]);
});
