/**
 * Phase 2K stabilisation — the whole product, end to end, on production routes.
 *
 * 1. Cross-tool chains without re-upload: every hop is a Continue with link, every result is a
 *    new artifact that becomes the selection, and names carry the lineage.
 * 2. Shared-encoder regression after the Phase 2J consolidation: PNG/JPEG/WebP exports from
 *    Stitch, Editor, Annotation, Combine and Split decode, keep their size and transparency (or
 *    background), are never truncated, and very large JPEG/WebP requests fail in a controlled way.
 * 3. Product surface: routes, navigation, sitemap/robots and homepage lazy loading.
 */
import { expect, test, type Download, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";
import { gzipSync } from "node:zlib";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

type RGB = [number, number, number];
type RGBA = [number, number, number, number];
const STITCH_A = join(FIXTURE_DIR, "chat-light/a.png");
const STITCH_B = join(FIXTURE_DIR, "chat-light/b.png");
const RECEIPT = join(process.cwd(), "src/tests/fixtures/ocr/receipt/image.png");
const RED: RGB = [220, 40, 40];
const BLUE: RGB = [40, 80, 200];

function png(name: string, width: number, height: number, pixel: (x: number, y: number) => RGBA) {
  const p = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) p.data.set(pixel(x, y), (y * width + x) * 4);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(p) };
}
const solid = (name: string, width: number, height: number, c: RGB) => png(name, width, height, () => [...c, 255]);
/** Left half fully transparent, right half red. */
const halves = (name = "halves.png", width = 400, height = 300) => png(name, width, height, (x) => (x < width / 2 ? [0, 0, 0, 0] : [...RED, 255]));
/** Every row y has red + 256 × green = y, so truncation or misplacement is visible. */
const rowCoded = (name: string, width: number, height: number) => png(name, width, height, (_x, y) => [y & 255, (y >> 8) & 255, 128, 255]);
const quadrants = (name = "quad.png", width = 600, height = 400) =>
  png(name, width, height, (x, y): RGBA => (y < height / 2 ? (x < width / 2 ? [...RED, 255] : [40, 170, 70, 255]) : x < width / 2 ? [...BLUE, 255] : [230, 200, 40, 255]));

function signature(buffer: Buffer): "png" | "jpeg" | "webp" | "pdf" | "unknown" {
  if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  return "unknown";
}

/** Decode with the browser (any format) and sample RGBA pixels. */
async function decode(page: Page, buffer: Buffer, points: [number, number][]) {
  return page.evaluate(
    async ([b64, points]) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const x = c.getContext("2d")!;
      x.drawImage(bitmap, 0, 0);
      const out = { width: bitmap.width, height: bitmap.height, samples: points.map(([px, py]) => Array.from(x.getImageData(px, py, 1, 1).data)) };
      bitmap.close();
      c.width = 0;
      return out;
    },
    [buffer.toString("base64"), points] as const,
  ) as Promise<{ width: number; height: number; samples: RGBA[] }>;
}

const near = (got: number[], want: number[], tolerance = 24) => want.every((v, i) => Math.abs(got[i] - v) <= tolerance);

async function saved(download: Download) {
  return { name: download.suggestedFilename(), buffer: readFileSync((await download.path())!) };
}

/** Click the tool's primary export and return the downloaded file. */
async function exportDownload(page: Page, resultTestId: string) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export").click()]);
  await expect(page.getByTestId(resultTestId)).toBeVisible({ timeout: 180_000 });
  return saved(download);
}

async function continueTo(page: Page, resultTestId: string, tool: RegExp, url: RegExp) {
  await page.getByTestId(resultTestId).getByRole("link", { name: tool }).click();
  await expect(page).toHaveURL(url, { timeout: 60_000 });
}

/** The newest file is the selected one (a new artifact always becomes the selection). */
async function expectNewestSelected(page: Page, count: number, name?: string) {
  const items = page.getByTestId("file-item");
  await expect(items).toHaveCount(count);
  await expect(items.last().locator("button").first()).toHaveAttribute("aria-pressed", "true");
  if (name) await expect(items.last()).toContainText(name);
}

async function drag(page: Page, testId: string, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
  await page.mouse.up();
}

async function setField(page: Page, testId: string, value: number) {
  await page.getByTestId(testId).fill(String(value));
  await page.getByTestId(testId).press("Enter");
}

