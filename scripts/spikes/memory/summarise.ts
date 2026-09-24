/**
 * Prints markdown tables from docs/spikes/results/memory-<browser>.json.
 *   npx tsx scripts/spikes/memory/summarise.ts [chromium,firefox,webkit]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const browsers = (process.argv[2] || "chromium,firefox,webkit,webkit-main").split(",");
const data: Record<string, { environment: R; results: Record<string, R> }> = {};
for (const b of browsers) {
  const f = join(process.cwd(), "docs", "spikes", "results", `memory-${b}.json`);
  if (existsSync(f)) data[b] = JSON.parse(readFileSync(f, "utf8"));
}
const present = Object.keys(data);
const cell = (r: R | undefined, f: (r: R) => string) => (!r ? "—" : f(r));
const status = (r: R) => (r.ok ? "✅" : `❌ ${String(r.error ?? "").replace(/\|/g, "/").slice(0, 60)}`);
const peak = (r: R) => (r.memory?.peakDeltaMiB ?? "?") + "";
const ids = (prefix: string) => [...new Set(present.flatMap((b) => Object.keys(data[b].results)))].filter((id) => id.startsWith(prefix));

console.log("## Environments\n");
for (const b of present) console.log(`- ${b}: ${data[b].environment.version} (${data[b].environment.os}, ${data[b].environment.date})`);

console.log("\n## Canvas limits (✅ allocate+draw+readback works)\n");
for (const id of ids("limits-")) {
  console.log(`\n### ${id}\n`);
  const first = present.map((b) => data[b].results[id]).find((r) => r?.rows);
  if (!first) continue;
  console.log(`| size | ${present.join(" | ")} |\n|---|${present.map(() => "---").join("|")}|`);
  for (const row of first.rows as R[]) {
    const cells = present.map((b) => {
      const rr = (data[b].results[id]?.rows as R[] | undefined)?.find((x) => x.width === row.width && x.height === row.height);
      return rr ? (rr.ok ? "✅" : `❌ ${String(rr.reason).slice(0, 40)}`) : "—";
    });
    console.log(`| ${row.width}×${row.height} | ${cells.join(" | ")} |`);
  }
}

const table = (title: string, prefix: string, cols: [string, (r: R) => string][]) => {
  console.log(`\n## ${title}\n`);
  console.log(`| case | ${present.map((b) => `${b} ${cols.map((c) => c[0]).join(" / ")}`).join(" | ")} |`);
  console.log(`|---|${present.map(() => "---").join("|")}|`);
  for (const id of ids(prefix)) {
    console.log(`| ${id} | ${present.map((b) => cell(data[b].results[id], (r) => (r.ok ? cols.map((c) => c[1](r)).join(" / ") : status(r)))).join(" | ")} |`);
  }
};

table("Decode", "decode-", [
  ["ms", (r) => `${r.decodeMs}`],
  ["peak MiB", peak],
  ["retained", (r) => `${r.memory?.retainedAfterMiB}`],
  ["bitmap", (r) => `${r.bmW}×${r.bmH}`],
]);
table("Lifecycle", "bitmaps-", [["peak MiB", peak], ["retained", (r) => `${r.memory?.retainedAfterMiB}`]]);
table("Object URLs", "objecturls-", [["peak MiB", peak], ["retained", (r) => `${r.memory?.retainedAfterMiB}`]]);
const exportCols: [string, (r: R) => string][] = [
  ["ms", (r) => `${r.ms}`],
  ["peak MiB", peak],
  ["out", (r) => `${r.encW ?? r.outW}×${r.encH ?? r.outH} ${r.blobType ?? ""}`.trim()],
  ["KiB", (r) => `${Math.round((r.bytes ?? 0) / 1024)}`],
  ["stall", (r) => `${r.maxMainStallMs}`],
];
table("Single-canvas export", "single-", exportCols);
table("Tiled streamed PNG", "tiled-", exportCols);
table("Split output", "split-", [["ms", (r) => `${r.ms}`], ["peak MiB", peak], ["parts", (r) => `${r.parts}`], ["KiB", (r) => `${Math.round(r.bytes / 1024)}`]]);
table("Multi-image", "multi-", exportCols);
table("toDataURL vs toBlob", "dataurl-", [["ms", (r) => `${r.encodeMs}`], ["peak MiB", peak], ["dataURL MiB", (r) => `${r.dataUrlMiB}`], ["stall", (r) => `${r.maxMainStallMs}`]]);
table("toBlob", "toblob-", [["ms", (r) => `${r.encodeMs}`], ["peak MiB", peak], ["blob MiB", (r) => `${r.blobMiB}`], ["stall", (r) => `${r.maxMainStallMs}`]]);
table("OpenCV", "opencv-", [
  ["load ms", (r) => `${r.loadMs}`],
  ["peak MiB", peak],
  ["wasm MiB", (r) => `${r.wasmAfterAnalyseMiB ?? r.wasmAfterLoadMiB}`],
  ["analyse ms", (r) => `${r.timings?.total ?? "—"}`],
  ["offset", (r) => `${r.offsetY ?? "—"}`],
]);

// Failures with failure mode.
console.log("\n## Failures\n");
for (const b of present) for (const [id, r] of Object.entries(data[b].results)) if (!r.ok && !id.startsWith("limits-")) console.log(`- ${b} ${id}: ${r.error ?? JSON.stringify({ blobType: r.blobType, enc: `${r.encW}x${r.encH}`, cornerAlpha: r.cornerAlpha })}`);
