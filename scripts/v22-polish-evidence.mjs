/** Capture the same local review flow before and after the focused UX pass. */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const phase = process.argv[2];
if (phase !== "before" && phase !== "after") throw new Error("Use before or after");
const root = join(process.cwd(), "docs", "v2.2", "polish");
const fixtures = join(root, "fixtures");
const output = join(root, phase);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
await page.goto(new URL("/screenshot-beautifier", process.env.E2E_BASE_URL ?? "http://localhost:3100").toString(), { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(3000); // allow the client workspace provider to hydrate before setting files
const consent = page.getByRole("button", { name: "Reject Google Analytics" });
if (await consent.waitFor({ state: "visible", timeout: 1500 }).then(() => true).catch(() => false)) await consent.click();
await page.getByTestId("file-input").setInputFiles([join(fixtures, "saas-desktop.png"), join(fixtures, "saas-mobile.png")]);
await page.getByTestId("file-item").first().waitFor({ state: "visible", timeout: 30_000 });
await page.getByTestId("beautify-stage").waitFor({ state: "visible", timeout: 60_000 });
await page.getByRole("button", { name: "Watermark Stamp Pro" }).click();
await page.getByTestId("watermark-add-text").click();
await page.getByLabel("Watermark text").fill("NORTHSTAR");
await page.getByLabel("Watermark color").fill("#172033");
await page.getByLabel("Repeat across image").click();
await page.getByLabel("Upload watermark logo").setInputFiles(join(fixtures, "northstar-logo-transparent.png"));
await page.waitForTimeout(500);
await page.screenshot({ path: join(output, "watermark-desktop.png") });
await page.getByTestId("open-screenshot-packs").click();
await page.getByTestId("screenshot-pack-workspace").waitFor({ state: "visible" });
await page.screenshot({ path: join(output, "pack-desktop.png") });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: join(output, "pack-mobile.png") });
await page.getByRole("button", { name: "Pack controls" }).click();
await page.screenshot({ path: join(output, "pack-mobile-controls.png") });
await browser.close();
console.log(`Wrote ${phase} captures to ${output}`);
