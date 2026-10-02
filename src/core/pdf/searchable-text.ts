/**
 * Searchable-PDF text-layer preparation.
 *
 * The text here always comes from the original structured OCR result. User-edited OCR
 * text is intentionally excluded: edited prose has no reliable relationship to the OCR
 * geometry and remains the source for Copy/TXT only.
 */
import { orderLines } from "@/core/ocr/normalize";
import type { BBox, OcrResult } from "@/core/ocr/types";
import { imageBoxToPdfPage } from "./coords";
import { pageGeometry } from "./geometry";
import type { PaginationPlan } from "./types";

export interface SearchableTextLine {
  text: string;
  bbox: BBox;
}

export interface SearchableTextSource {
  imageIndex: number;
  assetId?: string;
  language: string;
  lines: SearchableTextLine[];
}

export interface PdfTextRun {
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  language: string;
}

/** Preserve the reading order chosen by Phase 2B without copying unrelated OCR metadata. */
export function searchableSourceFromResult(imageIndex: number, result: OcrResult, assetId?: string): SearchableTextSource {
  return {
    imageIndex,
    assetId,
    language: result.language,
    lines: orderLines(result.blocks, result.readingOrder)
      .filter((line) => line.text.trim().length > 0 && line.bbox.w > 0 && line.bbox.h > 0)
      .map((line) => ({ text: line.text.normalize("NFC"), bbox: { ...line.bbox } })),
  };
}

/** Map original-image OCR geometry to the exact page slices used by the visual PDF. */
export function buildPdfTextRuns(plan: PaginationPlan, sources: SearchableTextSource[]): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  for (const source of sources) {
    const image = plan.images[source.imageIndex];
    if (!image) continue;
    const geometry = pageGeometry(plan.setup, image.width, image.height);
    for (const line of source.lines) {
      const rect = imageBoxToPdfPage(line.bbox, plan.pages, source.imageIndex, geometry, plan.setup.marginPt);
      if (!rect || !line.text.trim()) continue;
      runs.push({ ...rect, text: line.text, language: source.language });
    }
  }
  return runs;
}

