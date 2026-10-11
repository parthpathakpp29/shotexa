"use client";

/**
 * The comparison preview. It draws the workspace's ≤ 4 MP preview bitmaps through the SAME
 * layout, the SAME alignment and the SAME difference engine as the export, at a display scale
 * — so the only difference between this canvas and the downloaded file is resolution.
 *
 * Costs are kept where they belong:
 *   - the pixel comparison re-runs only when something that changes it changes, never while
 *     the divider or the opacity slider moves (those re-run the cheap compositing path);
 *   - alignment is measured once per pair/fitting and cached in the registry;
 *   - OCR never runs here at all.
 *
 * The before/after divider is dragged here: the position lives in local state while the
 * pointer is down and is committed once on release, giving exactly one undo step.
 */
import { ChevronLeft, ChevronRight, Crosshair, Redo2, SquareDashed, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "@/components/ui/controls";
import { Badge, IconButton, Mono, Toolbar } from "@/components/ui/primitives";
import { ViewportToolbar } from "@/components/ui/viewport";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { alignmentSummary } from "@/core/compare/align";
import { applyTextChanges, regionLabel, sourceBoxToAnalysis } from "@/core/compare/analysis";
import { drawCompare } from "@/core/compare/draw";
import { compareLayout, dividerFromX } from "@/core/compare/layout";
import { COMPARE_MODES } from "@/core/compare/presets";
import type { CompareMode, CompareRegion, CompareTextChange, CompareVisualAnalysis } from "@/core/compare/types";
import { backingSize, displayWidth, type Zoom } from "@/lib/stage-size";
import { cn } from "@/lib/cn";
import { useReleasingCanvas } from "@/lib/use-canvas-ref";
import { useElementWidth } from "@/lib/use-element-width";
import { useViewportInteraction } from "@/lib/use-viewport";
import { useCompareResults } from "./use-compare";

const MAX_PREVIEW_HEIGHT = 560;
const ARROW_STEP = 1;
const SHIFT_STEP = 10;
/** A drawn ignore region must be at least this many canvas pixels on both sides. */
const MIN_IGNORE_PX = 6;

export interface CompareStageProps {
  assetA: string;
  assetB: string;
  selectedRegion: number | null;
  onSelectRegion(id: number | null): void;
  selectedTextChange: string | null;
  onSelectTextChange(id: string | null): void;
  drawIgnore: boolean;
  onDrawIgnore(on: boolean): void;
  onAnalysis(analysis: CompareVisualAnalysis | null): void;
}

export function CompareStage({ assetA, assetB, selectedRegion, onSelectRegion, selectedTextChange, onSelectTextChange, drawIgnore, onDrawIgnore, onAnalysis }: CompareStageProps) {
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
  const alignStatus = useWorkspace((s) => s.compareRun.align.status);
  const results = useCompareResults(fileA, fileB);
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attachCanvas = useReleasingCanvas(canvasRef);
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  /** The divider while the pointer is down; null when it is not being dragged. */
  const [draft, setDraft] = useState<number | null>(null);
  const [stats, setStats] = useState<CompareVisualAnalysis | null>(null);
  const [ignoreDraft, setIgnoreDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [flickerFrame, setFlickerFrame] = useState<"a" | "b">("a");
  const [reducedMotion, setReducedMotion] = useState(false);
  const latest = useRef(settings.divider);
  const latestIgnore = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const ignoreMove = useRef<((x: number, y: number) => void) | null>(null);
  const attemptedAlign = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const divider = draft ?? settings.divider;
  const layout = useMemo(
    () =>
      fileA && fileB
        ? compareLayout(
            { ...settings, divider },
            { size: { width: fileA.width, height: fileA.height }, name: fileA.name },
            { size: { width: fileB.width, height: fileB.height }, name: fileB.name },
            results.alignment,
          )
        : null,
    [settings, divider, fileA, fileB, results.alignment],
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

  // Measure the alignment once per pair, fitting and preview generation — never while a
  // control moves, and never twice for the same inputs even if the measurement failed.
  useEffect(() => {
    if (settings.alignment.mode === "off" || results.alignment) return;
    const attempt = `${results.pair}|${settings.fit}|${settings.align}|${settings.alignment.mode}|${versionA}|${versionB}`;
    if (attemptedAlign.current === attempt) return;
    attemptedAlign.current = attempt;
    void runtime.alignCompare().catch(() => undefined);
  }, [runtime, results.alignment, results.pair, settings.fit, settings.align, settings.alignment.mode, versionA, versionB]);

  const fitWidth = useMemo(() => {
    if (!layout || frameWidth <= 0) return 0;
    const available = Math.max(1, frameWidth - 32);
    const byHeight = (MAX_PREVIEW_HEIGHT * layout.canvas.width) / layout.canvas.height;
    return Math.max(1, Math.floor(Math.min(displayWidth(layout.canvas, available, "fit"), byHeight)));
  }, [layout, frameWidth]);
  const fitScale = layout && fitWidth ? fitWidth / layout.canvas.width : 1;
  const cssWidth = layout ? (zoom === "fit" ? fitWidth : displayWidth(layout.canvas, Math.max(1, frameWidth - 32), zoom)) : 0;
  const cssHeight = layout && cssWidth ? Math.max(1, Math.round((cssWidth * layout.canvas.height) / layout.canvas.width)) : 0;
  const sliding = layout?.mode === "slider" && !settings.flicker && !drawIgnore;
  const analysing = layout?.mode === "difference" || layout?.mode === "heatmap";
  const viewport = useViewportInteraction({
    scrollRef,
    contentRef: stageRef,
    zoom,
    setZoom,
    fitScale,
    allowDragPan: !sliding && !drawIgnore,
    allowTouchPan: !sliding && !drawIgnore,
    onEscape: () => {
      onSelectRegion(null);
      onSelectTextChange(null);
      if (drawIgnore) onDrawIgnore(false);
    },
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
    // Keep the same object when nothing measurable moved, so the panels below do not churn.
    setStats((current) => (sameAnalysis(current, nextStats) ? current : nextStats));
  }, [runtime, assetA, assetB, versionA, versionB, layout, renderLayout, fileA, fileB, cssWidth, cssHeight]);

  // Fold any OCR text diff into the region list, then publish for the summary and the report.
  const analysis = useMemo(() => {
    if (!stats || !layout) return stats;
    if (!results.textDiff?.changes.length) return stats;
    return applyTextChanges(stats, results.textDiff, { a: layout.a, b: layout.b });
  }, [stats, layout, results.textDiff]);

  useEffect(() => {
    onAnalysis(analysis);
    runtime.publishCompareAnalysis(analysis);
  }, [analysis, onAnalysis, runtime]);

  const regions = useMemo(() => analysis?.regions ?? [], [analysis]);
  const selectedIndex = regions.findIndex((region) => region.id === selectedRegion);

  const focusRegion = useCallback(
    (region: CompareRegion) => {
      onSelectRegion(region.id);
      if (zoom === "fit") setZoom(1);
      requestAnimationFrame(() => {
        const frame = scrollRef.current;
        const stage = stageRef.current;
        if (!frame || !stage) return;
        const x = ((region.x + region.width / 2) / Math.max(1, analysis?.width ?? 1)) * stage.offsetWidth;
        const y = ((region.y + region.height / 2) / Math.max(1, analysis?.height ?? 1)) * stage.offsetHeight;
        frame.scrollTo({ left: Math.max(0, x - frame.clientWidth / 2), top: Math.max(0, y - frame.clientHeight / 2), behavior: reducedMotion ? "auto" : "smooth" });
      });
    },
    [analysis?.height, analysis?.width, onSelectRegion, reducedMotion, zoom],
  );

  const step = useCallback(
    (delta: number) => {
      if (!regions.length) return;
      const current = selectedIndex >= 0 ? selectedIndex : delta > 0 ? -1 : 0;
      const next = (current + delta + regions.length) % regions.length;
      focusRegion(regions[next]);
    },
    [focusRegion, regions, selectedIndex],
  );

  // "[" and "]" walk the changes. Arrow keys stay with the slider; letters stay with typing.
  useEffect(() => {
    if (!analysing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === "]") {
        event.preventDefault();
        step(1);
      } else if (event.key === "[") {
        event.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [analysing, step]);

  if (!fileA || !fileB || !layout) return null;

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

  /** Stage CSS position to a point normalised against the shared comparison cell. */
  function cellPoint(clientX: number, clientY: number) {
    const box = stageRef.current!.getBoundingClientRect();
    const canvasX = ((clientX - box.left) / Math.max(1, box.width)) * layout!.canvas.width;
    const canvasY = ((clientY - box.top) / Math.max(1, box.height)) * layout!.canvas.height;
    return {
      x: Math.min(1, Math.max(0, (canvasX - layout!.cellA.x) / layout!.cell.width)),
      y: Math.min(1, Math.max(0, (canvasY - layout!.cellA.y) / layout!.cell.height)),
    };
  }

  function beginIgnore(event: React.PointerEvent<HTMLDivElement>) {
    const start = cellPoint(event.clientX, event.clientY);
    const update = (clientX: number, clientY: number) => {
      const now = cellPoint(clientX, clientY);
      const rect = {
        x: Math.min(start.x, now.x),
        y: Math.min(start.y, now.y),
        width: Math.abs(now.x - start.x),
        height: Math.abs(now.y - start.y),
      };
      latestIgnore.current = rect;
      setIgnoreDraft(rect);
    };
    update(event.clientX, event.clientY);
    return update;
  }

  function commitIgnore() {
    const rect = latestIgnore.current;
    latestIgnore.current = null;
    setIgnoreDraft(null);
    if (!rect) return;
    if (rect.width * layout!.cell.width < MIN_IGNORE_PX || rect.height * layout!.cell.height < MIN_IGNORE_PX) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ig${Date.now().toString(36)}`;
    setCompare({
      ...settings,
      ignoreRegions: [...settings.ignoreRegions, { id, name: "", enabled: true, ...rect }],
    });
    onDrawIgnore(false);
  }

  const ignoreRects = layout.ignoreRegions;
  const textBoxes = selectedTextChange && results.textDiff ? textChangeRects(results.textDiff.changes, selectedTextChange, layout) : [];
  const alignLine = results.alignment ? alignmentSummary(results.alignment) : settings.alignment.mode === "off" ? "Alignment off" : "Measuring alignment…";

  return (
    <section aria-label="Comparison preview" data-testid="compare-workspace">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl<CompareMode>
          label="Comparison view"
          size="sm"
          className="max-md:w-full max-md:grid-flow-row max-md:grid-cols-3"
          value={settings.mode}
          onChange={(mode) => setCompare({ ...settings, mode })}
          options={COMPARE_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Toolbar aria-label="View and history">
            <span className="contents max-md:hidden">
              <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
                <Undo2 />
              </IconButton>
              <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
                <Redo2 />
              </IconButton>
            </span>
            <IconButton label={drawIgnore ? "Stop drawing ignore regions" : "Draw an ignore region"} active={drawIgnore} onClick={() => onDrawIgnore(!drawIgnore)} data-testid="compare-ignore-draw">
              {drawIgnore ? <X /> : <SquareDashed />}
            </IconButton>
          </Toolbar>
          <ViewportToolbar zoom={zoom} fitScale={fitScale} onFit={viewport.fit} onActual={viewport.actual} onZoomIn={viewport.zoomIn} onZoomOut={viewport.zoomOut} label="Compare view" />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Mono className="text-[12px] text-ink-2" data-testid="compare-output-size">
          {layout.canvas.width} × {layout.canvas.height} px
        </Mono>
        {settings.alignment.mode !== "off" && (
          <span data-testid="compare-alignment-badge">
            <Badge tone={results.alignment?.status === "failed" ? "warning" : results.alignment ? "accent" : "neutral"} dot>
              {alignStatus === "running" ? "Measuring alignment…" : alignLine}
            </Badge>
          </span>
        )}
        {analysing && regions.length > 0 && (
          <div className="flex items-center gap-1" data-testid="compare-region-nav">
            <IconButton label="Previous change" onClick={() => step(-1)}>
              <ChevronLeft />
            </IconButton>
            <Mono className="min-w-24 text-center text-[12px]" aria-live="polite" data-testid="compare-region-position">
              {selectedIndex >= 0 ? `Change ${selectedIndex + 1} of ${regions.length}` : `${regions.length} change${regions.length === 1 ? "" : "s"}`}
            </Mono>
            <IconButton label="Next change" onClick={() => step(1)}>
              <ChevronRight />
            </IconButton>
          </div>
        )}
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
            data-align-status={results.alignment?.status ?? (settings.alignment.mode === "off" ? "off" : "pending")}
            data-viewport-pan
            className={cn("relative shrink-0 touch-none select-none rounded-xs shadow-sm", sliding && "cursor-ew-resize", drawIgnore && "cursor-crosshair")}
            style={{ width: cssWidth, height: cssHeight }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if (drawIgnore) {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const update = beginIgnore(e);
                ignoreMove.current = update;
                return;
              }
              if (!sliding) return;
              // Own the gesture: the page must not scroll while the divider is being dragged.
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              e.currentTarget.querySelector<HTMLButtonElement>('[data-testid="compare-divider"]')?.focus({ preventScroll: true });
              moveTo(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              if (drawIgnore) {
                ignoreMove.current?.(e.clientX, e.clientY);
                return;
              }
              if (!sliding) return;
              moveTo(e.clientX);
            }}
            onPointerUp={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              e.currentTarget.releasePointerCapture(e.pointerId);
              if (drawIgnore) {
                ignoreMove.current = null;
                commitIgnore();
                return;
              }
              if (sliding) commit();
            }}
            onPointerCancel={() => {
              if (drawIgnore) {
                ignoreMove.current = null;
                commitIgnore();
                return;
              }
              if (sliding) commit();
            }}
          >
            <canvas ref={attachCanvas} aria-label={`Comparison of ${fileA.name} and ${fileB.name}`} role="img" data-testid="compare-canvas" className="block h-full w-full rounded-xs" />

            {/* Areas deliberately excluded from the comparison. */}
            {ignoreRects.map((rect, index) => (
                <span
                  key={index}
                  aria-hidden
                  data-testid="compare-ignore-overlay"
                  className="pointer-events-none absolute border-2 border-dashed border-[#92b4ff] bg-[#92b4ff]/10"
                  style={{
                    left: `${(rect.x / layout.canvas.width) * 100}%`,
                    top: `${(rect.y / layout.canvas.height) * 100}%`,
                    width: `${(rect.width / layout.canvas.width) * 100}%`,
                    height: `${(rect.height / layout.canvas.height) * 100}%`,
                  }}
                />
              ))}
            {ignoreDraft && (
              <span
                aria-hidden
                className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/15"
                style={{
                  left: `${((layout.cellA.x + ignoreDraft.x * layout.cell.width) / layout.canvas.width) * 100}%`,
                  top: `${((layout.cellA.y + ignoreDraft.y * layout.cell.height) / layout.canvas.height) * 100}%`,
                  width: `${((ignoreDraft.width * layout.cell.width) / layout.canvas.width) * 100}%`,
                  height: `${((ignoreDraft.height * layout.cell.height) / layout.canvas.height) * 100}%`,
                }}
              />
            )}

            {/* The OCR text change currently being inspected, on both sides. */}
            {textBoxes.map((box, index) => (
              <span
                key={index}
                aria-hidden
                data-testid="compare-text-highlight"
                className="pointer-events-none absolute rounded-xs border-2 border-[#ffd166] bg-[#ffd166]/20"
                style={{
                  left: `${(box.x / layout.canvas.width) * 100}%`,
                  top: `${(box.y / layout.canvas.height) * 100}%`,
                  width: `${(box.width / layout.canvas.width) * 100}%`,
                  height: `${(box.height / layout.canvas.height) * 100}%`,
                }}
              />
            ))}

            {analysing &&
              !drawIgnore &&
              regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  aria-label={`Focus changed region ${region.id}: ${regionLabel(region, analysis?.analysisScale ?? 1)}`}
                  aria-pressed={selectedRegion === region.id}
                  title={`${regionLabel(region, analysis?.analysisScale ?? 1)} — ${region.pixels.toLocaleString()} changed pixels`}
                  data-testid="compare-region-overlay"
                  data-kind={region.kind}
                  onClick={() => focusRegion(region)}
                  className={cn(
                    "absolute z-10 border-2 outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    selectedRegion === region.id ? "border-white bg-accent/15 ring-2 ring-accent" : "border-white/60 hover:border-white",
                  )}
                  style={{
                    left: `${(region.x / Math.max(1, analysis?.width ?? 1)) * 100}%`,
                    top: `${(region.y / Math.max(1, analysis?.height ?? 1)) * 100}%`,
                    width: `${(region.width / Math.max(1, analysis?.width ?? 1)) * 100}%`,
                    height: `${(region.height / Math.max(1, analysis?.height ?? 1)) * 100}%`,
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
                  const step2 = e.shiftKey ? SHIFT_STEP : ARROW_STEP;
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const next = Math.min(100, Math.max(0, settings.divider + (e.key === "ArrowLeft" ? -step2 : step2)));
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
        {drawIgnore
          ? "Drag on the comparison to mark an area that should be left out — a clock, a banner, an avatar. Press Escape to stop."
          : settings.flicker
          ? reducedMotion
            ? "Flicker is paused because reduced motion is enabled in your system settings."
            : `Flicker is playing ${flickerFrame.toUpperCase()} at ${settings.flickerSpeed} ms. This animation is preview-only.`
          : sliding
          ? "Drag the divider, or focus it and use ← →. Before is on the left, after on the right."
          : analysing
          ? "Select a changed region, or walk them with the arrows ( [ and ] ). The preview shows exactly what will be exported."
          : "The preview shows exactly what will be exported, at a smaller size."}
      </p>

      {analysing && analysis && (
        <div className="t-body-sm mt-2 rounded-md border border-line bg-surface-3 px-3 py-2 text-ink-2" data-testid="compare-difference-stats" aria-live="polite">
          <p>
            <strong className="text-ink">{analysis.changedPercent.toFixed(1)}% changed</strong> · {analysis.unchangedPercent.toFixed(1)}% unchanged · {analysis.changedPixels.toLocaleString()} changed pixels · {analysis.regions.length.toLocaleString()}
            {analysis.regionsTruncated ? "+" : ""} changed region{analysis.regions.length === 1 && !analysis.regionsTruncated ? "" : "s"}.
          </p>
          <p className="mt-1 text-ink-3">
            Analysis resolution: {analysis.width} × {analysis.height} preview pixels, {analysis.metric === "perceptual" ? "perceptual (CIE76 ΔE*ab)" : "pixel"} metric.
            {analysis.ignoredPixels > 0 ? ` ${analysis.ignoredPixels.toLocaleString()} pixels were left out by ignore regions.` : ""} This is a deterministic measurement, not semantic similarity.
          </p>
          {layout.mode === "heatmap" && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-3" data-testid="compare-heatmap-legend">
              <span>Heatmap scale:</span>
              <span aria-hidden className="inline-block h-2 w-28 rounded-full" style={{ backgroundImage: "linear-gradient(90deg, rgb(0,90,255), rgb(0,255,215), rgb(255,255,0), rgb(255,0,0))" }} />
              <span>cool = smaller measured change, hot = larger. The same scale is drawn into the exported image.</span>
            </p>
          )}
          {regions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Changed regions">
              {regions.slice(0, 12).map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => focusRegion(region)}
                  className={cn(
                    "min-h-9 rounded-sm border px-2 text-xs focus-visible:ring-2 focus-visible:ring-accent max-md:min-h-11",
                    selectedRegion === region.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2",
                  )}
                >
                  Region {region.id} · {regionLabel(region, analysis.analysisScale)} · {region.pixels.toLocaleString()} px · {region.percent.toFixed(2)}%
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {analysing && !analysis && (
        <p className="t-body-sm mt-2 flex items-center gap-2 text-ink-3">
          <Crosshair aria-hidden className="size-4" /> Measuring the difference…
        </p>
      )}
    </section>
  );
}

/** Did anything measurable actually change? Flicker redraws must not churn the panels. */
function sameAnalysis(a: CompareVisualAnalysis | null, b: CompareVisualAnalysis | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.changedPixels === b.changedPixels &&
    a.comparedPixels === b.comparedPixels &&
    a.totalPixels === b.totalPixels &&
    a.ignoredPixels === b.ignoredPixels &&
    a.width === b.width &&
    a.height === b.height &&
    a.metric === b.metric &&
    a.regions.length === b.regions.length &&
    a.regions.every((region, index) => region.id === b.regions[index].id && region.x === b.regions[index].x && region.y === b.regions[index].y && region.pixels === b.regions[index].pixels && region.kind === b.regions[index].kind)
  );
}

/** Canvas-pixel rectangles for one text change, on both sides. */
function textChangeRects(changes: CompareTextChange[], id: string, layout: ReturnType<typeof compareLayout>) {
  const change = changes.find((item) => item.id === id);
  if (!change) return [];
  return [
    ...change.regionsA.map((box) => sourceBoxToAnalysis(box, layout.a, 1)),
    ...change.regionsB.map((box) => sourceBoxToAnalysis(box, layout.b, 1)),
  ].filter((rect): rect is { x: number; y: number; width: number; height: number } => !!rect);
}
