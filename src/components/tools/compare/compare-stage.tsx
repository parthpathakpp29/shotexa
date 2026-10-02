"use client";

/**
 * The comparison preview. It draws the workspace's ≤ 4 MP preview bitmaps through the SAME
 * layout and the SAME renderer as the export, at a display scale — so the only difference
 * between this canvas and the downloaded file is resolution.
 *
 * The before/after divider is dragged here: the position lives in local state while the pointer
 * is down (so nothing re-renders the store on every move) and is committed once on release,
 * giving exactly one undo step.
 */
import { Maximize2, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Mono, Toolbar, ToolbarDivider } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { drawCompare } from "@/core/compare/draw";
import { compareLayout, dividerFromX } from "@/core/compare/layout";
import { backingSize } from "@/lib/stage-size";
import { cn } from "@/lib/cn";
import { useReleasingCanvas } from "@/lib/use-canvas-ref";
import { useElementWidth } from "@/lib/use-element-width";

const MAX_PREVIEW_HEIGHT = 560;
const ARROW_STEP = 1;
const SHIFT_STEP = 10;

export function CompareStage({ assetA, assetB }: { assetA: string; assetB: string }) {
  const { runtime } = useWorkspaceContext();
  const fileA = useWorkspace((s) => s.files[assetA]);
  const fileB = useWorkspace((s) => s.files[assetB]);
  const versionA = useWorkspace((s) => s.files[assetA]?.previewVersion ?? 0);
  const versionB = useWorkspace((s) => s.files[assetB]?.previewVersion ?? 0);
  const settings = useWorkspace((s) => s.compare);
  const setCompare = useWorkspace((s) => s.setCompare);
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attachCanvas = useReleasingCanvas(canvasRef);
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<"fit" | 1>("fit");
  /** The divider while the pointer is down; null when it is not being dragged. */
  const [draft, setDraft] = useState<number | null>(null);
  const latest = useRef(settings.divider);

  const divider = draft ?? settings.divider;
  const layout = useMemo(
    () => (fileA && fileB ? compareLayout({ ...settings, divider }, { size: { width: fileA.width, height: fileA.height }, name: fileA.name }, { size: { width: fileB.width, height: fileB.height }, name: fileB.name }) : null),
    [settings, divider, fileA, fileB],
  );

  const cssWidth = useMemo(() => {
    if (!layout || frameWidth <= 0) return 0;
    const available = Math.max(1, frameWidth - 32);
    if (zoom === 1) return Math.max(1, Math.min(layout.canvas.width, available * 4));
    const byHeight = (MAX_PREVIEW_HEIGHT * layout.canvas.width) / layout.canvas.height;
    return Math.max(1, Math.floor(Math.min(available, byHeight, layout.canvas.width)));
  }, [layout, frameWidth, zoom]);
  const cssHeight = layout && cssWidth ? Math.max(1, Math.round((cssWidth * layout.canvas.height) / layout.canvas.width)) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !fileA || !fileB || !cssWidth) return;
    const size = backingSize({ width: cssWidth, height: cssHeight }, Infinity);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: layout.mode === "difference" });
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    const bitmapA = runtime.registry.preview(assetA);
    const bitmapB = runtime.registry.preview(assetB);
    // One renderer, one layout: the preview is the export at a smaller scale.
    drawCompare(
      ctx,
      layout,
      { image: bitmapA ?? null, imageScale: bitmapA ? bitmapA.width / fileA.width : 1 },
      { image: bitmapB ?? null, imageScale: bitmapB ? bitmapB.width / fileB.width : 1 },
      size.width,
      size.height,
      { createCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }) },
    );
  }, [runtime, assetA, assetB, versionA, versionB, layout, fileA, fileB, cssWidth, cssHeight]);

  if (!fileA || !fileB || !layout) return null;
  const sliding = layout.mode === "slider";

  function moveTo(clientX: number) {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const value = dividerFromX(clientX - box.left, box.width);
    latest.current = value;
    setDraft(value);
  }

  function commit() {
    setDraft(null);
    // The latest pointer value, not the last rendered frame — one drag, one undo step.
    if (latest.current !== settings.divider) setCompare({ ...settings, divider: latest.current });
  }

  return (
    <section aria-label="Comparison preview" data-testid="compare-workspace">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Mono className="text-[12px] text-ink-2" data-testid="compare-output-size">
          {layout.canvas.width} × {layout.canvas.height} px
        </Mono>
        <Toolbar aria-label="View and history">
          <IconButton label="Fit" active={zoom === "fit"} onClick={() => setZoom("fit")}>
            <Maximize2 />
          </IconButton>
          <button
            type="button"
            aria-label="Actual size"
            title="Actual size"
            onClick={() => setZoom(1)}
            className={cn("t-mono inline-flex h-9 items-center rounded-sm px-2 text-[12px] max-md:h-11", zoom === 1 ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink")}
          >
            100%
          </button>
          <span className="contents max-md:hidden">
            <ToolbarDivider />
            <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
              <Undo2 />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
              <Redo2 />
            </IconButton>
          </span>
        </Toolbar>
      </div>

      <div ref={frameRef} className="flex min-h-[420px] items-center justify-center overflow-auto rounded-lg border border-line bg-surface-2 p-4 max-md:min-h-[50dvh] max-md:p-2">
        {cssWidth > 0 && (
          <div
            ref={stageRef}
            data-testid="compare-stage"
            data-canvas-width={layout.canvas.width}
            data-canvas-height={layout.canvas.height}
            data-mode={layout.mode}
            data-divider={divider}
            className={cn("relative shrink-0 touch-none select-none rounded-xs shadow-sm", sliding && "cursor-ew-resize")}
            style={{ width: cssWidth, height: cssHeight }}
            onPointerDown={(e) => {
              if (!sliding || e.button !== 0) return;
              // Own the gesture: the page must not scroll while the divider is being dragged.
              // preventDefault keeps the page from scrolling or selecting mid-drag; the handle
              // is focused by hand because that also suppresses the default focus.
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              e.currentTarget.querySelector<HTMLButtonElement>('[data-testid="compare-divider"]')?.focus({ preventScroll: true });
              moveTo(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!sliding || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
              moveTo(e.clientX);
            }}
            onPointerUp={(e) => {
              if (!sliding || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
              e.currentTarget.releasePointerCapture(e.pointerId);
              commit();
            }}
            onPointerCancel={() => sliding && commit()}
          >
            <canvas ref={attachCanvas} aria-label={`Comparison of ${fileA.name} and ${fileB.name}`} role="img" data-testid="compare-canvas" className="block h-full w-full rounded-xs" />
            {sliding && (
              <button
                type="button"
                role="slider"
                aria-label="Before and after divider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={divider}
                aria-valuetext={`${divider}% from the left`}
                data-testid="compare-divider"
                onKeyDown={(e) => {
                  const step = e.shiftKey ? SHIFT_STEP : ARROW_STEP;
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const next = Math.min(100, Math.max(0, settings.divider + (e.key === "ArrowLeft" ? -step : step)));
                  setCompare({ ...settings, divider: next }, { coalesce: "divider" });
                }}
                className="absolute top-0 z-10 flex h-full w-11 -translate-x-1/2 cursor-ew-resize items-center justify-center outline-none md:w-8"
                style={{ left: `${divider}%` }}
              >
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/90 shadow-sm" />
                <span aria-hidden className="pointer-events-none size-7 rounded-full border-2 border-white bg-dark/70 shadow-md" />
              </button>
            )}
          </div>
        )}
      </div>
      <p className="t-body-sm mt-3 text-ink-2" data-testid="compare-hint">
        {sliding
          ? "Drag the divider, or focus it and use ← →. Before is on the left, after on the right."
          : "The preview shows exactly what will be exported, at a smaller size."}
      </p>
    </section>
  );
}
