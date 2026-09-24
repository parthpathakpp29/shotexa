import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { addBreak, clampBreak, manualYs, moveBreak, removeBreak, snapTo, sortBreaks, validateBreaks } from "@/core/pdf/breaks";
import { DEFAULT_PAGINATION_CONFIG, resolvePaginationConfig } from "@/core/pdf/config";
import { imageBoxToPdfPage, slicePlacement } from "@/core/pdf/coords";
import { PdfError, toPdfError } from "@/core/pdf/errors";
import { assertSupportedSize, FIT_PT_PER_PX, MAX_PAGE_PT, pageGeometry } from "@/core/pdf/geometry";
import { chooseBreak, paginateImage, scoreCandidate, slicesFor } from "@/core/pdf/paginate";
import { buildPlan } from "@/core/pdf/plan";
import { assemblePdf, sliceTiles, type EncodedPage } from "@/core/pdf/render-pdf";
import { bandedAreaProxy, computeRowSignals, type GrayProxy } from "@/core/pdf/signals";
import { downscaleGray, rgbaToGray } from "@/core/stitch/gray";
import type { PageBreak, PageSetup, PageSlice } from "@/core/pdf/types";
import { validatePdf } from "../../../../scripts/spikes/pdf/validate-pdf";

const cfg = DEFAULT_PAGINATION_CONFIG;
const A4: PageSetup = { paper: "a4", orientation: "portrait", marginPt: 28 };
const LETTER: PageSetup = { paper: "letter", orientation: "portrait", marginPt: 28 };
const FIT: PageSetup = { paper: "fit", orientation: "portrait", marginPt: 28 };

/**
 * Synthetic 1:1 proxy (scaleY = 1): white page, "text lines" of vertical strokes (strong
 * horizontal gradients) and optional flat grey blocks (bubbles/cards).
 */
function synth(height: number, text: [number, number][], blocks: [number, number, number][] = [], width = 120): GrayProxy {
  const data = new Uint8Array(width * height).fill(255);
  for (const [y0, y1, v] of blocks) for (let y = y0; y < y1; y++) data.fill(v, y * width, (y + 1) * width);
  for (const [y0, y1] of text) for (let y = y0; y < y1; y++) for (let x = 10; x < width - 10; x += 4) data[y * width + x] = data[y * width + x + 1] = 0;
  return { width, height, data, scaleY: 1 };
}

/** Text lines every `pitch` px of `h` px starting at `from`, with page-sized gaps where given. */
function lines(from: number, to: number, pitch = 30, h = 18): [number, number][] {
  const out: [number, number][] = [];
  for (let y = from; y + h <= to; y += pitch) out.push([y, y + h]);
  return out;
}

const brk = (y: number, id = `b${y}`, source: PageBreak["source"] = "automatic"): PageBreak => ({ id, y, source });

describe("page geometry", () => {
  it("A4 / Letter capacity for a 1080-px-wide screenshot with 28 pt margins", () => {
    const a4 = pageGeometry(A4, 1080, 5000);
    expect(a4.pageW).toBeCloseTo(595.28);
    expect(a4.scale).toBeCloseTo((595.28 - 56) / 1080);
    expect(a4.capacityPx).toBe(1573);
    const letter = pageGeometry(LETTER, 1080, 5000);
    expect(letter.capacityPx).toBe(Math.floor((792 - 56) / ((612 - 56) / 1080)));
    expect(letter.capacityPx).toBeLessThan(a4.capacityPx);
  });
  it("fit pages use 0.75 pt/px and are capped at the 14,400 pt page limit", () => {
    const small = pageGeometry(FIT, 1080, 2400);
    expect(small.scale).toBe(FIT_PT_PER_PX);
    expect(small.pageH).toBeCloseTo(2400 * 0.75 + 56);
    expect(small.capacityPx).toBe(Infinity);
    const tall = pageGeometry(FIT, 1080, 30000);
    expect(tall.pageH).toBeCloseTo(MAX_PAGE_PT);
    expect(tall.scale).toBeLessThan(FIT_PT_PER_PX);
  });
  it("rejects impossible margins and unsupported source sizes", () => {
    expect(() => pageGeometry({ ...A4, marginPt: 400 }, 1080, 100)).toThrow(RangeError);
    expect(() => assertSupportedSize(1080, 30000)).not.toThrow();
    expect(() => assertSupportedSize(1080, 70000)).toThrow(PdfError);
    expect(() => assertSupportedSize(20000, 100)).toThrow(/PDF_UNSUPPORTED_SIZE/);
    expect(() => assertSupportedSize(0, 100)).toThrow(PdfError);
  });
});

