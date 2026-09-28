import { expect, test, type Download, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { inspectBytes } from "@/core/metadata/engine-core";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

const IMAGE = join(FIXTURE_DIR, "chat-light/a.png");
const SECOND = join(FIXTURE_DIR, "chat-light/b.png");
const METADATA = join(process.cwd(), "src/tests/fixtures/metadata/jpeg/kitchen-sink.jpg");
const capture = !!process.env.CAPTURE_PHASE2A;
const SCREENSHOTS = join(process.cwd(), "docs/phase-2a/screenshots");

async function captureReview(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOTS, name), fullPage: true });
}

async function addRegion(page: Page, rect = { x: 0.12, y: 0.12, width: 0.28, height: 0.12 }) {
  const stage = page.getByLabel(/Screenshot redaction canvas/);
  await expect(stage).toBeVisible();
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * rect.x, box.y + box.height * rect.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (rect.x + rect.width), box.y + box.height * (rect.y + rect.height), { steps: 8 });
  await page.mouse.up();
  const region = page.getByTestId("redaction-region");
  await expect(region).toHaveCount(1);
  return {
    x: Number(await region.getAttribute("data-source-x")),
    y: Number(await region.getAttribute("data-source-y")),
    width: Number(await region.getAttribute("data-source-width")),
    height: Number(await region.getAttribute("data-source-height")),
  };
}

async function waitForRedactionEditor(page: Page) {
  await expect(page.getByTestId("redaction-editor")).toBeVisible({ timeout: 30_000 });
}

async function downloadFromExport(page: Page): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByTestId("export").click()]);
  await expect(page.getByTestId("safe-share-result")).toBeVisible();
  return download;
}

function pixel(png: PNG, x: number, y: number) {
  const i = (y * png.width + x) * 4;
  return [...png.data.subarray(i, i + 4)];
}

