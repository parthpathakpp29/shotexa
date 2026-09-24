/**
 * Generates the Smart Stitch benchmark fixtures with real browser rendering (Playwright
 * Chromium). Each fixture is two viewport screenshots of the same page at two known
 * scroll positions, so the expected offset is exact: offsetY = (scrollB − scrollA) × DPR.
 *
 *   npx tsx scripts/spikes/stitch-fixtures/generate.ts
 *
 * Output: src/tests/fixtures/stitch/<id>/{a,b}.<ext> + manifest.json
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderScene, type SceneName, type SceneOptions } from "./scenes";

type Format = "png" | "jpeg" | "webp";
type Expect = "match" | "no-match";

interface FixtureSpec {
  id: string;
  description: string;
  category: string[];
  scene: SceneName;
  sceneB?: { scene: SceneName; options: SceneOptions };
  options: SceneOptions;
  viewport: { width: number; height: number };
  dpr: number;
  scrollA: number;
  scrollB: number;
  format?: Format;
  quality?: number;
  /** Change status-bar clock between shots (realistic phone chrome drift). */
  clockDrift?: boolean;
  expect: Expect;
}

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const FIXTURES: FixtureSpec[] = [
  { id: "chat-light", description: "Phone chat, light, fixed status/app bar + input bar, ~36% content overlap", category: ["chat", "repeated-header", "repeated-footer"], scene: "chat", options: { seed: 11 }, viewport: PHONE, dpr: 3, scrollA: 600, scrollB: 1020, clockDrift: true, expect: "match" },
  { id: "chat-dark", description: "Phone chat, dark mode, fixed chrome", category: ["chat", "dark-mode", "repeated-header"], scene: "chat", options: { seed: 12, dark: true }, viewport: PHONE, dpr: 3, scrollA: 900, scrollB: 1250, clockDrift: true, expect: "match" },
  { id: "chat-light-jpeg", description: "chat-light pair re-encoded as JPEG q=0.7", category: ["chat", "jpeg"], scene: "chat", options: { seed: 11 }, viewport: PHONE, dpr: 3, scrollA: 600, scrollB: 1020, clockDrift: true, format: "jpeg", quality: 0.7, expect: "match" },
  { id: "webpage-article", description: "Desktop article, no fixed chrome, ~30% overlap", category: ["webpage"], scene: "article", options: { seed: 21 }, viewport: DESKTOP, dpr: 1, scrollA: 400, scrollB: 960, expect: "match" },
  { id: "webpage-article-webp", description: "Desktop article (HiDPI) as WebP q=0.8", category: ["webpage", "webp"], scene: "article", options: { seed: 22 }, viewport: DESKTOP, dpr: 2, scrollA: 1200, scrollB: 1700, format: "webp", quality: 0.8, expect: "match" },
  { id: "webpage-dark", description: "Desktop article, dark theme, ~40% overlap", category: ["webpage", "dark-mode"], scene: "article", options: { seed: 23, dark: true }, viewport: DESKTOP, dpr: 1, scrollA: 700, scrollB: 1180, expect: "match" },
  { id: "repeated-header-webpage", description: "Sticky 64px nav + fixed cookie bar, ~25% content overlap", category: ["webpage", "repeated-header", "repeated-footer"], scene: "article", options: { seed: 24, stickyHeader: true, stickyFooter: true }, viewport: DESKTOP, dpr: 1, scrollA: 500, scrollB: 1020, expect: "match" },
  { id: "small-overlap-webpage", description: "Desktop article, 60px (7.5%) overlap", category: ["webpage", "small-overlap"], scene: "article", options: { seed: 25 }, viewport: DESKTOP, dpr: 1, scrollA: 300, scrollB: 1040, expect: "match" },
  { id: "small-overlap-chat", description: "Phone chat, ~57 CSS px of content overlap under fixed chrome", category: ["chat", "small-overlap", "repeated-header"], scene: "chat", options: { seed: 13 }, viewport: PHONE, dpr: 3, scrollA: 700, scrollB: 1300, clockDrift: true, expect: "match" },
  { id: "tiny-overlap-webpage", description: "Desktop article, 24px (3%) overlap — stress", category: ["webpage", "small-overlap"], scene: "article", options: { seed: 26 }, viewport: DESKTOP, dpr: 1, scrollA: 600, scrollB: 1376, expect: "match" },
  { id: "large-overlap-chat", description: "Phone chat, only 90 CSS px scrolled (~86% content overlap)", category: ["chat", "large-overlap"], scene: "chat", options: { seed: 14 }, viewport: PHONE, dpr: 3, scrollA: 1500, scrollB: 1590, clockDrift: true, expect: "match" },
  { id: "large-overlap-webpage", description: "Desktop article, 80px scrolled (90% overlap)", category: ["webpage", "large-overlap"], scene: "article", options: { seed: 27 }, viewport: DESKTOP, dpr: 1, scrollA: 1000, scrollB: 1080, expect: "match" },
  { id: "code-editor", description: "Dark code editor, fixed tab bar + status bar, monospace", category: ["code", "dark-mode", "repeated-header"], scene: "code", options: { seed: 31 }, viewport: DESKTOP, dpr: 1, scrollA: 800, scrollB: 1320, expect: "match" },
  { id: "table-rows", description: "Invoice table — highly repetitive rows", category: ["table", "repeated-header"], scene: "table", options: { seed: 41 }, viewport: DESKTOP, dpr: 1, scrollA: 900, scrollB: 1420, expect: "match" },
  { id: "repetitive-chat", description: "Chat of near-identical short messages (ambiguity stress)", category: ["chat", "repetitive"], scene: "chat", options: { seed: 15, repetitive: true }, viewport: PHONE, dpr: 2, scrollA: 800, scrollB: 1200, clockDrift: true, expect: "match" },
  { id: "non-overlap-chat", description: "Same chat, far-apart scroll positions (same chrome, no shared content)", category: ["chat", "non-overlapping"], scene: "chat", options: { seed: 16 }, viewport: PHONE, dpr: 3, scrollA: 300, scrollB: 2400, clockDrift: true, expect: "no-match" },
  { id: "non-overlap-unrelated", description: "Two unrelated articles of the same width", category: ["webpage", "non-overlapping"], scene: "article", options: { seed: 28 }, sceneB: { scene: "article", options: { seed: 29 } }, viewport: DESKTOP, dpr: 1, scrollA: 400, scrollB: 400, expect: "no-match" },
];

