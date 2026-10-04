"use client";

/**
 * The long screenshot with its split lines. The image is the ≤ 4 MP workspace preview (never
 * full-resolution pixels); lines and section numbers are DOM overlays positioned in source
 * pixels × scale, so dragging only moves overlays.
 *
 * A drag uses the latest-value pattern: the newest position lives in a DragSession and
 * pointer-up commits exactly that as ONE undo step. Dragging, nudging or deleting a line in
 * Equal mode turns the split into Custom lines at the same positions first.
 */
import { ArrowDown, ArrowUp, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { IconButton, Mono, Toolbar, ToolbarDivider } from "@/components/ui/primitives";
import { ViewportToolbar } from "@/components/ui/viewport";
import { BitmapCanvas } from "@/components/workspace/bitmap-canvas";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { DragSession } from "@/core/annotation/objects";
import { addLine, addLineInTallest, asCustom, cutsFor, defaultSplit, moveLine, piecesFor, removeLine } from "@/core/split/plan";
import type { SplitSettings } from "@/core/split/types";
import type { ViewportZoom } from "@/core/viewport/viewport";
import { cn } from "@/lib/cn";
import { useElementWidth } from "@/lib/use-element-width";
import { useViewportInteraction } from "@/lib/use-viewport";

const MAX_PREVIEW_WIDTH = 560;
const NUDGE = 1;
const SHIFT_NUDGE = 10;

let lineSeq = 0;
export const newLineId = () => `split-${Date.now().toString(36)}-${(lineSeq++).toString(36)}`;

interface Drag {
  index: number;
  lineId: string;
  startY: number;
  startClientY: number;
  scale: number;
  /** The settings being edited (already Custom). */
  base: SplitSettings;
  next: SplitSettings;
}

interface Props {
  assetId: string;
  active: number | null;
  onActive(index: number | null): void;
}

export function SplitStage({ assetId, active, onActive }: Props) {
  const file = useWorkspace((s) => s.files[assetId]);
  const stored = useWorkspace((s) => s.split.byAsset[assetId]);
  const setSplit = useWorkspace((s) => s.setSplit);
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);
  const [zoom, setZoom] = useState<ViewportZoom>("fit");
  const [measureRef, available] = useElementWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef(new DragSession<Drag>());
  const [draft, setDraft] = useState<SplitSettings | null>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const measuredFitWidth = file ? Math.max(1, Math.min(MAX_PREVIEW_WIDTH, (available || MAX_PREVIEW_WIDTH) - 32, file.width)) : 1;
  const fitScale = file ? measuredFitWidth / file.width : 1;
  const viewport = useViewportInteraction({
    scrollRef,
    contentRef: stageRef,
    zoom,
    setZoom,
    fitScale,
    onEscape: () => {
      drag.current.cancel();
      setDraft(null);
      onActive(null);
    },
  });

  if (!file) return null;
  const H = file.height;
  const settings = stored ?? defaultSplit({ width: file.width, height: H });
  const shown = draft ?? settings;
  const cuts = cutsFor(shown, H);
  const pieces = piecesFor(cuts, H);
  const fitWidth = measuredFitWidth;
  const width = zoom === "fit" ? fitWidth : Math.max(1, Math.round(file.width * zoom));
  const scale = width / file.width;
  const custom = shown.mode === "custom";
  /** Commit a change, unless it only converts Equal → Custom without moving anything. */
  function commit(next: SplitSettings, coalesce?: string) {
    const same = JSON.stringify(cutsFor(next, H)) === JSON.stringify(cutsFor(settings, H));
    if (same && next.mode !== settings.mode) return;
    setSplit(assetId, next, { coalesce });
  }

  function nudge(index: number, delta: number) {
    const base = asCustom(settings, H, newLineId);
    const line = base.lines[index];
    if (!line) return;
    commit(moveLine(base, line.id, line.y + delta, H), `nudge:${index}`);
  }

  function remove(index: number) {
    const base = asCustom(settings, H, newLineId);
    const line = base.lines[index];
    if (!line) return;
    setSplit(assetId, removeLine(base, line.id));
    const left = base.lines.length - 1;
    onActive(left ? Math.min(index, left - 1) : null);
  }

  function add(next: SplitSettings) {
    if (next === settings) return;
    setSplit(assetId, next);
    const ys = cutsFor(next, H);
    const added = ys.findIndex((y) => !cuts.includes(y));
    onActive(added >= 0 ? added : null);
  }

  const go = (index: number) => {
    onActive(index);
    lineRefs.current[index]?.focus({ preventScroll: true });
    lineRefs.current[index]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <section aria-label="Split preview" data-testid="split-workspace">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Toolbar aria-label="Split lines">
          <IconButton label="Previous split" disabled={!cuts.length || active === 0} onClick={() => go(active === null ? cuts.length - 1 : Math.max(0, active - 1))}>
            <ArrowUp />
          </IconButton>
          <Mono className="min-w-16 text-center text-[12px]" data-testid="split-position">
            {cuts.length ? (active === null ? `${cuts.length} line${cuts.length === 1 ? "" : "s"}` : `${active + 1} / ${cuts.length}`) : "No lines"}
          </Mono>
          <IconButton label="Next split" disabled={!cuts.length || active === cuts.length - 1} onClick={() => go(active === null ? 0 : Math.min(cuts.length - 1, active + 1))}>
            <ArrowDown />
          </IconButton>
          <ToolbarDivider />
          <IconButton label="Add split" onClick={() => add(addLineInTallest(settings, H, newLineId))}>
            <Plus />
          </IconButton>
          <IconButton label="Delete split" disabled={active === null || active >= cuts.length} onClick={() => active !== null && remove(active)}>
            <Trash2 />
          </IconButton>
        </Toolbar>
        <Toolbar aria-label="History" className="max-md:hidden">
          <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
            <Undo2 />
          </IconButton>
          <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
            <Redo2 />
          </IconButton>
        </Toolbar>
        <ViewportToolbar zoom={zoom} fitScale={fitScale} onFit={viewport.fit} onActual={viewport.actual} onZoomIn={viewport.zoomIn} onZoomOut={viewport.zoomOut} label="Split view" />
      </div>

      <div ref={(element) => { measureRef(element); scrollRef.current = element; }} className={cn("max-h-[calc(100dvh-12rem)] min-h-[420px] overflow-auto rounded-lg border border-line bg-surface-2 px-4 py-6 max-md:max-h-[70dvh] max-md:px-2", (viewport.spaceHeld || viewport.isPanning) && "cursor-grab", viewport.isPanning && "cursor-grabbing")}>
        <div
          ref={stageRef}
          data-viewport-edit
          data-testid="split-stage"
          data-width={file.width}
          data-height={H}
          data-pieces={pieces.length}
          data-mode={shown.mode}
          className={cn("relative mx-auto select-none rounded-xs bg-white shadow-sm", custom ? "cursor-copy" : "cursor-default")}
          style={{ width }}
          onClick={(e) => {
            // Click (or tap without scrolling) on the image adds a line — Custom mode only, so a
            // stray tap never silently turns an equal split into a custom one.
            if (!custom || (e.target as HTMLElement).closest("[data-split-line]")) return;
            const box = e.currentTarget.getBoundingClientRect();
            add(addLine(settings, (e.clientY - box.top) / scale, H, newLineId));
          }}
        >
          <BitmapCanvas id={assetId} width={width} label={`Preview of ${file.name}`} className="rounded-xs" />

          {pieces.map((p) => (
            <span
              key={`s${p.index}`}
              aria-hidden
              data-testid="split-section"
              data-y0={p.y0}
              data-y1={p.y1}
              className="pointer-events-none absolute left-2 flex items-center gap-1.5"
              style={{ top: p.y0 * scale + 8 }}
            >
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-dark font-mono text-[11px] font-semibold text-white shadow-sm">{p.index + 1}</span>
              <span className="rounded-xs bg-dark/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {file.width} × {p.y1 - p.y0}
              </span>
            </span>
          ))}

          {cuts.map((y, index) => {
            const selected = active === index;
            return (
              <button
                key={`l${index}`}
                ref={(el) => {
                  lineRefs.current[index] = el;
                }}
                type="button"
                role="slider"
                data-split-line
                data-testid="split-line"
                data-index={index}
                data-y={y}
                aria-label={`Split line ${index + 1}`}
                aria-valuemin={0}
                aria-valuemax={H}
                aria-valuenow={y}
                aria-valuetext={`${y} px from the top`}
                onFocus={() => onActive(index)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? SHIFT_NUDGE : NUDGE;
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    nudge(index, e.key === "ArrowUp" ? -step : step);
                  } else if (e.key === "Delete" || e.key === "Backspace") {
                    e.preventDefault();
                    remove(index);
                  }
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault(); // keep the scroller from scrolling and the page from selecting
                  e.stopPropagation();
                  e.currentTarget.focus({ preventScroll: true });
                  onActive(index);
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // Best effort: moves still arrive while the pointer is over the line.
                  }
                  const base = asCustom(settings, H, newLineId);
                  drag.current.begin({ index, lineId: base.lines[index].id, startY: y, startClientY: e.clientY, scale, base, next: base });
                }}
                onPointerMove={(e) => {
                  const g = drag.current.latest;
                  if (!drag.current.active || !g) return;
                  const next = moveLine(g.base, g.lineId, g.startY + (e.clientY - g.startClientY) / g.scale, H);
                  drag.current.update({ ...g, next });
                  setDraft(next);
                }}
                onPointerUp={() => {
                  // The latest pointer value, not the last rendered draft.
                  const g = drag.current.commit();
                  setDraft(null);
                  if (g) commit(g.next);
                }}
                onPointerCancel={() => {
                  drag.current.cancel();
                  setDraft(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="group absolute inset-x-[-10px] z-10 h-11 -translate-y-1/2 cursor-ns-resize touch-none outline-none md:h-6"
                style={{ top: y * scale }}
              >
                <span aria-hidden className={cn("pointer-events-none absolute inset-x-[10px] top-1/2 -translate-y-1/2 border-t-2 border-dashed", selected ? "border-accent" : "border-accent/80", "group-focus-visible:border-solid")} />
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full border bg-surface px-2 py-0.5 font-mono text-[10px] shadow-xs",
                    selected ? "border-accent text-accent-ink ring-2 ring-accent/30" : "border-accent-line text-accent-ink",
                  )}
                >
                  {y} px
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="t-body-sm mt-3 text-ink-2" data-testid="split-hint">
        {custom
          ? "Click the image to add a split line. Drag a line to move it; arrow keys nudge it; Delete removes it."
          : "Drag a line to adjust it, or switch to Custom to place your own lines."}
      </p>
    </section>
  );
}