test.describe("Phase 2A Safe Share", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("Blackout permanently replaces source pixels, then cleans and verifies metadata", async ({ page }) => {
    const outbound: string[] = [];
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (request) => {
      const body = request.postDataBuffer();
      if (request.method() !== "GET" && request.method() !== "HEAD" && body?.length) outbound.push(request.url());
    });
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(IMAGE);
    await waitForRedactionEditor(page);
    await expect(page.getByRole("radio", { name: /Blackout/ })).toHaveAttribute("aria-checked", "true");
    const r = await addRegion(page);
    await captureReview(page, "01-redact-screenshot.png");
    const download = await downloadFromExport(page);
    const output = PNG.sync.read(readFileSync((await download.path())!));
    const original = PNG.sync.read(readFileSync(IMAGE));
    expect({ width: output.width, height: output.height }).toEqual({ width: original.width, height: original.height });
    const x0 = Math.round(r.x);
    const y0 = Math.round(r.y);
    const x1 = Math.round(r.x + r.width);
    const y1 = Math.round(r.y + r.height);
    let originalColourFound = false;
    for (let y = y0 + 5; y < y1 - 5; y += Math.max(1, Math.floor((y1 - y0) / 6))) {
      for (let x = x0 + 5; x < x1 - 5; x += Math.max(1, Math.floor((x1 - x0) / 6))) {
        if (pixel(original, x, y).slice(0, 3).some((v) => v !== 0)) originalColourFound = true;
        expect(pixel(output, x, y)).toEqual([0, 0, 0, 255]);
      }
    }
    expect(originalColourFound).toBe(true);
    expect(inspectBytes(new Uint8Array(readFileSync((await download.path())!))).hasPrivacyMetadata).toBe(false);
    await expect(page.getByText("Redactions flattened")).toBeVisible();
    await expect(page.getByText("Privacy metadata removed")).toBeVisible();
    await expect(page.getByText("Output verified")).toBeVisible();
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Blur intensity is adjustable and exports a flattened copy", async ({ page }) => {
    await page.goto("/blur-screenshot");
    await page.getByTestId("file-input").setInputFiles(IMAGE);
    await waitForRedactionEditor(page);
    await expect(page.getByRole("radio", { name: /Blur/ })).toHaveAttribute("aria-checked", "true");
    await addRegion(page);
    const slider = page.getByRole("slider", { name: "Blur intensity" });
    await slider.fill("32");
    await expect(slider).toHaveValue("32");
    await captureReview(page, "02-blur-screenshot.png");
    const out = PNG.sync.read(readFileSync((await (await downloadFromExport(page)).path())!));
    const input = PNG.sync.read(readFileSync(IMAGE));
    expect(Buffer.compare(out.data, input.data)).not.toBe(0);
  });

  test("Pixelate exports through the same verified pipeline", async ({ page }) => {
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(IMAGE);
    await waitForRedactionEditor(page);
    await page.getByRole("radio", { name: /Pixelate/ }).click();
    await addRegion(page);
    const output = PNG.sync.read(readFileSync((await (await downloadFromExport(page)).path())!));
    const input = PNG.sync.read(readFileSync(IMAGE));
    expect(Buffer.compare(output.data, input.data)).not.toBe(0);
  });

  test("redaction add/delete and Undo/Redo operate on logical regions", async ({ page }) => {
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(IMAGE);
    await waitForRedactionEditor(page);
    await addRegion(page);
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(page.getByTestId("redaction-region")).toHaveCount(0);
    await page.getByRole("button", { name: "Redo" }).first().click();
    await expect(page.getByTestId("redaction-region")).toHaveCount(1);
    await page.getByRole("button", { name: /Delete blackout redaction/ }).click();
    await expect(page.getByTestId("redaction-region")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(page.getByTestId("redaction-region")).toHaveCount(1);
  });

  test("Smart Stitch result continues to Safe Share without another upload", async ({ page }) => {
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([IMAGE, SECOND]);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
    await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await page.getByTestId("stitch-result").getByRole("link", { name: /Safe Share/ }).click();
    await expect(page).toHaveURL(/\/redact-screenshot$/);
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await expect(page.getByLabel(/Screenshot redaction canvas/)).toBeVisible();
    await addRegion(page, { x: 0.1, y: 0.05, width: 0.3, height: 0.05 });
    await captureReview(page, "04-stitch-to-safe-share.png");
    await downloadFromExport(page);
  });

  test("Remove Metadata inspects, cleans, verifies and downloads", async ({ page }) => {
    await page.goto("/remove-image-metadata");
    await page.getByTestId("file-input").setInputFiles(METADATA);
    await expect(page.getByTestId("privacy-findings")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("GPS location")).toBeVisible();
    await captureReview(page, "03-remove-metadata.png");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    await expect(page.getByText("Privacy Clean complete")).toBeVisible();
    const bytes = new Uint8Array(readFileSync((await download.path())!));
    expect(inspectBytes(bytes).hasPrivacyMetadata).toBe(false);
  });

  test("mobile uses the shared Files and Safe Share controls sheets", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/redact-screenshot");
    await page.getByTestId("file-input").setInputFiles(IMAGE);
    await waitForRedactionEditor(page);
    await expect(page.getByRole("button", { name: "Files (1)" })).toBeVisible();
    const controls = page.getByRole("button", { name: "Safe Share controls" });
    const box = (await controls.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await controls.click();
    await expect(page.getByRole("dialog", { name: "Safe Share controls" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("radio", { name: /Blackout/ })).toBeVisible();
    await captureReview(page, "05-mobile-safe-share.png");
  });

  test("informational pages do not capture pasted screenshots", async ({ page }) => {
    const assertNoCapture = async () => {
      await expect(page.getByTestId("workspace-input-state")).toHaveAttribute("data-enabled", "false");
      await page.evaluate(async () => {
        const blob = await (await fetch("/samples/sample-chat-1.png")).blob();
        const dt = new DataTransfer();
        dt.items.add(new File([blob], "pasted.png", { type: "image/png" }));
        document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      });
      await page.getByRole("link", { name: /Shotexa home/i }).first().click();
      await expect(page.getByTestId("connected-workspace")).toHaveCount(0);
    };
    await page.goto("/tools");
    await assertNoCapture();
    await page.getByRole("link", { name: "Privacy", exact: true }).first().click();
    await expect(page).toHaveURL(/\/privacy$/);
    await assertNoCapture();
  });
});
