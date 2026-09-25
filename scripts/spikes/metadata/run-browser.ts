/**
 * Spike E browser runner: decode checks (pixels, dimensions, orientation, alpha, colour) of
 * original vs cleaned vs "strip everything" in each engine, output determinism vs Node, Canvas
 * export metadata, input mismatches, large images (container clean vs decode+re-encode, OS-level
 * memory), main thread vs Image Worker, and a 25-file batch with memory after each file.
 *
 *   SHOTEXA_ENABLE_SPIKES=1 npm run build && npx next start -p 3100
 *   npx tsx scripts/spikes/metadata/run-browser.ts --browsers chromium,firefox,webkit [--only fixtures,canvas,…]
 *
 * Writes docs/spikes/results/metadata-browser-<browser>.json
 */
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanBytes } from "../../../src/core/metadata/engine-core";
import { ProcSampler } from "../memory/proc-sampler";
import { cat, exifApp1, jpegWith, pngChunk, pngWith, privacyExif, riff, riffChunk, vp8x, WEBP_FLAG, webpChunks } from "../metadata-fixtures/build";

const MiB = 1024 * 1024;
const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []));
const BASE = args.base || "http://localhost:3100";
const BROWSERS = (args.browsers || "chromium").split(",");
const ONLY = args.only ? args.only.split(",") : ["fixtures", "canvas", "mismatch", "large", "batch"];
const FIX = join(process.cwd(), "src", "tests", "fixtures", "metadata");
const BFIX = join(process.cwd(), ".cache", "spike-b");
const OUT = join(process.cwd(), "docs", "spikes", "results");
const TYPES: Record<string, { type: BrowserType; launch: Parameters<BrowserType["launch"]>[0] }> = {
  chromium: { type: chromium, launch: { channel: "chromium" } },
  firefox: { type: firefox, launch: {} },
  webkit: { type: webkit, launch: {} },
};
const mib = (b: number) => +(b / MiB).toFixed(1);
const manifest: { id: string; file: string; format: string; expect: Record<string, unknown> }[] = JSON.parse(readFileSync(join(FIX, "manifest.json"), "utf8"));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 24);

/** Large inputs: Spike B tall images with the privacy EXIF injected (built in Node, served via route). */
const LARGE: Record<string, () => Uint8Array> = {
  "phone-1080x2400.png": () => pngWith(new Uint8Array(readFileSync(join(BFIX, "phone-1080x2400-0.png"))), [pngChunk("eXIf", privacyExif())]),
  "tall-1080x10000.jpg": () => jpegWith(new Uint8Array(readFileSync(join(BFIX, "tall-1080x10000.jpg"))), [exifApp1(privacyExif())]),
  "tall-1080x20000.jpg": () => jpegWith(new Uint8Array(readFileSync(join(BFIX, "tall-1080x20000.jpg"))), [exifApp1(privacyExif())]),
  "tall-1080x10000.png": () => pngWith(new Uint8Array(readFileSync(join(BFIX, "tall-1080x10000.png"))), [pngChunk("eXIf", privacyExif())]),
  "tall-1080x20000.png": () => pngWith(new Uint8Array(readFileSync(join(BFIX, "tall-1080x20000.png"))), [pngChunk("eXIf", privacyExif())]),
  "tall-1080x10000.webp": () => withWebpExif(new Uint8Array(readFileSync(join(BFIX, "tall-1080x10000.webp")))),
  "tall-1080x16383.webp": () => withWebpExif(new Uint8Array(readFileSync(join(BFIX, "tall-1080x16383.webp")))),
};
function withWebpExif(file: Uint8Array): Uint8Array {
  const chunks = webpChunks(file);
  const x = chunks.find((c) => c.id === "VP8X")!;
  const w = 1 + (x.data[4] | (x.data[5] << 8) | (x.data[6] << 16));
  const h = 1 + (x.data[7] | (x.data[8] << 8) | (x.data[9] << 16));
  return riff(vp8x(w, h, x.data[0] | WEBP_FLAG.exif), ...chunks.filter((c) => c.id !== "VP8X").map((c) => riffChunk(c.id, c.data)), riffChunk("EXIF", privacyExif()));
}
const largeCache: Record<string, Uint8Array> = {};
const large = (k: string) => (largeCache[k] ??= LARGE[k]());

