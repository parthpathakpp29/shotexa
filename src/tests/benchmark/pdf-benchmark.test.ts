/**
 * Spike D — pagination quality benchmark (Node). Gated:
 *
 *   PDF_OCR=1   npx vitest run src/tests/benchmark/pdf-benchmark.test.ts -t "ocr cache"   # once: OCR lines per fixture
 *   PDF_BENCH=1 npx vitest run src/tests/benchmark/pdf-benchmark.test.ts -t "pagination"
 *
 * Writes docs/spikes/results/pdf-node.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { it } from "vitest";
import { orderLines } from "@/core/ocr/normalize";
import { applyPreprocessing, choosePreprocessing, imageStats } from "@/core/ocr/preprocess";
import { mergeStripResults, planOcrStrips } from "@/core/ocr/strips";
import type { OcrResult } from "@/core/ocr/types";
import { resolvePaginationConfig, type PaginationConfigOverrides } from "@/core/pdf/config";
import { pageGeometry } from "@/core/pdf/geometry";
import { paginateImage } from "@/core/pdf/paginate";
import { computeRowSignals, proxyScale } from "@/core/pdf/signals";
import type { OcrLineBox, PageSetup, PaginationMode } from "@/core/pdf/types";
import { downscaleGray, rgbaToGray } from "@/core/stitch/gray";
import { createNodeEngine, encodeGrayPng, encodeRgbaPng } from "../helpers/ocr-fixtures";
import { evaluatePlan, HARD_TYPES, loadPdfManifest, loadPdfTruth, PDF_FIXTURE_DIR } from "../helpers/pdf-metrics";

const OUT = join(process.cwd(), "docs", "spikes", "results", "pdf-node.json");

function decode(id: string) {
  const png = PNG.sync.read(readFileSync(join(PDF_FIXTURE_DIR, id, "image.png")));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
}

it.runIf(process.env.PDF_OCR)(
  "ocr cache",
  async () => {
    const engine = createNodeEngine();
    for (const f of loadPdfManifest()) {
      const out = join(PDF_FIXTURE_DIR, f.id, "ocr.json");
      if (existsSync(out) && !process.env.PDF_OCR_FORCE) continue;
      const img = decode(f.id);
      const t0 = performance.now();
      // Same default pipeline as the browser OCR service (Spike C): auto preprocessing, strips > 8000 px.
      const strips = img.height > 8000 ? planOcrStrips(img.height, 2000, 240) : [{ y: 0, height: img.height, ownFrom: 0, ownTo: img.height }];
      const parts: { strip: (typeof strips)[number]; result: OcrResult }[] = [];
      for (const s of strips) {
        const crop = { width: img.width, height: s.height, data: img.data.subarray(s.y * img.width * 4, (s.y + s.height) * img.width * 4) };
        const steps = choosePreprocessing(imageStats(crop));
        const pre = steps.length ? applyPreprocessing(crop, steps) : null;
        const bytes = pre ? encodeGrayPng(pre.image) : encodeRgbaPng(crop);
        const result = await engine.recognise({ image: bytes, original: { width: img.width, height: img.height }, transform: { scale: pre?.scale ?? 1, offsetX: 0, offsetY: s.y } });
        parts.push({ strip: s, result });
      }
      const blocks = strips.length > 1 ? mergeStripResults(parts, img).blocks : parts[0].result.blocks;
      const lines = orderLines(blocks, "top-down").map((l) => ({ y: Math.round(l.bbox.y), h: Math.round(l.bbox.h), text: l.text }));
      const ms = Math.round(performance.now() - t0);
      writeFileSync(out, JSON.stringify({ ms, lines }) + "\n");
      console.log(`${f.id.padEnd(20)} OCR ${ms} ms, ${lines.length} lines`);
    }
    await engine.terminate();
  },
  3_600_000,
);

interface Variant {
  name: string;
  mode: PaginationMode;
  cfg?: PaginationConfigOverrides;
}

const WINDOWS: [string, number, number][] = [
  ["up5", 0.05, 0],
  ["up10", 0.1, 0],
  ["up12", 0.12, 0],
  ["up15", 0.15, 0],
  ["up20", 0.2, 0],
  ["up10+down5", 0.1, 0.05],
  ["up15+down5", 0.15, 0.05],
];

function variants(): Variant[] {
  const v: Variant[] = [{ name: "fixed", mode: "fixed" }];
  for (const [n, u, d] of WINDOWS) {
    v.push({ name: `visual:${n}`, mode: "visual", cfg: { windowUp: u, windowDown: d } });
    v.push({ name: `ocr:${n}`, mode: "ocr", cfg: { windowUp: u, windowDown: d } });
  }
  // Signal ablations (visual, default window).
  const W = { edgeDensity: 0, inkDensity: 0, whitespace: 0, separator: 0, distance: 0 };
  for (const k of Object.keys(W) as (keyof typeof W)[]) v.push({ name: `ablate:-${k}`, mode: "visual", cfg: { weights: { [k]: 0 } } });
  v.push({ name: "ablate:ocr-only", mode: "ocr", cfg: { weights: { ...W, distance: 0.6 } } });
  return v;
}

const SETUPS: [string, PageSetup][] = [
  ["a4", { paper: "a4", orientation: "portrait", marginPt: 28 }],
  ["letter", { paper: "letter", orientation: "portrait", marginPt: 28 }],
];

it.runIf(process.env.PDF_BENCH)(
  "pagination",
  async () => {
    const runs: Record<string, unknown> = {};
    for (const f of loadPdfManifest()) {
      const img = decode(f.id);
      const truth = loadPdfTruth(f.id);
      const ocrFile = join(PDF_FIXTURE_DIR, f.id, "ocr.json");
      const ocr = existsSync(ocrFile) ? (JSON.parse(readFileSync(ocrFile, "utf8")) as { ms: number; lines: OcrLineBox[] }) : null;
      const base = resolvePaginationConfig();
      const t0 = performance.now();
      const { scaleX, scaleY } = proxyScale(img.width, base);
      const gray = downscaleGray(rgbaToGray(img.data, img.width, img.height), Math.round(img.width * scaleX), Math.round(img.height * scaleY));
      const signals = computeRowSignals({ ...gray, scaleY: gray.height / img.height }, base);
      const signalMs = performance.now() - t0;
      for (const [paperName, setup] of SETUPS) {
        const g = pageGeometry(setup, img.width, img.height);
        for (const v of variants()) {
          if (v.mode === "ocr" && !ocr) continue;
          const cfg = resolvePaginationConfig(v.cfg);
          const t1 = performance.now();
          const breaks = paginateImage({ height: img.height, capacityPx: g.capacityPx, mode: v.mode, signals, ocrLines: ocr?.lines, cfg });
          const planMs = performance.now() - t1;
          const m = evaluatePlan(
            breaks.map((b) => ({ y: b.y, ideal: b.idealY, confidence: b.confidence })),
            truth,
            g.capacityPx,
            { up: g.capacityPx * cfg.windowUp, down: g.capacityPx * cfg.windowDown },
          );
          runs[`${f.id}|${paperName}|${v.name}`] = {
            fixture: f.id,
            category: f.category,
            difficult: f.difficult,
            size: `${img.width}x${img.height}`,
            paper: paperName,
            capacityPx: g.capacityPx,
            variant: v.name,
            mode: v.mode,
            signalMs: +signalMs.toFixed(1),
            planMs: +planMs.toFixed(2),
            ocrMs: ocr?.ms ?? null,
            ...m,
            breakYs: breaks.map((b) => ({ y: b.y, ideal: b.idealY, c: b.confidence, r: b.reasons })),
          };
        }
      }
      console.log(`${f.id.padEnd(20)} signals ${signalMs.toFixed(0)} ms`);
    }
    mkdirSync(join(process.cwd(), "docs", "spikes", "results"), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ environment: `node ${process.version}`, config: resolvePaginationConfig(), runs }, null, 1) + "\n");
  },
  3_600_000,
);

/** Small weight grid search on the NORMAL fixtures (difficult ones act as a holdout). */
it.runIf(process.env.PDF_TUNE)(
  "tune",
  async () => {
    const base = resolvePaginationConfig();
    const prepared = loadPdfManifest().map((f) => {
      const img = decode(f.id);
      const { scaleX, scaleY } = proxyScale(img.width, base);
      const gray = downscaleGray(rgbaToGray(img.data, img.width, img.height), Math.round(img.width * scaleX), Math.round(img.height * scaleY));
      return { f, img, truth: loadPdfTruth(f.id), signals: computeRowSignals({ ...gray, scaleY: gray.height / img.height }, base) };
    });
    const results: { w: Record<string, number>; normalBad: number; difficultBad: number; text: number; meanShift: number }[] = [];
    for (const edgeDensity of [2, 4, 8])
      for (const inkDensity of [0.5, 1, 2])
        for (const whitespace of [0.75, 1.5, 3])
          for (const separator of [0.75, 1.5, 3])
            for (const distance of [0.3, 0.6, 1.2]) {
              const cfg = resolvePaginationConfig({ weights: { edgeDensity, inkDensity, whitespace, separator, distance } });
              let normalBad = 0;
              let difficultBad = 0;
              let text = 0;
              let shift = 0;
              let n = 0;
              for (const p of prepared)
                for (const [, setup] of SETUPS) {
                  const g = pageGeometry(setup, p.img.width, p.img.height);
                  const breaks = paginateImage({ height: p.img.height, capacityPx: g.capacityPx, mode: "visual", signals: p.signals, cfg });
                  const m = evaluatePlan(breaks.map((b) => ({ y: b.y, ideal: b.idealY })), p.truth, g.capacityPx, { up: g.capacityPx * cfg.windowUp, down: 0 });
                  if (p.f.difficult) difficultBad += m.badBreaks;
                  else normalBad += m.badBreaks;
                  text += m.textLineCuts;
                  shift += m.meanShiftPx * m.breaks;
                  n += m.breaks;
                }
              results.push({ w: { edgeDensity, inkDensity, whitespace, separator, distance }, normalBad, difficultBad, text, meanShift: shift / n });
            }
    results.sort((a, b) => a.normalBad - b.normalBad || a.text - b.text || a.meanShift - b.meanShift);
    const { ocrText: _ocr, ...baseW } = base.weights;
    void _ocr;
    const cur = results.find((r) => JSON.stringify(r.w) === JSON.stringify(baseW));
    const hist: Record<string, number> = {};
    for (const r of results) hist[r.normalBad] = (hist[r.normalBad] ?? 0) + 1;
    writeFileSync(join(process.cwd(), "docs", "spikes", "results", "pdf-tuning.json"), JSON.stringify({ combos: results.length, current: cur, normalBadHistogram: hist, top: results.slice(0, 15), worst: results.slice(-3) }, null, 1) + "\n");
    console.log("current", JSON.stringify(cur));
    for (const r of results.slice(0, 8)) console.log(JSON.stringify(r));
  },
  3_600_000,
);

