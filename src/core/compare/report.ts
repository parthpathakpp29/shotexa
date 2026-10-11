/**
 * "Shotexa Visual Comparison Report" — a local PDF (and optional ZIP package) built from the
 * measured summary and the images Compare already produced.
 *
 * It records what was measured and what settings produced it. It deliberately does NOT claim
 * to certify, audit or prove anything: the footer says so on every page, because a browser
 * pixel comparison is evidence of nothing beyond the two files it was given.
 *
 * pdf-lib is imported lazily, so nothing of it is fetched until a report is actually asked
 * for, and the standard Helvetica faces are used so no font has to be downloaded.
 */
import { createZip, type ArchiveEntry } from "@/core/archive/zip";
import { CompareError } from "./types";
import { summaryRows, summaryToJson, type CompareSummary } from "./summary";

type PdfLib = typeof import("pdf-lib");
type PdfDoc = import("pdf-lib").PDFDocument;
type PdfPage = import("pdf-lib").PDFPage;
type PdfFont = import("pdf-lib").PDFFont;

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const FOOT = "Shotexa Visual Comparison Report — measured locally in the browser. A factual pixel and OCR comparison of two files; not a certification or an audit.";

export interface CompareReportImages {
  /** PNG bytes. Only the views that were actually generated are included. */
  before?: Blob;
  after?: Blob;
  difference?: Blob;
  heatmap?: Blob;
}

export interface CompareReportOptions {
  summary: CompareSummary;
  images?: CompareReportImages;
  signal?: { readonly aborted: boolean };
}

interface Writer {
  lib: PdfLib;
  doc: PdfDoc;
  regular: PdfFont;
  bold: PdfFont;
  mono: PdfFont;
  page: PdfPage;
  y: number;
  pages: number;
}

const INK = (lib: PdfLib) => lib.rgb(0.11, 0.09, 0.08);
const MUTED = (lib: PdfLib) => lib.rgb(0.42, 0.39, 0.37);
const LINE = (lib: PdfLib) => lib.rgb(0.85, 0.83, 0.8);
const ACCENT = (lib: PdfLib) => lib.rgb(0.78, 0.31, 0.16);

function addPage(w: Writer): void {
  w.page = w.doc.addPage([A4.width, A4.height]);
  w.pages++;
  w.y = A4.height - MARGIN;
  w.page.drawText(FOOT, { x: MARGIN, y: 26, size: 6.5, font: w.regular, color: MUTED(w.lib), maxWidth: A4.width - MARGIN * 2, lineHeight: 8 });
}

function ensure(w: Writer, needed: number): void {
  if (w.y - needed < MARGIN + 24) addPage(w);
}

function wrap(text: string, font: PdfFont, size: number, width: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // A single word longer than the column is cut rather than allowed to overflow.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
      let cut = rest.length;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) lines.push(current);
  return lines;
}

function paragraph(w: Writer, text: string, options: { size?: number; font?: PdfFont; colour?: import("pdf-lib").RGB; gap?: number } = {}): void {
  const size = options.size ?? 9;
  const font = options.font ?? w.regular;
  const lines = wrap(text, font, size, A4.width - MARGIN * 2);
  ensure(w, lines.length * (size + 3) + (options.gap ?? 4));
  for (const line of lines) {
    w.y -= size + 3;
    w.page.drawText(line, { x: MARGIN, y: w.y, size, font, color: options.colour ?? INK(w.lib) });
  }
  w.y -= options.gap ?? 4;
}

function heading(w: Writer, text: string): void {
  ensure(w, 34);
  w.y -= 20;
  w.page.drawText(text, { x: MARGIN, y: w.y, size: 12.5, font: w.bold, color: INK(w.lib) });
  w.y -= 7;
  w.page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: A4.width - MARGIN, y: w.y }, thickness: 0.6, color: LINE(w.lib) });
  w.y -= 6;
}

