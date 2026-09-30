/**
 * Phase 2J Compress Screenshot + Convert Screenshot — production routes, real Image Worker.
 *
 * Fixtures are made by the browser's own encoders (JPEG, WebP, transparent PNG). Every output
 * is checked by its file signature, decoded again in the browser, and sampled: dimensions,
 * format, transparency and the JPEG background colour are verified from pixels.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

type RGBA = [number, number, number, number];
type Kind = "noise" | "halves" | "gradient";

const capture = !!process.env.CAPTURE_PHASE2J;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2j/screenshots");

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: false });
}

/**
 * Draw a fixture and encode it with the browser: "noise" (large when lossless), "halves" (left
 * half fully transparent, right half red) or "gradient".
 */
async function makeImage(page: Page, name: string, o: { width: number; height: number; type: string; quality?: number; kind: Kind }) {
  const b64 = await page.evaluate(async ({ width, height, type, quality, kind }) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const x = c.getContext("2d")!;
    if (kind === "halves") {
      x.clearRect(0, 0, width, height);
      x.fillStyle = "rgb(220, 40, 40)";
      x.fillRect(Math.floor(width / 2), 0, width - Math.floor(width / 2), height);
    } else if (kind === "gradient") {
      const g = x.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, "#1d4ed8");
      g.addColorStop(1, "#f59e0b");
      x.fillStyle = g;
      x.fillRect(0, 0, width, height);
    } else {
      const img = x.createImageData(width, height);
      let seed = 7;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        img.data[i] = seed & 255;
        img.data[i + 1] = (seed >> 8) & 255;
        img.data[i + 2] = (seed >> 16) & 255;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    }
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, quality));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, o);
  return { name, mimeType: o.type, buffer: Buffer.from(b64, "base64") };
}

/** Decode a file with the browser and sample pixels (RGBA). */
async function decode(page: Page, buffer: Buffer, type: string, points: [number, number][]) {
  return page.evaluate(
    async ([b64, type, points]) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type }));
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const x = c.getContext("2d")!;
      x.drawImage(bitmap, 0, 0);
      const samples = points.map(([px, py]) => Array.from(x.getImageData(px, py, 1, 1).data));
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return { ...size, samples };
    },
    [buffer.toString("base64"), type, points] as const,
  ) as Promise<{ width: number; height: number; samples: RGBA[] }>;
}

function signature(buffer: Buffer): "png" | "jpeg" | "webp" | "unknown" {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return "unknown";
}

const near = (got: number[], want: number[], tolerance = 24) => want.every((v, i) => Math.abs(got[i] - v) <= tolerance);

async function open(page: Page, route: string, files: Parameters<Page["setInputFiles"]>[1]) {
  await page.goto(route);
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByTestId("encode-workspace")).toBeVisible({ timeout: 30_000 });
}

/** The primary action: encode (or reuse the checked result), save as an artifact, download. */
async function exportFile(page: Page, trigger = page.getByTestId("export")) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), trigger.click()]);
  await expect(page.getByTestId("encode-result")).toBeVisible({ timeout: 120_000 });
  return { name: download.suggestedFilename(), buffer: readFileSync((await download.path())!) };
}

