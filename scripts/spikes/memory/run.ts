/**
 * Spike B runner. Drives /spikes/memory in real browsers and measures OS-level memory
 * of the whole browser process tree while each experiment runs.
 *
 *   npm run dev   (in another terminal)
 *   npx tsx scripts/spikes/memory/run.ts --browsers chromium,firefox,webkit [--filter decode] [--base http://localhost:3000]
 *
 * Writes docs/spikes/results/memory-<browser>.json
 */
import { chromium, firefox, webkit, type Browser, type BrowserType } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, type Case } from "./cases";
import { ProcSampler, type ProcSample } from "./proc-sampler";

const CACHE_DIR = join(process.cwd(), ".cache", "spike-b");
const OUT_DIR = join(process.cwd(), "docs", "spikes", "results");
const MiB = 1024 * 1024;

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []),
);
const BASE = args.base || "http://localhost:3000";
const BROWSERS = (args.browsers || "chromium").split(",");
const FILTER = args.filter || "";
const CASE_TIMEOUT = Number(args.timeout || 180_000);
const VERBOSE = "verbose" in args;
/** Run every case on the main thread (for engines without OffscreenCanvas in workers). */
const FORCE_CTX = args["force-ctx"] as "main" | undefined;
/** Suffix for the results file, e.g. --tag main → memory-webkit-main.json */
const TAG = args.tag ? `-${args.tag}` : "";
const log = (...a: unknown[]) => VERBOSE && console.log(new Date().toISOString().slice(11, 23), ...a);

const TYPES: Record<string, { type: BrowserType; launch: Parameters<BrowserType["launch"]>[0] }> = {
  // Full Chromium in new-headless mode (closer to Chrome than the headless shell).
  chromium: { type: chromium, launch: { channel: "chromium", args: ["--js-flags=--expose-gc"] } },
  firefox: { type: firefox, launch: {} },
  webkit: { type: webkit, launch: {} },
};

const mime = (f: string) => (f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg");
const mib = (b: number) => +(b / MiB).toFixed(1);

function category(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("gpu")) return "gpu";
  if (n.includes("network")) return "network";
  if (n.includes("webprocess") || n === "renderer" || n.startsWith("content-tab")) return "content/renderer";
  return n;
}

function summarise(samples: ProcSample[], baseline: ProcSample[], phases: { name: string; t: number }[], endT: number, tail: ProcSample[]) {
  const med = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : 0);
  const base = med(baseline.map((s) => s.total.priv));
  const baseWs = med(baseline.map((s) => s.total.ws));
  const peak = samples.reduce((m, s) => (s.total.priv > m.total.priv ? s : m), samples[0] ?? baseline.at(-1)!);
  const peakWs = Math.max(...samples.map((s) => s.total.ws), baseWs);
  // Peak per phase.
  const perPhase: Record<string, number> = {};
  for (let i = 0; i < phases.length - 1; i++) {
    const w = samples.filter((s) => s.t >= phases[i].t && s.t <= phases[i + 1].t);
    if (w.length) perPhase[phases[i].name] = mib(Math.max(...w.map((s) => s.total.priv)) - base);
  }
  // Largest single process at peak and its growth vs baseline.
  const baseByPid = new Map((baseline.at(-1)?.procs ?? []).map((p) => [p.pid, p.priv]));
  const byProc = (peak?.procs ?? [])
    .map((p) => ({ name: category(p.name), deltaMiB: mib(p.priv - (baseByPid.get(p.pid) ?? 0)), privMiB: mib(p.priv) }))
    .sort((a, b) => b.deltaMiB - a.deltaMiB)
    .slice(0, 3);
  const retained = tail.length ? mib(tail.at(-1)!.total.priv - base) : null;
  return {
    baselineMiB: mib(base),
    peakDeltaMiB: peak ? mib(peak.total.priv - base) : null,
    peakWsDeltaMiB: mib(peakWs - baseWs),
    retainedAfterMiB: retained,
    perPhaseDeltaMiB: perPhase,
    topProcessesAtPeak: byProc,
    samples: samples.length,
    sampleEndT: endT,
  };
}

