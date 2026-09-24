/**
 * Spike C — OCR fixtures with exact, DOM-derived ground truth.
 *
 *   npx tsx scripts/spikes/ocr-fixtures/generate.ts
 *
 * For every fixture: src/tests/fixtures/ocr/<id>/image.<ext> + expected.json + expected.txt,
 * plus manifest.json. Ground truth = every rendered word (text + device-pixel box) grouped
 * into visual lines in logical (DOM) reading order.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import * as S from "./scenes";

type Category = "ui" | "article" | "chat" | "dark" | "small-text" | "code" | "table" | "receipt" | "low-contrast" | "mixed-layout" | "hindi" | "mixed-language" | "long" | "orientation";

interface Spec {
  id: string;
  category: Category[];
  description: string;
  html: string;
  viewport: { width: number; height: number };
  dpr: number;
  lang: "eng" | "hin" | "eng+hin";
  format?: "png" | "jpeg";
  quality?: number;
  /** Rotate the rendered PNG 90° clockwise (orientation test). */
  rotate90?: boolean;
  /** Expected source lines with indentation (code fixtures). */
  sourceLines?: string[];
}

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const SPECS: Spec[] = [
  { id: "web-clean", category: ["ui"], description: "Clean landing page: nav, hero, buttons, feature columns", html: S.webClean(), viewport: DESKTOP, dpr: 1, lang: "eng" },
  { id: "article", category: ["article"], description: "Text-heavy serif article, 18px body", html: S.article(), viewport: DESKTOP, dpr: 1, lang: "eng" },
  { id: "article-dark", category: ["article", "dark"], description: "Same article family in dark theme", html: S.article({ dark: true, seed: 5 }), viewport: DESKTOP, dpr: 1, lang: "eng" },
  { id: "settings-desktop", category: ["ui"], description: "Desktop settings: sidebar + label/description/value rows", html: S.settingsDesktop(), viewport: DESKTOP, dpr: 1, lang: "eng" },
  { id: "chat-light", category: ["chat"], description: "WhatsApp-style light chat, multi-line bubbles, timestamps, emoji (DPR 3)", html: S.chat({}), viewport: PHONE, dpr: 3, lang: "eng" },
  { id: "chat-dark", category: ["chat", "dark"], description: "WhatsApp-style dark chat (DPR 3)", html: S.chat({ dark: true, seed: 3 }), viewport: PHONE, dpr: 3, lang: "eng" },
  { id: "phone-settings-2x", category: ["small-text", "ui"], description: "Phone settings list, 14px text at DPR 2", html: S.phoneSettings({ fontPx: 14 }), viewport: PHONE, dpr: 2, lang: "eng" },
  { id: "phone-dense-3x", category: ["small-text", "ui"], description: "Dense phone settings, 11px text at DPR 3", html: S.phoneSettings({ fontPx: 11, dense: true }), viewport: PHONE, dpr: 3, lang: "eng" },
  { id: "phone-tiny-1x", category: ["small-text"], description: "Dense phone settings, 11px text at DPR 1 (tiny pixels)", html: S.phoneSettings({ fontPx: 11, dense: true }), viewport: PHONE, dpr: 1, lang: "eng" },
  { id: "code-dark", category: ["code", "dark"], description: "Dark editor, 14px Consolas, line numbers, symbol-heavy TypeScript", html: S.codeEditor({ dark: true, lineNumbers: true }), viewport: { width: 1000, height: 400 }, dpr: 1, lang: "eng", sourceLines: S.CODE_LINES },
  { id: "code-light", category: ["code"], description: "Light editor, no line numbers, same code", html: S.codeEditor({ dark: false, lineNumbers: false }), viewport: { width: 1000, height: 400 }, dpr: 1, lang: "eng", sourceLines: S.CODE_LINES },
  { id: "code-dark-2x", category: ["code", "dark"], description: "Dark editor at DPR 2 (HiDPI laptop)", html: S.codeEditor({ dark: true, lineNumbers: true }), viewport: { width: 1000, height: 400 }, dpr: 2, lang: "eng", sourceLines: S.CODE_LINES },
  { id: "table", category: ["table"], description: "Invoice table: header, zebra rows, numbers, dates", html: S.table(), viewport: { width: 1000, height: 600 }, dpr: 1, lang: "eng" },
  { id: "receipt", category: ["receipt"], description: "Receipt: mixed fonts/sizes, prices, date/time, totals", html: S.receipt(), viewport: { width: 520, height: 700 }, dpr: 1, lang: "eng" },
  { id: "low-contrast", category: ["low-contrast"], description: "Gray #8f8f8f text on #c9c9c9", html: S.article({ lowContrast: true, seed: 2, paragraphs: 3 }), viewport: DESKTOP, dpr: 1, lang: "eng" },
  { id: "jpeg-q35", category: ["low-contrast"], description: "Article screenshot re-encoded as JPEG q=0.35 (compression artefacts)", html: S.article({ seed: 8, paragraphs: 3 }), viewport: DESKTOP, dpr: 1, lang: "eng", format: "jpeg", quality: 0.35 },
  { id: "blurred", category: ["low-contrast"], description: "Article with 0.8px blur", html: S.article({ blur: true, seed: 11, paragraphs: 3 }), viewport: DESKTOP, dpr: 1, lang: "eng" },
  { id: "mixed-cards", category: ["mixed-layout", "ui"], description: "Heading, paragraph, buttons, 3 cards with badges, footer", html: S.mixedCards(), viewport: DESKTOP, dpr: 1, lang: "eng" },
  { id: "two-column", category: ["mixed-layout", "article"], description: "Two-column article (reading-order test)", html: S.twoColumn(), viewport: DESKTOP, dpr: 1, lang: "eng" },
  { id: "hindi-article", category: ["hindi"], description: "Hindi (Devanagari) article, 20px", html: S.hindiArticle(), viewport: DESKTOP, dpr: 1, lang: "hin" },
  { id: "chat-hindi", category: ["hindi", "chat"], description: "Hindi chat (DPR 3)", html: S.chat({ lang: "hi", messages: 10 }), viewport: PHONE, dpr: 3, lang: "hin" },
  { id: "chat-mixed-en-hi", category: ["mixed-language", "chat"], description: "Mixed English + Hindi chat (DPR 3)", html: S.chat({ lang: "mixed", messages: 10, seed: 1 }), viewport: PHONE, dpr: 3, lang: "eng+hin" },
  { id: "chat-1080x1920", category: ["chat", "long"], description: "Phone chat 360×640 @3 = 1080×1920", html: S.chat({ messages: 8, seed: 4 }), viewport: { width: 360, height: 640 }, dpr: 3, lang: "eng" },
  { id: "chat-720x1280", category: ["chat"], description: "Small phone chat 360×640 @2 = 720×1280", html: S.chat({ messages: 8, seed: 4 }), viewport: { width: 360, height: 640 }, dpr: 2, lang: "eng" },
  { id: "long-1080x5000", category: ["long", "chat"], description: "Long chat screenshot ~1080×5000", html: S.chat({ messages: 23, seed: 6 }), viewport: { width: 360, height: 640 }, dpr: 3, lang: "eng" },
  { id: "long-1080x10000", category: ["long", "chat"], description: "Long chat screenshot ~1080×10000", html: S.chat({ messages: 47, seed: 7 }), viewport: { width: 360, height: 640 }, dpr: 3, lang: "eng" },
  { id: "rotated-90", category: ["orientation"], description: "Article rotated 90° clockwise", html: S.article({ seed: 14, paragraphs: 2 }), viewport: { width: 1000, height: 800 }, dpr: 1, lang: "eng", rotate90: true },
];

