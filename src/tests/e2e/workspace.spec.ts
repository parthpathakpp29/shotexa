/**
 * Phase 1 critical flows (production routes, real engines):
 *   1. homepage upload two → overlap suggestion → Smart Stitch → export
 *   2. homepage paste → connected workspace
 *   3. Smart Stitch manual adjustment → undo/redo → export (verified output size)
 *   4. stitch result → Continue with Safe Share → the result stays in the workspace
 * Navigation between pages is always client-side (links): a reload clears the workspace by design.
 *
 * CAPTURE_SCREENSHOTS=1 also writes review screenshots to docs/phase-1/screenshots/.
 */
import { expect, test, type Download, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

const A = join(FIXTURE_DIR, "chat-light/a.png");
const B = join(FIXTURE_DIR, "chat-light/b.png");
/** chat-light: B starts 1260 px into A (manifest); output height = offset + B height. */
const AUTO_OFFSET = 1260;
const HEIGHT = 2532;
const SHOTS = join(process.cwd(), "docs", "phase-1", "screenshots");
const capture = !!process.env.CAPTURE_SCREENSHOTS;
/** Dev servers compile a route on first visit; allow for it on client-side navigations. */
const NAV = { timeout: 60_000 };

async function shot(page: Page, name: string, fullPage = false) {
  if (!capture) return;
  mkdirSync(SHOTS, { recursive: true });
  // Capturing hides the caret by styling inputs; doing that before hydration causes a mismatch warning.
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage });
}

async function pngSize(d: Download) {
  const buf = readFileSync((await d.path())!);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function waitForAlignment(page: Page) {
  // First analysis lazily loads the alignment engine in the Vision Worker.
  await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence", { timeout: 120_000 });
}

async function exportStitch(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByTestId("export").click()]);
  expect(download.suggestedFilename()).toBe("stitched-screenshot.png");
  await expect(page.getByTestId("stitch-result")).toBeVisible();
  return download;
}

