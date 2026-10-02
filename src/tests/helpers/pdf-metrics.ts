/**
 * Pagination quality metrics against DOM ground truth (Spike D).
 *
 * - text-line cut: the cut crosses rows containing glyph pixels of a text line (ink band
 *   measured from the image; DOM line boxes include empty space above/below glyphs).
 * - hard-region cut: through a heading, chat message, table row, code line, list item,
 *   form field, receipt row or image (4 px tolerance: cutting ON a 1 CSS px border is fine).
 * - soft-region cut: through a paragraph or card between its lines (acceptable in documents).
 * - bad break = text-line cut OR content-splitting hard-region cut (region text on both sides).
 * - cosmetic edge cut: inside a hard region's padding/border only (text all on one side).
 *   Reported separately; `strictBad` counts it as bad too.
 * - avoidable: a bad break for which SOME y inside the allowed window was clean (oracle).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PDF_FIXTURE_DIR = join(process.cwd(), "src", "tests", "fixtures", "pdf");

export interface PdfTruth {
  id: string;
  width: number;
  height: number;
  textLines: { text: string; box: [number, number, number, number]; ink?: [number, number] | null }[];
  regions: { type: string; box: [number, number, number, number] }[];
}
export interface PdfFixture {
  id: string;
  category: string[];
  description: string;
  file: string;
  width: number;
  height: number;
  dpr: number;
  difficult: boolean;
}

export const loadPdfManifest = (): PdfFixture[] => JSON.parse(readFileSync(join(PDF_FIXTURE_DIR, "manifest.json"), "utf8"));
export const loadPdfTruth = (id: string): PdfTruth => JSON.parse(readFileSync(join(PDF_FIXTURE_DIR, id, "truth.json"), "utf8"));

export const HARD_TYPES = new Set(["heading", "chat-message", "table-row", "code-line", "list-item", "field", "receipt-row", "image"]);
const SOFT = new Set(["paragraph", "card"]);

/** Region tolerance: a 1 CSS px border is 2–3 device px at DPR 2–3; cutting ON it is fine. */
const REGION_TOL = 4;

export function cutKinds(y: number, t: PdfTruth) {
  // Text: the cut crosses rows that contain glyph pixels (measured ink band, see ink-bands.ts).
  const text = t.textLines.some((l) => (l.ink ? y > l.ink[0] && y < l.ink[1] - 1 : y > l.box[1] + l.box[3] * 0.1 && y < l.box[1] + l.box[3] * 0.9));
  const inside = (r: { box: number[] }) => y > r.box[1] + REGION_TOL && y < r.box[1] + r.box[3] - REGION_TOL;
  const hardHits = t.regions.filter((r) => HARD_TYPES.has(r.type) && inside(r));
  const hard = hardHits.length > 0;
  const soft = t.regions.some((r) => SOFT.has(r.type) && inside(r));
  // Cosmetic edge cut: the region's text ink lies entirely on one side of the cut, so only
  // padding / a border / a rounded bubble edge moves to the next page. Images are never cosmetic.
  const splits = (r: { type: string; box: number[] }) => {
    if (r.type === "image") return true;
    const inner = t.textLines.filter((l) => l.box[1] >= r.box[1] - 1 && l.box[1] + l.box[3] <= r.box[1] + r.box[3] + 1);
    const band = (l: (typeof inner)[number]) => l.ink ?? [l.box[1], l.box[1] + l.box[3]];
    const above = inner.some((l) => band(l)[0] < y);
    const below = inner.some((l) => band(l)[1] > y);
    return !inner.length || (above && below);
  };
  const hardSplit = hardHits.some(splits);
  return { text, hard, hardSplit, hardCosmetic: hard && !hardSplit, soft, bad: text || hardSplit, strictBad: text || hard };
}

/** Is there any clean y (no text-line or hard-region cut) in [lo, hi]? */
export function cleanExists(lo: number, hi: number, t: PdfTruth): boolean {
  for (let y = Math.ceil(lo); y <= hi; y++) if (!cutKinds(y, t).bad) return true;
  return false;
}

export interface BreakEval {
  y: number;
  ideal?: number;
  confidence?: string;
}

export function evaluatePlan(breaks: BreakEval[], t: PdfTruth, capacityPx: number, windowPx: { up: number; down: number }) {
  let text = 0;
  let hard = 0;
  let soft = 0;
  let cosmetic = 0;
  let strict = 0;
  let bad = 0;
  let avoidable = 0;
  let unavoidable = 0;
  const shifts: number[] = [];
  const byConfidence: Record<string, { n: number; bad: number }> = {};
  const ys = [0, ...breaks.map((b) => b.y), t.height];
  let veryShort = 0;
  for (let i = 1; i < ys.length - 1; i++) if (ys[i] - ys[i - 1] < 0.6 * capacityPx) veryShort++;
  for (const b of breaks) {
    const k = cutKinds(b.y, t);
    if (k.text) text++;
    if (k.hard) hard++;
    if (k.hardCosmetic) cosmetic++;
    if (k.strictBad) strict++;
    if (k.soft) soft++;
    const ideal = b.ideal ?? b.y;
    const clean = cleanExists(ideal - windowPx.up, ideal + windowPx.down, t);
    if (k.bad) {
      bad++;
      if (clean) avoidable++;
      else unavoidable++;
    }
    shifts.push(Math.abs(b.y - ideal));
    const c = b.confidence ?? "n/a";
    byConfidence[c] ??= { n: 0, bad: 0 };
    byConfidence[c].n++;
    if (k.bad) byConfidence[c].bad++;
  }
  return {
    breaks: breaks.length,
    pages: breaks.length + 1,
    textLineCuts: text,
    hardRegionCuts: hard,
    softRegionCuts: soft,
    cosmeticEdgeCuts: cosmetic,
    strictBad: strict,
    badBreaks: bad,
    avoidableBad: avoidable,
    unavoidableBad: unavoidable,
    meanShiftPx: shifts.length ? shifts.reduce((s, v) => s + v, 0) / shifts.length : 0,
    maxShiftPx: shifts.length ? Math.max(...shifts) : 0,
    maxShiftPct: shifts.length ? Math.max(...shifts) / capacityPx : 0,
    veryShortPages: veryShort,
    byConfidence,
  };
}
