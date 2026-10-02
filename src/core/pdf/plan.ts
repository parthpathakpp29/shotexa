/** Build a full PaginationPlan (pure) from per-image signals. Used by the engine and UI re-planning. */
import type { PaginationConfig } from "./config";
import { pageGeometry } from "./geometry";
import { newBreakId, paginateImage, slicesFor } from "./paginate";
import type { RowSignals } from "./signals";
import type {
  ImagePlan,
  OcrLineBox,
  PageSetup,
  PaginationMode,
  PaginationPlan,
} from "./types";

export interface PlanImage {
  width: number;
  height: number;
  signals?: RowSignals;
  ocrLines?: OcrLineBox[];
  manualBreaks?: number[];
  /** Frozen layout: use exactly these breaks (all manual), no automatic re-planning. */
  fixedBreaks?: number[];
}

export function buildPlan(
  images: PlanImage[],
  setup: PageSetup,
  mode: PaginationMode,
  cfg: PaginationConfig,
): PaginationPlan {
  const t0 = performance.now();
  const plans: ImagePlan[] = images.map((im, imageIndex) => {
    const g = pageGeometry(setup, im.width, im.height);
    const breaks = im.fixedBreaks
      ? [...new Set(im.fixedBreaks)]
          .filter((y) => y > 0 && y < im.height)
          .sort((a, b) => a - b)
          .map((y, k, all) => ({ id: newBreakId(), y, idealY: Number.isFinite(g.capacityPx) ? Math.round((k ? all[k - 1] : 0) + g.capacityPx) : undefined, source: "manual" as const }))
      : paginateImage({
          height: im.height,
          capacityPx: g.capacityPx,
          mode: mode === "ocr" && !im.ocrLines ? "visual" : mode,
          signals: im.signals,
          ocrLines: im.ocrLines,
          manualBreaks: im.manualBreaks,
          overlapPx: setup.overlapPx,
          cfg,
        });
    return {
      imageIndex,
      width: im.width,
      height: im.height,
      capacityPx: g.capacityPx,
      breaks,
    };
  });
  const pages = plans.flatMap((p) =>
    slicesFor(
      p.imageIndex,
      p.height,
      p.capacityPx,
      p.breaks,
      setup.overlapPx ?? 0,
    ),
  );
  return {
    setup,
    mode,
    images: plans,
    pages,
    analysisMs: performance.now() - t0,
  };
}