/** Two-column label/value rows; the value column is monospaced so numbers line up. */
function rows(w: Writer, entries: { label: string; value: string }[], labelWidth = 160): void {
  for (const entry of entries) {
    const valueLines = wrap(entry.value, w.mono, 8.5, A4.width - MARGIN * 2 - labelWidth);
    ensure(w, valueLines.length * 12 + 2);
    const top = w.y - 12;
    w.page.drawText(entry.label, { x: MARGIN, y: top, size: 8.5, font: w.regular, color: MUTED(w.lib) });
    valueLines.forEach((line, index) => {
      w.page.drawText(line, { x: MARGIN + labelWidth, y: top - index * 11, size: 8.5, font: w.mono, color: INK(w.lib) });
    });
    w.y = top - (valueLines.length - 1) * 11 - 4;
  }
}

async function drawImageBlock(w: Writer, caption: string, blob: Blob, maxHeight: number): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const image = blob.type === "image/jpeg" ? await w.doc.embedJpg(bytes) : await w.doc.embedPng(bytes);
  const available = A4.width - MARGIN * 2;
  const scale = Math.min(available / image.width, maxHeight / image.height, 1);
  const width = Math.max(1, image.width * scale);
  const height = Math.max(1, image.height * scale);
  ensure(w, height + 26);
  w.y -= 13;
  w.page.drawText(caption, { x: MARGIN, y: w.y, size: 8.5, font: w.bold, color: MUTED(w.lib) });
  w.y -= height + 6;
  w.page.drawRectangle({ x: MARGIN - 1, y: w.y - 1, width: width + 2, height: height + 2, borderColor: LINE(w.lib), borderWidth: 0.6 });
  w.page.drawImage(image, { x: MARGIN, y: w.y, width, height });
  w.y -= 8;
}

const fileRows = (facts: CompareSummary["files"]["a"]): { label: string; value: string }[] => [
  { label: "Filename", value: facts.name },
  { label: "Dimensions", value: `${facts.width} x ${facts.height} px` },
  { label: "Aspect ratio", value: `${facts.aspectRatio.toFixed(3)}:1` },
  { label: "Format", value: facts.type.replace("image/", "").toUpperCase() },
  { label: "File size", value: `${facts.bytes.toLocaleString("en-GB")} bytes` },
  { label: "Transparency", value: facts.transparent === null ? "Not checked" : facts.transparent ? "Alpha present" : "None detected" },
];

