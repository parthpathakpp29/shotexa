import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

function image(name: string, width = 1600, height = 1200, rgb: [number, number, number] = [64, 120, 220]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...rgb, 255], i);
  return { name, mimeType: "image/png", buffer: PNG.sync.write(png) };
}

async function openEditor(page: Page, files = [image("large.png")]) {
  await page.goto("/screenshot-editor");
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByTestId("editor-stage")).toBeVisible({ timeout: 30_000 });
}

test.describe("Phase 3E shared interaction system", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("wheel zoom stays anchored to the pointer and keyboard controls are consistent", async ({ page, browserName }) => {
    await openEditor(page);
    const stage = page.getByTestId("editor-stage");
    const box = (await stage.boundingBox())!;
    const point = { x: box.x + box.width * 0.72, y: box.y + box.height * 0.36 };
    const worldBefore = await stage.evaluate((el, p) => {
      const rect = el.getBoundingClientRect();
      return { x: (p.x - rect.left) / (rect.width / 1600), y: (p.y - rect.top) / (rect.height / 1200) };
    }, point);

    await page.mouse.move(point.x, point.y);
    if (browserName === "webkit") {
      // Playwright WebKit does not reliably forward mouse.wheel to nested overflow regions on Windows.
      await page.getByTestId("editor-viewport").evaluate((el, p) => el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -260, clientX: p.x, clientY: p.y })), point);
    } else {
      await page.mouse.wheel(0, -260);
    }
    await expect(page.getByTestId("viewport-zoom")).not.toHaveText("Fit");
    const worldAfter = await stage.evaluate((el, p) => {
      const rect = el.getBoundingClientRect();
      return { x: (p.x - rect.left) / (rect.width / 1600), y: (p.y - rect.top) / (rect.height / 1200) };
    }, point);
    expect(Math.abs(worldAfter.x - worldBefore.x)).toBeLessThan(3);
    expect(Math.abs(worldAfter.y - worldBefore.y)).toBeLessThan(3);

    await page.keyboard.press("0");
    await expect(page.getByTestId("viewport-zoom")).toHaveText("Fit");
    await page.keyboard.press("1");
    await expect(page.getByTestId("viewport-zoom")).toHaveText("100%");
    await page.keyboard.press("+");
    await expect(page.getByTestId("viewport-zoom")).toHaveText("125%");
    await page.keyboard.press("-");
    await expect(page.getByTestId("viewport-zoom")).toHaveText("100%");

    const cropX = page.getByTestId("crop-x");
    await cropX.focus();
    await cropX.fill("");
    await page.keyboard.type("1");
    await expect(page.getByTestId("viewport-zoom")).toHaveText("100%");
  });

  test("Space plus drag pans without replacing the active crop interaction", async ({ page }) => {
    await openEditor(page);
    const viewport = page.getByTestId("editor-viewport");
    await viewport.hover();
    await page.keyboard.press("1");
    await viewport.evaluate((el) => { el.scrollLeft = 300; el.scrollTop = 220; });
    const before = await viewport.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
    const box = (await viewport.boundingBox())!;
    await page.keyboard.down("Space");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    const after = await viewport.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
    expect(after.x).toBeLessThan(before.x);
    expect(after.y).toBeLessThan(before.y);
    await expect(page.getByTestId("editor-crop")).toBeVisible();
  });

  test("file handles reorder the processing order and drag-over messaging is contextual", async ({ page }) => {
    await openEditor(page, [image("first.png", 300, 200), image("second.png", 320, 220, [220, 90, 80])]);
    const items = page.getByTestId("file-item");
    await expect(items).toHaveCount(2);
    await items.nth(0).locator("[data-drag-handle]").dragTo(items.nth(1));
    await expect(items.nth(0).getByText("second.png")).toBeVisible();
    await expect(items.nth(1).getByText("first.png")).toBeVisible();

    const dropBytes = Array.from(image("drop.png", 12, 12).buffer);
    await page.evaluate((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "drop.png", { type: "image/png" }));
      document.querySelector(".flex.min-h-dvh.flex-col")?.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, dropBytes);
    await expect(page.getByText("Drop screenshots here", { exact: true })).toBeVisible();
    await page.evaluate((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "drop.png", { type: "image/png" }));
      document.querySelector(".flex.min-h-dvh.flex-col")?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, dropBytes);
    await expect(items).toHaveCount(3);
    await expect(items.nth(2).getByText("drop.png")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("1 screenshot added to workspace");
  });
});

test.describe("Phase 3E mobile inspector", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the settings sheet remains scrollable without horizontal overflow", async ({ page }) => {
    await openEditor(page, [image("mobile.png", 800, 1200)]);
    await page.getByRole("button", { name: "Edit settings" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const metrics = await page.getByRole("dialog").evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.scrollHeight).toBeGreaterThanOrEqual(metrics.clientHeight);
    await expect(page.getByRole("dialog").getByRole("button", { name: "Reset rotation" })).toBeVisible();
  });
});