/** Pick an export format in whichever inspector is showing (they all share `exportSettings`). */
async function chooseFormat(page: Page, label: "PNG" | "JPEG" | "WebP") {
  const group = page.getByRole("radiogroup", { name: /export format/i });
  if (!(await group.isVisible())) await page.getByRole("button", { name: /advanced options|output options/i }).click();
  await group.getByRole("radio", { name: label, exact: true }).click();
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

test.describe.configure({ timeout: 360_000 });
test.use({ viewport: { width: 1440, height: 960 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName === "firefox", "Local Playwright Firefox cannot create a page on this host (see Phase 2D–2J).");
});

test.describe("cross-tool chains without re-upload", () => {
  test("Smart Stitch → Editor → Annotate → Safe Share → OCR → PDF", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "OCR in this chain runs the production OCR engine, covered cross-browser by its own smoke test.");
    const { errors, outbound } = watch(page);
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([STITCH_A, STITCH_B]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    const stitched = await exportDownload(page, "stitch-result");
    await expectNewestSelected(page, 3, "stitched-screenshot.png");

    await continueTo(page, "stitch-result", /Editor/, /\/screenshot-editor$/);
    await setField(page, "crop-height", 2000);
    const edited = await exportDownload(page, "editor-result");
    expect(edited.name).toBe("edited-stitched-screenshot.png");
    await expectNewestSelected(page, 4, edited.name);

    await continueTo(page, "editor-result", /Annotate/, /\/annotate-screenshot$/);
    await expect(page.getByTestId("annotate-stage")).toHaveAttribute("data-out-height", "2000");
    await drag(page, "annotate-stage", [0.5, 0.05], [0.8, 0.2]);
    const annotated = await exportDownload(page, "annotate-result");
    expect(annotated.name).toBe("annotated-edited-stitched-screenshot.png");
    await expectNewestSelected(page, 5, annotated.name);

    await continueTo(page, "annotate-result", /Safe Share/, /\/redact-screenshot$/);
    const stage = page.getByLabel(/Screenshot redaction canvas/);
    await expect(stage).toBeVisible({ timeout: 30_000 });
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("redaction-region")).toHaveCount(1);
    const safe = await exportDownload(page, "safe-share-result");
    await expectNewestSelected(page, 6);

    await continueTo(page, "safe-share-result", /Extract Text/, /\/screenshot-to-text$/);
    await expect(page.getByTestId("file-item").last().locator("button").first()).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("extract-text").click();
    await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 240_000 });
    expect((await page.getByTestId("ocr-result-text").inputValue()).trim().length).toBeGreaterThan(20);

    await continueTo(page, "ocr-result", /Open PDF/, /\/screenshot-to-pdf$/);
    await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 120_000 });
    // PDF takes the selected artifact alone — the Safe Share copy, not the originals.
    await expect(page.getByTestId("pdf-image-0")).toContainText(safe.name);
    await expect(page.getByTestId("pdf-image-1")).toHaveCount(0);
    const pdf = await exportDownload(page, "pdf-result");
    expect(signature(pdf.buffer)).toBe("pdf");
    expect((await PDFDocument.load(pdf.buffer)).getPageCount()).toBeGreaterThanOrEqual(1);

    // Every intermediate result was a real, decodable image of the expected size.
    expect((await decode(page, stitched.buffer, [])).height).toBe(3792);
    expect(await decode(page, edited.buffer, [])).toMatchObject({ width: 1170, height: 2000 });
    expect(await decode(page, annotated.buffer, [])).toMatchObject({ width: 1170, height: 2000 });
    expect(await decode(page, safe.buffer, [])).toMatchObject({ width: 1170, height: 2000 });
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Combine → Split → Editor → Compress", async ({ page }) => {
    const { errors, outbound } = watch(page);
    await page.goto("/combine-screenshots");
    await page.getByTestId("file-input").setInputFiles([solid("red.png", 120, 60, RED), solid("blue.png", 80, 100, BLUE)]);
    await expect(page.getByTestId("combine-preview")).toBeVisible({ timeout: 30_000 });
    await exportDownload(page, "combine-result");
    await expectNewestSelected(page, 3);

    await continueTo(page, "combine-result", /Split/, /\/split-long-screenshot$/);
    await expect(page.getByTestId("split-stage")).toHaveAttribute("data-height", "176");
    await page.getByTestId("export").click();
    await expect(page.getByTestId("split-result")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("split-add-to-workspace").click();
    // Pieces join as artifacts; the first piece is selected.
    await expect(page.getByTestId("file-item")).toHaveCount(5);
    await expect(page.getByTestId("file-item").nth(3).locator("button").first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("file-item").nth(3)).toContainText("shotexa-split-01.png");

    await continueTo(page, "split-result", /Editor/, /\/screenshot-editor$/);
    await expect(page.getByTestId("editor-output-size")).toHaveText("120 × 88 px");
    await page.getByRole("button", { name: "Rotate right" }).click();
    const edited = await exportDownload(page, "editor-result");
    expect(edited.name).toBe("edited-shotexa-split-01.png");
    await expectNewestSelected(page, 6, edited.name);

    await continueTo(page, "editor-result", /Compress/, /\/compress-screenshot$/);
    await page.getByRole("radiogroup", { name: "Output format" }).getByRole("radio", { name: "WebP" }).click();
    const out = await exportDownload(page, "encode-result");
    expect(out.name).toBe("compressed-edited-shotexa-split-01.webp");
    expect(signature(out.buffer)).toBe("webp");
    const d = await decode(page, out.buffer, [
      // Piece 1 is combined rows 0–87: red 0–59, clear gap 60–75, blue 76–87. Turned clockwise,
      // source row y lands in column 87 − y: red on the right, the gap at columns 12–27.
      [80, 60],
      [20, 60],
    ]);
    expect([d.width, d.height]).toEqual([88, 120]);
    expect(near(d.samples[0], [...RED, 255], 40)).toBe(true);
    expect(d.samples[1][3]).toBeLessThanOrEqual(10); // transparency survived Combine → Split → Editor → WebP
    await expectNewestSelected(page, 7, out.name);
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Editor → Annotate → Convert", async ({ page }) => {
    await page.goto("/screenshot-editor");
    await page.getByTestId("file-input").setInputFiles(quadrants());
    await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Flip horizontal" }).click();
    await exportDownload(page, "editor-result");
    await continueTo(page, "editor-result", /Annotate/, /\/annotate-screenshot$/);
    await drag(page, "annotate-stage", [0.1, 0.1], [0.4, 0.4]);
    await exportDownload(page, "annotate-result");
    await continueTo(page, "annotate-result", /Convert/, /\/convert-screenshot$/);
    await expect(page.getByTestId("encode-original-meta")).toContainText("600 × 400");
    const out = await exportDownload(page, "encode-result");
    expect(out.name).toBe("annotated-edited-quad.jpg");
    expect(signature(out.buffer)).toBe("jpeg");
    const d = await decode(page, out.buffer, [
      [450, 50], // mirrored: red top-left moved to the top-right
      [150, 350],
    ]);
    expect([d.width, d.height]).toEqual([600, 400]);
    expect(near(d.samples[0], [...RED, 255], 30)).toBe(true);
    expect(near(d.samples[1], [230, 200, 40, 255], 30)).toBe(true);
    await expectNewestSelected(page, 4, out.name);
  });

  test("Safe Share → OCR → Searchable PDF", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Production OCR cross-browser coverage stays in the OCR suites.");
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(RECEIPT);
    const canvas = page.getByLabel(/Screenshot redaction canvas/);
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.9);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.97, { steps: 6 });
    await page.mouse.up();
    const safe = await exportDownload(page, "safe-share-result");
    await continueTo(page, "safe-share-result", /Extract Text/, /\/screenshot-to-text$/);
    await page.getByTestId("extract-text").click();
    await expect(page.getByTestId("ocr-result-text")).toBeVisible({ timeout: 240_000 });
    await continueTo(page, "ocr-result", /Open Searchable PDF/, /\/screenshot-to-searchable-pdf$/);
    await expect(page.getByText("Text layer ready").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("pdf-image-0")).toContainText(safe.name);
    const out = await exportDownload(page, "searchable-pdf-result");
    expect(signature(out.buffer)).toBe("pdf");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(out.buffer), useWorkerFetch: false }).promise;
    const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
    expect(text).toMatch(/Corner\s*Cafe/i); // the OCR text layer came along, no second OCR run
  });

  test("Split piece → Combine", async ({ page }) => {
    await page.goto("/split-long-screenshot");
    await page.getByTestId("file-input").setInputFiles(rowCoded("long.png", 300, 1200));
    await expect(page.getByTestId("split-stage")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("split-count").fill("3");
    await page.getByTestId("split-count").press("Enter");
    await page.getByTestId("export").click();
    await expect(page.getByTestId("split-result")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("split-add-to-workspace").click();
    await expect(page.getByTestId("file-item")).toHaveCount(4);

    await continueTo(page, "split-result", /Combine/, /\/combine-screenshots$/);
    await expect(page.getByTestId("combine-preview")).toBeVisible({ timeout: 30_000 });
    // With a piece selected, Combine takes the pieces — never the original they were cut from.
    await page.getByRole("radio", { name: "Clear" }).click();
    const out = await exportDownload(page, "combine-result");
    expect(signature(out.buffer)).toBe("png");
    const p = PNG.sync.read(out.buffer);
    expect(p.width).toBe(300);
    const gap = (p.height - 1200) / 2;
    expect(gap).toBeGreaterThanOrEqual(0); // three 400 px pieces and two equal gaps
    const rowAt = (y: number) => p.data[y * p.width * 4] + 256 * p.data[y * p.width * 4 + 1];
    expect([rowAt(0), rowAt(399), rowAt(400 + gap), rowAt(799 + gap), rowAt(p.height - 1)]).toEqual([0, 399, 400, 799, 1199]);
    await expectNewestSelected(page, 5);
  });
});

