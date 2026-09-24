/**
 * Markdown summary of docs/spikes/results/ocr-browser-<browser>.json (+ Node parity).
 *   npx tsx scripts/spikes/ocr/summarise-browser.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chooseReadingOrder, orderLines } from "../../../src/core/ocr/normalize";
import type { OcrBlock } from "../../../src/core/ocr/types";
import { cer, normStrict } from "../../../src/tests/helpers/ocr-metrics";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const RES = join(process.cwd(), "docs", "spikes", "results");
const browsers = ["chromium", "firefox", "webkit"].filter((b) => existsSync(join(RES, `ocr-browser-${b}.json`)));
const data: Record<string, { environment: R; results: R }> = Object.fromEntries(browsers.map((b) => [b, JSON.parse(readFileSync(join(RES, `ocr-browser-${b}.json`), "utf8"))]));
const node = JSON.parse(readFileSync(join(RES, "ocr-node.json"), "utf8")).runs as Record<string, R>;
const truth = (id: string) => normStrict(JSON.parse(readFileSync(join(process.cwd(), "src", "tests", "fixtures", "ocr", id, "expected.json"), "utf8")).lines.map((l: R) => l.text).join("\n"));
const pct = (v: number) => (v * 100).toFixed(1);

function nodeDefaultCer(id: string): string {
  const r = node[`${id}|auto`];
  if (!r?.blocks) return "—";
  const blocks: OcrBlock[] = r.blocks.map((ls: R[]) => ({
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    confidence: 0,
    paragraphs: [{ bbox: { x: 0, y: 0, w: 0, h: 0 }, confidence: 0, lines: ls.map((l) => ({ text: l.t, bbox: { x: l.b[0], y: l.b[1], w: l.b[2], h: l.b[3] }, confidence: l.c, words: l.w.map((w: R) => ({ text: w[0], bbox: { x: w[1], y: w[2], w: w[3], h: w[4] }, confidence: l.c })) })) }],
  }));
  return pct(cer(truth(id), normStrict(orderLines(blocks, chooseReadingOrder(blocks)).map((l) => l.text).join("\n"))));
}

console.log("## Environments\n");
for (const b of browsers) console.log(`- ${b} ${data[b].environment.version}`);

console.log("\n## Cold start and downloads\n");
console.log(`| | ${browsers.join(" | ")} |\n|---|${browsers.map(() => "---").join("|")}|`);
const L = (b: string) => data[b].results.lifecycle ?? {};
const row = (label: string, f: (b: string) => unknown) => console.log(`| ${label} | ${browsers.map((b) => String(f(b) ?? "—")).join(" | ")} |`);
row("App JS before OCR intent (KiB)", (b) => L(b).appJsBeforeIntentKiB);
row("OCR assets requested before intent", (b) => L(b).ocrAssetsBeforeIntent);
row("Cold init (worker + core + eng model) ms", (b) => L(b).coldInit?.ms);
for (const kind of ["core", "model", "worker", "app-js"]) row(`Cold download: ${kind} (KiB)`, (b) => (L(b).coldDownloads ?? []).filter((d: R) => d.kind === kind).map((d: R) => `${d.KiB} ${kind === "core" ? d.url.split("/").pop() : ""}`.trim()).join(", "));
row("Idle worker memory Δ (MiB)", (b) => L(b).coldInit?.idleWorkerDeltaMiB);
row("Re-init after dispose (cached) ms", (b) => L(b).warmReinit?.ms);

console.log("\n## Warm jobs (same page, worker reused)\n");
console.log(`| job | ${browsers.map((b) => `${b} ms / peak Δ MiB / after Δ / stall ms`).join(" | ")} |\n|---|${browsers.map(() => "---").join("|")}|`);
const jobs = (L(browsers[0]).warmJobs ?? []) as R[];
jobs.forEach((j, i) => {
  console.log(`| ${i + 1}. ${j.id} (${(j.preprocessing ?? []).join("+") || "none"}) | ${browsers.map((b) => { const x = (L(b).warmJobs ?? [])[i]; return x ? (x.ok ? `${x.wallMs} / ${x.peakDeltaMiB} / ${x.afterDeltaMiB} / ${x.maxStallMs}` : x.code) : "—"; }).join(" | ")} |`);
});
row("Large job long-1080x10000 (auto strips): ms / parts", (b) => (L(b).largeJob ? `${L(b).largeJob.wallMs} / ${L(b).largeJob.parts}` : null));
row("…peak Δ / after recycle Δ (MiB)", (b) => (L(b).largeJob ? `${L(b).largeJob.peakDeltaMiB} / ${L(b).largeJob.afterRecycleDeltaMiB}` : null));
row("After dispose Δ (MiB)", (b) => L(b).afterDisposeDeltaMiB);

console.log("\n## Image sizes (fresh page, warm engine)\n");
console.log(`| image | ${browsers.map((b) => `${b} ms / parts / peak Δ / after Δ / stall`).join(" | ")} |\n|---|${browsers.map(() => "---").join("|")}|`);
const sizes = (data[browsers[0]].results.sizes ?? []) as R[];
sizes.forEach((s, i) => {
  console.log(`| ${s.id}${s.opts?.strips === "off" ? " (full image)" : ""} | ${browsers.map((b) => { const x = (data[b].results.sizes ?? [])[i]; return x ? (x.ok ? `${x.wallMs} / ${x.parts} / ${x.peakDeltaMiB} / ${x.afterDeltaMiB} / ${x.maxStallMs}` : x.code) : "—"; }).join(" | ")} |`);
});

console.log("\n## Cancellation\n");
for (const b of browsers) {
  const c = data[b].results.cancel;
  if (!c) continue;
  console.log(`- ${b}: result ${c.result?.code ?? c.error}, settled ${c.cancelCallToSettledMs} ms after cancel(), memory after cancel Δ ${c.afterCancelDeltaMiB} MiB, next job ${c.nextJob?.ok ? `ok in ${c.nextJob.wallMs} ms (re-init ${Math.round(c.nextJob.timings?.initMs ?? 0)} ms)` : c.nextJob?.code}`);
}

console.log("\n## Hindi\n");
for (const b of browsers) {
  const h = data[b].results.hindi;
  if (!h) continue;
  console.log(`- ${b}: hin cold init ${h.hinColdInitMs} ms (downloads ${h.hinDownloads?.map((d: R) => `${d.url.split("/").pop()} ${d.KiB} KiB`).join(", ")}); eng+hin init ${h.engHinInitMs} ms (${h.engHinDownloads?.map((d: R) => `${d.url.split("/").pop()} ${d.KiB} KiB`).join(", ")}); idle Δ ${h.idleDeltaMiB} MiB; chat-hindi ${h.chatHindi?.wallMs} ms peak Δ ${h.chatHindi?.peakDeltaMiB} MiB`);
}

console.log("\n## Accuracy parity — default pipeline (auto preprocessing + auto order), CER %\n");
console.log(`| fixture | node | ${browsers.join(" | ")} | ${browsers.map((b) => `${b} ms`).join(" | ")} |\n|---|---:|${browsers.map(() => "---:").join("|")}|${browsers.map(() => "---:").join("|")}|`);
const ids = Object.keys(data[browsers[0]].results.accuracy ?? {});
for (const id of ids) {
  const cells = browsers.map((b) => {
    const x = data[b].results.accuracy?.[id];
    return x?.ok ? pct(cer(truth(id), normStrict(x.rawText))) : (x?.code ?? "—");
  });
  const ms = browsers.map((b) => data[b].results.accuracy?.[id]?.wallMs ?? "—");
  console.log(`| ${id} | ${nodeDefaultCer(id)} | ${cells.join(" | ")} | ${ms.join(" | ")} |`);
}
for (const b of browsers) {
  const acc = data[b].results.accuracy ?? {};
  const fb = new Set((Object.values(acc) as R[]).flatMap((x) => x.fallbacks ?? []));
  if (fb.size) console.log(`\n${b} fallbacks: ${[...fb].join(", ")}`);
}