test.describe("Phase 1 workspace", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("homepage upload → overlap suggestion → Smart Stitch → export", async ({ page }) => {
    const leaks: string[] = [];
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/__nextjs")) return; // dev-server tooling, not app traffic
      const body = r.postDataBuffer();
      if (r.method() !== "GET" && r.method() !== "HEAD" && body && body.length > 1024) leaks.push(`${r.method()} ${r.url()}`);
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Everything You Need for");
    await shot(page, "01-homepage");
    await shot(page, "01-homepage-full", true);

    await page.getByTestId("file-input").setInputFiles([A, B]);
    await expect(page.getByTestId("connected-workspace")).toBeVisible();
    await expect(page.getByTestId("file-item")).toHaveCount(2);
    await expect(page.getByText("These screenshots appear to overlap.")).toBeVisible({ timeout: 30_000 });
    await shot(page, "02-connected-workspace");

    await page.getByRole("link", { name: "Smart Stitch" }).first().click();
    await expect(page).toHaveURL(/\/stitch-screenshots$/, NAV);
    await expect(page.getByTestId("file-item")).toHaveCount(2); // survived navigation
    await waitForAlignment(page);
    await expect(page.getByRole("slider", { name: "Seam line" })).toHaveAttribute("aria-valuenow", String(AUTO_OFFSET));
    await shot(page, "03-smart-stitch");

    const size = await pngSize(await exportStitch(page));
    expect(size).toEqual({ width: 1170, height: AUTO_OFFSET + HEIGHT });
    expect(leaks).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("homepage paste → connected workspace", async ({ page }) => {
    await page.goto("/");
    const carried = await page.evaluate(async () => {
      const blob = await (await fetch("/samples/sample-chat-1.png")).blob();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "image.png", { type: "image/png" }));
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      const ok = (ev.clipboardData?.files.length ?? 0) > 0;
      document.body.dispatchEvent(ev);
      return ok;
    });
    // Some engines drop clipboardData from script-created paste events; real Ctrl/⌘+V is unaffected.
    test.skip(!carried, "synthetic paste events can't carry files in this browser");
    await expect(page.getByTestId("connected-workspace")).toBeVisible();
    await expect(page.getByTestId("file-item")).toHaveCount(1);
    await expect(page.getByTestId("file-item")).toContainText("Pasted screenshot 1.png");
    // One screenshot: single-image tools, no Smart Stitch suggestion.
    await expect(page.getByRole("navigation", { name: "Workspace tools" }).getByRole("link", { name: /Safe Share/ })).toBeVisible();
    await expect(page.getByText("These screenshots appear to overlap.")).toHaveCount(0);
  });

  test("Smart Stitch manual adjustment → undo/redo → export", async ({ page }) => {
    await page.goto("/stitch-screenshots");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Smart Screenshot Stitcher");
    await page.getByTestId("file-input").setInputFiles([A, B]);
    await waitForAlignment(page);

    const seam = page.getByRole("slider", { name: "Seam line" });
    await page.getByRole("button", { name: "Adjust manually" }).click();
    await expect(page.getByTestId("manual-controls")).toBeVisible();
    await page.getByRole("button", { name: "Move join down 10 pixels" }).click();
    await expect(seam).toHaveAttribute("aria-valuenow", String(AUTO_OFFSET + 10));
    await expect(page.getByTestId("stitch-confidence")).toContainText("Adjusted manually");

    // Keyboard on the seam handle: ↑ moves the join up 1 px.
    await seam.focus();
    await page.keyboard.press("ArrowUp");
    await expect(seam).toHaveAttribute("aria-valuenow", String(AUTO_OFFSET + 9));

    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(seam).toHaveAttribute("aria-valuenow", String(AUTO_OFFSET + 10));
    await page.getByRole("button", { name: "Redo" }).first().click();
    await expect(seam).toHaveAttribute("aria-valuenow", String(AUTO_OFFSET + 9));

    await page.getByRole("radio", { name: "Difference" }).click();
    await expect(page.getByRole("radio", { name: "Difference" })).toHaveAttribute("aria-checked", "true");

    const size = await pngSize(await exportStitch(page));
    expect(size).toEqual({ width: 1170, height: AUTO_OFFSET + 9 + HEIGHT });

    // Reset returns to the automatic alignment.
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(seam).toHaveAttribute("aria-valuenow", String(AUTO_OFFSET));
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence");
  });

  test("stitch result → Continue with Safe Share → result stays in the workspace", async ({ page }) => {
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([A, B]);
    await waitForAlignment(page);
    await exportStitch(page);
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await shot(page, "04-stitch-result");

    await page.getByTestId("stitch-result").getByRole("link", { name: /Safe Share/ }).click();
    await expect(page).toHaveURL(/\/redact-screenshot$/, NAV);
    await expect(page.getByTestId("preview-tool")).toBeVisible();
    await expect(page.getByTestId("active-file")).toContainText("stitched-screenshot.png");
    await expect(page.getByTestId("active-file")).toContainText(`1170 × ${AUTO_OFFSET + HEIGHT} px`);
    await expect(page.getByTestId("file-item")).toHaveCount(3);
    await shot(page, "05-safe-share-shell");

    // Back to Smart Stitch: alignment and result are still there (no re-analysis needed).
    await page.getByRole("link", { name: "Back to Smart Stitch" }).click();
    await expect(page).toHaveURL(/\/stitch-screenshots$/, NAV);
    await expect(page.getByTestId("stitch-confidence")).toContainText("High confidence");
    await expect(page.getByTestId("stitch-result")).toBeVisible();
  });

  test("mobile: compact shell with sheets and sticky actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/stitch-screenshots");
    await page.getByTestId("file-input").setInputFiles([A, B]);
    await waitForAlignment(page);
    const bar = page.getByRole("button", { name: "Files (2)" });
    await expect(bar).toBeVisible();
    const box = (await bar.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
    await shot(page, "06-mobile-stitch");
    await page.getByRole("button", { name: "Alignment" }).click();
    await expect(page.getByRole("dialog", { name: "Alignment" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("switch", { name: "Automatic alignment" })).toBeVisible();
    await shot(page, "07-mobile-controls");
  });
});
