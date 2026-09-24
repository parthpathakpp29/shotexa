/** Report fixture matrix: Node baseline metrics + Chromium default-pipeline CER/time. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cer, normStrict } from "../../../src/tests/helpers/ocr-metrics";
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const RES = join(process.cwd(), "docs", "spikes", "results");
const node = JSON.parse(readFileSync(join(RES, "ocr-node.json"), "utf8")).runs as Record<string, R>;
const chr = JSON.parse(readFileSync(join(RES, "ocr-browser-chromium.json"), "utf8")).results.accuracy as Record<string, R>;
const man = JSON.parse(readFileSync(join(process.cwd(), "src/tests/fixtures/ocr/manifest.json"), "utf8")) as R[];
const truth = (id: string) => normStrict(JSON.parse(readFileSync(join(process.cwd(), "src/tests/fixtures/ocr", id, "expected.json"), "utf8")).lines.map((l: R) => l.text).join("\n"));
const pct = (v: number) => (v * 100).toFixed(1);
console.log("| fixture | category | image | lang | default preprocessing | Chromium ms (warm) | CER default | CER no-prep, engine order | WER no-prep | word recall / precision | confidence |");
console.log("|---|---|---|---|---|---:|---:|---:|---:|---|---:|");
for (const f of man) {
  const n = node[`${f.id}|none`];
  const c = chr[f.id];
  const lang = f.lang === "hin" ? "eng+hin*" : f.lang;
  const def = c?.ok ? pct(cer(truth(f.id), normStrict(c.rawText))) : "—";
  const prep = c ? ((c.preprocessing ?? []).filter((s: string) => s !== "gray").join("+") || "none") : (node[`${f.id}|auto`]?.steps?.join("+") || "none");
  console.log(`| ${f.id} | ${f.category.join(", ")} | ${f.width}×${f.height} | ${lang} | ${prep} | ${c?.wallMs ?? "—"} | ${def} | ${pct(n.engine.cer)} | ${pct(Math.min(n.engine.wer, n.topDown.wer))} | ${pct(n.wordRecall)} / ${pct(n.wordPrecision)} | ${pct(n.confidence ?? 0)} |`);
}
