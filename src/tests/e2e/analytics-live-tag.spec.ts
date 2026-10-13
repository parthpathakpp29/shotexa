import { expect, test } from "@playwright/test";

// Opt-in network check for the actual Google tag. The normal suite uses a local
// collector mock so it remains deterministic and sends no CI traffic to GA4.
test("rejection sends no real analytics requests", async ({ page }) => {
  test.skip(process.env.E2E_REAL_GA4 !== "1", "Run with E2E_REAL_GA4=1 in a network-enabled environment");
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com|va\.vercel-scripts\.com|\/_vercel\/insights\/|\/3e5b8101dc4b4d62\/view/.test(request.url())) analyticsRequests.push(request.url());
  });
  await page.goto("/?private=must-not-send");
  expect(analyticsRequests).toEqual([]);
  await page.getByRole("button", { name: "Reject analytics" }).click();
  await page.goto("/tools");
  await expect(page).toHaveURL(/\/tools$/);
  expect(await page.evaluate(() => localStorage.getItem("shotexa.analytics-consent.v1"))).toBe("rejected");
  expect(analyticsRequests).toEqual([]);
});

test("the real Google tag emits sanitized GA4 requests for accepted navigation", async ({ page }) => {
  test.skip(process.env.E2E_REAL_GA4 !== "1", "Run with E2E_REAL_GA4=1 in a network-enabled environment");

  const tagResponses: number[] = [];
  const collectionResponses: number[] = [];
  const collectionUrls: string[] = [];
  const collectionBodies: string[] = [];
  page.on("response", (response) => {
    if (response.url().startsWith("https://www.googletagmanager.com/gtag/js?")) tagResponses.push(response.status());
    const url = new URL(response.url());
    if ((url.hostname === "google-analytics.com" || url.hostname.endsWith(".google-analytics.com")) && url.pathname === "/g/collect") {
      collectionResponses.push(response.status());
    }
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.hostname === "google-analytics.com" || url.hostname.endsWith(".google-analytics.com")) && url.pathname === "/g/collect") {
      collectionUrls.push(request.url());
      collectionBodies.push(request.postData() ?? "");
    }
  });

  await page.goto("/?private=must-not-send");
  expect(collectionUrls).toEqual([]);
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(() => tagResponses, { timeout: 30_000 }).toContain(200);
  await expect.poll(() => collectionUrls.length, { timeout: 30_000 }).toBe(1);
  await expect.poll(() => collectionResponses.length, { timeout: 30_000 }).toBe(1);

  const first = new URL(collectionUrls[0]);
  expect(first.searchParams.get("tid")).toBe("G-912D4G6Z2B");
  expect(first.searchParams.get("en")).toBe("page_view");
  expect(first.searchParams.get("dl")).toBe(new URL("/", page.url()).origin + "/");
  expect(first.href).not.toContain("must-not-send");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "All tools" }).click();
  await expect(page).toHaveURL(/\/tools$/, { timeout: 20_000 });
  await page.locator('a[href="/screenshot-editor"]:visible').first().click();
  await expect(page).toHaveURL(/\/screenshot-editor$/, { timeout: 20_000 });
  await expect.poll(() => collectionUrls.filter((url) => new URL(url).searchParams.get("en") === "page_view").length, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await expect.poll(() => collectionUrls.some((url) => new URL(url).searchParams.get("en") === "tool_opened"), { timeout: 30_000 }).toBe(true);
  // Give the Google tag's own history listener time to emit any delayed hit.
  await page.waitForTimeout(3000);
  const manualPageViews = await page.evaluate(() => (window.dataLayer ?? []).filter((entry) => {
    const args = Array.from(entry as ArrayLike<unknown>);
    return args[0] === "event" && args[1] === "page_view";
  }).length);
  const queuedCommands = await page.evaluate(() => (window.dataLayer ?? []).map((entry) => {
    const args = Array.from(entry as ArrayLike<unknown>);
    return `${String(args[0])}:${String(args[1])}`;
  }));
  const actualPageViews = collectionUrls.filter((url) => new URL(url).searchParams.get("en") === "page_view").length;
  const toolOpened = collectionUrls.filter((url) => new URL(url).searchParams.get("en") === "tool_opened").length;
  const origin = new URL(page.url()).origin;
  const pageLocations = collectionUrls.filter((url) => new URL(url).searchParams.get("en") === "page_view").map((url) => new URL(url).searchParams.get("dl"));
  expect(tagResponses).toHaveLength(1);
  expect(queuedCommands.filter((command) => command === "config:G-912D4G6Z2B")).toHaveLength(1);
  expect(manualPageViews).toBe(3);
  expect(actualPageViews).toBe(3);
  expect(pageLocations).toEqual([`${origin}/`, `${origin}/tools`, `${origin}/screenshot-editor`]);
  for (const requestUrl of collectionUrls) {
    const params = new URL(requestUrl).searchParams;
    const location = params.get("dl");
    expect(params.get("tid")).toBe("G-912D4G6Z2B");
    expect(params.get("dr") ?? "").toBe("");
    expect([`${origin}/`, `${origin}/tools`, `${origin}/screenshot-editor`]).toContain(location);
    expect(location).not.toContain("?");
    expect(location).not.toContain("#");
  }
  expect(JSON.stringify(collectionUrls) + JSON.stringify(collectionBodies)).not.toContain("must-not-send");
  expect(collectionUrls.find((url) => new URL(url).searchParams.get("en") === "tool_opened")).toContain("ep.tool_id=editor");
  expect(collectionResponses).toHaveLength(collectionUrls.length);
  expect(collectionResponses.every((status) => status === 204)).toBe(true);
  console.log(JSON.stringify({ tagStatus: tagResponses[0], collectStatus: collectionResponses[0], collectOrigin: first.origin, measurementId: first.searchParams.get("tid"), pageLocations, pageReferrers: collectionUrls.map((url) => new URL(url).searchParams.get("dr")), pageViews: actualPageViews, toolOpened }));
});
