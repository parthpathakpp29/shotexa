import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const IMAGE = join(process.cwd(), "src/tests/fixtures/ocr/receipt/image.png");

async function analyticsCalls(page: Page) {
  return page.evaluate(() => (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>)));
}

test.beforeEach(async ({ page }) => {
  // Emulate the real tag's Arguments queue contract and a browser collection request.
  // Arrays are deliberately ignored: the old test accepted the broken bootstrap.
  await page.route("https://www.googletagmanager.com/gtag/js?**", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `(()=>{let configured=false;const layer=window.dataLayer=window.dataLayer||[];function send(entry){if(Object.prototype.toString.call(entry)!=="[object Arguments]")return;if(entry[0]==="config"&&entry[1]==="G-912D4G6Z2B")configured=true;if(entry[0]==="event"&&configured){const p=entry[2]||{};const q=new URLSearchParams({tid:"G-912D4G6Z2B",en:entry[1],dl:p.page_location||"",dr:p.page_referrer||""});if(p.tool_id)q.set("ep.tool_id",p.tool_id);fetch("https://www.google-analytics.com/g/collect?"+q.toString(),{mode:"no-cors"})}}layer.forEach(send);const push=layer.push.bind(layer);layer.push=function(entry){const result=push(entry);send(entry);return result}})();`,
  }));
  await page.route("https://www.google-analytics.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  const vercelScript = `(()=>{let beforeSend=null;const queued=window.vaq||[];window.va=function(type){const value=arguments[1];if(type==="beforeSend"){beforeSend=value;return}if(type==="pageview"){const event=beforeSend?.({type:"pageview",url:location.href});if(event)fetch("/3e5b8101dc4b4d62/view",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({o:event.url,dp:location.pathname,r:""})})}};queued.forEach(args=>window.va(...args));if(!queued.some(args=>args[0]==="pageview"))window.va("pageview")})();`;
  await page.route("https://va.vercel-scripts.com/v1/script.debug.js", (route) => route.fulfill({ contentType: "application/javascript", body: vercelScript }));
  await page.route("**/_vercel/insights/script.js", (route) => route.fulfill({ contentType: "application/javascript", body: vercelScript }));
  await page.route("**/3e5b8101dc4b4d62/view", (route) => {
    const body = route.request().postDataJSON() as { o?: string };
    return route.fulfill({ status: /^https?:\/\//.test(body.o ?? "") ? 204 : 400, body: "" });
  });
});

test("Reject keeps the Google tag and collection requests off", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (/googletagmanager\.com|google-analytics\.com|va\.vercel-scripts\.com|\/_vercel\/insights\/script\.js|\/3e5b8101dc4b4d62\/view/.test(request.url())) requests.push(request.url()); });
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
  const vercelBodies: Array<{ o: string; dp: string }> = [];
  const vercelStatuses: number[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com|va\.vercel-scripts\.com|\/_vercel\/insights\/script\.js/.test(request.url())) requests.push(request.url());
    if (request.url().endsWith("/3e5b8101dc4b4d62/view")) vercelBodies.push(request.postDataJSON());
  });
  page.on("response", (response) => { if (response.url().endsWith("/3e5b8101dc4b4d62/view")) vercelStatuses.push(response.status()); });
  await page.goto("/?private=do-not-send");
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "page_view").length).toBe(1);
  await expect.poll(() => requests.filter((url) => url.includes("/g/collect?")).length).toBe(1);
  await expect.poll(() => vercelBodies.length).toBeGreaterThanOrEqual(1);
  await expect.poll(() => vercelStatuses.length).toBeGreaterThanOrEqual(1);
  expect(vercelStatuses).not.toContain(400);
  expect(vercelBodies[0]).toMatchObject({ o: new URL("/", page.url()).origin + "/", dp: "/" });
  expect(JSON.stringify(vercelBodies)).not.toContain("do-not-send");
  const firstCollect = new URL(requests.find((url) => url.includes("/g/collect?"))!);
  expect(firstCollect.searchParams.get("tid")).toBe("G-912D4G6Z2B");
  expect(firstCollect.searchParams.get("en")).toBe("page_view");
  expect(firstCollect.searchParams.get("dl")).toBe(new URL("/", page.url()).origin + "/");
  expect(firstCollect.href).not.toContain("do-not-send");
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
  await expect.poll(() => requests.filter((url) => url.includes("/g/collect?") && url.includes("en=page_view")).length).toBe(3);
  expect((await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "tool_opened")).toHaveLength(1);

  await page.getByTestId("file-input").setInputFiles({ name: "secret-token-123.png", mimeType: "image/png", buffer: readFileSync(IMAGE) });
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "upload_completed").length).toBe(1);
  await page.getByRole("button", { name: "Rotate right" }).click();
  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export edited image" }).click()]);
  await expect.poll(async () => (await analyticsCalls(page)).filter((entry) => entry[0] === "event" && entry[1] === "export_completed").length).toBe(1);
  const calls = await analyticsCalls(page);
  expect(JSON.stringify(calls)).not.toContain("secret-token-123");
  expect(JSON.stringify(requests)).not.toContain("secret-token-123");
  await expect.poll(() => requests.some((url) => url.includes("en=tool_opened") && url.includes("ep.tool_id=editor"))).toBe(true);
  await expect.poll(() => requests.some((url) => url.includes("en=upload_completed"))).toBe(true);
  await expect.poll(() => requests.some((url) => url.includes("en=export_completed"))).toBe(true);
  expect(calls.filter((entry) => entry[0] === "event" && entry[1] === "page_view")).toHaveLength(3);
  expect(requests.filter((url) => url.includes("googletagmanager.com"))).toHaveLength(1);
});

test("An accepted visitor can reject later and the tag stays off after reload", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (/googletagmanager\.com|google-analytics\.com|\/3e5b8101dc4b4d62\/view/.test(request.url())) requests.push(request.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(() => requests.filter((url) => url.includes("googletagmanager.com")).length).toBe(1);
  await page.getByRole("button", { name: "Analytics choices" }).click();
  await page.getByRole("button", { name: "Reject analytics" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("shotexa.analytics-consent.v1"))).toBe("rejected");
  const before = requests.length;
  await page.reload();
  await page.goto("/tools");
  expect(requests.length).toBe(before);
});

test("Saved consent resumes once, and Reject can later change to Accept", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (/googletagmanager\.com|google-analytics\.com\/g\/collect|\/3e5b8101dc4b4d62\/view/.test(request.url())) requests.push(request.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Reject analytics" }).click();
  await page.reload();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Analytics choices" }).click();
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(() => requests.filter((url) => url.includes("/g/collect?")).length).toBe(1);
  await page.reload();
  await expect.poll(() => requests.filter((url) => url.includes("/g/collect?")).length).toBe(2);
  expect(requests.filter((url) => url.includes("googletagmanager.com"))).toHaveLength(2);
  expect(await page.evaluate(() => localStorage.getItem("shotexa.analytics-consent.v1"))).toBe("accepted");
});

test("A finished workflow records one completion without sending its custom name", async ({ page }) => {
  const collectionUrls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("google-analytics.com/g/collect")) collectionUrls.push(request.url()); });
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
  await expect.poll(() => collectionUrls.filter((url) => url.includes("en=workflow_completed")).length).toBe(1);
  expect(JSON.stringify(await analyticsCalls(page))).not.toContain("Private client name");
  expect(JSON.stringify(collectionUrls)).not.toContain("Private client name");
});
