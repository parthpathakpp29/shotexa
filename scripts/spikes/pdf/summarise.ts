/**
 * Summaries of docs/spikes/results/pdf-node.json.
 *   npx tsx scripts/spikes/pdf/summarise.ts [section]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const data = JSON.parse(readFileSync(join(process.cwd(), "docs", "spikes", "results", "pdf-node.json"), "utf8"));
const runs = Object.values(data.runs) as R[];
const section = process.argv[2] ?? "all";
const sum = (rs: R[], k: string) => rs.reduce((s, r) => s + (r[k] ?? 0), 0);
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : "0.0");

function agg(filter: (r: R) => boolean) {
  const rs = runs.filter(filter);
  const b = sum(rs, "breaks");
  return {
    n: rs.length,
    breaks: b,
    bad: sum(rs, "badBreaks"),
    text: sum(rs, "textLineCuts"),
    hard: sum(rs, "hardRegionCuts"),
    cosmetic: sum(rs, "cosmeticEdgeCuts"),
    strict: sum(rs, "strictBad"),
    soft: sum(rs, "softRegionCuts"),
    avoidable: sum(rs, "avoidableBad"),
    unavoidable: sum(rs, "unavoidableBad"),
    meanShift: b ? rs.reduce((s, r) => s + r.meanShiftPx * r.breaks, 0) / b : 0,
    maxShiftPct: Math.max(0, ...rs.map((r) => r.maxShiftPct)),
    short: sum(rs, "veryShortPages"),
    pages: sum(rs, "pages"),
  };
}
const row = (label: string, a: ReturnType<typeof agg>) =>
  `| ${label} | ${a.breaks} | ${a.bad} (${pct(a.bad, a.breaks)}%) | ${a.strict} (${pct(a.strict, a.breaks)}%) | ${a.text} | ${a.hard} | ${a.cosmetic} | ${a.soft} | ${a.avoidable} | ${a.meanShift.toFixed(0)} | ${(a.maxShiftPct * 100).toFixed(1)}% | ${a.short} | ${a.pages} |`;
const header = "| variant | breaks | bad breaks | text-line cuts | hard-region cuts | soft cuts | avoidable bad | mean shift px | max shift | very short pages | pages |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";

const variants = [...new Set(runs.map((r) => r.variant))];
const normal = (r: R) => !r.difficult;
const difficult = (r: R) => r.difficult;

if (section === "all" || section === "overall") {
  for (const [label, f] of [["ALL fixtures (A4 + Letter)", () => true], ["Normal fixtures", normal], ["Difficult fixtures", difficult]] as [string, (r: R) => boolean][]) {
    console.log(`\n### ${label}\n\n${header}`);
    for (const v of variants) console.log(row(v, agg((r) => r.variant === v && f(r))));
  }
}

if (section === "all" || section === "fixtures") {
  const pick = ["fixed", "visual:up10", "ocr:up10", "visual:up15", "ocr:up15"];
  console.log(`\n### Per fixture — bad / breaks (strict bad incl. cosmetic edge cuts), A4 + Letter\n\n| fixture | ${pick.join(" | ")} | unavoidable (up10) |\n|---|${pick.map(() => "---:").join("|")}|---:|`);
  for (const id of [...new Set(runs.map((r) => r.fixture))]) {
    const cells = pick.map((v) => {
      const a = agg((r) => r.fixture === id && r.variant === v);
      return `${a.bad}/${a.breaks} (${a.strict})`;
    });
    const u = agg((r) => r.fixture === id && r.variant === "visual:up10");
    console.log(`| ${id} | ${cells.join(" | ")} | ${u.unavoidable} |`);
  }
}

if (section === "all" || section === "confidence") {
  for (const v of ["visual:up10", "ocr:up10", "visual:up15"]) {
    const acc: Record<string, { n: number; bad: number }> = {};
    for (const r of runs.filter((r) => r.variant === v))
      for (const [k, x] of Object.entries(r.byConfidence as Record<string, { n: number; bad: number }>)) {
        acc[k] ??= { n: 0, bad: 0 };
        acc[k].n += x.n;
        acc[k].bad += x.bad;
      }
    console.log(`\n${v} confidence: ${Object.entries(acc).map(([k, x]) => `${k}: ${x.n} breaks, ${x.bad} bad (${pct(x.bad, x.n)}%)`).join(" · ")}`);
  }
}

if (section === "all" || section === "timing") {
  const fx = [...new Map(runs.map((r) => [r.fixture, r])).values()];
  console.log("\n| fixture | size | signal analysis ms | plan ms (visual) | OCR ms (if performed for PDF) |\n|---|---|---:|---:|---:|");
  for (const r of fx) {
    const v = runs.find((x) => x.fixture === r.fixture && x.variant === "visual:up10");
    console.log(`| ${r.fixture} | ${r.size} | ${r.signalMs} | ${v?.planMs} | ${r.ocrMs ?? "—"} |`);
  }
}
