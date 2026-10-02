/**
 * Spike E browser flows (real UI: file input → inspect → Privacy Clean → download), in Chromium,
 * Firefox and WebKit. Every download is re-verified in Node with the engine and a byte-grep for
 * the synthetic values. Screenshots never leave the page (no non-GET / body-carrying requests).
 */
import { expect, test, type Page } from "@playwright/test";
import exifr from "exifr";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspectBytes, verifyBytes } from "../../core/metadata/engine-core";

const FIX = join(process.cwd(), "src", "tests", "fixtures", "metadata");
const fx = (p: string) => join(FIX, p);

test.describe.configure({ timeout: 120_000 });

async function openSpike(page: Page) {
  const requests: { method: string; body: number; url: string }[] = [];
  page.on("request", (r) => requests.push({ method: r.method(), body: r.postDataBuffer()?.length ?? 0, url: r.url() }));
  await page.goto("/spikes/metadata");
  await page.waitForFunction(() => !!window.spikeE, null, { timeout: 60_000 });
  return requests;
}

/** Upload (unless the file was just added) → Privacy Clean → download → verify in Node. */
async function cleanAndDownload(page: Page, file: string, alreadyAdded = false) {
  if (!alreadyAdded) await page.getByLabel("Add images").setInputFiles(fx(file));
  const entry = page.getByTestId("entry").last();
  await expect(entry.getByTestId("privacy")).toBeVisible({ timeout: 30_000 });
  await entry.getByRole("button", { name: "Privacy Clean" }).click();
  await expect(entry.getByTestId("verification")).toContainText("Privacy Clean complete — verified", { timeout: 30_000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), entry.getByRole("link", { name: "Download" }).click()]);
  const out = new Uint8Array(readFileSync((await dl.path())!));
  const original = new Uint8Array(readFileSync(fx(file)));
  const v = verifyBytes(out, { original });
  expect(v.problems).toEqual([]);
  expect(Buffer.from(out).includes(Buffer.from("SHOTEXA-FAKE"))).toBe(false);
  expect(Buffer.from(out).includes(Buffer.from("SHOTEXA-FAKE", "utf16le"))).toBe(false);
  return { entry, out };
}

const noUploads = (reqs: { method: string; body: number }[]) => expect(reqs.filter((r) => r.method !== "GET" || r.body > 0)).toEqual([]);

test("homepage loads no metadata engine or image worker", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.goto("/", { waitUntil: "load" });
  // Not "networkidle": the dev server's HMR connection can keep it from settling (Firefox flake).
  await page.waitForTimeout(3000);
  expect(urls.filter((u) => /metadata|image\.worker/i.test(u))).toEqual([]);
});

test("JPEG with GPS/EXIF/XMP/IPTC → findings shown → Privacy Clean → verified download", async ({ page }) => {
  const reqs = await openSpike(page);
  await page.getByLabel("Add images").setInputFiles(fx("jpeg/kitchen-sink.jpg"));
  const entry = page.getByTestId("entry").last();
  await expect(entry.getByTestId("privacy")).toContainText("GPS latitude");
  await expect(entry.getByTestId("privacy")).toContainText("Camera/device model");
  await expect(entry).toContainText("ICC colour profile"); // preserved column
  const { out } = await cleanAndDownload(page, "jpeg/kitchen-sink.jpg", true);
  await expect(page.getByTestId("verification").last()).toContainText("image data byte-identical");
  await expect(page.getByTestId("verification").last()).toContainText("dimensions unchanged");
  const ins = inspectBytes(out);
  expect(ins.hasPrivacyMetadata).toBe(false);
  expect(ins.colorProfile).toBe("icc");
  const oracle = (await exifr.parse(Buffer.from(out), { gps: true, xmp: true, iptc: true, ifd1: true, mergeOutput: false })) ?? {};
  expect([oracle.gps, oracle.xmp, oracle.iptc, oracle.ifd1]).toEqual([undefined, undefined, undefined, undefined]);
  noUploads(reqs);
});

test("no privacy metadata → honest message, nothing rewritten", async ({ page }) => {
  await openSpike(page);
  await page.getByLabel("Add images").setInputFiles(fx("png/clean.png"));
  const entry = page.getByTestId("entry").last();
  await expect(entry.getByTestId("no-privacy")).toHaveText("No privacy-sensitive metadata found.");
  await expect(entry.getByRole("button", { name: "Nothing to remove" })).toBeDisabled();
});

test("oriented JPEG stays oriented (minimal EXIF), PNG ICC profile preserved, animated WebP intact", async ({ page }) => {
  await openSpike(page);
  const o = await cleanAndDownload(page, "jpeg/orientation-6.jpg");
  expect(inspectBytes(o.out).orientation).toBe(6);
  await expect(o.entry.getByTestId("verification")).toContainText("orientation kept");
  const icc = await cleanAndDownload(page, "png/icc.png");
  expect(inspectBytes(icc.out).colorProfile).toBe("icc");
  const anim = await cleanAndDownload(page, "webp/animated.webp");
  expect(inspectBytes(anim.out).animated).toBe(true);
});

test("extension/MIME/signature mismatch → controlled error", async ({ page }) => {
  await openSpike(page);
  await page.getByLabel("Add images").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(fx("png/clean.png")) });
  await expect(page.getByTestId("error").last()).toHaveText("METADATA_INVALID_FILE");
});
