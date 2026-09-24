/**
 * Spike C browser runner: cold start, downloads, warm latency, sizes, strips vs full image,
 * memory (OS-level, whole browser process tree), cancellation, Hindi, and accuracy parity.
 *
 *   SHOTEXA_ENABLE_SPIKES=1 npm run build && npx next start -p 3100
 *   npx tsx scripts/spikes/ocr/run-browser.ts --browsers chromium,firefox,webkit [--only lifecycle,sizes,cancel,hindi,accuracy]
 *
 * Writes docs/spikes/results/ocr-browser-<browser>.json
 */
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProcSampler } from "../memory/proc-sampler";

const MiB = 1024 * 1024;
const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []));
const BASE = args.base || "http://localhost:3100";
const BROWSERS = (args.browsers || "chromium").split(",");
const ONLY = args.only ? args.only.split(",") : ["lifecycle", "sizes", "cancel", "hindi", "accuracy"];
const FIX = join(process.cwd(), "src", "tests", "fixtures", "ocr");
const OUT = join(process.cwd(), "docs", "spikes", "results");
const TYPES: Record<string, { type: BrowserType; launch: Parameters<BrowserType["launch"]>[0] }> = {
  chromium: { type: chromium, launch: { channel: "chromium" } },
  firefox: { type: firefox, launch: {} },
  webkit: { type: webkit, launch: {} },
};
const mib = (b: number) => +(b / MiB).toFixed(1);

type Net = { url: string; bytes: number; kind: string };
function kindOf(url: string) {
  if (url.includes("/vendor/tessdata/")) return "model";
  if (url.includes("/vendor/tesseract-core/")) return "core";
  if (url.includes("/vendor/tesseract/")) return "worker";
  if (url.includes("/_next/")) return "app-js";
  return "other";
}

async function openPage(browser: Browser, sampler: ProcSampler) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const net: Net[] = [];
  page.on("requestfinished", async (req) => {
    const url = req.url();
    if (url.includes("/__ocr/")) return;
    try {
      const s = await req.sizes();
      net.push({ url: url.replace(BASE, ""), bytes: s.responseBodySize + s.responseHeadersSize, kind: kindOf(url) });
    } catch {
      /* ignore */
    }
  });
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.route("**/__ocr/**", (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname.replace("/__ocr/", ""));
    const f = join(FIX, p);
    return existsSync(f) ? route.fulfill({ status: 200, contentType: p.endsWith(".jpg") ? "image/jpeg" : "image/png", body: readFileSync(f) }) : route.fulfill({ status: 404 });
  });
  await page.goto(`${BASE}/spikes/ocr`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.spikeC, null, { timeout: 60_000 });
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

/** Run fn while sampling; returns result + peak/after deltas vs `base`. */
async function measured<T>(sampler: ProcSampler, base: number, fn: () => Promise<T>) {
  const t0 = Date.now();
  const r = await fn();
  const t1 = Date.now();
  await sampler.discover(); // pick up any worker processes spawned meanwhile
  await sampler.waitFor(t1 + 600);
  const w = sampler.window(t0, t1 + 600);
  const peak = Math.max(...w.map((s) => s.total.priv), base);
  return { r, ms: t1 - t0, peakDeltaMiB: mib(peak - base), afterDeltaMiB: mib(memNow(sampler) - base) };
}

const extract = (page: Page, id: string, opts: Record<string, unknown> = {}) =>
  page.evaluate(({ src, opts }) => window.spikeC!.extract(src, opts as never), { src: `/__ocr/${id}/image.${id === "jpeg-q35" ? "jpg" : "png"}`, opts }) as Promise<Record<string, unknown>>;

const brief = (r: Record<string, unknown>) => ({
  ok: r.ok,
  code: r.code ?? null,
  wallMs: Math.round(r.wallMs as number),
  timings: r.timings,
  parts: r.parts,
  preprocessing: r.preprocessing,
  confidence: r.confidence,
  maxStallMs: r.maxStallMs,
  progressEvents: r.progressEvents,
  fallbacks: r.fallbacks,
});

async function lifecycle(browser: Browser, sampler: ProcSampler) {
  const { context, page, net } = await openPage(browser, sampler);
  const base = memNow(sampler);
  const appJsBeforeIntent = net.filter((n) => n.kind === "app-js").reduce((s, n) => s + n.bytes, 0);
  const ocrAssetsBeforeIntent = net.filter((n) => ["worker", "core", "model"].includes(n.kind)).length;
  const out: Record<string, unknown> = { appJsBeforeIntentKiB: Math.round(appJsBeforeIntent / 1024), ocrAssetsBeforeIntent };
  const netMark = net.length;
  const init = await measured(sampler, base, () => page.evaluate(() => window.spikeC!.warmup("eng")));
  out.coldInit = { ms: Math.round(init.r as number), wallMs: init.ms, peakDeltaMiB: init.peakDeltaMiB, idleWorkerDeltaMiB: init.afterDeltaMiB };
  out.coldDownloads = net.slice(netMark).map((n) => ({ ...n, KiB: Math.round(n.bytes / 1024) }));
  const jobs: Record<string, unknown>[] = [];
  for (const id of ["chat-1080x1920", "chat-1080x1920", "article", "code-dark", "receipt"]) {
    const m = await measured(sampler, base, () => extract(page, id));
    jobs.push({ id, ...brief(m.r), peakDeltaMiB: m.peakDeltaMiB, afterDeltaMiB: m.afterDeltaMiB });
  }
  out.warmJobs = jobs;
  const big = await measured(sampler, base, () => extract(page, "long-1080x10000"));
  out.largeJob = { id: "long-1080x10000", ...brief(big.r), peakDeltaMiB: big.peakDeltaMiB, afterRecycleDeltaMiB: big.afterDeltaMiB };
  const dispose = await measured(sampler, base, () => page.evaluate(() => window.spikeC!.dispose()));
  out.afterDisposeDeltaMiB = dispose.afterDeltaMiB;
  const reinit = await measured(sampler, base, () => page.evaluate(() => window.spikeC!.warmup("eng")));
  out.warmReinit = { ms: Math.round(reinit.r as number), downloadsAfterDispose: net.slice(netMark).length - (out.coldDownloads as unknown[]).length };
  await context.close();
  return out;
}