/** Build the report. Returns a PDF Blob; never a data URL. */
export async function createCompareReportPdf(options: CompareReportOptions): Promise<Blob> {
  const { summary } = options;
  try {
    const lib = (await import("pdf-lib")) as PdfLib;
    const doc = await lib.PDFDocument.create();
    doc.setTitle(summary.title);
    doc.setProducer("Shotexa");
    doc.setCreator("Shotexa Compare");
    const regular = await doc.embedFont(lib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
    const mono = await doc.embedFont(lib.StandardFonts.Courier);
    const w: Writer = { lib, doc, regular, bold, mono, page: doc.addPage([A4.width, A4.height]), y: A4.height - MARGIN, pages: 1 };
    w.page.drawText(FOOT, { x: MARGIN, y: 26, size: 6.5, font: regular, color: MUTED(lib), maxWidth: A4.width - MARGIN * 2, lineHeight: 8 });

    // Title block
    w.y -= 24;
    w.page.drawText(summary.title, { x: MARGIN, y: w.y, size: 20, font: bold, color: INK(lib) });
    w.y -= 16;
    w.page.drawText(`Generated ${summary.generatedAt}`, { x: MARGIN, y: w.y, size: 8.5, font: mono, color: MUTED(lib) });
    w.y -= 12;
    w.page.drawText(summary.tool, { x: MARGIN, y: w.y, size: 8.5, font: regular, color: MUTED(lib) });
    w.y -= 6;

    heading(w, "Comparison summary");
    rows(w, summaryRows(summary));
    rows(w, [
      { label: "Changed pixels (count)", value: `${summary.totals.changedPixels.toLocaleString("en-GB")} of ${summary.totals.comparedPixels.toLocaleString("en-GB")} compared` },
      { label: "Pixels left out", value: `${summary.totals.ignoredPixels.toLocaleString("en-GB")} (ignore regions, transparency or ignored colour)` },
      { label: "Comparison resolution", value: summary.analysis ? `${summary.analysis.width} x ${summary.analysis.height} analysis px` : "Not analysed" },
    ]);

    heading(w, "Alignment");
    rows(w, [
      { label: "Mode", value: summary.alignment.mode },
      { label: "Result", value: summary.alignment.status },
      { label: "X offset", value: `${summary.alignment.x >= 0 ? "+" : ""}${summary.alignment.x} px` },
      { label: "Y offset", value: `${summary.alignment.y >= 0 ? "+" : ""}${summary.alignment.y} px` },
      { label: "Scale", value: `${summary.alignment.scalePercent.toFixed(2)}%` },
      { label: "Match score", value: `${summary.alignment.score} (${summary.alignment.confidence} confidence)` },
    ]);
    if (summary.alignment.status === "failed" && summary.alignment.mode !== "off") {
      paragraph(w, "Alignment could not be measured reliably, so the comparison ran without it.", { size: 8.5, colour: MUTED(lib) });
    }

    heading(w, "Files");
    paragraph(w, "A — before", { size: 9, font: bold, gap: 1 });
    rows(w, fileRows(summary.files.a), 170);
    paragraph(w, "B — after", { size: 9, font: bold, gap: 1 });
    rows(w, fileRows(summary.files.b), 170);
    if (summary.files.mismatches.length) {
      paragraph(w, `Differences between the two files: ${summary.files.mismatches.join("; ")}.`, { size: 8.5, colour: ACCENT(lib) });
    } else {
      paragraph(w, "Both files have the same dimensions, aspect ratio and format.", { size: 8.5, colour: MUTED(lib) });
    }

    heading(w, "Difference measurement");
    rows(w, [
      { label: "Metric", value: summary.metric.mode },
      { label: "What it measures", value: summary.metric.description },
      { label: "Colour tolerance", value: String(summary.metric.colourTolerance) },
      { label: "Luminance tolerance", value: String(summary.metric.luminanceTolerance) },
      { label: "Perceptual tolerance", value: `delta-E ${summary.metric.deltaE}` },
    ]);

    if (options.images?.before || options.images?.after) {
      addPage(w);
      heading(w, "Before and after");
      if (options.images.before) await drawImageBlock(w, "A — before", options.images.before, 320);
      if (options.images.after) await drawImageBlock(w, "B — after", options.images.after, 320);
    }
    if (options.images?.difference || options.images?.heatmap) {
      addPage(w);
      heading(w, "Difference views");
      if (options.images.difference) await drawImageBlock(w, "Difference", options.images.difference, 320);
      if (options.images.heatmap) await drawImageBlock(w, "Heatmap (cool = smaller measured change, hot = larger)", options.images.heatmap, 320);
    }

    if (summary.regions.length) {
      addPage(w);
      heading(w, `Changed regions (${summary.regions.length}${summary.totals.regionsTruncated ? "+" : ""})`);
      paragraph(w, "Boxes are in comparison-analysis pixels. A region is only named when the measurement supports it; everything else is reported as a visual change.", { size: 8, colour: MUTED(lib) });
      for (const region of summary.regions.slice(0, 120)) {
        const source = region.sourceB ?? region.sourceA;
        rows(w, [
          {
            label: `Region ${region.id} — ${region.label}`,
            value: `${region.box.width} x ${region.box.height} at (${region.box.x}, ${region.box.y}) · ${region.changedPixels.toLocaleString("en-GB")} changed px · ${region.percentOfCompared.toFixed(2)}% · ${region.confidence} confidence${source ? ` · in screenshot at (${source.x}, ${source.y})` : ""}`,
          },
        ], 190);
      }
      if (summary.regions.length > 120) paragraph(w, `${summary.regions.length - 120} further regions are included in the JSON summary.`, { size: 8, colour: MUTED(lib) });
    }

    if (summary.textChanges.length) {
      addPage(w);
      heading(w, `Visible text changes (${summary.textChanges.length})`);
      paragraph(w, "Text is reproduced exactly as the on-device OCR read it, with OCR's own confidence. OCR can misread; treat low confidence accordingly.", { size: 8, colour: MUTED(lib) });
      for (const change of summary.textChanges.slice(0, 200)) {
        ensure(w, 40);
        w.y -= 12;
        w.page.drawText(`${change.kind.toUpperCase()} · OCR confidence ${(change.ocrConfidence * 100).toFixed(0)}%`, { x: MARGIN, y: w.y, size: 7.5, font: bold, color: MUTED(lib) });
        if (change.before !== undefined) paragraph(w, `- ${change.before}`, { size: 8.5, font: mono, gap: 1 });
        if (change.after !== undefined) paragraph(w, `+ ${change.after}`, { size: 8.5, font: mono, gap: 1 });
        w.y -= 3;
      }
    }

    if (summary.ignoreRegions.length) {
      heading(w, `Ignored regions (${summary.ignoreRegions.length})`);
      rows(
        w,
        summary.ignoreRegions.map((region, index) => ({
          label: region.name || `Ignore region ${index + 1}`,
          value: `${(region.width * 100).toFixed(1)}% x ${(region.height * 100).toFixed(1)}% at (${(region.x * 100).toFixed(1)}%, ${(region.y * 100).toFixed(1)}%) · ${region.enabled ? "applied" : "disabled"}`,
        })),
        190,
      );
    }

    heading(w, "Settings used");
    rows(w, [
      { label: "View", value: summary.settings.mode },
      { label: "Preset", value: summary.settings.preset ?? "none" },
      { label: "Fitting", value: `${summary.settings.fit} · placed ${summary.settings.placement}` },
      { label: "Minimum region size", value: `${summary.settings.minRegionSize} px` },
      { label: "Region merge distance", value: `${summary.settings.mergeDistance} px` },
      { label: "Ignore tiny differences", value: summary.settings.ignoreTiny ? "on" : "off" },
      { label: "Ignore anti-aliasing", value: summary.settings.ignoreAntialiasing ? "on" : "off" },
      { label: "Ignore near-identical colour", value: summary.settings.ignoreNearIdenticalColour ? "on" : "off" },
      { label: "Ignore transparent pixels", value: summary.settings.ignoreTransparent ? "on" : "off" },
      { label: "Compare alpha", value: summary.settings.compareAlpha ? "on" : "off" },
      { label: "Ignored colour", value: summary.settings.ignoreColour ? `${summary.settings.ignoreColour} +/- ${summary.settings.ignoreColourTolerance}` : "none" },
      { label: "Movement detection", value: summary.settings.detectMovement ? "on" : "off" },
      { label: "Heatmap", value: `intensity ${summary.settings.heatmap.intensity}% · threshold ${summary.settings.heatmap.threshold}% · ${summary.settings.heatmap.changedOnly ? "changed only" : "full"} · legend ${summary.settings.heatmap.legend ? "on" : "off"}` },
    ]);

    if (options.signal?.aborted) throw new CompareError("COMPARE_CANCELLED");
    const bytes = await doc.save();
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
  } catch (error) {
    if (error instanceof CompareError) throw error;
    throw new CompareError("COMPARE_REPORT_FAILED", error instanceof Error ? error.message : undefined);
  }
}

export interface CompareReportPackage {
  blob: Blob;
  names: string[];
}

/**
 * comparison-report.zip — only the files that were actually generated go in it, so the
 * package never implies an output that does not exist.
 */
export async function createCompareReportZip(options: CompareReportOptions & { pdf?: Blob }): Promise<CompareReportPackage> {
  const entries: ArchiveEntry[] = [];
  const images = options.images ?? {};
  if (images.before) entries.push({ name: "before.png", input: images.before });
  if (images.after) entries.push({ name: "after.png", input: images.after });
  if (images.difference) entries.push({ name: "difference.png", input: images.difference });
  if (images.heatmap) entries.push({ name: "heatmap.png", input: images.heatmap });
  const pdf = options.pdf ?? (await createCompareReportPdf(options));
  entries.push({ name: "report.pdf", input: pdf });
  entries.push({ name: "summary.json", input: summaryToJson(options.summary) });
  return createZip(entries);
}
