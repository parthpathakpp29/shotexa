import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const ROOT = join(process.cwd(), "docs/v2.1/visual-polish");
const CAPTURE = !!process.env.CAPTURE_BEAUTIFY_POLISH;

const fixtures = {
  dashboard: {
    width: 1440, height: 900,
    html: `<style>*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172539;font:16px Arial}.shell{display:flex;height:900px}.side{width:244px;background:#132338;color:white;padding:27px}.brand{font-size:27px;font-weight:800;margin-bottom:45px}.nav{padding:15px;border-radius:10px;color:#a9bdd2;margin:5px 0}.sel{background:#26415d;color:white}.main{padding:34px 45px;flex:1}.top{display:flex;justify-content:space-between;align-items:center}.top h1{font-size:32px;margin:5px 0}.muted{color:#7c8a9a}.avatar{background:#f6b45e;padding:14px;border-radius:100%}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:34px 0}.card,.chart,.table{background:white;border:1px solid #e4e9ef;border-radius:16px;padding:24px;box-shadow:0 7px 22px #17253908}.num{font-size:31px;font-weight:800;margin:15px 0 3px}.up{color:#109c75;font-weight:700}.chart{height:330px}.chart h2{margin:0;font-size:21px}.plot{height:230px;display:flex;align-items:end;gap:17px;padding:25px 7px 4px;border-bottom:1px solid #dbe4ed}.bar{flex:1;background:linear-gradient(#5bbcc1,#126886);border-radius:6px 6px 0 0}.table{margin-top:20px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #eef1f5;padding:13px 0}</style><div class="shell"><aside class="side"><div class="brand">◈ Northstar</div><div class="nav sel">▦ &nbsp; Overview</div><div class="nav">▤ &nbsp; Analytics</div><div class="nav">◫ &nbsp; Campaigns</div><div class="nav">♧ &nbsp; Audience</div><div class="nav">⚙ &nbsp; Settings</div></aside><main class="main"><div class="top"><div><div class="muted">Monday, October 12, 2026</div><h1>Good morning, Alex</h1><div class="muted">Here is what is happening with your product.</div></div><div class="avatar">AL</div></div><div class="cards"><div class="card">Revenue<div class="num">$48,290</div><span class="up">↗ 12.8%</span></div><div class="card">Active users<div class="num">12,840</div><span class="up">↗ 8.2%</span></div><div class="card">Conversion<div class="num">4.82%</div><span class="up">↗ 1.4%</span></div><div class="card">Retention<div class="num">87.3%</div><span class="up">↗ 3.1%</span></div></div><div class="chart"><h2>Growth over time</h2><div class="muted">Revenue performance across the last twelve months</div><div class="plot">${[44,60,54,75,82,68,91,105,98,126,142,165].map(v=>`<div class="bar" style="height:${v}px"></div>`).join("")}</div></div><div class="table"><b>Recent activity</b><div class="row"><span>Enterprise plan upgrade</span><span class="up">+$2,490</span></div><div class="row"><span>New workspace created</span><span>Just now</span></div></div></main></div>`,
  },
  mobile: {
    width: 390, height: 844,
    html: `<style>*{box-sizing:border-box}body{margin:0;background:#f6f3ec;color:#222626;font:16px Arial}.head{background:#173f3c;color:#fff;padding:50px 24px 76px;border-radius:0 0 36px 36px}.head small{opacity:.7}.head h1{font-size:32px;margin:16px 0 5px}.balance{font-size:44px;font-weight:800;margin:35px 0 8px}.row{display:flex;justify-content:space-between}.pills{display:flex;gap:12px;margin:-38px 22px 24px}.pill{flex:1;background:#fff;border-radius:18px;padding:19px;text-align:center;box-shadow:0 10px 25px #143e3825}.main{padding:0 23px}.card{background:#fff;border-radius:22px;padding:21px;margin:17px 0}.card h2{font-size:18px;margin:0 0 15px}.track{background:#e5eeea;height:12px;border-radius:20px;overflow:hidden}.track i{display:block;background:#e4a967;width:68%;height:100%}.entry{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid #edf0ed}.icon{background:#e6f0ea;border-radius:15px;padding:14px}.bottom{position:absolute;bottom:0;width:100%;padding:21px;background:#fff;display:flex;justify-content:space-around;color:#66817c}</style><div class="head"><div class="row"><b>◈ flora</b><span>☼</span></div><h1>Good morning, Maya</h1><small>Your money, growing with you.</small><div class="balance">$24,680.50</div><small>Total balance &nbsp; ↗ 8.4% this month</small></div><div class="pills"><div class="pill">↗<br><b>Send</b></div><div class="pill">↘<br><b>Request</b></div><div class="pill">✦<br><b>Invest</b></div></div><div class="main"><div class="card"><h2>Monthly goal</h2><div class="row"><span>Emergency fund</span><b>$6,800 / $10,000</b></div><p class="track"><i></i></p></div><h2>Activity</h2><div class="card"><div class="entry"><span class="icon">♣</span> Grocery market <b>−$42.80</b></div><div class="entry"><span class="icon">☕</span> Morning coffee <b>−$5.50</b></div><div class="entry"><span class="icon">✦</span> Monthly interest <b style="color:#279778">+$84.30</b></div></div></div><div class="bottom"><span>⌂ Home</span><span>▥ Activity</span><span>◯ Cards</span><span>⚙ More</span></div>`,
  },
  docs: {
    width: 1200, height: 800,
    html: `<style>*{box-sizing:border-box}body{margin:0;color:#dce4f3;background:#111827;font:16px Arial}.top{height:56px;border-bottom:1px solid #2f3b50;padding:17px 28px}.brand{font-weight:800;color:#a8d8ff}.layout{display:flex}.side{width:240px;border-right:1px solid #2f3b50;height:744px;padding:30px 22px;color:#9eacc2}.side div{padding:12px 9px}.sel{color:#8ed3ff;background:#1b2c44;border-radius:8px}.body{padding:45px 58px;max-width:900px}.crumb{color:#86accf;font-size:13px}.body h1{font-size:38px;color:white;margin:16px 0}.body p{font-size:17px;line-height:1.7;color:#b9c6d8}.note{background:#19314a;border-left:3px solid #58b0e4;padding:17px;border-radius:5px;margin:26px 0}.code{border:1px solid #3a4963;border-radius:11px;background:#0b1220;margin-top:28px;overflow:hidden}.codehead{background:#1d293d;padding:14px 20px;color:#a2b3cd}.code pre{font:15px/1.8 Consolas,monospace;padding:20px 25px;margin:0;color:#bad0eb}.pink{color:#e5a4ca}.green{color:#9ed6aa}.cyan{color:#85d8ee}</style><div class="top"><span class="brand">◈ Arc API</span> &nbsp; / &nbsp; Documentation</div><div class="layout"><div class="side"><div>Getting started</div><div class="sel">Quickstart</div><div>Authentication</div><div>SDKs</div><div>API reference</div><div>Webhooks</div></div><div class="body"><div class="crumb">Guides &nbsp; / &nbsp; Getting started</div><h1>Build your first integration</h1><p>Connect to the Arc platform in minutes. Create a client, authenticate your request, and start turning events into insight.</p><div class="note">All examples run locally. Keep your API key in your server environment.</div><h2>Install the SDK</h2><p>Use your preferred package manager to add the official client.</p><div class="code"><div class="codehead">terminal</div><pre>npm install @arc/client</pre></div><h2>Make your first request</h2><div class="code"><div class="codehead">quickstart.ts</div><pre><span class="pink">import</span> { ArcClient } <span class="pink">from</span> <span class="green">"@arc/client"</span>\n\n<span class="pink">const</span> client = <span class="pink">new</span> ArcClient({ apiKey })\n<span class="pink">const</span> events = <span class="pink">await</span> client.events.list()\n<span class="cyan">console.log</span>(events)</pre></div></div></div>`,
  },
};