async function sizes(browser: Browser, sampler: ProcSampler) {
  const cases: [string, Record<string, unknown>][] = [
    ["chat-720x1280", {}],
    ["chat-1080x1920", {}],
    ["long-1080x5000", {}],
    ["long-1080x5000", { strips: "off" }],
    ["long-1080x10000", {}],
    ["long-1080x10000", { strips: "off" }],
  ];
  const out = [];
  for (const [id, opts] of cases) {
    const { context, page } = await openPage(browser, sampler);
    await page.evaluate(() => window.spikeC!.warmup("eng"));
    await settle(sampler);
    const base = memNow(sampler);
    const m = await measured(sampler, base, () => extract(page, id, opts));
    out.push({ id, opts, ...brief(m.r), peakDeltaMiB: m.peakDeltaMiB, afterDeltaMiB: m.afterDeltaMiB });
    await context.close();
  }
  return out;
}

async function cancel(browser: Browser, sampler: ProcSampler) {
  const { context, page } = await openPage(browser, sampler);
  await page.evaluate(() => window.spikeC!.warmup("eng"));
  await settle(sampler);
  const base = memNow(sampler);
  const t0 = Date.now();
  const job = extract(page, "long-1080x10000", { strips: "off" });
  await new Promise((r) => setTimeout(r, 2500));
  const tCancel = Date.now();
  await page.evaluate(() => window.spikeC!.cancel());
  const r = await job;
  const tDone = Date.now();
  await sampler.waitFor(tDone + 1500);
  const after = memNow(sampler);
  const next = await measured(sampler, base, () => extract(page, "receipt"));
  await context.close();
  return { result: brief(r), cancelCallToSettledMs: tDone - tCancel, sinceStartMs: tDone - t0, afterCancelDeltaMiB: mib(after - base), nextJob: { ...brief(next.r), peakDeltaMiB: next.peakDeltaMiB } };
}

async function hindi(browser: Browser, sampler: ProcSampler) {
  const { context, page, net } = await openPage(browser, sampler);
  const base = memNow(sampler);
  const mark = net.length;
  const init = await measured(sampler, base, () => page.evaluate(() => window.spikeC!.warmup("hin")));
  const hinDownloads = net.slice(mark).map((n) => ({ url: n.url, KiB: Math.round(n.bytes / 1024) }));
  const mark2 = net.length;
  const both = await measured(sampler, base, () => page.evaluate(() => window.spikeC!.warmup("eng+hin")));
  const bothDownloads = net.slice(mark2).map((n) => ({ url: n.url, KiB: Math.round(n.bytes / 1024) }));
  const job = await measured(sampler, base, () => extract(page, "chat-hindi", { langs: "eng+hin" }));
  await context.close();
  return { hinColdInitMs: Math.round(init.r as number), hinDownloads, engHinInitMs: Math.round(both.r as number), engHinDownloads: bothDownloads, idleDeltaMiB: both.afterDeltaMiB, chatHindi: { ...brief(job.r), peakDeltaMiB: job.peakDeltaMiB } };
}

async function accuracy(browser: Browser, sampler: ProcSampler) {
  const manifest = JSON.parse(readFileSync(join(FIX, "manifest.json"), "utf8")) as { id: string; lang: string; category: string[] }[];
  const { context, page } = await openPage(browser, sampler);
  const out: Record<string, unknown> = {};
  for (const f of manifest) {
    if (f.category.includes("long")) continue; // covered by `sizes`
    const r = await extract(page, f.id, { langs: f.lang === "hin" ? "eng+hin" : f.lang });
    out[f.id] = { ...brief(r), rawText: r.rawText, engineLines: (r.engineLines as { text: string }[] | undefined)?.map((l) => l.text), topDownLines: r.topDownLines };
    console.log(`  accuracy ${f.id} ${r.ok ? "ok" : r.code} ${Math.round(r.wallMs as number)}ms`);
  }
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
      const file = join(OUT, `ocr-browser-${name}.json`);
      const results: Record<string, unknown> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).results : {};
      const browser = await cfg.type.launch(cfg.launch);
      const env = { browser: name, version: browser.version(), date: new Date().toISOString() };
      console.log(`=== ${name} ${env.version}`);
      const steps: Record<string, (b: Browser, s: ProcSampler) => Promise<unknown>> = { lifecycle, sizes, cancel, hindi, accuracy };
      for (const step of ONLY) {
        const t = Date.now();
        try {
          results[step] = await steps[step](browser, sampler);
        } catch (e) {
          results[step] = { error: String((e as Error).message).slice(0, 400) };
        }
        console.log(`${step} done in ${Math.round((Date.now() - t) / 1000)} s`);
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
