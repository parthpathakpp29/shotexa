/**
 * Markdown summary of docs/spikes/results/ocr-node.json.
 *   npx tsx scripts/spikes/ocr/summarise-node.ts [section]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const data = JSON.parse(readFileSync(join(process.cwd(), "docs", "spikes", "results", "ocr-node.json"), "utf8"));
const runs: R[] = (Object.values(data.runs) as R[]).filter((r) => !r.error);
const errors = (Object.values(data.runs) as R[]).filter((r) => r.error);
const section = process.argv[2] ?? "all";
const pct = (v: number) => (v * 100).toFixed(1);
const get = (f: string, v: string) => runs.find((r) => r.fixture === f && r.variant === v);
const fixtures = [...new Set(runs.map((r) => r.fixture))];
const best = (f: string, key: (r: R) => number) => runs.filter((r) => r.fixture === f).reduce((a, b) => (key(b) < key(a) ? b : a));
const bestCer = (r: R) => Math.min(r.engine.cer, r.topDown.cer);

if (section === "all" || section === "fixtures") {
  console.log("\n### Baseline (no preprocessing) and best variant per fixture\n");
  console.log("| fixture | size | lang | ms | conf | CER engine | CER top-down | WER | word recall | word precision | lines exact+near / total | order (eng / td) | best variant → CER |");
  console.log("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|");
  for (const f of fixtures) {
    const n = get(f, "none");
    if (!n) continue;
    const b = best(f, bestCer);
    const w = Math.min(n.engine.wer, n.topDown.wer);
    console.log(
      `| ${f} | ${n.size} | ${n.lang} | ${n.recogniseMs} | ${pct(n.confidence ?? 0)} | ${pct(n.engine.cer)} | ${pct(n.topDown.cer)} | ${pct(w)} | ${pct(n.wordRecall)} | ${pct(n.wordPrecision)} | ${n.engine.lines.exact + n.engine.lines.near} / ${n.engine.lines.total} | ${n.engine.orderScore} / ${n.topDown.orderScore} | ${b.variant} → ${pct(bestCer(b))} |`,
    );
  }
}

if (section === "all" || section === "prep") {
  console.log("\n### Preprocessing: CER (best of both orders) per fixture, % — lower is better\n");
  const variants = ["none", "gray", "contrast", "binarize", "sharpen", "upscale1.5", "upscale2", "contrast+upscale2", "invert", "auto"];
  console.log(`| fixture | ${variants.join(" | ")} |`);
  console.log(`|---|${variants.map(() => "---:").join("|")}|`);
  for (const f of fixtures) {
    const cells = variants.map((v) => {
      const r = get(f, v);
      return r ? pct(bestCer(r)) : "—";
    });
    console.log(`| ${f} | ${cells.join(" | ")} |`);
  }
  console.log("\n### Preprocessing effect vs none (mean Δ CER points over fixtures where both ran; wins/losses at ±0.5 pt)\n");
  console.log("| variant | fixtures | mean Δ CER | wins | losses | mean Δ time |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const v of variants.slice(1)) {
    const pairs = fixtures.map((f) => [get(f, "none"), get(f, v)]).filter(([a, b]) => a && b) as R[][];
    if (!pairs.length) continue;
    const d = pairs.map(([a, b]) => bestCer(b) - bestCer(a));
    const t = pairs.map(([a, b]) => b.recogniseMs + b.prepMs - a.recogniseMs);
    console.log(`| ${v} | ${pairs.length} | ${(100 * d.reduce((s, x) => s + x, 0) / d.length).toFixed(2)} | ${d.filter((x) => x < -0.005).length} | ${d.filter((x) => x > 0.005).length} | ${Math.round(t.reduce((s, x) => s + x, 0) / t.length)} ms |`);
  }
}

if (section === "all" || section === "psm") {
  console.log("\n### Page segmentation (no preprocessing): CER engine-order % / order score\n");
  const psm = ["none", "psm:single-column", "psm:single-block", "psm:sparse"];
  console.log(`| fixture | ${psm.map((p) => (p === "none" ? "auto (3)" : p.replace("psm:", ""))).join(" | ")} |`);
  console.log(`|---|${psm.map(() => "---").join("|")}|`);
  for (const f of fixtures) {
    if (!get(f, "psm:sparse")) continue;
    console.log(`| ${f} | ${psm.map((p) => { const r = get(f, p); return r ? `${pct(r.engine.cer)} / ${r.engine.orderScore} (td ${pct(r.topDown.cer)})` : "—"; }).join(" | ")} |`);
  }
}

if (section === "all" || section === "lang") {
  console.log("\n### Languages\n");
  console.log("| fixture | variant | lang | ms | CER eng-order | CER top-down | word recall |");
  console.log("|---|---|---|---:|---:|---:|---:|");
  for (const r of runs.filter((r) => r.variant.startsWith("lang:") || ((r.lang !== "eng") && r.variant === "none"))) {
    console.log(`| ${r.fixture} | ${r.variant} | ${r.lang} | ${r.recogniseMs} | ${pct(r.engine.cer)} | ${pct(r.topDown.cer)} | ${pct(r.wordRecall)} |`);
  }
}

if (section === "all" || section === "detail") {
  console.log("\n### Symbols, boxes, misses (no preprocessing)\n");
  console.log("| fixture | symbol acc | symbols | box mean IoU | x-IoU | centre-in-box | matched words | missing words (sample) | extra words (sample) |");
  console.log("|---|---:|---:|---:|---:|---:|---:|---|---|");
  for (const f of fixtures) {
    const n = get(f, "none");
    if (!n) continue;
    const b = n.boxes;
    console.log(`| ${f} | ${pct(n.symbols.accuracy)} | ${n.symbols.total} | ${b ? b.meanIou.toFixed(2) : "—"} | ${b ? b.meanXIou.toFixed(2) : "—"} | ${b ? pct(b.centreInsideRate) : "—"} | ${b ? `${b.matchedWords}/${b.truthWords}` : "—"} | ${n.missingWords.slice(0, 6).join(" ").replace(/\|/g, "\\|")} | ${n.extraWords.slice(0, 6).join(" ").replace(/\|/g, "\\|")} |`);
  }
}

if (section === "all" || section === "other") {
  console.log("\n### Other variants\n");
  for (const r of runs.filter((r) => ["autoRotate", "strips-2000"].includes(r.variant))) {
    console.log(`- ${r.fixture} ${r.variant}: CER ${pct(r.engine.cer)} (td ${pct(r.topDown.cer)}), ${r.recogniseMs} ms, rotateRadians ${r.rotateRadians}`);
  }
  console.log(`\nNode init times (ms): ${data.initTimesMs.join(", ")}`);
  if (errors.length) console.log(`\nErrors: ${errors.map((e) => `${e.fixture}|${e.variant}: ${e.error}`).join("; ")}`);
}
