/** Pure, deterministic layout math for Combine Screenshots. */
import type { CombineAlignment, CombineBackground, CombinePlan, CombineSettings, CombineSource } from "./types";
import { CombineError } from "./errors";

export const DEFAULT_COMBINE_SETTINGS: CombineSettings = {
  layout: "vertical",
  gap: 16,
  background: "transparent",
  alignment: "center",
  sizing: "original",
  gridColumns: "auto",
};

const BACKGROUND: Record<CombineBackground, string | undefined> = {
  transparent: undefined,
  white: "#ffffff",
  cream: "#f8f6f1",
  dark: "#1c1714",
};

export function resolveCombineSettings(partial: Partial<CombineSettings> = {}): CombineSettings {
  const next = { ...DEFAULT_COMBINE_SETTINGS, ...partial };
  return {
    ...next,
    gap: Math.max(0, Math.min(256, Math.round(next.gap))),
    // Horizontal output is normalised by height; vertical/grid use common widths.
    sizing: next.layout === "horizontal" && next.sizing === "match-width" ? "match-height" : next.layout !== "horizontal" && next.sizing === "match-height" ? "match-width" : next.sizing,
  };
}

function aligned(alignment: CombineAlignment, outer: number, inner: number): number {
  if (alignment === "end") return outer - inner;
  if (alignment === "center") return (outer - inner) / 2;
  return 0;
}

function scaled(source: CombineSource, target: number, by: "width" | "height") {
  const ratio = by === "width" ? target / source.width : target / source.height;
  return { width: Math.max(1, Math.round(source.width * ratio)), height: Math.max(1, Math.round(source.height * ratio)) };
}

function gridColumns(count: number, requested: CombineSettings["gridColumns"]): number {
  if (requested !== "auto") return Math.min(count, requested);
  return Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
}

export function planCombine(sources: CombineSource[], partial: Partial<CombineSettings> = {}): CombinePlan {
  if (sources.length < 2) throw new CombineError("COMBINE_TOO_FEW_IMAGES");
  if (sources.some((source) => source.width <= 0 || source.height <= 0)) throw new CombineError("COMBINE_INVALID_LAYOUT");
  const settings = resolveCombineSettings(partial);
  const gap = settings.gap;
  if (settings.layout === "vertical") {
    const target = Math.max(...sources.map((source) => source.width));
    const sizes = sources.map((source) => settings.sizing === "match-width" ? scaled(source, target, "width") : source);
    const width = Math.max(...sizes.map((source) => source.width));
    let y = 0;
    const placements = sizes.map((source, index) => {
      const placement = { source: index, x: Math.round(aligned(settings.alignment, width, source.width)), y, width: source.width, height: source.height };
      y += source.height + (index + 1 < sizes.length ? gap : 0);
      return placement;
    });
    return { width, height: y, placements, background: BACKGROUND[settings.background], settings };
  }
  if (settings.layout === "horizontal") {
    const target = Math.max(...sources.map((source) => source.height));
    const sizes = sources.map((source) => settings.sizing === "match-height" ? scaled(source, target, "height") : source);
    const height = Math.max(...sizes.map((source) => source.height));
    let x = 0;
    const placements = sizes.map((source, index) => {
      const placement = { source: index, x, y: Math.round(aligned(settings.alignment, height, source.height)), width: source.width, height: source.height };
      x += source.width + (index + 1 < sizes.length ? gap : 0);
      return placement;
    });
    return { width: x, height, placements, background: BACKGROUND[settings.background], settings };
  }

  const columns = gridColumns(sources.length, settings.gridColumns);
  const sizes = settings.sizing === "match-width"
    ? sources.map((source) => scaled(source, Math.max(...sources.map((item) => item.width)), "width"))
    : sources;
  const rows = Math.ceil(sizes.length / columns);
  const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(...sizes.filter((_, index) => index % columns === column).map((source) => source.width)));
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...sizes.slice(row * columns, (row + 1) * columns).map((source) => source.height)));
  const xOffsets = columnWidths.map((_, i) => columnWidths.slice(0, i).reduce((sum, width) => sum + width, 0) + i * gap);
  const yOffsets = rowHeights.map((_, i) => rowHeights.slice(0, i).reduce((sum, height) => sum + height, 0) + i * gap);
  const placements = sizes.map((source, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      source: index,
      x: Math.round(xOffsets[column] + aligned(settings.alignment, columnWidths[column], source.width)),
      y: Math.round(yOffsets[row] + aligned(settings.alignment, rowHeights[row], source.height)),
      width: source.width,
      height: source.height,
    };
  });
  return { width: columnWidths.reduce((sum, width) => sum + width, 0) + gap * (columns - 1), height: rowHeights.reduce((sum, height) => sum + height, 0) + gap * (rows - 1), placements, background: BACKGROUND[settings.background], settings };
}
