import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { TOOL_CONTENT } from "@/config/tool-content";
import { LIVE_TOOLS, TOOL_LIST, TOOLS } from "@/config/tools";
import { BUILT_IN_WORKFLOWS } from "@/core/workflows/recipes";

const CAPTURE = !!process.env.CAPTURE_V2_UX;
const SHOTS = join(process.cwd(), "docs/v2-workflows-ux/screenshots");
async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (!CAPTURE || testInfo.project.name !== "chromium") return;
  mkdirSync(SHOTS, { recursive: true });
  const education = page.getByTestId("tool-education");
  await education.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, name), fullPage: false });
}

const ROUTES = new Set(TOOL_LIST.filter((tool) => tool.status === "live").map((tool) => tool.route as string));
const WORKFLOW_IDS = new Set(BUILT_IN_WORKFLOWS.map((workflow) => workflow.id as string));

test.describe("Tool pages teach without getting in the way", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("every live tool: one H1, the tool first, its own explanation below, and only real links", async ({ page }) => {
    test.setTimeout(300_000);
    for (const id of LIVE_TOOLS) {
      const tool = TOOLS[id];
      const content = TOOL_CONTENT[id];
      await page.goto(tool.route);
      await expect(page.getByRole("heading", { level: 1 }), id).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 }), id).toHaveText(tool.seo.h1);

      const education = page.getByTestId("tool-education");
      await expect(education, id).toBeVisible();
      const dropzone = (await page.getByTestId("dropzone").boundingBox())!;
      const explanation = (await education.boundingBox())!;
      expect(explanation.y, `${id}: explanation sits below the uploader`).toBeGreaterThan(dropzone.y + dropzone.height);

      const h2 = await page.locator("main h2").allTextContents();
      expect(h2.slice(0, 4), id).toEqual([content.whatHeading, "How it works", "When to use it", `Questions about ${tool.name}`]);
      await expect(education.getByTestId("tool-outputs").getByRole("listitem"), id).toHaveCount(content.outputs.length);
      await expect(education.locator("dt"), id).toHaveCount(content.faq.length);

      for (const href of await education.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")!))) {
        if (href.startsWith("/workflows?workflow=")) expect(WORKFLOW_IDS.has(href.split("=")[1]), `${id} → ${href}`).toBe(true);
        else expect(ROUTES.has(href) || href === "/privacy", `${id} → ${href}`).toBe(true);
      }
    }
  });

  test("explanations load no tool engine, model or OCR data", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/vendor/")) requested.push(request.url()); });
    for (const route of ["/remove-background", "/redact-screenshot", "/screenshot-to-data", "/compare-screenshots", "/screenshot-to-text", "/screenshot-beautifier"]) {
      await page.goto(route);
      await page.getByTestId("tool-education").scrollIntoViewIfNeeded();
      await page.waitForLoadState("networkidle");
    }
    expect(requested).toEqual([]);
  });

  test("representative pages, for visual review", async ({ page }, testInfo) => {
    const pages: [string, string][] = [["/screenshot-beautifier", "11-tool-beautifier.png"], ["/redact-screenshot", "12-tool-privacy-guard.png"], ["/screenshot-to-data", "13-tool-screenshot-to-data.png"], ["/remove-background", "14-tool-remove-background.png"], ["/compare-screenshots", "15-tool-compare.png"], ["/compress-screenshot", "16-tool-compress.png"], ["/screenshot-to-text", "17-tool-ocr.png"]];
    for (const [route, name] of pages) {
      await page.goto(route);
      await expect(page.getByTestId("tool-education")).toBeVisible();
      await shot(page, testInfo, name);
    }
  });
});

test.describe("Tool pages on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the explanation fits the screen and the uploader still comes first", async ({ page }) => {
    for (const route of ["/remove-background", "/redact-screenshot", "/screenshot-to-data", "/compare-screenshots"]) {
      await page.goto(route);
      await expect(page.getByTestId("dropzone")).toBeInViewport();
      const offenders = await page.evaluate(() => [...document.querySelectorAll("[data-testid=tool-education] *")].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > window.innerWidth + 1;
      }).length);
      expect(offenders, route).toBe(0);
    }
  });
});
