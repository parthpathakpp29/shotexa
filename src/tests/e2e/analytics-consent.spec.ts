import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const IMAGE = join(process.cwd(), "src/tests/fixtures/ocr/receipt/image.png");

async function analyticsCalls(page: Page) {
  return page.evaluate(() => (window.dataLayer ?? []).filter((entry): entry is unknown[] => Array.isArray(entry)));
}

test.beforeEach(async ({ page }) => {
  // The mock tag records event requests without contacting Google's servers.
  await page.route("https://www.googletagmanager.com/gtag/js?**", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.dataLayer=window.dataLayer||[];const push=window.dataLayer.push.bind(window.dataLayer);window.dataLayer.push=function(entry){const result=push(entry);if(entry[0]==="event")fetch("https://www.google-analytics.com/g/collect?en="+encodeURIComponent(entry[1]));return result};`,
  }));
  await page.route("https://www.google-analytics.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://va.vercel-scripts.com/v1/script.debug.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "",
  }));
  await page.route("**/_vercel/insights/script.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "",
  }));
});

test("Reject keeps the Google tag and collection requests off", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (/googletagmanager\.com|google-analytics\.com|va\.vercel-scripts\.com|\/_vercel\/insights\/script\.js/.test(request.url())) requests.push(request.url()); });
  await page.goto("/?private=do-not-send");
  await page.setViewportSize({ width: 667, height: 375 });
  const banner = page.getByRole("region", { name: "Analytics choices" });
  await expect(banner).toBeVisible();
  expect((await banner.boundingBox())!.height).toBeLessThanOrEqual(339);
  await page.getByRole("button", { name: "Reject analytics" }).click();
  await expect(page.getByRole("region", { name: "Analytics choices" })).toBeHidden();
  await page.goto("/tools");
  await expect(page).toHaveURL(/\/tools$/);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("shotexa.analytics-consent.v1"))).toBe("rejected");
});

test("Accept tracks one sanitized page view per route and safe tool actions", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (/googletagmanager\.com|google-analytics\.com|va\.vercel-scripts\.com|\/_vercel\/insights\/script\.js/.test(request.url())) requests.push(request.url()); });
  await page.goto("/?private=do-not-send");
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "page_view").length).toBe(1);
  expect(requests.filter((url) => url.includes("googletagmanager.com"))).toHaveLength(1);
  expect(requests.filter((url) => /va\.vercel-scripts\.com|\/_vercel\/insights\/script\.js/.test(url))).toHaveLength(1);
  const config = (await analyticsCalls(page)).find((entry) => entry[0] === "config");
  expect(config?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  expect(JSON.stringify(await analyticsCalls(page))).not.toContain("do-not-send");

  await page.locator('a[href="/tools"]').first().click();
  await expect(page).toHaveURL(/\/tools$/);
  await page.locator('a[href="/screenshot-editor"]').first().click();
  await expect(page).toHaveURL(/\/screenshot-editor$/);
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "page_view").length).toBe(3);
  expect((await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "tool_opened")).toHaveLength(1);

  await page.getByTestId("file-input").setInputFiles({ name: "secret-token-123.png", mimeType: "image/png", buffer: readFileSync(IMAGE) });
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "upload_completed").length).toBe(1);
  await page.getByRole("button", { name: "Rotate right" }).click();
  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export edited image" }).click()]);
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "export_completed").length).toBe(1);
  const calls = await analyticsCalls(page);
  expect(JSON.stringify(calls)).not.toContain("secret-token-123");
  expect(calls.filter((entry) => entry[0] === "event" && entry[1] === "page_view")).toHaveLength(3);
  expect(requests.filter((url) => url.includes("googletagmanager.com"))).toHaveLength(1);
});

test("An accepted visitor can reject later and the tag stays off after reload", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) requests.push(request.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(() => requests.filter((url) => url.includes("googletagmanager.com")).length).toBe(1);
  await page.getByRole("button", { name: "Analytics choices" }).click();
  await page.getByRole("button", { name: "Reject analytics" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("shotexa.analytics-consent.v1"))).toBe("rejected");
  const before = requests.length;
  await page.reload();
  expect(requests.length).toBe(before);
});

test("A finished workflow records one completion without sending its custom name", async ({ page }) => {
  await page.goto("/workflows");
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "page_view").length).toBe(1);
  await page.getByRole("button", { name: /^Custom workflow/ }).click();
  await page.getByLabel("Workflow name").fill("Private client name");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Workflow action").selectOption("export");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("button", { name: "Save workflow" }).click();
  const card = page.getByRole("heading", { name: "Private client name" });
  await card.locator("xpath=ancestor::article").getByRole("button", { name: "Run" }).click();
  await page.getByTestId("file-input").setInputFiles(IMAGE);
  await page.getByRole("button", { name: "Start Private client name" }).click();
  await expect(page.getByTestId("workflow-complete")).toBeVisible({ timeout: 120_000 });
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "workflow_completed").length).toBe(1);
  expect(JSON.stringify(await analyticsCalls(page))).not.toContain("Private client name");
});
