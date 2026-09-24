/**
 * Spike D browser runner: analysis + PDF export time, memory (OS-level, whole browser process
 * tree), main-thread stalls, progress, cancellation, JPEG vs PNG, overlap, fit pages, and
 * structural validation of every produced PDF (reloaded with pdf-lib in Node).
 *
 *   SHOTEXA_ENABLE_SPIKES=1 npm run build && npx next start -p 3100
 *   npx tsx scripts/spikes/pdf/run-browser.ts --browsers chromium,firefox,webkit [--only single,multi,...] [--tag rep2]
 *
 * Writes docs/spikes/results/pdf-browser-<browser>.json; PDFs go to .cache/pdf-out (not committed).
 */
import { chromium, firefox, webkit, type Browser, type BrowserType } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProcSampler } from "../memory/proc-sampler";
import { validatePdf } from "./validate-pdf";

const MiB = 1024 * 1024;
const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []));
const BASE = args.base || "http://localhost:3100";
const BROWSERS = (args.browsers || "chromium").split(",");
const PDF_FIX = join(process.cwd(), "src", "tests", "fixtures", "pdf");
const B_FIX = join(process.cwd(), ".cache", "spike-b");
const OUT = join(process.cwd(), "docs", "spikes", "results");
const PDF_OUT = join(process.cwd(), ".cache", "pdf-out");
const TYPES: Record<string, { type: BrowserType; launch: Parameters<BrowserType["launch"]>[0] }> = {
  chromium: { type: chromium, launch: { channel: "chromium" } },
  firefox: { type: firefox, launch: {} },
  webkit: { type: webkit, launch: {} },
};
const mib = (b: number) => +(b / MiB).toFixed(1);

/** `pdf:<fixture>` → Spike D fixture; `b:<file>` → Spike B large-image fixture. */
const src = (id: string) => `/__pdf/${id}`;

interface Case {
  id: string;
  images: string[];
  paper?: "a4" | "letter" | "fit";
  mode?: "fixed" | "visual" | "ocr";
  format?: "jpeg" | "png";
  overlapPx?: number;
  reorder?: [number, number];
  /** Manual edit before export: move break 0 of image 0 by dy (snap on). */
  moveFirstBy?: number;
  cancelAfterMs?: number;
  /** Show full-size <img> previews (default off: measure the engine). */
  preview?: boolean;
}

const CASES: Case[] = [
  { id: "single-phone", images: ["b:phone-1080x2400-0.png"] },
  { id: "single-chat", images: ["pdf:chat-light"] },
  { id: "single-chat-fixed", images: ["pdf:chat-light"], mode: "fixed" },
  { id: "single-chat-letter", images: ["pdf:chat-light"], paper: "letter" },
  { id: "single-chat-fit", images: ["pdf:chat-light"], paper: "fit" },
  { id: "multi-4-phone-reorder", images: ["b:phone-1080x2400-0.png", "b:phone-1080x2400-1.png", "b:phone-1080x2400-2.png", "b:phone-1080x2400-3.png"], reorder: [3, 0] },
  { id: "multi-mixed", images: ["pdf:article", "b:phone-1440x3200-0.png", "pdf:code", "pdf:receipt"] },
  { id: "long-5000", images: ["b:tall-1080x5000.png"] },
  { id: "long-10000", images: ["pdf:long-chat-10000"] },
  { id: "long-10000-png", images: ["pdf:long-chat-10000"], format: "png" },
  { id: "long-10000-overlap48", images: ["pdf:long-chat-10000"], overlapPx: 48 },
  { id: "long-20000", images: ["pdf:long-article-20000"] },
  { id: "long-20000-with-preview", images: ["pdf:long-article-20000"], preview: true },
  { id: "long-20000-fit", images: ["pdf:long-article-20000"], paper: "fit" },
  { id: "long-30000", images: ["b:tall-1080x30000.png"] },
  { id: "multi-2x10000", images: ["b:pair-1080x10000-a.png", "b:pair-1080x10000-b.png"] },
  { id: "manual-edit", images: ["pdf:chat-light"], moveFirstBy: -120 },
  { id: "cancel-20000", images: ["pdf:long-article-20000"], cancelAfterMs: 250 },
];
const ONLY = args.only ? args.only.split(",") : CASES.map((c) => c.id);

