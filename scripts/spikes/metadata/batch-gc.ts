/**
 * Spike E batch-memory check: is the growth seen in the 20 × 20k batch a leak or GC lag?
 * Chromium with --expose-gc: clean a 1080×20000 JPEG/PNG 20× (Image Worker), force a page GC
 * after each, sample OS-level memory of the whole browser process tree.
 *
 *   SHOTEXA_ENABLE_SPIKES=1 npm run build && npx next start -p 3100
 *   npx tsx scripts/spikes/metadata/batch-gc.ts
 *
 * Writes docs/spikes/results/metadata-batch-gc.json
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProcSampler } from "../memory/proc-sampler";
import { exifApp1, jpegWith, pngChunk, pngWith, privacyExif } from "../metadata-fixtures/build";

const MiB = 1024 * 1024;
const BFIX = join(process.cwd(), ".cache", "spike-b");
const files: Record<string, Buffer> = {
  "a.jpg": Buffer.from(jpegWith(new Uint8Array(readFileSync(join(BFIX, "tall-1080x20000.jpg"))), [exifApp1(privacyExif())])),
  "b.png": Buffer.from(pngWith(new Uint8Array(readFileSync(join(BFIX, "tall-1080x20000.png"))), [pngChunk("eXIf", privacyExif())])),
};

async function main() {
  const sampler = new ProcSampler();
  await sampler.start(50);
  const browser = await chromium.launch({ channel: "chromium", args: ["--js-flags=--expose-gc"] });
  const out: Record<string, unknown> = { browser: browser.version(), date: new Date().toISOString() };
  try {
    for (const variant of ["gc-after-each", "no-gc"] as const) {
      const page = await (await browser.newContext()).newPage();
      await page.route("**/__meta/**", (r) => {
        const k = r.request().url().split("/").pop()!;
        return r.fulfill({ status: 200, contentType: k.endsWith("jpg") ? "image/jpeg" : "image/png", body: files[k] });
      });
      await page.goto("http://localhost:3100/spikes/metadata");
      await page.waitForFunction(() => !!window.spikeE);
      await sampler.discover();
      await new Promise((r) => setTimeout(r, 2000));
      const base = sampler.samples.at(-1)!.total.priv;
      const steps: number[] = [];
      for (let i = 0; i < 20; i++) {
        const k = i % 2 ? "b.png" : "a.jpg";
        const r = (await page.evaluate((k) => (window.spikeE!.clean as (s: string, o: object) => Promise<{ ok: boolean }>)(`/__meta/${k}`, { name: k }), k)) as { ok: boolean };
        if (!r.ok) throw new Error("clean failed");
        if (variant === "gc-after-each") await page.evaluate(() => (globalThis as { gc?: () => void }).gc?.());
        await sampler.discover();
        await sampler.waitFor(Date.now() + 400);
        steps.push(+((sampler.samples.at(-1)!.total.priv - base) / MiB).toFixed(1));
      }
      out[variant] = steps;
      console.log(variant, steps.join(", "));
      await page.context().close();
    }
  } finally {
    await browser.close();
    sampler.stop();
  }
  writeFileSync(join(process.cwd(), "docs", "spikes", "results", "metadata-batch-gc.json"), JSON.stringify(out, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