describe("engine-independent proxy", () => {
  it("banded area proxy equals the benchmark's full-image area downscale exactly", async () => {
    const W = 173;
    const H = 1031;
    const rgba = new Uint8Array(W * H * 4);
    let seed = 7;
    for (let i = 0; i < rgba.length; i++) rgba[i] = (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    for (const [pw, ph, band] of [
      [60, 516, 256],
      [60, 516, 7],
      [173, 1031, 100],
      [41, 700, 1],
    ]) {
      const want = downscaleGray(rgbaToGray(rgba, W, H), pw, ph).data;
      let yields = 0;
      const got = await bandedAreaProxy(W, H, pw, ph, (s0, s1) => rgba.subarray(s0 * W * 4, s1 * W * 4), {
        bandProxyRows: band,
        yieldBetweenBands: async () => void yields++,
      });
      expect(Buffer.from(got).equals(Buffer.from(want))).toBe(true);
      expect(yields).toBe(Math.ceil(ph / band) - 1);
    }
  });
});

describe("candidate scoring", () => {
  const s = computeRowSignals(synth(400, [...lines(0, 150), ...lines(200, 400)]), cfg);
  it("text rows score badly, whitespace gaps score well", () => {
    const inText = scoreCandidate(s, 40, 40, 50, cfg);
    const inGap = scoreCandidate(s, 175, 175, 50, cfg);
    expect(inText.edgeDensity).toBe(1);
    expect(inText.whitespaceScore).toBe(0);
    expect(inGap.edgeDensity).toBe(0);
    expect(inGap.whitespaceScore).toBe(1);
    expect(inGap.totalScore).toBeLessThan(inText.totalScore);
  });
  it("distance from ideal is normalised by the window", () => {
    expect(scoreCandidate(s, 175, 175, 50, cfg).distanceFromIdeal).toBe(0);
    expect(scoreCandidate(s, 150, 175, 50, cfg).distanceFromIdeal).toBeCloseTo(0.5);
  });
  it("OCR text intersection penalises cuts inside a recognised line (with padding)", () => {
    const ocr = [{ y: 170, h: 12 }];
    expect(scoreCandidate(s, 175, 175, 50, cfg, ocr).textIntersectionPenalty).toBe(1);
    expect(scoreCandidate(s, 171, 175, 50, cfg, ocr).textIntersectionPenalty).toBe(0); // inside the 2 px pad
    expect(scoreCandidate(s, 190, 175, 50, cfg, ocr).textIntersectionPenalty).toBe(0);
    expect(scoreCandidate(s, 175, 175, 50, cfg, ocr).totalScore - scoreCandidate(s, 175, 175, 50, cfg).totalScore).toBeCloseTo(cfg.weights.ocrText);
  });
  it("separator rows (flat colour change) are recognised", () => {
    const g = computeRowSignals(synth(200, [], [[100, 200, 200]]), cfg);
    expect(scoreCandidate(g, 100, 100, 20, cfg).separatorScore).toBe(1);
    expect(scoreCandidate(g, 150, 150, 20, cfg).separatorScore).toBe(0);
  });
  it("weights come from one central config and merge overrides", () => {
    const c = resolvePaginationConfig({ weights: { distance: 2 }, windowUp: 0.15 });
    expect(c.weights.distance).toBe(2);
    expect(c.weights.whitespace).toBe(cfg.weights.whitespace);
    expect(c.windowUp).toBe(0.15);
  });
});

describe("chooseBreak", () => {
  it("moves the cut from inside text to the nearest whitespace gap within the window", () => {
    const s = computeRowSignals(synth(2000, [...lines(0, 1500), ...lines(1540, 2000)]), cfg);
    const b = chooseBreak(s, 1560, 1400, 1600, cfg);
    expect(b.y).toBeGreaterThanOrEqual(1500);
    expect(b.y).toBeLessThanOrEqual(1540);
    expect(b.confidence).toBe("high");
    expect(b.idealY).toBe(1560);
  });
  it("never leaves [minY, maxY], even when a better gap lies outside", () => {
    const s = computeRowSignals(synth(2000, [...lines(0, 1000), ...lines(1100, 2000, 20, 16)]), cfg);
    const b = chooseBreak(s, 1560, 1450, 1560, cfg);
    expect(b.y).toBeGreaterThanOrEqual(1450);
    expect(b.y).toBeLessThanOrEqual(1560);
  });
  it("low confidence: keeps the ideal cut and flags it for review when nothing is safe", () => {
    // Every row is a stroke (dense photo / code wall): no gap anywhere.
    const s = computeRowSignals(synth(2000, [[0, 2000]]), cfg);
    const b = chooseBreak(s, 1560, 1400, 1560, cfg);
    expect(b.y).toBe(1560);
    expect(b.confidence).toBe("low");
    expect(b.needsReview).toBe(true);
    expect(b.reasons?.[0]).toMatch(/kept ideal cut/);
  });
  it("medium confidence inside a flat coloured block (bubble/card) without strokes", () => {
    const s = computeRowSignals(synth(2000, [...lines(0, 1400), ...lines(1700, 2000)], [[1400, 1700, 180]]), cfg);
    const b = chooseBreak(s, 1560, 1500, 1560, cfg);
    expect(b.confidence).toBe("medium");
  });
});

describe("paginateImage", () => {
  const H = 5000;
  const cap = 1573;
  const s = computeRowSignals(synth(H, lines(0, H, 40, 18)), cfg);

  it("fixed mode cuts at exact multiples of the page capacity", () => {
    const b = paginateImage({ height: H, capacityPx: cap, mode: "fixed", cfg });
    expect(b.map((x) => x.y)).toEqual([1573, 3146, 4719]);
  });
  it("visual mode: pages never exceed capacity (windowDown 0) and respect the upward window", () => {
    const b = paginateImage({ height: H, capacityPx: cap, mode: "visual", signals: s, cfg });
    const ys = [0, ...b.map((x) => x.y), H];
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeLessThanOrEqual(cap);
    for (let i = 1; i < ys.length - 1; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(Math.floor(cap * (1 - cfg.windowUp)));
    expect(b.every((x) => x.source === "automatic" && x.idealY !== undefined)).toBe(true);
  });
  it("windowDown allows a slightly taller page, shrunk to fit", () => {
    const c = resolvePaginationConfig({ windowDown: 0.05 });
    const b = paginateImage({ height: H, capacityPx: cap, mode: "visual", signals: s, cfg: c });
    const sl = slicesFor(0, H, cap, b);
    for (const p of sl) expect(p.y1 - p.y0).toBeLessThanOrEqual(Math.ceil(cap * 1.05));
    for (const p of sl) expect(p.fitScale).toBeCloseTo(Math.min(1, cap / (p.y1 - p.y0)));
  });
  it("manual breaks are anchors; automatic breaks are re-planned after them", () => {
    const b = paginateImage({ height: H, capacityPx: cap, mode: "visual", signals: s, cfg, manualBreaks: [1000] });
    expect(b[0]).toMatchObject({ y: 1000, source: "manual", idealY: cap });
    expect(b[1].source).toBe("automatic");
    expect(b[1].y).toBeGreaterThan(1000 + cap * (1 - cfg.windowUp) - 1);
    expect(b[1].y).toBeLessThanOrEqual(1000 + cap);
  });
  it("a manual break beyond one page gets automatic breaks before it", () => {
    const b = paginateImage({ height: H, capacityPx: cap, mode: "fixed", cfg, manualBreaks: [4000] });
    expect(b.map((x) => x.y)).toEqual([1573, 3146, 4000]);
  });
  it("short images and fit mode have no automatic breaks", () => {
    expect(paginateImage({ height: 1500, capacityPx: cap, mode: "visual", signals: s, cfg })).toEqual([]);
    expect(paginateImage({ height: H, capacityPx: Infinity, mode: "visual", signals: s, cfg })).toEqual([]);
  });
  it("overlap: the next page starts `overlapPx` above the cut and still fits", () => {
    const b = paginateImage({ height: H, capacityPx: cap, mode: "fixed", cfg, overlapPx: 48 });
    const sl = slicesFor(0, H, cap, b, 48);
    expect(sl[1].y0).toBe(b[0].y - 48);
    for (const p of sl) expect(p.y1 - p.y0).toBeLessThanOrEqual(cap);
    expect(sl.length).toBe(4);
  });
});

describe("slices", () => {
  it("cover the image exactly, sorted, with fitScale for oversize pages", () => {
    const sl = slicesFor(2, 4000, 1573, [brk(2500), brk(1200)]);
    expect(sl.map((p) => [p.y0, p.y1])).toEqual([
      [0, 1200],
      [1200, 2500],
      [2500, 4000],
    ]);
    expect(sl.every((p) => p.imageIndex === 2 && p.fitScale === 1)).toBe(true);
    const big = slicesFor(0, 4000, 1573, [brk(3000)]);
    expect(big[0].fitScale).toBeCloseTo(1573 / 3000);
  });
  it("tall slices are split into ≤ tileRows bands with a 1-row seam overlap", () => {
    const t = sliceTiles({ imageIndex: 0, y0: 0, y1: 5000, fitScale: 1 }, 2048);
    expect(t).toEqual([
      { y0: 0, y1: 2049 },
      { y0: 2048, y1: 4097 },
      { y0: 4096, y1: 5000 },
    ]);
    expect(sliceTiles({ imageIndex: 0, y0: 100, y1: 1673, fitScale: 1 }, 2048)).toEqual([{ y0: 100, y1: 1673 }]);
  });
});

describe("break editing model", () => {
  const lim = { height: 5000, minGapPx: 48 };
  const list = [brk(1573, "a"), brk(3146, "b"), brk(4719, "c")];
  it("sorts, moves (becomes manual) and clamps between neighbours", () => {
    expect(sortBreaks([brk(3), brk(1), brk(2)]).map((b) => b.y)).toEqual([1, 2, 3]);
    const m = moveBreak(list, "b", 3000, lim);
    expect(m.find((b) => b.id === "b")).toMatchObject({ y: 3000, source: "manual" });
    expect(clampBreak(list, "b", 100, lim)).toBe(1573 + 48);
    expect(clampBreak(list, "b", 9999, lim)).toBe(4719 - 48);
    expect(moveBreak(list, "a", -50, lim)[0].y).toBe(48);
    expect(manualYs(m)).toEqual([3000]);
  });
  it("adds manual breaks, rejecting out-of-range, too-close and duplicate positions", () => {
    expect(addBreak(list, 800, lim, "n").map((b) => b.y)).toEqual([800, 1573, 3146, 4719]);
    expect(addBreak(list, 1573, lim, "n")).toBe(list); // duplicate
    expect(addBreak(list, 1600, lim, "n")).toBe(list); // too close
    expect(addBreak(list, 10, lim, "n")).toBe(list);
    expect(addBreak(list, 4990, lim, "n")).toBe(list);
  });
  it("removes breaks and snaps to the nearest safe y within range", () => {
    expect(removeBreak(list, "b").map((b) => b.id)).toEqual(["a", "c"]);
    expect(snapTo(1000, [900, 990, 1030], 24)).toBe(990);
    expect(snapTo(1000, [900, 1100], 24)).toBe(1000);
  });
  it("validates break lists (invalid / duplicate / unsorted)", () => {
    expect(validateBreaks(list, lim)).toEqual([]);
    expect(validateBreaks([brk(0), brk(6000)], lim)).toContain("OUT_OF_RANGE");
    expect(validateBreaks([brk(1000), brk(1000)], lim)).toContain("TOO_CLOSE");
    expect(validateBreaks([brk(3000), brk(1000)], lim)).toContain("UNSORTED");
  });
});

describe("plan building", () => {
  const s = computeRowSignals(synth(5000, lines(0, 5000, 40, 18)), cfg);
  it("OCR mode without OCR lines falls back to visual", () => {
    const img = { width: 1080, height: 5000, signals: s };
    const v = buildPlan([img], A4, "visual", cfg);
    const o = buildPlan([img], A4, "ocr", cfg);
    expect(o.images[0].breaks.map((b) => b.y)).toEqual(v.images[0].breaks.map((b) => b.y));
  });
  it("multiple images each start on a new page, in order", () => {
    const p = buildPlan([{ width: 1080, height: 2400 }, { width: 1080, height: 1000 }], A4, "fixed", cfg);
    expect(p.pages.map((x) => [x.imageIndex, x.y0, x.y1])).toEqual([
      [0, 0, 1573],
      [0, 1573, 2400],
      [1, 0, 1000],
    ]);
  });
  it("frozen layouts keep exactly the given breaks (all manual) with ideal positions", () => {
    const p = buildPlan([{ width: 1080, height: 5000, signals: s, fixedBreaks: [3000, 4500, 3000] }], A4, "visual", cfg);
    expect(p.images[0].breaks.map((b) => [b.y, b.source, b.idealY])).toEqual([
      [3000, "manual", 1573],
      [4500, "manual", 4573],
    ]);
    expect(p.pages[0].fitScale).toBeCloseTo(1573 / 3000);
  });
});

describe("coordinates: image → page → PDF", () => {
  const g = pageGeometry(A4, 1080, 5000);
  const slices: PageSlice[] = slicesFor(0, 5000, g.capacityPx, [brk(1500), brk(3050)]);

  it("slice placement is top-aligned inside the margins", () => {
    const p = slicePlacement(slices[0], g, 28);
    expect(p.x).toBeCloseTo(28);
    expect(p.w).toBeCloseTo(g.contentW);
    expect(p.y + p.h).toBeCloseTo(g.pageH - 28);
    expect(p.h).toBeCloseTo(1500 * g.scale);
  });
  it("oversize (shrunk) slices are centred horizontally", () => {
    const p = slicePlacement({ imageIndex: 0, y0: 0, y1: 3146, fitScale: 0.5 }, g, 28);
    expect(p.w).toBeCloseTo(g.contentW / 2);
    expect(p.x).toBeCloseTo(28 + g.contentW / 4);
    expect(p.y + p.h).toBeCloseTo(g.pageH - 28);
  });
  it("maps an OCR box on page 2 to page-local PDF coordinates (bottom-left origin)", () => {
    const box = { x: 100, y: 1600, w: 200, h: 40 }; // 100 px below the first cut
    const r = imageBoxToPdfPage(box, slices, 0, g, 28)!;
    expect(r.pageIndex).toBe(1);
    expect(r.x).toBeCloseTo(28 + 100 * g.scale);
    expect(r.w).toBeCloseTo(200 * g.scale);
    // top of box is 100 px below the top of page 2's content box
    expect(r.y + r.h).toBeCloseTo(g.pageH - 28 - 100 * g.scale);
  });
  it("boxes straddling a cut go to the page holding their centre; outside boxes map to null", () => {
    expect(imageBoxToPdfPage({ x: 0, y: 1490, w: 10, h: 30 }, slices, 0, g, 28)!.pageIndex).toBe(1);
    expect(imageBoxToPdfPage({ x: 0, y: 1470, w: 10, h: 30 }, slices, 0, g, 28)!.pageIndex).toBe(0);
    expect(imageBoxToPdfPage({ x: 0, y: 6000, w: 10, h: 10 }, slices, 0, g, 28)).toBeNull();
    expect(imageBoxToPdfPage({ x: 0, y: 10, w: 10, h: 10 }, slices, 1, g, 28)).toBeNull();
  });
  it("with overlap, the first page containing the box centre wins", () => {
    const ov = slicesFor(0, 5000, g.capacityPx, [brk(1500)], 48);
    expect(imageBoxToPdfPage({ x: 0, y: 1470, w: 10, h: 10 }, ov, 0, g, 28)!.pageIndex).toBe(0);
  });
});

describe("errors", () => {
  it("maps failures to controlled codes", () => {
    expect(toPdfError(Object.assign(new Error("x"), { name: "AbortError" }), "export").code).toBe("PDF_CANCELLED");
    expect(toPdfError(new RangeError("Array buffer allocation failed"), "export").code).toBe("PDF_MEMORY_PRESSURE");
    expect(toPdfError(new Error("boom"), "decode").code).toBe("PDF_DECODE_FAILED");
    expect(toPdfError(new Error("boom"), "analyse").code).toBe("PDF_ANALYSIS_FAILED");
    expect(toPdfError(new Error("boom"), "export").code).toBe("PDF_EXPORT_FAILED");
    const e = new PdfError("PDF_INVALID_BREAKS", "detail");
    expect(toPdfError(e, "export")).toBe(e);
    expect(e.message).toBe("PDF_INVALID_BREAKS"); // raw detail never becomes the message
  });
});

describe("PDF assembly (pdf-lib, Node)", () => {
  /** Encoded pages for an image whose rows are a vertical gradient (no blank pages). */
  function pagesFor(width: number, height: number, slices: PageSlice[], tileRows = 2048): EncodedPage[] {
    return slices.map((slice) => ({
      slice,
      imageWidth: width,
      imageHeight: height,
      format: "png" as const,
      tiles: sliceTiles(slice, tileRows).map((t) => {
        const png = new PNG({ width, height: t.y1 - t.y0 });
        for (let y = 0; y < t.y1 - t.y0; y++)
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            png.data[i] = png.data[i + 1] = png.data[i + 2] = (t.y0 + y) % 256;
            png.data[i + 3] = 255;
          }
        return { ...t, bytes: new Uint8Array(PNG.sync.write(png)) };
      }),
    }));
  }
  const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

  it("A4: page count, sizes, placement and one image per page all validate", async () => {
    const plan = buildPlan([{ width: 108, height: 500 }], { ...A4 }, "fixed", cfg);
    const pages = pagesFor(108, 500, plan.pages);
    const blob = await assemblePdf(pages, pages.length, { setup: A4, imageFormat: "png" });
    const v = await validatePdf(await bytesOf(blob), plan.pages, [{ width: 108, height: 500 }], A4);
    expect(v.problems).toEqual([]);
    expect(v.pages).toBe(plan.pages.length);
    expect(v.producer).toMatch(/Shotexa/);
  });
  it("fit: one tall page drawn as several bands validates (no gaps, no clipping)", async () => {
    const plan = buildPlan([{ width: 60, height: 700 }], FIT, "fixed", cfg);
    const pages = pagesFor(60, 700, plan.pages, 256);
    const blob = await assemblePdf(pages, pages.length, { setup: FIT, imageFormat: "png" });
    const v = await validatePdf(await bytesOf(blob), plan.pages, [{ width: 60, height: 700 }], FIT, 256);
    expect(v.problems).toEqual([]);
    expect(v.maxBandsPerPage).toBe(3);
  });
  it("multiple images of different widths", async () => {
    const imgs = [
      { width: 108, height: 300 },
      { width: 144, height: 900 },
    ];
    const plan = buildPlan(imgs, LETTER, "fixed", cfg);
    const pages = plan.pages.flatMap((s) => pagesFor(imgs[s.imageIndex].width, imgs[s.imageIndex].height, [s]));
    const blob = await assemblePdf(pages, pages.length, { setup: LETTER, imageFormat: "png" });
    const v = await validatePdf(await bytesOf(blob), plan.pages, imgs, LETTER);
    expect(v.problems).toEqual([]);
  });
  it("cancellation between pages rejects with PDF_CANCELLED", async () => {
    const plan = buildPlan([{ width: 108, height: 500 }], A4, "fixed", cfg);
    const pages = pagesFor(108, 500, plan.pages);
    const signal = { aborted: false };
    async function* slow() {
      for (const p of pages) {
        yield p;
        signal.aborted = true; // user cancels after the first page
      }
    }
    await expect(assemblePdf(slow(), pages.length, { setup: A4, imageFormat: "png", signal })).rejects.toMatchObject({ code: "PDF_CANCELLED" });
  });
  it("reports progress per page", async () => {
    const plan = buildPlan([{ width: 108, height: 500 }], A4, "fixed", cfg);
    const pages = pagesFor(108, 500, plan.pages);
    const seen: number[] = [];
    await assemblePdf(pages, pages.length, { setup: A4, imageFormat: "png", onProgress: (f) => seen.push(f) });
    expect(seen.length).toBe(pages.length + 1);
    expect(seen.at(-1)).toBe(1);
  });
});