async function openPage(browser: Browser, sampler: ProcSampler, preview = false) {
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  const net: { url: string; bytes: number }[] = [];
  page.on("requestfinished", async (req) => {
    const url = req.url();
    if (url.includes("/__pdf/")) return;
    try {
      const s = await req.sizes();
      net.push({ url: url.replace(BASE, ""), bytes: s.responseBodySize + s.responseHeadersSize });
    } catch {
      /* ignore */
    }
  });
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.route("**/__pdf/**", (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname.replace("/__pdf/", ""));
    const f = p.startsWith("pdf:") ? join(PDF_FIX, p.slice(4), "image.png") : join(B_FIX, p.slice(2));
    return existsSync(f) ? route.fulfill({ status: 200, contentType: f.endsWith(".jpg") ? "image/jpeg" : "image/png", body: readFileSync(f) }) : route.fulfill({ status: 404 });
  });
  await page.goto(`${BASE}/spikes/pdf${preview ? "" : "?preview=0"}`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.spikeD, null, { timeout: 60_000 });
  await sampler.discover();
  await settle(sampler);
  return { context, page, net, crashed: () => crashed };
}

async function settle(sampler: ProcSampler, maxMs = 8000) {
  const end = Date.now() + maxMs;
  await new Promise((r) => setTimeout(r, 800));
  while (Date.now() < end) {
    const w = sampler.window(Date.now() - 800, Date.now()).map((s) => s.total.priv);
    if (w.length >= 3 && Math.max(...w) - Math.min(...w) < 6 * MiB) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

const memNow = (s: ProcSampler) => s.samples.at(-1)?.total.priv ?? 0;

async function measured<T>(sampler: ProcSampler, base: number, fn: () => Promise<T>) {
  const t0 = Date.now();
  const r = await fn();
  const t1 = Date.now();
  await sampler.discover();
  await sampler.waitFor(t1 + 600);
  const w = sampler.window(t0, t1 + 600);
  const peak = Math.max(...w.map((s) => s.total.priv), base);
  return { r, ms: t1 - t0, peakDeltaMiB: mib(peak - base), afterDeltaMiB: mib(memNow(sampler) - base) };
}

async function runCase(browser: Browser, sampler: ProcSampler, c: Case, name: string) {
  const { context, page, net, crashed } = await openPage(browser, sampler, c.preview);
  const appJsBeforeIntentKiB = Math.round(net.filter((n) => n.url.includes("/_next/")).reduce((s, n) => s + n.bytes, 0) / 1024);
  const netMark = net.length;
  const base = memNow(sampler);
  const out: Record<string, unknown> = { id: c.id, images: c.images, appJsBeforeIntentKiB };
  try {
    await page.evaluate((o) => window.spikeD!.configure(o), { paper: c.paper ?? "a4", marginPt: 28, overlapPx: c.overlapPx ?? 0, mode: c.mode ?? "visual" });
    const load = await measured(sampler, base, () => page.evaluate((s) => window.spikeD!.load(s), c.images.map(src)));
    out.analyse = { ...load.r, peakDeltaMiB: load.peakDeltaMiB, afterDeltaMiB: load.afterDeltaMiB };
    if (c.reorder) await page.evaluate(([a, b]) => window.spikeD!.reorder(a, b), c.reorder);
    if (c.moveFirstBy) {
      const y0 = await page.evaluate(() => window.spikeD!.plan()!.images[0].breaks[0]?.y);
      await page.evaluate(([y, dy]) => window.spikeD!.moveBreak(0, 0, y + dy, true), [y0, c.moveFirstBy]);
      out.manualEdit = { from: y0, requested: y0 + c.moveFirstBy };
    }
    const plan = await page.evaluate(() => window.spikeD!.plan());
    out.plan = {
      pages: plan!.pages.length,
      planMs: plan!.planMs,
      breaks: plan!.images.map((i) => i.breaks.map((b) => ({ y: b.y, idealY: b.idealY, source: b.source, confidence: b.confidence ?? null }))),
      needsReview: plan!.images.reduce((s, i) => s + i.breaks.filter((b) => b.needsReview).length, 0),
      order: plan!.images.map((i) => i.name),
    };
    const exp = await measured(sampler, base, () =>
      page.evaluate((o) => window.spikeD!.exportPdf(o), { format: c.format ?? "jpeg", cancelAfterMs: c.cancelAfterMs, returnBytes: !c.cancelAfterMs }) as Promise<Record<string, unknown>>,
    );
    const { bytes, ...rest } = exp.r;
    out.export = { ...rest, peakDeltaMiB: exp.peakDeltaMiB, afterDeltaMiB: exp.afterDeltaMiB };
    out.pdfLibLoadedKiB = Math.round(net.slice(netMark).filter((n) => n.url.includes("/_next/")).reduce((s, n) => s + n.bytes, 0) / 1024);
    if (typeof bytes === "string") {
      const buf = Buffer.from(bytes, "base64");
      mkdirSync(PDF_OUT, { recursive: true });
      writeFileSync(join(PDF_OUT, `${name}-${c.id}.pdf`), buf);
      out.validation = await validatePdf(buf, plan!.pages, plan!.images.map((i) => ({ width: i.width, height: i.height })), plan!.setup, rest.tileRows as number);
    }
    if (c.cancelAfterMs !== undefined) {
      // After cancelling, a normal export must still work (resources released, worker usable).
      await settle(sampler, 4000);
      out.afterCancelDeltaMiB = mib(memNow(sampler) - base);
      const again = await measured(sampler, base, () => page.evaluate(() => window.spikeD!.exportPdf({ returnBytes: false })) as Promise<Record<string, unknown>>);
      out.exportAfterCancel = { ok: again.r.ok, pages: again.r.pages, ms: again.r.ms, peakDeltaMiB: again.peakDeltaMiB };
    }
    // Retained memory after the job + clearing the workspace (engine disposed, URLs revoked).
    await page.evaluate(() => window.spikeD!.clear());
    await settle(sampler, 5000);
    out.afterClearDeltaMiB = mib(memNow(sampler) - base);
  } catch (e) {
    out.error = String((e as Error).message).slice(0, 400);
  }
  out.crashed = crashed();
  await context.close();
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sampler = new ProcSampler();
  await sampler.start(50);
  try {
    for (const name of BROWSERS) {
      const cfg = TYPES[name];
      const file = join(OUT, `pdf-browser-${name}${args.tag ? `-${args.tag}` : ""}.json`);
      const results: Record<string, unknown> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).results : {};
      const browser = await cfg.type.launch(cfg.launch);
      const env = { browser: name, version: browser.version(), date: new Date().toISOString() };
      console.log(`=== ${name} ${env.version}`);
      for (const c of CASES.filter((x) => ONLY.includes(x.id))) {
        const t = Date.now();
        results[c.id] = await runCase(browser, sampler, c, name);
        const r = results[c.id] as Record<string, Record<string, unknown>>;
        console.log(`${c.id}: ${Math.round((Date.now() - t) / 1000)} s`, r.error ?? "", JSON.stringify({ a: r.analyse?.wallMs, e: r.export?.ms, ok: r.export?.ok, pages: r.export?.pages, peak: r.export?.peakDeltaMiB, v: r.validation?.ok }));
        writeFileSync(file, JSON.stringify({ environment: env, results }, null, 1) + "\n");
      }
      await browser.close();
    }
  } finally {
    sampler.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