async function checkSize(page: Page) {
  await page.getByTestId("encode-check").click();
  const cmp = page.getByTestId("encode-comparison");
  await expect(cmp).toBeVisible({ timeout: 120_000 });
  return cmp;
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

const format = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Output format" }).getByRole("radio", { name });

test.describe.configure({ timeout: 180_000 });

test.describe("Phase 2J Compress + Convert", () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test.beforeEach(({ browserName }) => {
    // Same host limitation as Phases 2D–2I: this machine's Playwright Firefox fails to create a
    // page before app code loads. Chromium and WebKit (main-thread fallback) cover the flows.
    test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  });

  test("JPEG → compressed JPEG: smaller, same size, valid, source unchanged, local", async ({ page }) => {
    const { errors, outbound } = watch(page);
    await page.goto("/compress-screenshot");
    const input = await makeImage(page, "photo.jpg", { width: 800, height: 600, type: "image/jpeg", quality: 1, kind: "noise" });
    await open(page, "/compress-screenshot", input);
    await expect(format(page, "JPEG · original")).toHaveAttribute("aria-checked", "true"); // format kept by default
    await expect(page.getByTestId("encode-quality-value")).toHaveText("80%");
    const cmp = await checkSize(page);
    await expect(cmp).toHaveAttribute("data-outcome", "smaller");
    const checked = Number(await cmp.getAttribute("data-output"));
    await shot(page, "01-compress-jpeg.png");

    const out = await exportFile(page);
    expect(out.name).toBe("compressed-photo.jpg");
    expect(signature(out.buffer)).toBe("jpeg");
    expect(out.buffer.length).toBeLessThan(input.buffer.length);
    const decoded = await decode(page, out.buffer, "image/jpeg", [[400, 300]]);
    expect([decoded.width, decoded.height]).toEqual([800, 600]);
    // The checked result was reused (no second encode): its size is exactly the downloaded file's.
    expect(out.buffer.length).toBe(checked);
    await expect(page.getByTestId("file-item")).toHaveCount(2);
    await expect(page.getByTestId("file-item").first()).toContainText("photo.jpg");
    await expect(page.getByTestId("file-item").first()).toContainText("800 × 600");
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("JPEG → WebP", async ({ page }) => {
    await page.goto("/compress-screenshot");
    const input = await makeImage(page, "photo.jpg", { width: 640, height: 480, type: "image/jpeg", quality: 0.95, kind: "gradient" });
    await open(page, "/compress-screenshot", input);
    await format(page, "WebP").click();
    const out = await exportFile(page);
    expect(out.name).toBe("compressed-photo.webp");
    expect(signature(out.buffer)).toBe("webp");
    const d = await decode(page, out.buffer, "image/webp", [[5, 5]]);
    expect([d.width, d.height]).toEqual([640, 480]);
    expect(near(d.samples[0], [29, 78, 216, 255], 30)).toBe(true); // gradient starts blue
  });

  test("transparent PNG → JPEG on the default white background", async ({ page }) => {
    await page.goto("/convert-screenshot");
    const input = await makeImage(page, "logo.png", { width: 400, height: 300, type: "image/png", kind: "halves" });
    await open(page, "/convert-screenshot", input);
    await expect(format(page, "JPEG")).toHaveAttribute("aria-checked", "true"); // PNG → JPEG by default
    await expect(page.getByTestId("encode-alpha-note")).toContainText("has transparent areas");
    await expect(page.getByRole("radiogroup", { name: "JPEG background" }).getByRole("radio", { name: "White" })).toHaveAttribute("aria-checked", "true");
    await shot(page, "02-convert-transparent-to-jpeg.png");
    const out = await exportFile(page);
    expect(out.name).toBe("logo.jpg");
    expect(signature(out.buffer)).toBe("jpeg");
    const d = await decode(page, out.buffer, "image/jpeg", [
      [100, 150],
      [300, 150],
    ]);
    expect([d.width, d.height]).toEqual([400, 300]);
    expect(near(d.samples[0], [255, 255, 255, 255])).toBe(true); // white, never black
    expect(near(d.samples[1], [220, 40, 40, 255])).toBe(true);
  });

  test("transparent PNG → JPEG on a custom background", async ({ page }) => {
    await page.goto("/convert-screenshot");
    const input = await makeImage(page, "logo.png", { width: 400, height: 300, type: "image/png", kind: "halves" });
    await open(page, "/convert-screenshot", input);
    await page.getByTestId("encode-background-custom").fill("#3366cc");
    const out = await exportFile(page);
    const d = await decode(page, out.buffer, "image/jpeg", [
      [100, 150],
      [300, 150],
    ]);
    expect(near(d.samples[0], [51, 102, 204, 255])).toBe(true);
    expect(near(d.samples[1], [220, 40, 40, 255])).toBe(true);
  });

  test("transparent PNG → WebP keeps transparency", async ({ page }) => {
    await page.goto("/convert-screenshot");
    const input = await makeImage(page, "logo.png", { width: 400, height: 300, type: "image/png", kind: "halves" });
    await open(page, "/convert-screenshot", input);
    await format(page, "WebP").click();
    await expect(page.getByTestId("encode-alpha-note")).toHaveCount(0); // no background needed
    const out = await exportFile(page);
    expect(out.name).toBe("logo.webp");
    expect(signature(out.buffer)).toBe("webp");
    const d = await decode(page, out.buffer, "image/webp", [
      [100, 150],
      [300, 150],
    ]);
    expect([d.width, d.height]).toEqual([400, 300]);
    expect(d.samples[0][3]).toBeLessThanOrEqual(10); // still transparent
    expect(near(d.samples[1], [220, 40, 40, 255])).toBe(true);
  });

  test("WebP → PNG, and WebP's size limit is explained before encoding", async ({ page }) => {
    await page.goto("/convert-screenshot");
    const input = await makeImage(page, "chart.webp", { width: 500, height: 400, type: "image/webp", quality: 1, kind: "gradient" });
    await open(page, "/convert-screenshot", input);
    await expect(format(page, "PNG")).toHaveAttribute("aria-checked", "true"); // WebP → PNG by default
    const out = await exportFile(page);
    expect(out.name).toBe("chart.png");
    expect(signature(out.buffer)).toBe("png");
    const png = PNG.sync.read(out.buffer);
    expect([png.width, png.height]).toEqual([500, 400]);

    // A 17,000 px-tall PNG can't become WebP (16,383 px limit): say so, don't truncate.
    const tall = new PNG({ width: 100, height: 17_000 });
    tall.data.fill(255);
    await page.getByTestId("file-input").setInputFiles({ name: "tall.png", mimeType: "image/png", buffer: PNG.sync.write(tall) });
    await expect(page.getByTestId("file-item")).toHaveCount(3); // source, converted result, tall.png
    await page.getByTestId("file-item").last().locator("button").first().click();
    await expect(page.getByTestId("encode-original-meta")).toContainText("100 × 17000");
    await format(page, "WebP").click();
    await expect(page.getByTestId("encode-issue")).toContainText("16,383 px");
    await expect(page.getByTestId("encode-check")).toBeDisabled();
    await expect(page.getByTestId("export")).toBeDisabled();
  });

  test("size comparison shows the exact original, new size, bytes and percent saved", async ({ page }) => {
    await page.goto("/compress-screenshot");
    const input = await makeImage(page, "photo.jpg", { width: 800, height: 600, type: "image/jpeg", quality: 1, kind: "noise" });
    await open(page, "/compress-screenshot", input);
    await page.getByRole("slider", { name: "JPEG quality" }).fill("60");
    await expect(page.getByTestId("encode-quality-value")).toHaveText("60%");
    const cmp = await checkSize(page);
    const shown = {
      original: Number(await cmp.getAttribute("data-original")),
      output: Number(await cmp.getAttribute("data-output")),
      saved: Number(await cmp.getAttribute("data-saved")),
      percent: Number(await cmp.getAttribute("data-percent")),
      savedText: await page.getByTestId("encode-saved").innerText(),
    };
    const out = await exportFile(page);
    const original = input.buffer.length;
    const output = out.buffer.length;
    const percent = Math.round(((original - output) / original) * 100);
    // Every number shown matches the real files byte for byte.
    expect(shown).toMatchObject({ original, output, saved: original - output, percent });
    expect(shown.savedText).toContain(`(${percent}%)`);
    await expect(page.getByTestId("encode-result")).toContainText(`(${percent}% saved)`);
  });

  test("a larger result is reported as larger, and a suggestion is only applied on request", async ({ page }) => {
    await page.goto("/compress-screenshot");
    const input = await makeImage(page, "small.jpg", { width: 800, height: 600, type: "image/jpeg", quality: 0.5, kind: "noise" });
    await open(page, "/compress-screenshot", input);
    await page.getByRole("slider", { name: "JPEG quality" }).fill("100");
    const cmp = await checkSize(page);
    await expect(cmp).toHaveAttribute("data-outcome", "larger");
    const atMax = Number(await cmp.getAttribute("data-output"));
    await expect(page.getByTestId("encode-larger")).toBeVisible();
    await expect(page.getByTestId("encode-saved")).toContainText("+");
    await expect(cmp.getByText("Saved", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("encode-suggestion")).toContainText("Lower the quality to 80%");
    await shot(page, "03-compress-larger.png");
    await expect(page.getByTestId("encode-quality-value")).toHaveText("100%"); // untouched until asked

    await page.getByTestId("encode-suggestion").getByRole("button", { name: /Try it/ }).click();
    await expect(page.getByTestId("encode-quality-value")).toHaveText("80%");
    // Re-encoded at the suggested setting: smaller than at 100%.
    await expect.poll(async () => Number(await cmp.getAttribute("data-output")), { timeout: 60_000 }).toBeLessThan(atMax);
  });

  test("Editor → Annotate result → Compress, without re-upload", async ({ page }) => {
    await page.goto("/screenshot-editor");
    const input = await makeImage(page, "screen.png", { width: 600, height: 400, type: "image/png", kind: "gradient" });
    await page.goto("/screenshot-editor");
    await page.getByTestId("file-input").setInputFiles(input);
    await page.getByRole("button", { name: "Rotate right" }).click();
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("editor-result").getByRole("link", { name: /Annotate/ }).click();
    await expect(page.getByTestId("annotate-stage")).toHaveAttribute("data-out-width", "400");
    const stage = (await page.getByTestId("annotate-stage").boundingBox())!;
    await page.mouse.move(stage.x + 40, stage.y + 40);
    await page.mouse.down();
    await page.mouse.move(stage.x + 200, stage.y + 200, { steps: 6 });
    await page.mouse.up();
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("annotate-result").getByRole("link", { name: /Compress/ }).click();
    await expect(page).toHaveURL(/\/compress-screenshot$/, { timeout: 60_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(page.getByTestId("encode-original-meta")).toContainText("400 × 600");

    await format(page, "WebP").click();
    const out = await exportFile(page);
    expect(out.name).toBe("compressed-annotated-edited-screen.webp");
    const d = await decode(page, out.buffer, "image/webp", [[120, 120]]); // on the arrow's shaft
    expect([d.width, d.height]).toEqual([400, 600]);
    expect(near(d.samples[0], [229, 56, 59, 255], 60)).toBe(true); // the arrow's colour survived
  });

  test("Split piece → Convert, without re-upload", async ({ page }) => {
    await page.goto("/split-long-screenshot");
    const input = await makeImage(page, "long.png", { width: 300, height: 1200, type: "image/png", kind: "gradient" });
    await page.goto("/split-long-screenshot");
    await page.getByTestId("file-input").setInputFiles(input);
    await page.getByTestId("export").click();
    await page.getByTestId("split-add-to-workspace").click();
    await page.getByTestId("split-result").getByRole("link", { name: /Convert/ }).click();
    await expect(page).toHaveURL(/\/convert-screenshot$/, { timeout: 60_000 });
    await expect(page.getByTestId("encode-original-meta")).toContainText("300 × 600");
    await format(page, "WebP").click();
    const out = await exportFile(page);
    expect(out.name).toBe("shotexa-split-01.webp");
    const d = await decode(page, out.buffer, "image/webp", [[2, 2]]);
    expect([d.width, d.height]).toEqual([300, 600]);
  });

  test("mobile Compress: settings sheet, check size, sticky export", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = watch(page);
    await page.goto("/compress-screenshot");
    const input = await makeImage(page, "phone.jpg", { width: 1170, height: 2532, type: "image/jpeg", quality: 1, kind: "gradient" });
    await open(page, "/compress-screenshot", input);
    const check = page.getByRole("button", { name: "Check file size" }).first();
    expect((await check.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const name of ["Compress settings", "Export"]) {
      expect((await page.getByRole("button", { name, exact: true }).boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Compress settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Compress settings" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radio", { name: "WebP" }).click();
    for (const radio of await sheet.getByRole("radiogroup", { name: "Output format" }).getByRole("radio").all()) {
      expect((await radio.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await sheet.getByRole("slider", { name: "WebP quality" }).fill("70");
    await expect(sheet.getByTestId("encode-quality-value")).toHaveText("70%");
    await shot(page, "04-compress-mobile-sheet.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await check.click();
    await expect(page.getByTestId("encode-comparison")).toHaveAttribute("data-outcome", "smaller", { timeout: 120_000 });
    await shot(page, "05-compress-mobile.png");
    const out = await exportFile(page, page.getByRole("button", { name: "Export", exact: true }));
    expect(signature(out.buffer)).toBe("webp");
    const d = await decode(page, out.buffer, "image/webp", [[0, 0]]);
    expect([d.width, d.height]).toEqual([1170, 2532]);
    expect(errors).toEqual([]);
  });

  test("mobile Convert: transparent PNG → JPEG on cream", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/convert-screenshot");
    const input = await makeImage(page, "logo.png", { width: 600, height: 400, type: "image/png", kind: "halves" });
    await open(page, "/convert-screenshot", input);
    await page.getByRole("button", { name: "Convert settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Convert settings" });
    const cream = sheet.getByRole("radio", { name: "Cream" });
    expect((await cream.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await cream.click();
    await expect(sheet.getByTestId("encode-alpha-note")).toContainText("has transparent areas");
    await page.keyboard.press("Escape");
    const out = await exportFile(page, page.getByRole("button", { name: "Export", exact: true }));
    expect(out.name).toBe("logo.jpg");
    const d = await decode(page, out.buffer, "image/jpeg", [
      [150, 200],
      [450, 200],
    ]);
    expect([d.width, d.height]).toEqual([600, 400]);
    expect(near(d.samples[0], [247, 241, 227, 255])).toBe(true);
    expect(near(d.samples[1], [220, 40, 40, 255])).toBe(true);
    await shot(page, "06-convert-mobile.png");
  });
});

test("homepage does not load the Compress/Convert tools", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host.");
  const scripts: string[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") scripts.push(await r.text().catch(() => ""));
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  expect(scripts.length).toBeGreaterThan(0);
  // A string only the Compress/Convert UI contains (the encoder core is imported on demand).
  expect(scripts.filter((s) => s.includes("PNG is lossless: every pixel is kept exactly"))).toEqual([]);
});
