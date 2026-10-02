/**
 * Tables from docs/spikes/results/pdf-browser-<browser>.json (Spike D report §9–§11).
 *   npx tsx scripts/spikes/pdf/summarise-browser.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type R = Record<string, Record<string, unknown> & { analyse?: Record<string, number | string>; export?: Record<string, number | string | boolean>; validation?: Record<string, unknown>; plan?: { pages: number; breaks: { y: number }[][] } }>;
const OUT = join(process.cwd(), "docs", "spikes", "results");
const browsers = ["chromium", "firefox", "webkit"].filter((b) => existsSync(join(OUT, `pdf-browser-${b}.json`)));
const data = Object.fromEntries(browsers.map((b) => [b, JSON.parse(readFileSync(join(OUT, `pdf-browser-${b}.json`), "utf8"))])) as Record<string, { environment: Record<string, string>; results: R }>;
const n = (v: unknown, d = 0) => (typeof v === "number" ? v.toFixed(d) : "—");

for (const b of browsers) {
  const { environment, results } = data[b];
  console.log(`\n### ${b} ${environment.version}\n`);
  console.log("| case | analyse ms (decode / signals) | analyse stall ms | analyse peak MiB | export ms | export stall ms | progress events | export peak MiB | retained after clear MiB | PDF KiB | pages | valid |");
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const [id, r] of Object.entries(results)) {
    const a = r.analyse ?? {};
    const e = r.export ?? {};
    const valid = r.validation ? (r.validation.ok ? "✅" : `❌ ${(r.validation.problems as string[]).join("; ")}`) : e.code ?? r.error ?? "—";
    console.log(
      `| ${id} | ${n(a.wallMs)} (${n(a.decodeMs)} / ${n(a.signalMs)}) | ${n(a.maxStallMs)} | ${n(a.peakDeltaMiB)} | ${n(e.ms ?? e.wallMs)} | ${n(e.maxStallMs)} | ${e.progressEvents ?? "—"} | ${n(e.peakDeltaMiB)} | ${n(r.afterClearDeltaMiB, 1)} | ${e.size ? Math.round((e.size as number) / 1024) : "—"} | ${e.pages ?? "—"} | ${valid} |`,
    );
  }
  const c = results["cancel-20000"];
  if (c) console.log(`\ncancel: ${JSON.stringify({ export: c.export, afterCancelDeltaMiB: c.afterCancelDeltaMiB, exportAfterCancel: c.exportAfterCancel })}`);
}

// Cross-browser break parity (same fixture, same config → same breaks?).
if (browsers.length > 1) {
  console.log("\n### Break parity across engines\n");
  const ids = Object.keys(data[browsers[0]].results);
  for (const id of ids) {
    const ys = browsers.map((b) => JSON.stringify(data[b].results[id]?.plan?.breaks?.map((i) => i.map((x) => x.y)) ?? null));
    console.log(`- ${id}: ${ys.every((y) => y === ys[0]) ? "identical" : browsers.map((b, i) => `${b} ${ys[i]}`).join(" | ")}`);
  }
}

// Medians over repeats (main run + --tag rep2/rep3) for the large cases: OS-level peaks are noisy.
const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
console.log("\n### Large cases — median of repeats (peak MiB and ms)\n");
console.log("| engine | case | n | analyse ms | analyse peak | export ms | export peak | range export peak | max stall ms |");
console.log("|---|---|---:|---:|---:|---:|---:|---|---:|");
for (const b of browsers) {
  const files = [`pdf-browser-${b}.json`, `pdf-browser-${b}-rep2.json`, `pdf-browser-${b}-rep3.json`].filter((f) => existsSync(join(OUT, f)));
  const runs = files.map((f) => JSON.parse(readFileSync(join(OUT, f), "utf8")).results as R);
  for (const id of ["long-10000", "long-20000", "long-20000-fit", "long-30000", "multi-2x10000"]) {
    const rs = runs.map((r) => r[id]).filter((r) => r?.export);
    if (!rs.length) continue;
    const ep = rs.map((r) => r.export!.peakDeltaMiB as number);
    const stall = Math.max(...rs.map((r) => Math.max((r.analyse?.maxStallMs as number) ?? 0, (r.export?.maxStallMs as number) ?? 0)));
    console.log(
      `| ${b} | ${id} | ${rs.length} | ${n(median(rs.map((r) => r.analyse!.wallMs as number)))} | ${n(median(rs.map((r) => r.analyse!.peakDeltaMiB as number)))} | ${n(median(rs.map((r) => r.export!.ms as number)))} | ${n(median(ep))} | ${n(Math.min(...ep))}–${n(Math.max(...ep))} | ${n(stall)} |`,
    );
  }
}