async function openPage(browser: Browser, sampler?: ProcSampler) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" || (r.postDataBuffer()?.length ?? 0) > 0) posts.push(`${r.method()} ${r.url()}`);
  });
  await page.route("**/__meta/**", (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname.replace("/__meta/", ""));
    const body = p.startsWith("large/") ? Buffer.from(large(p.slice(6))) : existsSync(join(FIX, p)) ? readFileSync(join(FIX, p)) : null;
    if (!body) return route.fulfill({ status: 404 });
    return route.fulfill({ status: 200, contentType: p.endsWith(".jpg") ? "image/jpeg" : p.endsWith(".png") ? "image/png" : "image/webp", body });
  });
  await page.goto(`${BASE}/spikes/metadata`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.spikeE, null, { timeout: 60_000 });
  if (sampler) {
    await sampler.discover();
    await settle(sampler);
  }
  return { context, page, posts };
}

async function settle(sampler: ProcSampler, maxMs = 6000) {
  const end = Date.now() + maxMs;
  await new Promise((r) => setTimeout(r, 600));
  while (Date.now() < end) {
    const w = sampler.window(Date.now() - 800, Date.now()).map((s) => s.total.priv);
    if (w.length >= 3 && Math.max(...w) - Math.min(...w) < 4 * MiB) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}
const memNow = (s: ProcSampler) => s.samples.at(-1)?.total.priv ?? 0;
async function measured<T>(sampler: ProcSampler, base: number, fn: () => Promise<T>) {
  const t0 = Date.now();
  const r = await fn();
  const t1 = Date.now();
  await sampler.discover();
  await sampler.waitFor(t1 + 500);
  const w = sampler.window(t0, t1 + 500);
  return { r, peakDeltaMiB: mib(Math.max(...w.map((s) => s.total.priv), base) - base), afterDeltaMiB: mib(memNow(sampler) - base) };
}
type AnyRec = Record<string, unknown>;
const call = <T = AnyRec,>(page: Page, fn: string, ...a: unknown[]) => page.evaluate(({ fn, a }) => (window.spikeE![fn] as (...x: unknown[]) => Promise<unknown>)(...a), { fn, a }) as Promise<T>;

async function fixtures(browser: Browser) {
  const { context, page, posts } = await openPage(browser);
  const out: AnyRec[] = [];
  for (const f of manifest) {
    const src = `/__meta/${f.file}`;
    const clean = await call(page, "clean", src, { name: f.file.split("/").pop() });
    const cmp = (await call<Record<string, Record<string, { w: number; h: number; hash: string; alphaMin: number; tl: number[]; tr: number[]; optionsHonoured: boolean }>>>(page, "compare", src, { name: f.file.split("/").pop() }));
    const o = cmp.original;
    const c = cmp.cleaned;
    const s = cmp.stripped;
    const node = cleanBytes(new Uint8Array(readFileSync(join(FIX, f.file)))).output;
    out.push({
      id: f.id,
      ok: clean.ok,
      changed: clean.changed,
      inputBytes: clean.inputBytes,
      outputBytes: clean.outputBytes,
      verified: (clean.verification as AnyRec | undefined)?.passed,
      msTotal: (clean.ms as AnyRec | undefined)?.total,
      maxStallMs: clean.maxStallMs,
      deterministic: clean.sha === sha(node),
      pixelsEqual: { img: o.img.hash === c.img.hash, bitmap: o.bitmap.hash === c.bitmap.hash, raw: o.raw.hash === c.raw.hash },
      dims: { original: [o.img.w, o.img.h], cleaned: [c.img.w, c.img.h], stripped: [s.img.w, s.img.h] },
      orientationKept: o.img.w === c.img.w && o.img.h === c.img.h,
      strippedDiffers: { img: o.img.hash !== s.img.hash, bitmap: o.bitmap.hash !== s.bitmap.hash },
      alphaMin: [o.img.alphaMin, c.img.alphaMin],
      colour: { original: { tl: o.img.tl, tr: o.img.tr }, cleaned: { tl: c.img.tl, tr: c.img.tr }, stripped: { tl: s.img.tl, tr: s.img.tr }, raw: { tl: o.raw.tl, tr: o.raw.tr } },
      rawOptionsHonoured: o.raw.optionsHonoured,
    });
  }
  await context.close();
  return { fixtures: out, uploads: posts };
}

async function canvas(browser: Browser) {
  const { context, page } = await openPage(browser);
  const r = await call(page, "canvasExports");
  await context.close();
  return r;
}

async function mismatch(browser: Browser) {
  const { context, page } = await openPage(browser);
  const r = await call(page, "mismatch", "/__meta/png/clean.png", "/__meta/jpeg/clean.jpg", "/__meta/webp/clean-lossy.webp");
  await context.close();
  return r;
}

async function largeCases(browser: Browser, sampler: ProcSampler) {
  const out: AnyRec[] = [];
  for (const k of Object.keys(LARGE)) {
    for (const variant of ["worker", "main", "naive-reencode"] as const) {
      const { context, page } = await openPage(browser, sampler);
      const base = memNow(sampler);
      const src = `/__meta/large/${k}`;
      const m = await measured(sampler, base, () => (variant === "naive-reencode" ? call(page, "naiveReencode", src) : call(page, "clean", src, { name: k, mode: variant })));
      const r = m.r;
      out.push({ file: k, variant, inputBytes: r.inputBytes, outputBytes: r.outputBytes, wallMs: r.wallMs, ms: r.ms, maxStallMs: r.maxStallMs, ok: r.ok ?? true, code: r.code, verified: (r.verification as AnyRec | undefined)?.passed, peakDeltaMiB: m.peakDeltaMiB, afterDeltaMiB: m.afterDeltaMiB });
      await context.close();
    }
  }
  return out;
}

async function batch(browser: Browser, sampler: ProcSampler) {
  const { context, page } = await openPage(browser, sampler);
  const base = memNow(sampler);
  const files = manifest.filter((f) => !(f.expect as AnyRec).noPrivacy).slice(0, 25);
  const steps: AnyRec[] = [];
  const t0 = Date.now();
  for (const [i, f] of files.entries()) {
    const r = await call(page, "clean", `/__meta/${f.file}`, { name: f.file.split("/").pop() });
    // Mimic the product: object URL for the download, revoked once used.
    await page.evaluate(() => {
      const u = URL.createObjectURL(new Blob([new Uint8Array(16)]));
      URL.revokeObjectURL(u);
    });
    await sampler.waitFor(Date.now() + 150);
    steps.push({ i: i + 1, id: f.id, ok: r.ok, ms: (r.ms as AnyRec | undefined)?.total, memDeltaMiB: mib(memNow(sampler) - base) });
  }
  const wallMs = Date.now() - t0;
  await page.evaluate(() => window.spikeE!.dispose());
  await settle(sampler);
  const afterDispose = mib(memNow(sampler) - base);
  // Second pass over large files (20 × 20k JPEG/PNG): does memory plateau (GC) or grow (leak)?
  const bigSteps: AnyRec[] = [];
  for (let i = 0; i < 20; i++) {
    const k = i % 2 ? "tall-1080x20000.png" : "tall-1080x20000.jpg";
    const r = await call(page, "clean", `/__meta/large/${k}`, { name: k });
    await sampler.waitFor(Date.now() + 300);
    bigSteps.push({ i: i + 1, file: k, ok: r.ok, ms: (r.ms as AnyRec | undefined)?.total, memDeltaMiB: mib(memNow(sampler) - base) });
  }
  await context.close();
  return { files: files.length, wallMs, steps, afterDisposeDeltaMiB: afterDispose, large: bigSteps };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sampler = new ProcSampler();
  await sampler.start(50);
  try {
    for (const name of BROWSERS) {
      const cfg = TYPES[name];
      const file = join(OUT, `metadata-browser-${name}.json`);
      const results: AnyRec = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).results : {};
      const browser = await cfg.type.launch(cfg.launch);
      const env = { browser: name, version: browser.version(), date: new Date().toISOString() };
      console.log(`=== ${name} ${env.version}`);
      for (const step of ONLY) {
        const t = Date.now();
        try {
          results[step] = step === "fixtures" ? await fixtures(browser) : step === "canvas" ? await canvas(browser) : step === "mismatch" ? await mismatch(browser) : step === "large" ? await largeCases(browser, sampler) : await batch(browser, sampler);
        } catch (e) {
          results[step] = { error: String((e as Error).message).slice(0, 400) };
        }
        console.log(`${step}: ${Math.round((Date.now() - t) / 1000)} s`);
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

void cat;