test.describe("shared encoder regression", () => {
  test("Smart Stitch exports decode as PNG, JPEG and WebP at full size", async ({ page }) => {
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([STITCH_A, STITCH_B]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    for (const [label, kind] of [
      ["JPEG", "jpeg"],
      ["WebP", "webp"],
      ["PNG", "png"],
    ] as const) {
      await chooseFormat(page, label);
      const out = await exportDownload(page, "stitch-result");
      expect(signature(out.buffer), label).toBe(kind);
      const d = await decode(page, out.buffer, [[585, 3791]]);
      expect([d.width, d.height], label).toEqual([1170, 3792]); // not truncated
      expect(d.samples[0][3]).toBe(255);
    }
  });

  test("transparency: PNG/WebP keep it, JPEG gets white — Editor and Annotation", async ({ page }) => {
    await page.goto("/screenshot-editor");
    await page.getByTestId("file-input").setInputFiles(halves());
    await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Flip horizontal" }).click(); // red now left, clear right
    const results: Record<string, RGBA[]> = {};
    for (const label of ["PNG", "WebP", "JPEG"] as const) {
      await page.getByTestId("file-item").first().locator("button").first().click();
      await chooseFormat(page, label);
      const out = await exportDownload(page, "editor-result");
      const d = await decode(page, out.buffer, [
        [100, 150],
        [300, 150],
      ]);
      expect([d.width, d.height], label).toEqual([400, 300]);
      results[label] = d.samples;
    }
    expect(near(results.PNG[0], [...RED, 255])).toBe(true);
    expect(results.PNG[1][3]).toBe(0);
    expect(results.WebP[1][3]).toBeLessThanOrEqual(10);
    expect(near(results.JPEG[1], [255, 255, 255, 255])).toBe(true); // white, never black
  });

  test("Annotation JPEG export fills transparency with white", async ({ page }) => {
    await page.goto("/annotate-screenshot");
    await page.getByTestId("file-input").setInputFiles(halves());
    await expect(page.getByTestId("annotate-stage")).toBeVisible({ timeout: 30_000 });
    await drag(page, "annotate-stage", [0.6, 0.2], [0.9, 0.3]);
    await chooseFormat(page, "JPEG");
    const out = await exportDownload(page, "annotate-result");
    expect(signature(out.buffer)).toBe("jpeg");
    const d = await decode(page, out.buffer, [[100, 150]]);
    expect([d.width, d.height]).toEqual([400, 300]);
    expect(near(d.samples[0], [255, 255, 255, 255])).toBe(true);
  });

  test("tall PNG streams without truncation; JPEG beyond one canvas fails in a controlled way", async ({ page }) => {
    const { errors } = watch(page);
    await page.goto("/screenshot-editor");
    // 1000 × 20,000 = 20 MP: above the 16.7 MP single-canvas ceiling, so PNG is written in tiles.
    await page.getByTestId("file-input").setInputFiles(rowCoded("tall.png", 1000, 20_000));
    await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 60_000 });
    await setField(page, "crop-width", 999);
    const out = await exportDownload(page, "editor-result");
    const p = PNG.sync.read(out.buffer);
    expect([p.width, p.height]).toEqual([999, 20_000]);
    const rowAt = (y: number) => p.data[y * p.width * 4] + 256 * p.data[y * p.width * 4 + 1];
    for (const y of [0, 2047, 2048, 10_000, 19_999]) expect(rowAt(y)).toBe(y); // every tile in place

    await page.getByTestId("file-item").first().locator("button").first().click();
    await chooseFormat(page, "JPEG");
    const downloads: string[] = [];
    page.on("download", (d) => downloads.push(d.suggestedFilename()));
    await page.getByTestId("export").click();
    await expect(page.getByText("Export didn’t finish")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("file-item")).toHaveCount(2); // no half-made artifact
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Split: WebP pieces over 16,383 px are refused; PNG pieces reconstruct", async ({ page }) => {
    await page.goto("/split-long-screenshot");
    await page.getByTestId("file-input").setInputFiles(rowCoded("long.png", 300, 34_000));
    await expect(page.getByTestId("split-stage")).toBeVisible({ timeout: 60_000 });
    await chooseFormat(page, "WebP");
    await page.getByTestId("export").click();
    await expect(page.getByText("Split didn’t finish")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("split-result")).toHaveCount(0);

    await chooseFormat(page, "PNG");
    await page.getByTestId("export").click();
    await expect(page.getByTestId("split-piece")).toHaveCount(2, { timeout: 120_000 });
    const downloads: Download[] = [];
    const done = new Promise<void>((resolve) => page.on("download", (d) => downloads.push(d) === 2 && resolve()));
    await page.getByTestId("split-download-all").click();
    await done;
    const pieces = await Promise.all(downloads.map(async (d) => PNG.sync.read((await saved(d)).buffer)));
    expect(pieces.map((p) => p.height)).toEqual([17_000, 17_000]);
    const rowAt = (p: PNG, y: number) => p.data[y * p.width * 4] + 256 * p.data[y * p.width * 4 + 1];
    expect([rowAt(pieces[0], 0), rowAt(pieces[0], 16_999), rowAt(pieces[1], 0), rowAt(pieces[1], 16_999)]).toEqual([0, 16_999, 17_000, 33_999]);
  });
});