async function sourceScreenshot(page: Page, kind: "dashboard" | "website" | "mobile" | "docs") {
  if (kind === "website") {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  } else {
    const fixture = fixtures[kind];
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    await page.setContent(fixture.html);
  }
  const image = await page.screenshot();
  if (CAPTURE) { mkdirSync(join(ROOT, "sources"), { recursive: true }); writeFileSync(join(ROOT, "sources", `${kind}.png`), image); }
  return image;
}

const cases = [
  { kind: "dashboard", template: "orbit-launch", ratio: "16:9", preset: "Landscape 1600", width: 1600, height: 900 },
  { kind: "website", template: "copper-editorial", ratio: "4:5", preset: "Portrait 1080", width: 1080, height: 1350 },
  { kind: "mobile", template: "frosted-app", ratio: "9:16", preset: "Tall 1080", width: 1080, height: 1920 },
  { kind: "docs", template: "nocturne-code", ratio: "1:1", preset: "Square 1080", width: 1080, height: 1080 },
] as const;

test.describe.configure({ timeout: 240_000 });
for (const scenario of cases) {
  test(`${scenario.kind} screenshot exports a ${scenario.ratio} premium composition`, async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "The host's Playwright Firefox cannot create a page reliably.");
    await page.addInitScript(() => localStorage.setItem("shotexa.analytics-consent.v1", "rejected"));
    const source = await sourceScreenshot(page, scenario.kind);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/screenshot-beautifier");
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.getByTestId("file-input").setInputFiles({ name: `${scenario.kind}.png`, mimeType: "image/png", buffer: source });
    await expect(page.getByTestId("beautify-stage")).toBeVisible();
    if (scenario.kind === "website" && CAPTURE && browserName === "chromium") {
      await page.getByTestId("beautify-template-orbit-launch").click();
      await page.getByTestId("beautify-inspector").evaluate((element) => { element.parentElement!.scrollTop = 0; });
      mkdirSync(join(ROOT, "after"), { recursive: true });
      await page.screenshot({ path: join(ROOT, "after", "studio-homepage.png") });
    }
    await page.getByTestId(`beautify-template-${scenario.template}`).click();
    await expect(page.getByTestId("beautify-canvas")).toBeVisible();
    await page.getByRole("radiogroup", { name: "Output size" }).getByRole("radio", { name: scenario.preset, exact: true }).click();
    if (scenario.kind === "dashboard") {
      await page.getByTestId("beautify-browse-templates").click();
      await expect(page.getByTestId("beautify-template-dialog")).toBeVisible();
      if (CAPTURE && browserName === "chromium") {
        mkdirSync(join(ROOT, "after"), { recursive: true });
        await page.screenshot({ path: join(ROOT, "after", "template-gallery-desktop.png") });
      }
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("beautify-template-dialog")).toBeHidden();
      await page.getByTestId("beautify-browse-backgrounds").click();
      await expect(page.getByTestId("beautify-background-dialog")).toBeVisible();
      if (CAPTURE && browserName === "chromium") {
        await page.screenshot({ path: join(ROOT, "after", "background-gallery-desktop.png") });
        await page.getByTestId("beautify-background-dialog").locator("div.overflow-y-auto").last().evaluate((element) => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: join(ROOT, "after", "background-gallery-lower.png") });
      }
      await page.getByRole("button", { name: "Close background collection" }).click();
    }
    if (CAPTURE && browserName === "chromium") {
      await page.getByTestId("beautify-inspector").evaluate((element) => { element.parentElement!.scrollTop = 0; });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(ROOT, "after", `${scenario.kind}-editor-desktop.png`) });
    }
    if (scenario.kind === "dashboard") {
      await page.getByTestId("beautify-premium-bg-peach-veil").click();
      await expect(page.getByTestId("beautify-premium-bg-peach-veil")).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Undo" }).first().click();
      await expect(page.getByTestId("beautify-premium-bg-orbit-ink")).toHaveAttribute("aria-pressed", "true");
    }
    const preview = PNG.sync.read(Buffer.from((await page.getByTestId("beautify-canvas").evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"))).split(",")[1], "base64"));
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export").click()]);
    const result = PNG.sync.read(readFileSync((await download.path())!));
    expect(result.width).toBe(scenario.width);
    expect(result.height).toBe(scenario.height);
    expect(result.data[(Math.floor(result.height / 2) * result.width + Math.floor(result.width / 2)) * 4 + 3]).toBe(255);
    // Compare background pixels from the live canvas and encoded export. Content can differ
    // slightly because preview uses the registry bitmap; artwork must not drift.
    for (const [x, y] of [[0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97]]) {
      const pi = (Math.floor(preview.height * y) * preview.width + Math.floor(preview.width * x)) * 4;
      const ri = (Math.floor(result.height * y) * result.width + Math.floor(result.width * x)) * 4;
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(preview.data[pi + channel] - result.data[ri + channel])).toBeLessThan(25);
    }
    if (CAPTURE && browserName === "chromium") {
      mkdirSync(join(ROOT, "exports"), { recursive: true });
      await download.saveAs(join(ROOT, "exports", `${scenario.kind}-${scenario.ratio.replace(":", "x")}.png`));
    }
  });
}

test("mobile editor keeps designs and controls available", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "The host's Playwright Firefox cannot create a page reliably.");
  await page.addInitScript(() => localStorage.setItem("shotexa.analytics-consent.v1", "rejected"));
  const source = await sourceScreenshot(page, "mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/screenshot-beautifier");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByTestId("file-input").setInputFiles({ name: "mobile.png", mimeType: "image/png", buffer: source });
  await expect(page.getByTestId("beautify-stage")).toBeVisible();
  await page.getByTestId("mobile-inspector-trigger").click();
  await page.getByTestId("beautify-browse-templates").last().click();
  await expect(page.getByTestId("beautify-template-dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBeTruthy();
  if (CAPTURE && browserName === "chromium") {
    mkdirSync(join(ROOT, "after"), { recursive: true });
    await page.screenshot({ path: join(ROOT, "after", "template-gallery-mobile.png") });
  }
  await page.getByTestId("beautify-template-frosted-app-gallery").last().click();
  await expect(page.getByTestId("beautify-canvas")).toBeVisible();
  if (CAPTURE && browserName === "chromium") {
    await page.getByRole("button", { name: "Close" }).last().click();
    await page.screenshot({ path: join(ROOT, "after", "mobile-editor.png") });
  }
});
