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
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Mono, Toolbar } from "@/components/ui/primitives";
import { ViewportToolbar } from "@/components/ui/viewport";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { drawCompare } from "@/core/compare/draw";
import type { ChangedRegion, DifferenceAnalysis } from "@/core/compare/difference";
import { compareLayout, dividerFromX } from "@/core/compare/layout";
import { backingSize, displayWidth, type Zoom } from "@/lib/stage-size";
import { cn } from "@/lib/cn";
import { useReleasingCanvas } from "@/lib/use-canvas-ref";
import { useElementWidth } from "@/lib/use-element-width";
import { useViewportInteraction } from "@/lib/use-viewport";

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
  const [zoom, setZoom] = useState<Zoom>("fit");
  /** The divider while the pointer is down; null when it is not being dragged. */
  const [draft, setDraft] = useState<number | null>(null);
  const [stats, setStats] = useState<DifferenceAnalysis | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);
  const [flickerFrame, setFlickerFrame] = useState<"a" | "b">("a");
  const [reducedMotion, setReducedMotion] = useState(false);
  const latest = useRef(settings.divider);
  const scrollRef = useRef<HTMLDivElement>(null);

  const divider = draft ?? settings.divider;
  const layout = useMemo(
    () => (fileA && fileB ? compareLayout({ ...settings, divider }, { size: { width: fileA.width, height: fileA.height }, name: fileA.name }, { size: { width: fileB.width, height: fileB.height }, name: fileB.name }) : null),
    [settings, divider, fileA, fileB],
  );
  const renderLayout = useMemo(() => {
    if (!layout || !settings.flicker || reducedMotion) return layout;
    return { ...layout, mode: "slider" as const, divider: flickerFrame === "a" ? layout.canvas.width : 0, labels: null };
  }, [layout, settings.flicker, reducedMotion, flickerFrame]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!settings.flicker || reducedMotion) return;
    const timer = window.setInterval(() => setFlickerFrame((current) => (current === "a" ? "b" : "a")), settings.flickerSpeed);
    return () => window.clearInterval(timer);
  }, [settings.flicker, settings.flickerSpeed, reducedMotion]);

  const fitWidth = useMemo(() => {
    if (!layout || frameWidth <= 0) return 0;
    const available = Math.max(1, frameWidth - 32);
    const byHeight = (MAX_PREVIEW_HEIGHT * layout.canvas.width) / layout.canvas.height;
    return Math.max(1, Math.floor(Math.min(displayWidth(layout.canvas, available, "fit"), byHeight)));
  }, [layout, frameWidth]);
  const fitScale = layout && fitWidth ? fitWidth / layout.canvas.width : 1;
  const cssWidth = layout ? (zoom === "fit" ? fitWidth : displayWidth(layout.canvas, Math.max(1, frameWidth - 32), zoom)) : 0;
  const cssHeight = layout && cssWidth ? Math.max(1, Math.round((cssWidth * layout.canvas.height) / layout.canvas.width)) : 0;
  const sliding = layout?.mode === "slider" && !settings.flicker;
  const viewport = useViewportInteraction({
    scrollRef,
    contentRef: stageRef,
    zoom,
    setZoom,
    fitScale,
    allowDragPan: !sliding,
    allowTouchPan: !sliding,
    onEscape: () => setSelectedRegion(null),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !renderLayout || !fileA || !fileB || !cssWidth) return;
    const bitmapA = runtime.registry.preview(assetA);
    const bitmapB = runtime.registry.preview(assetB);
    const detailScale = Math.max(bitmapA ? bitmapA.width / fileA.width : 1, bitmapB ? bitmapB.width / fileB.width : 1);
    const size = backingSize({ width: cssWidth, height: cssHeight }, layout.canvas.width * detailScale);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: layout.mode === "difference" || layout.mode === "heatmap" });
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    // One renderer, one layout: the preview is the export at a smaller scale.
    const nextStats = drawCompare(
      ctx,
      renderLayout,
      { image: bitmapA ?? null, imageScale: bitmapA ? bitmapA.width / fileA.width : 1 },
      { image: bitmapB ?? null, imageScale: bitmapB ? bitmapB.width / fileB.width : 1 },
      size.width,
      size.height,
      { createCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }) },
    );
    setStats((current) => (current?.changedPixels === nextStats?.changedPixels && current?.totalPixels === nextStats?.totalPixels ? current : nextStats));
  }, [runtime, assetA, assetB, versionA, versionB, layout, renderLayout, fileA, fileB, cssWidth, cssHeight]);

  if (!fileA || !fileB || !layout) return null;
  function focusRegion(region: ChangedRegion) {
    setSelectedRegion(region.id);
    if (zoom === "fit") setZoom(1);
    requestAnimationFrame(() => {
      const frame = scrollRef.current;
      const stage = stageRef.current;
      if (!frame || !stage) return;
      const x = ((region.x + region.width / 2) / Math.max(1, stats?.width ?? 1)) * stage.offsetWidth;
      const y = ((region.y + region.height / 2) / Math.max(1, stats?.height ?? 1)) * stage.offsetHeight;
      frame.scrollTo({ left: Math.max(0, x - frame.clientWidth / 2), top: Math.max(0, y - frame.clientHeight / 2), behavior: reducedMotion ? "auto" : "smooth" });
    });
  }

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
          <span className="contents max-md:hidden">
            <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
              <Undo2 />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
              <Redo2 />
            </IconButton>
          </span>
        </Toolbar>
        <ViewportToolbar zoom={zoom} fitScale={fitScale} onFit={viewport.fit} onActual={viewport.actual} onZoomIn={viewport.zoomIn} onZoomOut={viewport.zoomOut} label="Compare view" />
      </div>

      <div
        ref={(element) => {
          frameRef(element);
          scrollRef.current = element;
        }}
        className={cn("min-h-[420px] overflow-auto rounded-lg border border-line bg-surface-2 p-4 max-md:min-h-[50dvh] max-md:p-2", (viewport.spaceHeld || viewport.isPanning) && "cursor-grab", viewport.isPanning && "cursor-grabbing")}
      >
        {cssWidth > 0 && (
          <div
            ref={stageRef}
            data-testid="compare-stage"
            data-canvas-width={layout.canvas.width}
            data-canvas-height={layout.canvas.height}
            data-mode={layout.mode}
            data-divider={divider}
            data-viewport-pan
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
            {(layout.mode === "difference" || layout.mode === "heatmap") && stats?.regions.map((region) => (
              <button
                key={region.id}
                type="button"
                aria-label={`Focus changed region ${region.id}`}
                title={`Region ${region.id}: ${region.pixels.toLocaleString()} changed pixels`}
                onClick={() => focusRegion(region)}
                className={cn("absolute z-10 border-2 outline-none focus-visible:ring-2 focus-visible:ring-accent", selectedRegion === region.id ? "border-white bg-accent/15" : "border-white/60 hover:border-white")}
                style={{
                  left: `${(region.x / Math.max(1, stats.width)) * 100}%`,
                  top: `${(region.y / Math.max(1, stats.height)) * 100}%`,
                  width: `${(region.width / Math.max(1, stats.width)) * 100}%`,
                  height: `${(region.height / Math.max(1, stats.height)) * 100}%`,
                }}
              />
            ))}
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
        {settings.flicker
          ? reducedMotion
            ? "Flicker is paused because reduced motion is enabled in your system settings."
            : `Flicker is playing ${flickerFrame.toUpperCase()} at ${settings.flickerSpeed} ms. This animation is preview-only.`
          : sliding
          ? "Drag the divider, or focus it and use ← →. Before is on the left, after on the right."
          : "The preview shows exactly what will be exported, at a smaller size."}
      </p>
      {(layout.mode === "difference" || layout.mode === "heatmap") && stats && (
        <div className="t-body-sm mt-2 rounded-md border border-line bg-surface-3 px-3 py-2 text-ink-2" data-testid="compare-difference-stats" aria-live="polite">
          <p>
            <strong className="text-ink">{stats.changedPercent.toFixed(1)}% changed</strong> · {stats.unchangedPercent.toFixed(1)}% unchanged · {stats.changedPixels.toLocaleString()} changed pixels · {stats.regions.length.toLocaleString()}{stats.regionsTruncated ? "+" : ""} changed regions.
          </p>
          <p className="mt-1 text-ink-3">Analysis resolution: {stats.width} × {stats.height} preview pixels. This is deterministic pixel difference, not semantic similarity.</p>
          {stats.regions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Changed regions">
              {stats.regions.slice(0, 12).map((region) => (
                <button key={region.id} type="button" onClick={() => focusRegion(region)} className={cn("min-h-9 rounded-sm border px-2 text-xs focus-visible:ring-2 focus-visible:ring-accent max-md:min-h-11", selectedRegion === region.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2")}>
                  Region {region.id} · {region.pixels.toLocaleString()} px · {region.percent.toFixed(2)}%
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