const OUT = join(process.cwd(), "src", "tests", "fixtures", "ocr");

export interface GtWord {
  text: string;
  box: [number, number, number, number]; // x, y, w, h (device px)
  emoji: boolean;
}
export interface GtLine {
  text: string;
  box: [number, number, number, number];
  words: GtWord[];
}

/** Runs in the page: DOM-order words with boxes, grouped into visual lines. */
const EXTRACT = `(() => {
  const dpr = window.devicePixelRatio;
  const words = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const el = n.parentElement;
      if (!el || el.closest('[data-ocr-ignore]')) return NodeFilter.FILTER_REJECT;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return NodeFilter.FILTER_REJECT;
      return n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const emojiRe = /\\p{Extended_Pictographic}/u;
  let n;
  while ((n = walker.nextNode())) {
    const text = n.textContent;
    const re = /\\S+/g;
    let m;
    while ((m = re.exec(text))) {
      const r = document.createRange();
      r.setStart(n, m.index);
      r.setEnd(n, m.index + m[0].length);
      const b = r.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      words.push({ text: m[0], box: [(b.left + scrollX) * dpr, (b.top + scrollY) * dpr, b.width * dpr, b.height * dpr], emoji: emojiRe.test(m[0]) });
    }
  }
  const lines = [];
  let cur = null;
  for (const w of words) {
    const [x, y, ww, h] = w.box;
    const cy = y + h / 2;
    if (cur) {
      const last = cur.words[cur.words.length - 1];
      const [lx, ly, lw, lh] = last.box;
      const lcy = ly + lh / 2;
      const sameRow = Math.abs(cy - lcy) < Math.min(h, lh) * 0.5;
      const gap = x - (lx + lw);
      // New line: different row, wrapped (x went back), or a column-sized gap.
      if (sameRow && gap > -1 && gap < Math.max(h, lh) * 2.5) { cur.words.push(w); continue; }
    }
    cur = { words: [w] };
    lines.push(cur);
  }
  return lines.map((l) => {
    const xs = l.words.map((w) => w.box[0]), ys = l.words.map((w) => w.box[1]);
    const x1 = Math.max(...l.words.map((w) => w.box[0] + w.box[2])), y1 = Math.max(...l.words.map((w) => w.box[1] + w.box[3]));
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { text: l.words.map((w) => w.text).join(' '), box: [x0, y0, x1 - x0, y1 - y0], words: l.words };
  });
})()`;

