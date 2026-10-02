"use client";

import { useRef } from "react";
import { Badge } from "@/components/ui/primitives";
import { BitmapCanvas } from "@/components/workspace/bitmap-canvas";
import type { PageBreak, PaginationPlan } from "@/core/pdf/types";
import type { FileId, WorkspaceFile } from "@/core/runtime/types";
import { cn } from "@/lib/cn";
import { useElementWidth } from "@/lib/use-element-width";

const ARROW_PX = 4;
const SHIFT_ARROW_PX = 40;
const MAX_PREVIEW_WIDTH = 620;

export interface PdfBreakSelection {
  assetId: FileId;
  y: number;
}

interface Props {
  inputIds: FileId[];
  files: Record<FileId, WorkspaceFile>;
  plan: PaginationPlan;
  selected: PdfBreakSelection | null;
  disabled?: boolean;
  onSelect(assetId: FileId, y: number): void;
  onMove(assetId: FileId, breakIndex: number, y: number, options: { snap: boolean; coalesce: boolean }): void;
  onDelete(assetId: FileId, breakIndex: number): void;
  onAdd(assetId: FileId, y: number): void;
}

function tone(b: PageBreak): "high" | "review" | "manual" {
  if (b.source === "manual") return "manual";
  return b.confidence === "high" ? "high" : "review";
}

export function PdfPreview({ inputIds, files, plan, selected, disabled, onSelect, onMove, onDelete, onAdd }: Props) {
  const [measureRef, available] = useElementWidth<HTMLDivElement>();
  const drag = useRef<{ assetId: FileId; breakIndex: number; startY: number; startClientY: number; scale: number } | null>(null);
  const pageCounts = inputIds.map((_, imageIndex) => plan.pages.filter((page) => page.imageIndex === imageIndex).length);
  const firstPages = pageCounts.map((_, imageIndex) => 1 + pageCounts.slice(0, imageIndex).reduce((total, count) => total + count, 0));

  return (
    <section className="rounded-lg border border-line bg-surface p-2 shadow-xs sm:p-3" aria-label="PDF page-break preview" data-testid="pdf-preview">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div><p className="font-display text-lg">Page preview</p><p className="text-xs text-ink-3">Drag a line, focus it and use arrow keys, or double-click the image to add a break.</p></div>
        <div className="flex gap-2"><Badge tone="success" dot mono={false}>High confidence</Badge><Badge tone="warning" dot mono={false}>Review recommended</Badge></div>
      </div>
      <div ref={measureRef} className="max-h-[calc(100dvh-14rem)] min-h-[360px] overflow-auto rounded-md border border-line bg-surface-2 px-3 py-5 sm:px-6 max-md:max-h-[calc(100dvh-13rem)]">
        <div className="mx-auto flex max-w-[680px] flex-col gap-8">
          {inputIds.map((assetId, imageIndex) => {
            const file = files[assetId];
            const imagePlan = plan.images[imageIndex];
            if (!file || !imagePlan) return null;
            const width = Math.max(1, Math.min(MAX_PREVIEW_WIDTH, available - 48 || MAX_PREVIEW_WIDTH, file.width));
            const scale = width / file.width;
            const pageCount = pageCounts[imageIndex];
            const firstPage = firstPages[imageIndex];
            return (
              <figure key={assetId} className="mx-auto w-full" data-testid={`pdf-image-${imageIndex}`}>
                <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{imageIndex + 1}. {file.name}</span>
                  <span className="t-mono text-[11px] text-ink-3">{file.width} × {file.height} px · {pageCount} page{pageCount === 1 ? "" : "s"}</span>
                </figcaption>
                <div
                  className={cn("relative mx-auto overflow-visible rounded-xs bg-white shadow-sm", disabled && "opacity-60")}
                  style={{ width }}
                  onDoubleClick={(event) => {
                    if (disabled) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    onAdd(assetId, (event.clientY - rect.top) / scale);
                  }}
                >
                  <BitmapCanvas id={assetId} width={width} label={`PDF preview of ${file.name}`} className="rounded-xs" />
                  <span className="pointer-events-none absolute left-2 top-2 rounded-xs bg-dark/85 px-2 py-1 font-mono text-[10px] text-white">Page {firstPage}</span>
                  {imagePlan.breaks.map((pageBreak, breakIndex) => {
                    const kind = tone(pageBreak);
                    const isSelected = selected?.assetId === assetId && selected.y === pageBreak.y;
                    const pageNo = firstPage + breakIndex;
                    return (
                      <div key={`${breakIndex}-${pageBreak.source}`}>
                        {pageBreak.idealY !== undefined && pageBreak.idealY !== pageBreak.y && <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-3/45" style={{ top: pageBreak.idealY * scale }} />}
                        <button
                          type="button"
                          role="slider"
                          aria-label={`Page break ${breakIndex + 1} for ${file.name}`}
                          aria-valuemin={0}
                          aria-valuemax={file.height}
                          aria-valuenow={pageBreak.y}
                          data-testid="pdf-break"
                          data-asset-id={assetId}
                          data-break-y={pageBreak.y}
                          data-confidence={pageBreak.confidence ?? "fixed"}
                          data-source={pageBreak.source}
                          disabled={disabled}
                          onFocus={() => onSelect(assetId, pageBreak.y)}
                          onKeyDown={(event) => {
                            const step = event.shiftKey ? SHIFT_ARROW_PX : ARROW_PX;
                            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                              event.preventDefault();
                              onMove(assetId, breakIndex, pageBreak.y + (event.key === "ArrowUp" ? -step : step), { snap: false, coalesce: false });
                            } else if (event.key === "Delete" || event.key === "Backspace") {
                              event.preventDefault();
                              onDelete(assetId, breakIndex);
                            } else if (event.key === "Enter" || event.key.toLowerCase() === "s") {
                              event.preventDefault();
                              onMove(assetId, breakIndex, pageBreak.y, { snap: true, coalesce: false });
                            }
                          }}
                          onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            drag.current = { assetId, breakIndex, startY: pageBreak.y, startClientY: event.clientY, scale };
                            onSelect(assetId, pageBreak.y);
                          }}
                          onPointerMove={(event) => {
                            const active = drag.current;
                            if (!active || active.assetId !== assetId) return;
                            onMove(assetId, active.breakIndex, active.startY + (event.clientY - active.startClientY) / active.scale, { snap: false, coalesce: true });
                          }}
                          onPointerUp={(event) => {
                            const active = drag.current;
                            drag.current = null;
                            if (!active) return;
                            onMove(assetId, active.breakIndex, active.startY + (event.clientY - active.startClientY) / active.scale, { snap: true, coalesce: true });
                          }}
                          className={cn(
                            "absolute inset-x-[-8px] z-10 h-6 -translate-y-1/2 cursor-ns-resize touch-none outline-none after:absolute after:inset-x-0 after:top-1/2 after:border-t-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-default",
                            kind === "high" && "after:border-success",
                            kind === "review" && "after:border-warning",
                            kind === "manual" && "after:border-accent",
                            isSelected && "after:border-t-[3px]",
                          )}
                          style={{ top: pageBreak.y * scale }}
                        >
                          <span className={cn("absolute right-2 top-1/2 -translate-y-1/2 rounded-full border bg-surface px-2 py-0.5 font-mono text-[10px] shadow-xs", kind === "review" ? "border-[#f0dcb4] text-warning" : kind === "manual" ? "border-accent-line text-accent-ink" : "border-[#cfe5d6] text-success")}>Page {pageNo + 1}{kind === "review" ? " · review" : kind === "manual" ? " · adjusted" : ""}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
