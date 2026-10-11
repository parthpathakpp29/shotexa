import { expect, test } from "@playwright/test";

const screenshotDir = process.env.LANDING_AUDIT_SCREENSHOTS_DIR;

async function capture(page: import("@playwright/test").Page, name: string) {
  const path = screenshotDir ? `${screenshotDir}/${name}` : test.info().outputPath(name);
  await page.screenshot({ path, fullPage: false });
}

async function expectNoOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test.describe("landing visual audit", () => {
  test("desktop marketing surfaces remain usable and capture cleanly", async ({ page, browserName }) => {
    const consoleErrors: string[] = [];
    const videoRequests: string[] = [];
    page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("/product/shotexa-demo.mov")) videoRequests.push(request.url());
    });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await expect(page.getByTestId("dropzone")).toBeVisible();
    const demo = page.getByTestId("product-demo-video");
    await expect(demo).not.toHaveAttribute("src");
    expect(videoRequests).toEqual([]);
    await expectNoOverflow(page);
    await capture(page, "desktop-hero.png");
    const workflowPanel = page.locator("#wf-panel");
    await workflowPanel.scrollIntoViewIfNeeded();
    await workflowPanel.screenshot({ path: test.info().outputPath("desktop-workflow.png") });
    await page.getByTestId("home-product-demo").scrollIntoViewIfNeeded();
    await expect(demo).toHaveAttribute("src", "/product/shotexa-demo.mov");
    if (browserName === "chromium") {
      await expect.poll(() => demo.evaluate((video) => (video as HTMLVideoElement).paused)).toBe(false);
    } else {
      await expect(page.getByRole("button", { name: "Play Shotexa product demo" })).toBeVisible();
    }
    await capture(page, "desktop-product-demo.png");
    if (browserName === "chromium") {
      await page.getByTestId("home-hero").scrollIntoViewIfNeeded();
      await expect.poll(() => demo.evaluate((video) => (video as HTMLVideoElement).paused)).toBe(true);
    }
    await page.getByTestId("home-toolbox").scrollIntoViewIfNeeded();
    await capture(page, "desktop-toolbox.png");
    await page.getByTestId("home-principles").scrollIntoViewIfNeeded();
    await capture(page, "desktop-principles.png");
    await page.getByTestId("site-footer").scrollIntoViewIfNeeded();
    await capture(page, "desktop-footer.png");
    await page.screenshot({ path: screenshotDir ? `${screenshotDir}/desktop-full-page.png` : test.info().outputPath("desktop-full-page.png"), fullPage: true });
    expect(consoleErrors).toEqual([]);
  });

  test("390px marketing surfaces stack without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByTestId("dropzone")).toBeVisible();
    const demo = page.getByTestId("product-demo-video");
    await expect(demo).not.toHaveAttribute("src");
    await expectNoOverflow(page);
    await capture(page, "mobile-hero.png");
    const workflowPanel = page.locator("#wf-panel");
    await workflowPanel.scrollIntoViewIfNeeded();
    await workflowPanel.screenshot({ path: test.info().outputPath("mobile-workflow.png") });
    await page.getByTestId("home-product-demo").scrollIntoViewIfNeeded();
    await expect(demo).toHaveAttribute("src", "/product/shotexa-demo.mov");
    await capture(page, "mobile-product-demo.png");
    await page.getByTestId("home-toolbox").scrollIntoViewIfNeeded();
    await capture(page, "mobile-toolbox.png");
    await page.getByTestId("site-footer").scrollIntoViewIfNeeded();
    await capture(page, "mobile-footer.png");
    await expectNoOverflow(page);
  });

  test("product demo does not autoplay for reduced-motion visitors", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const demo = page.getByTestId("product-demo-video");
    await expect(demo).not.toHaveAttribute("src");
    await page.getByTestId("home-product-demo").scrollIntoViewIfNeeded();
    await expect(demo).toHaveAttribute("src", "/product/shotexa-demo.mov");
    await expect.poll(() => demo.evaluate((video) => (video as HTMLVideoElement).paused)).toBe(true);
    await expect(page.getByRole("button", { name: "Play Shotexa product demo" })).toBeVisible();
  });
});
