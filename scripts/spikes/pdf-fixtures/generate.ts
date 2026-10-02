/**
 * Spike D — PDF pagination fixtures with DOM-derived ground truth.
 *
 *   npx tsx scripts/spikes/pdf-fixtures/generate.ts
 *
 * src/tests/fixtures/pdf/<id>/image.png + truth.json (text lines + typed content regions),
 * plus manifest.json. All boxes are device pixels in image coordinates.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addInkBands } from "./ink-bands";
import * as S from "./scenes";

interface Spec {
  id: string;
  category: string[];
  description: string;
  html: string;
  width: number; // CSS px
  dpr: number;
  difficult?: boolean;
}

const SPECS: Spec[] = [
  { id: "article", category: ["article"], description: "Headings, paragraphs, lists, quotes, section whitespace", html: S.article({ sections: 3, seed: 3 }), width: 360, dpr: 3 },
  { id: "chat-light", category: ["chat"], description: "Small and multi-line bubbles, day separators", html: S.chat({ messages: 20, seed: 5 }), width: 360, dpr: 3 },
  { id: "chat-dark", category: ["chat", "dark"], description: "Dark chat", html: S.chat({ messages: 20, seed: 9, dark: true }), width: 360, dpr: 3 },
  { id: "code", category: ["code", "dark"], description: "Syntax-highlighted code, long functions, blank lines, comments (DPR 2)", html: S.code({ repeats: 7 }), width: 640, dpr: 2 },
  { id: "table", category: ["table"], description: "Bordered zebra table with header", html: S.table({ rows: 48, seed: 2 }), width: 360, dpr: 3 },
  { id: "settings", category: ["ui"], description: "Cards, fields, section separators", html: S.settings({ sections: 6, seed: 4 }), width: 360, dpr: 3 },
  { id: "receipt", category: ["receipt"], description: "Long receipt: item rows, prices, total", html: S.receipt({ items: 80, seed: 6 }), width: 360, dpr: 3 },
  { id: "long-chat-10000", category: ["chat", "long"], description: "Very long chat ≈1080×10000", html: S.chat({ messages: 31, seed: 12 }), width: 360, dpr: 3 },
  { id: "long-article-20000", category: ["article", "long"], description: "Very long article ≈1080×20000", html: S.article({ sections: 12, seed: 13 }), width: 360, dpr: 3 },
  // Difficult: little or no whitespace near ideal cuts.
  { id: "dense-table", category: ["table", "difficult"], description: "Tight rows, faint borders, no gaps", html: S.table({ rows: 75, dense: true, seed: 7 }), width: 360, dpr: 3, difficult: true },
  { id: "dense-code", category: ["code", "difficult"], description: "Continuous code, 16 px line height, no blank lines (DPR 2)", html: S.code({ repeats: 9, dense: true }), width: 640, dpr: 2, difficult: true },
  { id: "giant-message", category: ["chat", "difficult"], description: "Chat containing one message taller than a page", html: S.chat({ messages: 13, seed: 21, giantAt: 5 }), width: 360, dpr: 3, difficult: true },
  { id: "photos", category: ["article", "difficult"], description: "Article with tall photo blocks", html: S.article({ sections: 4, seed: 17, photos: true }), width: 360, dpr: 3, difficult: true },
  { id: "dense-cards", category: ["ui", "difficult"], description: "Settings cards with 2 px gaps", html: S.settings({ sections: 8, seed: 8, dense: true }), width: 360, dpr: 3, difficult: true },
];

const OUT = join(process.cwd(), "src", "tests", "fixtures", "pdf");

/** Text lines (word boxes grouped into visual lines) + typed regions, in device px. */
const EXTRACT = `(() => {
  const dpr = window.devicePixelRatio;
  const box = (r) => [Math.round((r.left + scrollX) * dpr), Math.round((r.top + scrollY) * dpr), Math.round(r.width * dpr), Math.round(r.height * dpr)];
  const words = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 3) });
  let n;
  while ((n = walker.nextNode())) {
    const re = /\\S+/g; let m;
    while ((m = re.exec(n.textContent))) {
      const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const b = r.getBoundingClientRect(); if (b.width && b.height) words.push({ t: m[0], b: box(b) });
    }
  }
  const lines = []; let cur = null;
  for (const w of words) {
    const last = cur && cur.w[cur.w.length - 1];
    if (last && Math.abs((w.b[1] + w.b[3] / 2) - (last.b[1] + last.b[3] / 2)) < Math.min(w.b[3], last.b[3]) * 0.5 && w.b[0] >= last.b[0]) { cur.w.push(w); continue; }
    cur = { w: [w] }; lines.push(cur);
  }
  const textLines = lines.map((l) => {
    const y0 = Math.min(...l.w.map((w) => w.b[1])), y1 = Math.max(...l.w.map((w) => w.b[1] + w.b[3]));
    const x0 = Math.min(...l.w.map((w) => w.b[0])), x1 = Math.max(...l.w.map((w) => w.b[0] + w.b[2]));
    return { text: l.w.map((w) => w.t).join(' '), box: [x0, y0, x1 - x0, y1 - y0] };
  });
  const regions = [...document.querySelectorAll('[data-region]')].map((el) => ({ type: el.getAttribute('data-region'), box: box(el.getBoundingClientRect()) }));
  return { textLines, regions };
})()`;

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const manifest = [];
  for (const f of SPECS) {
    const ctx = await browser.newContext({ viewport: { width: f.width, height: 800 }, deviceScaleFactor: f.dpr });
    const page = await ctx.newPage();
    await page.setContent(f.html, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready");
    const truth = (await page.evaluate(EXTRACT)) as { textLines: unknown[]; regions: unknown[] };
    const png = await page.screenshot({ type: "png", fullPage: true });
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const dir = join(OUT, f.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "image.png"), png);
    writeFileSync(join(dir, "truth.json"), JSON.stringify({ id: f.id, width, height, ...truth }) + "\n");
    manifest.push({ id: f.id, category: f.category, description: f.description, file: `${f.id}/image.png`, width, height, dpr: f.dpr, difficult: !!f.difficult, textLines: truth.textLines.length, regions: truth.regions.length });
    console.log(`${f.id.padEnd(20)} ${width}×${height}  lines ${truth.textLines.length}  regions ${truth.regions.length}  ${(png.length / 1024).toFixed(0)} KiB`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
