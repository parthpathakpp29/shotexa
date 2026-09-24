/**
 * Offline reading-order evaluation over stored OCR layouts (ocr-node.json, variants none/auto).
 *   npx tsx scripts/spikes/ocr/eval-order.ts [variant=none]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chooseReadingOrder, orderLines } from "../../../src/core/ocr/normalize";
import { attachRowFragments, splitColumns } from "./order-experiments";
import type { OcrBlock, OcrLine } from "../../../src/core/ocr/types";
import { cer, lineMetrics, normStrict } from "../../../src/tests/helpers/ocr-metrics";

type Compact = { t: string; b: number[]; c: number; w: [string, number, number, number, number][] };
const variant = process.argv[2] ?? "none";
const data = JSON.parse(readFileSync(join(process.cwd(), "docs", "spikes", "results", "ocr-node.json"), "utf8"));
const bx = (a: number[]) => ({ x: a[0], y: a[1], w: a[2], h: a[3] });

function toBlocks(compact: Compact[][]): OcrBlock[] {
  return compact.map((lines) => {
    const ls: OcrLine[] = lines.map((l) => ({ text: l.t, bbox: bx(l.b), confidence: l.c, words: l.w.map(([text, x, y, w, h]) => ({ text, bbox: { x, y, w, h }, confidence: l.c })) }));
    return { bbox: { x: 0, y: 0, w: 0, h: 0 }, confidence: 0, paragraphs: [{ bbox: { x: 0, y: 0, w: 0, h: 0 }, confidence: 0, lines: ls }] };
  });
}

const strategies: Record<string, (b: OcrBlock[]) => OcrLine[]> = {
  engine: (b) => orderLines(b, "engine"),
  "top-down": (b) => orderLines(b, "top-down"),
  "attach (rejected)": (b) => attachRowFragments(b),
  "auto (selector)": (b) => orderLines(b, chooseReadingOrder(b)),
  "attach+split (rejected)": (b) => attachRowFragments(splitColumns(b).map((l) => ({ bbox: l.bbox, confidence: 0, paragraphs: [{ bbox: l.bbox, confidence: 0, lines: [l] }] }))),
};

const names = Object.keys(strategies);
console.log(`| fixture | ${names.map((n) => `${n} CER / order`).join(" | ")} |`);
console.log(`|---|${names.map(() => "---").join("|")}|`);
const totals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
for (const r of Object.values(data.runs) as { fixture: string; variant: string; blocks?: Compact[][] }[]) {
  if (r.variant !== variant || !r.blocks) continue;
  const exp = JSON.parse(readFileSync(join(process.cwd(), "src", "tests", "fixtures", "ocr", r.fixture, "expected.json"), "utf8"));
  const truthLines: string[] = exp.lines.map((l: { text: string }) => l.text);
  const truth = normStrict(truthLines.join("\n"));
  const blocks = toBlocks(r.blocks);
  const cells = names.map((n) => {
    const lines = strategies[n](blocks).map((l) => l.text);
    const c = cer(truth, normStrict(lines.join("\n")));
    totals[n].push(c);
    return `${(c * 100).toFixed(1)} / ${lineMetrics(truthLines, lines).orderScore.toFixed(2)}`;
  });
  console.log(`| ${r.fixture} | ${cells.join(" | ")} |`);
}
console.log(`| **mean** | ${names.map((n) => ((100 * totals[n].reduce((s, v) => s + v, 0)) / totals[n].length).toFixed(2)).join(" | ")} |`);
console.log(`| **worst** | ${names.map((n) => (100 * Math.max(...totals[n])).toFixed(1)).join(" | ")} |`);