test.describe("product surface", () => {
  test("every sitemap route works; tools page and menu list every tool with no 'Coming soon'", async ({ page, request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(paths.length).toBe(16);
    for (const path of paths) expect((await request.get(path)).status(), path).toBe(200);
    for (const synonym of ["/png-to-jpg", "/jpg-to-png", "/webp-to-png", "/split-screenshot", "/crop-screenshot", "/add-arrow-to-screenshot", "/highlight-screenshot"]) {
      expect((await request.get(synonym)).status(), synonym).toBe(404);
    }
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);

    const toolRoutes = paths.filter((p) => !["/", "/tools", "/privacy"].includes(p));
    await page.goto("/tools");
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
    for (const route of toolRoutes) await expect(page.locator(`main a[href="${route}"]`).first()).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Thirteen Tools/ })).toBeVisible();
    await expect(page.getByText(/on the way|what’s coming/i)).toHaveCount(0);

    await page.goto("/compress-screenshot");
    await page.getByTestId("file-input").setInputFiles(solid("a.png", 50, 50, RED));
    await page.getByRole("button", { name: "Compress", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Switch tool" });
    await expect(menu.getByRole("menuitem")).toHaveCount(toolRoutes.length);
    await expect(menu.getByText(/coming soon|soon/i)).toHaveCount(0);
  });

  test("homepage loads no heavy engine or tool implementation; record its JS weight", async ({ page }) => {
    const urls: string[] = [];
    const scripts: { url: string; body: Buffer }[] = [];
    page.on("request", (r) => urls.push(r.url()));
    page.on("response", async (r) => {
      if (r.request().resourceType() === "script") scripts.push({ url: r.url(), body: await r.body().catch(() => Buffer.alloc(0)) });
    });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(3000);
    // The page's own UI fonts (/_next/static/media) are expected; engines, models, workers and
    // the Hindi PDF font (/vendor/pdf/Hind-Regular.ttf) must wait for intent.
    expect(urls.filter((u) => /opencv|tesseract|traineddata|\.wasm|\/vendor\/|hind-regular|\.worker/i.test(u))).toEqual([]);
    const text = scripts.map((s) => s.body.toString("utf8"));
    const markers = {
      "pdf-lib": "PDFDocument.create",
      fontkit: "fontkit",
      "Annotation renderer": "Screenshot annotation canvas",
      "Split tool": "Every row of the original is in exactly one piece",
      "Compress/Convert": "PNG is lossless: every pixel is kept exactly",
    };
    for (const [name, marker] of Object.entries(markers)) expect(text.filter((t) => t.includes(marker)).length, name).toBe(0);
    const raw = scripts.reduce((n, s) => n + s.body.length, 0);
    const gzip = scripts.reduce((n, s) => n + gzipSync(s.body).length, 0);
    test.info().annotations.push({ type: "homepage-js", description: `${scripts.length} scripts · ${(raw / 1024).toFixed(1)} KB raw · ${(gzip / 1024).toFixed(1)} KB gzip` });
    console.log(`homepage JS: ${scripts.length} scripts, ${(raw / 1024).toFixed(1)} KB raw, ${(gzip / 1024).toFixed(1)} KB gzip`);
  });
});