/**
 * Page overlap: repeat the last `overlapPx` rows of each page at the top of the next. Cost =
 * extra pages; benefit = a bad cut whose cut-through elements all start within the overlap
 * appears complete on the next page ("rescued").
 */
it.runIf(process.env.PDF_OVERLAP)(
  "overlap",
  () => {
    const cfg = resolvePaginationConfig();
    const out: Record<string, unknown>[] = [];
    const prepared = loadPdfManifest().map((f) => {
      const img = decode(f.id);
      const { scaleX, scaleY } = proxyScale(img.width, cfg);
      const gray = downscaleGray(rgbaToGray(img.data, img.width, img.height), Math.round(img.width * scaleX), Math.round(img.height * scaleY));
      return { f, img, truth: loadPdfTruth(f.id), signals: computeRowSignals({ ...gray, scaleY: gray.height / img.height }, cfg) };
    });
    for (const overlapPx of [0, 24, 48, 96]) {
      for (const mode of ["fixed", "visual"] as const) {
        let pages = 0;
        let bad = 0;
        let rescued = 0;
        for (const p of prepared)
          for (const [, setup] of SETUPS) {
            const g = pageGeometry(setup, p.img.width, p.img.height);
            const breaks = paginateImage({ height: p.img.height, capacityPx: g.capacityPx, mode, signals: p.signals, cfg, overlapPx });
            pages += breaks.length + 1;
            for (const b of breaks) {
              const crossing = [
                ...p.truth.textLines.filter((l) => l.ink && b.y > l.ink[0] && b.y < l.ink[1] - 1).map((l) => l.ink![0]),
                ...p.truth.regions.filter((r) => HARD_TYPES.has(r.type) && b.y > r.box[1] + 4 && b.y < r.box[1] + r.box[3] - 4).map((r) => r.box[1]),
              ];
              if (!crossing.length) continue;
              bad++;
              if (overlapPx > 0 && crossing.every((top) => top >= b.y - overlapPx)) rescued++;
            }
          }
        out.push({ overlapPx, mode, pages, strictBad: bad, rescuedByOverlap: rescued, stillBroken: bad - rescued });
      }
    }
    writeFileSync(join(process.cwd(), "docs", "spikes", "results", "pdf-overlap.json"), JSON.stringify(out, null, 1) + "\n");
    for (const r of out) console.log(JSON.stringify(r));
  },
  600_000,
);
