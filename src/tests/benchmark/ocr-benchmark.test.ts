/**
 * Spike C — OCR accuracy/preprocessing benchmark (Node, same TesseractEngine adapter).
 * Slow (minutes); gated:
 *
 *   OCR_BENCH=1 npx vitest run src/tests/benchmark/ocr-benchmark.test.ts
 *   OCR_BENCH=1 OCR_FILTER=chat OCR_VARIANTS=none,auto npx vitest run src/tests/benchmark/ocr-benchmark.test.ts
 *
 * Writes/merges docs/spikes/results/ocr-node.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { orderLines } from "@/core/ocr/normalize";
import { applyPreprocessing, choosePreprocessing, imageStats, type PreprocessStep } from "@/core/ocr/preprocess";
import { mergeStripResults, planOcrStrips } from "@/core/ocr/strips";
import type { OcrLanguage, OcrResult, PageSegmentation } from "@/core/ocr/types";
import { bagOfWords, boxMetrics, cer, lineMetrics, normLenient, normStrict, rowMetrics, symbolAccuracy, wer } from "../helpers/ocr-metrics";
import {
  createNodeEngine,
  cropRgba,
  decodeFixture,
  encodeGrayPng,
  encodeRgbaPng,
  loadExpected,
  loadOcrManifest,
  readFixtureBytes,
  type OcrFixture,
} from "../helpers/ocr-fixtures";

interface Variant {
  name: string;
  steps?: PreprocessStep[] | "auto";
  segmentation?: PageSegmentation;
  languages?: OcrLanguage[];
  autoRotate?: boolean;
  strips?: { height: number; overlap: number };
}

const PRE: Variant[] = [
  { name: "none" },
  { name: "gray", steps: ["gray"] },
  { name: "contrast", steps: ["contrast"] },
  { name: "binarize", steps: ["binarize"] },
  { name: "sharpen", steps: ["sharpen"] },
  { name: "upscale1.5", steps: ["upscale1.5"] },
  { name: "upscale2", steps: ["upscale2"] },
  { name: "contrast+upscale2", steps: ["contrast", "upscale2"] },
  { name: "auto", steps: "auto" },
];
const LAYOUT = new Set(["chat-light", "chat-dark", "settings-desktop", "phone-settings-2x", "table", "receipt", "mixed-cards", "two-column", "web-clean", "code-dark"]);
const MAX_UPSCALE_PIXELS = 4_000_000;

function variantsFor(f: OcrFixture): Variant[] {
  const langs = f.lang.split("+") as OcrLanguage[];
  const v: Variant[] = [];
  if (f.category.includes("long")) {
    v.push({ name: "none" }, { name: "auto", steps: "auto" }, { name: "strips-2000", strips: { height: 2000, overlap: 240 } });
  } else {
    for (const p of PRE) {
      const up = Array.isArray(p.steps) && p.steps.some((s) => s.startsWith("upscale"));
      if (up && f.width * f.height > MAX_UPSCALE_PIXELS) continue;
      v.push(p);
    }
    if (f.category.includes("dark") || f.id === "article") v.push({ name: "invert", steps: ["invert"] });
  }
  if (LAYOUT.has(f.id)) for (const s of ["single-column", "single-block", "sparse"] as const) v.push({ name: `psm:${s}`, segmentation: s });
  if (f.rotate90) v.push({ name: "autoRotate", autoRotate: true });
  if (f.lang === "hin") v.push({ name: "lang:eng+hin", languages: ["eng", "hin"] });
  if (f.lang === "eng+hin") v.push({ name: "lang:eng", languages: ["eng"] }, { name: "lang:hin", languages: ["hin"] });
  if (f.id === "article" || f.id === "chat-light") v.push({ name: "lang:eng+hin", languages: ["eng", "hin"] });
  return v.map((x) => ({ ...x, languages: x.languages ?? langs }));
}

function score(f: OcrFixture, result: OcrResult) {
  const exp = loadExpected(f.id);
  const truthLines = exp.lines.map((l) => l.text);
  const truthText = truthLines.join("\n");
  const tS = normStrict(truthText);
  const tL = normLenient(truthText);
  const byOrder = (order: "engine" | "top-down") => {
    const lines = orderLines(result.blocks, order).map((l) => l.text);
    const text = lines.join("\n");
    const lm = lineMetrics(truthLines, lines);
    return {
      cer: +cer(tS, normStrict(text)).toFixed(4),
      cerLenient: +cer(tL, normLenient(text)).toFixed(4),
      wer: +wer(tL, normLenient(text)).toFixed(4),
      orderScore: +lm.orderScore.toFixed(3),
      lines: { exact: lm.exact, near: lm.near, missing: lm.missing, hallucinated: lm.hallucinated, total: lm.total },
      missingLines: lm.missingLines.slice(0, 6),
      hallucinatedLines: lm.hallucinatedLines.slice(0, 6),
    };
  };
  const engine = byOrder("engine");
  const topDown = byOrder("top-down");
  const rows = rowMetrics(
    exp.lines.map((l) => ({ text: l.text, bbox: { x: l.box[0], y: l.box[1], w: l.box[2], h: l.box[3] } })),
    orderLines(result.blocks, "engine").map((l) => ({ text: l.text, bbox: l.bbox })),
  );
  const bag = bagOfWords(tL, normLenient(result.rawText));
  const sym = symbolAccuracy(tS, normStrict(orderLines(result.blocks, "top-down").map((l) => l.text).join("\n")));
  const truthWords = exp.lines.flatMap((l) => l.words).filter((w) => !w.emoji);
  const boxes = exp.boxesFrame === "image" ? boxMetrics(truthWords, orderLines(result.blocks, "engine")) : null;
  const emojiWords = exp.lines.flatMap((l) => l.words).filter((w) => w.emoji).length;
  return {
    engine,
    topDown,
    rows: exp.boxesFrame === "image" ? rows : null,
    wordRecall: +bag.recall.toFixed(4),
    wordPrecision: +bag.precision.toFixed(4),
    missingWords: bag.missing.slice(0, 12),
    extraWords: bag.extra.slice(0, 12),
    symbols: { total: sym.total, accuracy: +sym.accuracy.toFixed(4), perSymbol: sym.perSymbol },
    boxes,
    emojiWordsInTruth: emojiWords,
  };
}

const OUT = join(process.cwd(), "docs", "spikes", "results", "ocr-node.json");

it.runIf(process.env.OCR_BENCH)("OCR benchmark", async () => {
  const filter = process.env.OCR_FILTER ?? "";
  const only = process.env.OCR_VARIANTS?.split(",");
  const fixtures = loadOcrManifest().filter((f) => f.id.includes(filter));
  const jobs = fixtures.flatMap((f) => variantsFor(f).filter((v) => !only || only.includes(v.name)).map((v) => ({ f, v })));
  // Group by language to minimise model switches.
  jobs.sort((a, b) => a.v.languages!.join().localeCompare(b.v.languages!.join()));
  const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { runs: {} };
  const runs: Record<string, unknown> = prior.runs;
  const engines = [createNodeEngine(), createNodeEngine()];
  const initTimes: number[] = [];
  let next = 0;
  let done = 0;

  const runOne = async (engine: ReturnType<typeof createNodeEngine>, f: OcrFixture, v: Variant) => {
    const tInit = performance.now();
    await engine.initialise({ languages: v.languages! });
    const initMs = performance.now() - tInit;
    if (initMs > 200) initTimes.push(initMs);
    const rgba = v.steps || v.strips ? decodeFixture(f) : null;
    let steps: PreprocessStep[] = [];
    const tPrep = performance.now();
    let result: OcrResult;
    const opts = { segmentation: v.segmentation, autoRotate: v.autoRotate, languages: v.languages };
    if (v.strips) {
      const strips = planOcrStrips(rgba!.height, v.strips.height, v.strips.overlap);
      const parts = [];
      for (const s of strips) {
        const img = encodeRgbaPng(cropRgba(rgba!, s.y, s.height));
        parts.push({ strip: s, result: await engine.recognise({ image: img, original: { width: f.width, height: f.height }, transform: { scale: 1, offsetX: 0, offsetY: s.y } }, opts) });
      }
      const merged = mergeStripResults(parts, { width: f.width, height: f.height });
      result = { ...parts[0].result, ...merged, rawText: orderLines(merged.blocks, "engine").map((l) => l.text).join("\n") };
    } else {
      let image: Uint8Array = readFixtureBytes(f);
      let scale = 1;
      if (v.steps) {
        steps = v.steps === "auto" ? choosePreprocessing(imageStats(rgba!)) : v.steps;
        if (steps.length) {
          const out = applyPreprocessing(rgba!, steps);
          image = encodeGrayPng(out.image);
          scale = out.scale;
        }
      }
      const prepMs = performance.now() - tPrep;
      result = await engine.recognise({ image, original: { width: f.width, height: f.height }, transform: { scale, offsetX: 0, offsetY: 0 }, preprocessing: steps }, opts);
      result.durationMs += 0;
      (result as OcrResult & { prepMs?: number }).prepMs = prepMs;
    }
    const s = score(f, result);
    const key = `${f.id}|${v.name}`;
    runs[key] = {
      fixture: f.id,
      category: f.category,
      size: `${f.width}x${f.height}`,
      lang: v.languages!.join("+"),
      variant: v.name,
      steps: v.steps === "auto" ? steps : (v.steps ?? []),
      recogniseMs: Math.round(result.durationMs),
      prepMs: Math.round((result as OcrResult & { prepMs?: number }).prepMs ?? 0),
      confidence: result.confidence !== undefined ? +result.confidence.toFixed(3) : null,
      rotateRadians: result.rotateRadians ?? null,
      ...s,
      // Compact layout for offline reading-order experiments (none/auto only).
      blocks: ["none", "auto"].includes(v.name)
        ? result.blocks.map((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ t: l.text, b: [l.bbox.x, l.bbox.y, l.bbox.w, l.bbox.h].map(Math.round), c: +l.confidence.toFixed(2), w: l.words.map((w) => [w.text, ...[w.bbox.x, w.bbox.y, w.bbox.w, w.bbox.h].map(Math.round)]) }))))
        : undefined,
    };
    done++;
    console.log(`[${done}/${jobs.length}] ${key.padEnd(40)} cer=${s.engine.cer} td=${s.topDown.cer} wer=${s.engine.wer} rec=${s.wordRecall} ${Math.round(result.durationMs)}ms`);
  };

  await Promise.all(
    engines.map(async (engine) => {
      while (next < jobs.length) {
        const { f, v } = jobs[next++];
        try {
          await runOne(engine, f, v);
        } catch (e) {
          const detail = (e as { detail?: string })?.detail ?? "";
          runs[`${f.id}|${v.name}`] = { fixture: f.id, variant: v.name, error: String((e as Error)?.message ?? e), detail };
          console.log(`ERROR ${f.id}|${v.name}: ${(e as Error)?.message} ${detail}`);
        }
        mkdirSync(join(process.cwd(), "docs", "spikes", "results"), { recursive: true });
        writeFileSync(OUT, JSON.stringify({ environment: `node ${process.version}`, initTimesMs: initTimes.map(Math.round), runs }, null, 1) + "\n");
      }
      await engine.terminate();
    }),
  );
}, 7_200_000);