/** Wait until total browser memory stops moving (async frees from the previous case). */
async function settle(sampler: ProcSampler, maxMs = 10_000) {
  const end = Date.now() + maxMs;
  await new Promise((r) => setTimeout(r, 1000));
  while (Date.now() < end) {
    const w = sampler.window(Date.now() - 1000, Date.now()).map((s) => s.total.priv);
    if (w.length >= 3 && Math.max(...w) - Math.min(...w) < 8 * MiB) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function runCase(browser: Browser, sampler: ProcSampler, c: Case) {
  const context = await browser.newContext();
  const page = await context.newPage();
  let crashed = false;
  const crash = new Promise<"crash">((resolve) => page.on("crash", () => ((crashed = true), resolve("crash"))));
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  await page.route("**/__spikeb/**", async (route) => {
    const file = decodeURIComponent(new URL(route.request().url()).pathname.replace("/__spikeb/", ""));
    const path = join(CACHE_DIR, file);
    if (!existsSync(path)) return route.fulfill({ status: 404, body: "missing" });
    await route.fulfill({ status: 200, contentType: mime(file), body: readFileSync(path) });
  });
  try {
    log("goto");
    await page.goto(`${BASE}/spikes/memory`, { waitUntil: "load", timeout: 120_000 });
    log("loaded");
    await page.getByTestId("harness-ready").filter({ hasText: /^ready$/ }).waitFor({ timeout: 120_000 });
    log("ready");
    // Warm-up in the same execution context: worker creation cost belongs to the baseline.
    await page.evaluate((ctx) => window.spikeB!.run(ctx, "noop" as never, {}), c.ctx);
    const nProcs = await sampler.discover();
    log("processes", nProcs);
    await settle(sampler);
    const tBase = Date.now();
    await page.waitForTimeout(1000);
    const baseline = sampler.window(tBase, Date.now());

    const t0 = Date.now();
    log("run", c.id);
    const run = page.evaluate(({ ctx, name, params }) => window.spikeB!.run(ctx, name as never, params), { ctx: c.ctx, name: c.name, params: c.params });
    const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), CASE_TIMEOUT));
    const outcome = await Promise.race([run.then((r) => ({ r })), crash, timeout]).catch((e: Error) => ({ error: e.message.slice(0, 300) }));
    const t1 = Date.now();
    log("done", typeof outcome === "string" ? outcome : "result");
    if (c.recycleAfter && outcome !== "crash") await page.evaluate(() => window.spikeB!.recycle()).catch(() => {});
    await sampler.waitFor(t1 + 2500);
    const samples = sampler.window(t0, t1);
    const tail = sampler.window(t1 + 2000, t1 + 2500);

    let result: Record<string, unknown>;
    if (outcome === "crash") result = { ok: false, error: "RENDERER_CRASHED" };
    else if (outcome === "timeout") result = { ok: false, error: `TIMEOUT_${CASE_TIMEOUT}ms` };
    else if ("error" in outcome) result = { ok: false, error: crashed ? "RENDERER_CRASHED" : outcome.error };
    else result = outcome.r as Record<string, unknown>;

    const phases = (result.phases as { name: string; t: number }[] | undefined) ?? [
      { name: "start", t: t0 },
      { name: "end", t: t1 },
    ];
    delete result.phases;
    return { ...result, memory: summarise(samples, baseline, phases, t1, tail), wallMs: t1 - t0, consoleErrors: consoleErrors.slice(0, 5) };
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const sampler = new ProcSampler();
  log("sampler starting");
  await sampler.start(50);
  log("sampler started");
  try {
    for (const name of BROWSERS) {
      const cfg = TYPES[name];
      const cases = CASES.filter((c) => (!c.browsers || c.browsers.includes(name)) && c.id.includes(FILTER))
        .filter((c) => !(FORCE_CTX && c.name === "stitchAnalyse")) // bitmap sources need OffscreenCanvas
        .map((c) => (FORCE_CTX ? { ...c, ctx: FORCE_CTX } : c));
      const outFile = join(OUT_DIR, `memory-${name}${TAG}.json`);
      const prior = FILTER && existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : null;
      const results: Record<string, unknown> = prior?.results ?? {};
      let browser = await cfg.type.launch(cfg.launch);
      const env = { forcedCtx: FORCE_CTX ?? null, browser: name, version: browser.version(), os: `${process.platform} ${process.arch}`, date: new Date().toISOString() };
      console.log(`\n=== ${name} ${env.version} — ${cases.length} cases`);
      for (const c of cases) {
        if (!browser.isConnected()) browser = await cfg.type.launch(cfg.launch);
        const r = (await runCase(browser, sampler, c).catch((e: Error) => ({ ok: false, error: `RUNNER: ${e.message.slice(0, 300)}` }))) as Record<string, unknown> & { memory?: { peakDeltaMiB: number | null } };
        results[c.id] = { group: c.group, ctx: c.ctx, name: c.name, params: c.params, ...r };
        console.log(`${c.id.padEnd(36)} ${r.ok ? "ok  " : "FAIL"} ${String(r.wallMs ?? "").padStart(6)}ms  peak+${r.memory?.peakDeltaMiB ?? "?"} MiB ${r.ok ? "" : String(r.error ?? "").slice(0, 100)}`);
        writeFileSync(outFile, JSON.stringify({ environment: env, results }, null, 2) + "\n");
        await new Promise((r) => setTimeout(r, 500));
      }
      await browser.close().catch(() => {});
    }
  } finally {
    sampler.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
