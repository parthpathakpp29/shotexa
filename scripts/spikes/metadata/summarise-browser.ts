/**
 * Tables from docs/spikes/results/metadata-browser-<browser>.json (Spike E report).
 *   npx tsx scripts/spikes/metadata/summarise-browser.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const OUT = join(process.cwd(), "docs", "spikes", "results");
const browsers = ["chromium", "firefox", "webkit"].filter((b) => existsSync(join(OUT, `metadata-browser-${b}.json`)));
const data: Record<string, AnyRec> = Object.fromEntries(browsers.map((b) => [b, JSON.parse(readFileSync(join(OUT, `metadata-browser-${b}.json`), "utf8"))]));
const n = (v: unknown, d = 0) => (typeof v === "number" ? v.toFixed(d) : "—");

console.log("### Environment\n");
for (const b of browsers) console.log(`- ${b} ${data[b].environment.version}`);

console.log("\n### Fixture decode matrix (all engines)\n");
console.log("| fixture | bytes in → out | " + browsers.map((b) => `${b}: verified / same bytes as Node / pixels equal (img·bitmap·raw) / dims orig→clean→stripped / stripped differs`).join(" | ") + " |");
console.log("|---|---|" + browsers.map(() => "---").join("|") + "|");
const ids = (data[browsers[0]].results.fixtures?.fixtures ?? []).map((x: AnyRec) => x.id);
for (const id of ids) {
  const cells = browsers.map((b) => {
    const x = data[b].results.fixtures.fixtures.find((f: AnyRec) => f.id === id);
    if (!x) return "—";
    const px = x.pixelsEqual;
    const d = x.dims;
    return `${x.verified ? "✅" : "❌"} ${x.deterministic ? "✅" : "❌"} ${px.img && px.bitmap && px.raw ? "✅" : `❌${JSON.stringify(px)}`} ${d.original.join("×")}→${d.cleaned.join("×")}→${d.stripped.join("×")} ${x.strippedDiffers.img ? "**yes**" : "no"}`;
  });
  const x0 = data[browsers[0]].results.fixtures.fixtures.find((f: AnyRec) => f.id === id);
  console.log(`| ${id} | ${x0.inputBytes} → ${x0.outputBytes} | ${cells.join(" | ")} |`);
}

console.log("\n### Colour samples (top-left red / top-right green, as displayed via <img>)\n");
for (const id of ids.filter((i: string) => /icc|gamma|srgb|kitchen/.test(i))) {
  for (const b of browsers) {
    const x = data[b].results.fixtures.fixtures.find((f: AnyRec) => f.id === id);
    console.log(`- ${id} ${b}: original ${JSON.stringify(x.colour.original.tl)} ${JSON.stringify(x.colour.original.tr)} · cleaned ${JSON.stringify(x.colour.cleaned.tl)} ${JSON.stringify(x.colour.cleaned.tr)} · stripped ${JSON.stringify(x.colour.stripped.tl)} ${JSON.stringify(x.colour.stripped.tr)}`);
  }
}

console.log("\n### Canvas exports\n");
for (const b of browsers) console.log(`- ${b}: ${JSON.stringify(data[b].results.canvas)}`);
console.log("\n### Input mismatches\n");
for (const b of browsers) console.log(`- ${b}: ${JSON.stringify(data[b].results.mismatch)}`);
console.log("\n### Uploads during fixture runs\n");
for (const b of browsers) console.log(`- ${b}: ${JSON.stringify(data[b].results.fixtures?.uploads ?? [])}`);

console.log("\n### Large images: container clean (worker / main) vs decode + re-encode\n");
console.log("| engine | file | variant | in KB | out KB | wall ms | read / clean / verify ms | max stall ms | peak MiB | after MiB | verified |");
console.log("|---|---|---|---:|---:|---:|---|---:|---:|---:|---|");
for (const b of browsers)
  for (const r of data[b].results.large ?? [])
    console.log(`| ${b} | ${r.file} | ${r.variant} | ${n(r.inputBytes / 1024)} | ${n(r.outputBytes / 1024)} | ${n(r.wallMs)} | ${r.ms ? `${n(r.ms.read, 1)} / ${n(r.ms.clean, 1)} / ${n(r.ms.verify, 1)}` : "—"} | ${n(r.maxStallMs)} | ${n(r.peakDeltaMiB, 1)} | ${n(r.afterDeltaMiB, 1)} | ${r.verified ?? (r.ok === false ? r.code : "n/a")} |`);

console.log("\n### Batch (25 files, sequential, Image Worker)\n");
for (const b of browsers) {
  const x = data[b].results.batch;
  if (!x?.steps) continue;
  console.log(`- ${b}: ${x.files} files in ${x.wallMs} ms; memory after each (MiB): ${x.steps.map((s: AnyRec) => s.memDeltaMiB).join(", ")}; after dispose ${x.afterDisposeDeltaMiB}; 20 × 20k: ${x.large.map((s: AnyRec) => `${s.memDeltaMiB} (${n(s.ms)} ms)`).join(", ")}`);
}