const OUT = join(process.cwd(), "src", "tests", "fixtures", "stitch");

async function scrollTo(page: Page, y: number) {
  return page.evaluate(async (target) => {
    window.scrollTo(0, target);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.scrollY;
  }, y);
}

async function encode(page: Page, png: Buffer, format: Format, quality = 0.8): Promise<Buffer> {
  if (format === "png") return png;
  const b64 = await page.evaluate(
    async ({ src, type, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      return c.toDataURL(type, q).split(",")[1];
    },
    { src: png.toString("base64"), type: `image/${format}`, q: quality },
  );
  return Buffer.from(b64, "base64");
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const manifest = [];
  for (const f of FIXTURES) {
    const ctx = await browser.newContext({ viewport: f.viewport, deviceScaleFactor: f.dpr });
    const page = await ctx.newPage();
    await page.setContent(renderScene(f.scene, f.options), { waitUntil: "load" });
    const yA = await scrollTo(page, f.scrollA);
    const pngA = await page.screenshot({ type: "png" });

    if (f.sceneB) await page.setContent(renderScene(f.sceneB.scene, f.sceneB.options), { waitUntil: "load" });
    if (f.clockDrift) {
      await page.evaluate(() => {
        document.getElementById("clock")!.textContent = "9:42";
        document.getElementById("batt")!.textContent = "▂▄▆ 99%";
      });
    }
    const yB = await scrollTo(page, f.scrollB);
    const pngB = await page.screenshot({ type: "png" });

    const format = f.format ?? "png";
    const ext = format === "jpeg" ? "jpg" : format;
    const dir = join(OUT, f.id);
    mkdirSync(dir, { recursive: true });
    const a = await encode(page, pngA, format, f.quality);
    const b = await encode(page, pngB, format, f.quality);
    writeFileSync(join(dir, `a.${ext}`), a);
    writeFileSync(join(dir, `b.${ext}`), b);

    const width = f.viewport.width * f.dpr;
    const height = f.viewport.height * f.dpr;
    const offsetY = f.expect === "match" ? (yB - yA) * f.dpr : null;
    manifest.push({
      id: f.id,
      description: f.description,
      category: f.category,
      files: { a: `${f.id}/a.${ext}`, b: `${f.id}/b.${ext}` },
      format,
      width,
      height,
      dpr: f.dpr,
      expect: f.expect,
      expectedOffsetY: offsetY,
      expectedOverlap: offsetY === null ? 0 : height - offsetY,
      scroll: { a: yA, b: yB },
    });
    console.log(`${f.id.padEnd(26)} ${width}x${height}  scroll ${yA}→${yB}  offset=${offsetY}  (${a.length + b.length} bytes)`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
