/**
 * Spike D browser flows (real UI: file input, buttons, keyboard, download link):
 * normal → PDF; multiple → reorder → PDF; long → automatic breaks → PDF; move a break → PDF;
 * dense/photos → low confidence → manual fix; cancel export. Every downloaded PDF is reloaded
 * with pdf-lib and validated against the plan. Screenshots never leave the page.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cutKinds, loadPdfTruth } from "../helpers/pdf-metrics";
import { validatePdf } from "../../../scripts/spikes/pdf/validate-pdf";

const FIX = join(process.cwd(), "src", "tests", "fixtures");
const img = (id: string) => join(FIX, "pdf", id, "image.png");
const normal = join(FIX, "ocr", "chat-1080x1920", "image.png");

test.describe.configure({ timeout: 180_000 });

async function openPdf(page: Page) {
  const requests: { url: string; method: string; body: number }[] = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), body: r.postDataBuffer()?.length ?? 0 }));
  await page.goto("/spikes/pdf");
  await page.waitForFunction(() => !!window.spikeD, null, { timeout: 60_000 });
  return requests;
}

async function addFiles(page: Page, files: string[]) {
  await page.getByLabel("Add screenshots").setInputFiles(files);
  await expect(page.getByTestId(`image-${files.length - 1}`)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("plan-summary")).toBeVisible();
}

const plan = (page: Page) => page.evaluate(() => window.spikeD!.plan()!);

/** Click "Create PDF", download via the real link, validate the file against the plan. */
async function exportAndValidate(page: Page) {
  const p = await plan(page);
  await page.getByRole("button", { name: "Create PDF" }).click();
  await expect(page.getByTestId("pdf-result")).toBeVisible({ timeout: 120_000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  const bytes = readFileSync((await dl.path())!);
  const tileRows = Number(await page.getByTestId("pdf-result").getAttribute("data-tile-rows"));
  const v = await validatePdf(new Uint8Array(bytes), p.pages, p.images.map((i) => ({ width: i.width, height: i.height })), p.setup, tileRows);
  expect(v.problems).toEqual([]);
  expect(v.pages).toBe(p.pages.length);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  return { plan: p, v };
}

const noUploads = (reqs: { method: string; body: number }[]) => expect(reqs.filter((r) => r.method !== "GET" || r.body > 0)).toEqual([]);

test("homepage loads no PDF engine or document worker", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(requests.filter((u) => /document\.worker|pdf-lib|pdf-engine/i.test(u))).toEqual([]);
});

test("normal screenshot → PDF", async ({ page }) => {
  const reqs = await openPdf(page);
  await addFiles(page, [normal]);
  const { plan: p } = await exportAndValidate(page);
  expect(p.pages).toHaveLength(2); // 1920 px > one A4 page (1573 px) → 2 pages
  noUploads(reqs);
});

test("multiple screenshots → reorder → PDF", async ({ page }) => {
  const reqs = await openPdf(page);
  await addFiles(page, [img("receipt"), img("code"), normal]);
  await page.getByRole("button", { name: "Move image 2 up" }).click(); // code (1280 wide) first
  const p = await plan(page);
  expect(p.images.map((i) => i.width)).toEqual([1280, 1080, 1080]);
  expect(p.images[0].name).toMatch(/code|image/);
  const { v } = await exportAndValidate(page);
  expect(v.pages).toBe(p.pages.length);
  noUploads(reqs);
});

test("long screenshot → automatic smart breaks → PDF", async ({ page }) => {
  await openPdf(page);
  await addFiles(page, [img("long-chat-10000")]);
  const sliders = page.getByRole("slider");
  expect(await sliders.count()).toBeGreaterThanOrEqual(6);
  const p = await plan(page);
  for (const b of p.images[0].breaks) {
    expect(b.source).toBe("automatic");
    expect(b.y).toBeLessThanOrEqual(b.idealY!); // upward window only (no shrink by default)
  }
  await exportAndValidate(page);
});

test("move a break with the keyboard → PDF uses it", async ({ page }) => {
  await openPdf(page);
  await addFiles(page, [img("article")]);
  const first = page.getByRole("slider").first();
  const y0 = Number(await first.getAttribute("aria-valuenow"));
  await first.focus();
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(first).toHaveAttribute("aria-valuenow", String(y0 - 84));
  await expect(first).toHaveAttribute("data-source", "manual");
  await expect(first).toBeFocused();
  await expect(page.getByTestId("break-details")).toContainText("-"); // shift shown vs ideal
  const { plan: p } = await exportAndValidate(page);
  expect(p.pages[0].y1).toBe(y0 - 84);
});

test("photos → low-confidence breaks flagged → manual fix clears review", async ({ page }) => {
  await openPdf(page);
  await addFiles(page, [img("photos")]);
  const truth = loadPdfTruth("photos");
  await expect(page.getByTestId("plan-summary")).not.toContainText(" 0 breaks need review");
  for (let guard = 0; guard < 5; guard++) {
    const low = page.locator('[role=slider][data-confidence="low"][data-source="automatic"]').first();
    if (!(await low.count())) break;
    const y = Number(await low.getAttribute("aria-valuenow"));
    // The user moves the cut up to the top edge of the photo it slices through.
    const photo = truth.regions.find((r) => r.type === "image" && y > r.box[1] && y < r.box[1] + r.box[3]);
    let target = photo ? photo.box[1] : y - 40;
    while (cutKinds(target, truth).bad) target--;
    await low.focus();
    const d = y - target;
    for (let i = 0; i < Math.floor(d / 40); i++) await page.keyboard.press("Shift+ArrowUp");
    for (let i = 0; i < Math.floor((d % 40) / 4); i++) await page.keyboard.press("ArrowUp");
    await expect(page.locator(":focus")).toHaveAttribute("data-source", "manual");
  }
  await expect(page.getByTestId("plan-summary")).toContainText(" 0 breaks need review");
  const p = await plan(page);
  for (const b of p.images[0].breaks.filter((x) => x.source === "manual")) expect(cutKinds(b.y, truth).bad).toBe(false);
  await exportAndValidate(page);
});

test("cancel export → PDF_CANCELLED, then export again works", async ({ page }) => {
  await openPdf(page);
  await addFiles(page, [img("long-article-20000")]);
  await page.getByRole("button", { name: "Create PDF" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("error")).toHaveText("PDF_CANCELLED");
  await expect(page.getByTestId("pdf-result")).toHaveCount(0);
  await exportAndValidate(page);
});

test("corrupt image → controlled PDF_DECODE_FAILED, page stays usable", async ({ page }) => {
  await openPdf(page);
  await page.getByLabel("Add screenshots").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("definitely not a png") });
  await expect(page.getByTestId("error")).toHaveText("PDF_DECODE_FAILED", { timeout: 60_000 });
  await addFiles(page, [normal]);
  await exportAndValidate(page);
});