async function encodeJpeg(page: Page, png: Buffer, quality: number): Promise<Buffer> {
  const b64 = (await page.evaluate(`(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,${png.toString("base64")}'; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/jpeg', ${quality}).split(',')[1];
  })()`)) as string;
  return Buffer.from(b64, "base64");
}

function rotatePng90(buf: Buffer): Buffer {
  const src = PNG.sync.read(buf);
  const dst = new PNG({ width: src.height, height: src.width });
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const s = (y * src.width + x) * 4;
      const dx = src.height - 1 - y;
      const d = (x * dst.width + dx) * 4;
      src.data.copy(dst.data, d, s, s + 4);
    }
  return PNG.sync.write(dst);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const manifest = [];
  for (const f of SPECS) {
    const ctx = await browser.newContext({ viewport: f.viewport, deviceScaleFactor: f.dpr });
    const page = await ctx.newPage();
    await page.setContent(f.html, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready");
    const lines = (await page.evaluate(EXTRACT)) as GtLine[];
    let img: Buffer = await page.screenshot({ type: "png", fullPage: true });
    const png = PNG.sync.read(img);
    let width = png.width;
    let height = png.height;
    let ext = "png";
    if (f.format === "jpeg") {
      img = await encodeJpeg(page, img, f.quality ?? 0.5);
      ext = "jpg";
    }
    if (f.rotate90) {
      img = rotatePng90(img);
      [width, height] = [height, width];
    }
    // Keep only words fully inside the captured image (full-page captures include everything).
    const inside = (b: number[]) => b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= png.width + 1 && b[1] + b[3] <= png.height + 1;
    const gt = lines.filter((l) => inside(l.box));
    const dir = join(OUT, f.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `image.${ext}`), img);
    const expected = {
      id: f.id,
      lang: f.lang,
      // Boxes are in the UNROTATED image frame for rotated fixtures.
      boxesFrame: f.rotate90 ? "unrotated" : "image",
      lines: gt,
      sourceLines: f.sourceLines ?? null,
    };
    writeFileSync(join(dir, "expected.json"), JSON.stringify(expected, null, 1) + "\n");
    writeFileSync(join(dir, "expected.txt"), gt.map((l) => l.text).join("\n") + "\n");
    const wordCount = gt.reduce((s, l) => s + l.words.length, 0);
    manifest.push({ id: f.id, category: f.category, description: f.description, file: `${f.id}/image.${ext}`, format: ext === "jpg" ? "jpeg" : "png", width, height, dpr: f.dpr, lang: f.lang, lines: gt.length, words: wordCount, rotate90: !!f.rotate90 });
    console.log(`${f.id.padEnd(20)} ${String(width).padStart(5)}×${String(height).padEnd(6)} ${String(gt.length).padStart(3)} lines ${String(wordCount).padStart(4)} words  ${(img.length / 1024).toFixed(0)} KiB`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
