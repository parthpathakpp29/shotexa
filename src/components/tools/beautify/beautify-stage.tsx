"use client";

/**
 * The composition preview. It draws the workspace's ≤ 4 MP preview bitmap through the SAME
 * layout and the SAME renderer as the export, at a display scale — so the only difference
 * between this canvas and the downloaded file is resolution.
 */
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { IconButton, Mono, Toolbar } from "@/components/ui/primitives";
import { ViewportToolbar } from "@/components/ui/viewport";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { drawBeautified } from "@/core/beautify/draw";
import { beautifyLayout } from "@/core/beautify/layout";
import { DEFAULT_BEAUTIFY } from "@/core/beautify/presets";
import { watermarkGeometry } from "@/core/beautify/watermark";
import type { WatermarkLayer } from "@/core/beautify/types";
import type { ViewportZoom } from "@/core/viewport/viewport";
import { cn } from "@/lib/cn";
import { backingSize } from "@/lib/stage-size";
import { useReleasingCanvas } from "@/lib/use-canvas-ref";
import { useElementWidth } from "@/lib/use-element-width";
import { useViewportInteraction } from "@/lib/use-viewport";

const MAX_PREVIEW_HEIGHT = 560;

export function BeautifyStage({ assetId, selectedWatermark = null, onSelectWatermark = () => undefined }: { assetId: string; selectedWatermark?: string | null; onSelectWatermark?(id: string | null): void }) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
  const version = useWorkspace((s) => s.files[assetId]?.previewVersion ?? 0);
  const files = useWorkspace((s) => s.files);
  const settings = useWorkspace((s) => s.beautify.byAsset[assetId]) ?? DEFAULT_BEAUTIFY;
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const setBeautify = useWorkspace((s) => s.setBeautify);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);
  const [zoom, setZoom] = useState<ViewportZoom>("fit");
  const [alignmentGuide, setAlignmentGuide] = useState<"x" | "y" | null>(null);
  const [watermarkBoxes, setWatermarkBoxes] = useState<Record<string, { width: number; height: number }>>({});
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attachCanvas = useReleasingCanvas(canvasRef);
  const drag = useRef<{ id: string; mode: "move" | "resize" | "rotate"; x: number; y: number; layer: WatermarkLayer } | null>(null);

  const source = useMemo(() => (file ? { width: file.width, height: file.height } : null), [file]);
  const layout = useMemo(() => (source ? beautifyLayout(settings, source) : null), [settings, source]);
  const resources = useMemo(() => {
    const ids = [...settings.composition.assetIds, settings.branding.assetId, settings.background.assetId, ...(settings.watermarks ?? []).map((layer) => layer.assetId)].filter((id): id is string => !!id && id !== assetId);
    return [...new Set(ids)].flatMap((id) => {
      const resource = files[id];
      const image = runtime.registry.preview(id);
      return resource && image ? [{ id, image, imageScale: image.width / resource.width, source: { width: resource.width, height: resource.height } }] : [];
    });
  }, [assetId, files, runtime, settings.background.assetId, settings.branding.assetId, settings.composition.assetIds, settings.watermarks]);

  // Fit the composition into the frame: never wider than the frame, never taller than the stage.
  const fitWidth = useMemo(() => {
    if (!layout || frameWidth <= 0) return 0;
    const available = Math.max(1, frameWidth - 32);
    const byHeight = (MAX_PREVIEW_HEIGHT * layout.canvas.width) / layout.canvas.height;
    return Math.max(1, Math.floor(Math.min(available, byHeight)));
  }, [layout, frameWidth]);
  const fitScale = layout && fitWidth ? fitWidth / layout.canvas.width : 1;
  const cssWidth = layout ? (zoom === "fit" ? fitWidth : Math.max(1, Math.round(layout.canvas.width * zoom))) : 0;
  const cssHeight = layout && cssWidth ? Math.max(1, Math.round((cssWidth * layout.canvas.height) / layout.canvas.width)) : 0;
  const viewport = useViewportInteraction({ scrollRef, contentRef: stageRef, zoom, setZoom, fitScale, allowDragPan: true, allowTouchPan: true });
  const motionStyle = {
    animationDuration: `${settings.animation.duration}ms`,
    animationTimingFunction: settings.animation.easing,
    animationIterationCount: settings.animation.loop ? "infinite" : "1",
    animationDirection: settings.animation.loop ? "alternate" : "normal",
    animationFillMode: "both",
    ["--beautify-motion" as string]: String(settings.animation.intensity / 100),
    ["--beautify-motion-x" as string]: settings.animation.direction === "left" ? "-1" : settings.animation.direction === "right" ? "1" : "0",
    ["--beautify-motion-y" as string]: settings.animation.direction === "up" ? "-1" : settings.animation.direction === "down" ? "1" : "0",
  } as CSSProperties;

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const layer = (settings.watermarks ?? []).find((item) => item.id === selectedWatermark);
    if (layer) {
      const step = event.shiftKey ? 2 : 0.25;
      const x = Math.max(0, Math.min(100, layer.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0)));
      const y = Math.max(0, Math.min(100, layer.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)));
      setBeautify(assetId, { ...settings, watermarks: (settings.watermarks ?? []).map((item) => item.id === layer.id ? { ...item, x, y } : item) }, { coalesce: `watermark-nudge-${layer.id}` });
      if (Math.abs(x - 50) < 0.5 || Math.abs(y - 50) < 0.5) window.dispatchEvent(new CustomEvent("shotexa:beautify-guide", { detail: Math.abs(x - 50) < 0.5 ? "x" : "y" }));
      return;
    }
    const step = event.shiftKey ? 0.05 : 0.01;
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -step : step;
    setBeautify(assetId, { ...settings, [horizontal ? "offsetX" : "offsetY"]: Math.max(-1, Math.min(1, settings[horizontal ? "offsetX" : "offsetY"] + delta)) }, { coalesce: horizontal ? "offset-x" : "offset-y" });
    window.dispatchEvent(new CustomEvent("shotexa:beautify-guide", { detail: horizontal ? "x" : "y" }));
  };

  function beginMark(event: ReactPointerEvent<HTMLDivElement>, layer: WatermarkLayer, mode: "move" | "resize" | "rotate") {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectWatermark(layer.id);
    drag.current = { id: layer.id, mode, x: event.clientX, y: event.clientY, layer };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveMark(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || !layout || !cssWidth) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    let patch: Partial<WatermarkLayer>;
    if (active.mode === "move") {
      const rawX = Math.max(0, Math.min(100, active.layer.x + dx / cssWidth * 100));
      const rawY = Math.max(0, Math.min(100, active.layer.y + dy / cssHeight * 100));
      const nearX = Math.abs(rawX - 50) < 1;
      const nearY = Math.abs(rawY - 50) < 1;
      patch = { x: nearX ? 50 : rawX, y: nearY ? 50 : rawY };
      setAlignmentGuide(nearX ? "x" : nearY ? "y" : null);
    }
    else if (active.mode === "resize") patch = { size: Math.max(2, Math.min(80, active.layer.size + dx / cssWidth * 100)) };
    else {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + active.layer.x / 100 * cssWidth;
      const cy = rect.top + active.layer.y / 100 * cssHeight;
      patch = { rotation: Math.round(Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI + 90) };
    }
    setBeautify(assetId, { ...settings, watermarks: (settings.watermarks ?? []).map((item) => item.id === active.id ? { ...item, ...patch } : item) }, { coalesce: `watermark-drag-${active.id}` });
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = (event: Event) => {
      setAlignmentGuide((event as CustomEvent<"x" | "y">).detail);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAlignmentGuide(null), 900);
    };
    window.addEventListener("shotexa:beautify-guide", show);
    return () => {
      window.removeEventListener("shotexa:beautify-guide", show);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const bitmap = runtime.registry.preview(assetId);
    if (!canvas || !layout || !source || !cssWidth) return;
    // Perspective's piecewise canvas projection needs more samples than its CSS display size:
    // a bounded 2× backing removes the low-resolution triangle seams seen on laptop screens.
    const multiplier = layout.perspective.active ? 2 : 1;
    const size = backingSize({ width: cssWidth * multiplier, height: cssHeight * multiplier }, layout.perspective.active ? Math.min(layout.canvas.width, 1600) : Infinity);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    // One renderer, one layout: the preview is the export at a smaller scale.
    drawBeautified(ctx, layout, bitmap ?? null, bitmap ? bitmap.width / source.width : 1, size.width / layout.canvas.width, 0, resources);
    setWatermarkBoxes(Object.fromEntries((settings.watermarks ?? []).map((layer) => {
      const box = watermarkGeometry(ctx, layout, layer, resources.find((item) => item.id === layer.assetId));
      return [layer.id, { width: box.width, height: box.height }];
    })));
  }, [runtime, assetId, version, layout, source, cssWidth, cssHeight, resources, settings.watermarks]);

  if (!file || !layout) return null;

  return (
    <section aria-label="Composition preview" data-testid="beautify-workspace">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Mono className="text-[12px] text-ink-2" data-testid="beautify-output-size">
          {layout.canvas.width} × {layout.canvas.height} px
        </Mono>
        <Toolbar aria-label="History" className="max-md:hidden">
          <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
            <Undo2 />
          </IconButton>
          <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
            <Redo2 />
          </IconButton>
        </Toolbar>
        <ViewportToolbar zoom={zoom} fitScale={fitScale} onFit={viewport.fit} onActual={viewport.actual} onZoomIn={viewport.zoomIn} onZoomOut={viewport.zoomOut} label="Beautifier view" />
      </div>
      <div ref={(element) => { frameRef(element); scrollRef.current = element; }} className={cn("min-h-[420px] overflow-auto rounded-lg border border-line bg-surface-2 p-4 max-md:min-h-[50dvh] max-md:p-2", (viewport.spaceHeld || viewport.isPanning) && "cursor-grab", viewport.isPanning && "cursor-grabbing")}>
        {cssWidth > 0 && (
          <div
            ref={stageRef}
            data-viewport-pan
            data-testid="beautify-stage"
            data-canvas-width={layout.canvas.width}
            data-canvas-height={layout.canvas.height}
            data-content-width={layout.content.width}
            data-content-height={layout.content.height}
            data-mode={settings.mode}
            tabIndex={0}
            aria-label="Beautifier canvas. Select a watermark to drag or nudge with arrow keys; hold Shift for larger steps."
            onKeyDown={nudge}
            className="bg-checker relative mx-auto rounded-xs shadow-sm"
            style={{ width: cssWidth, height: cssHeight }}
          >
            <canvas ref={attachCanvas} aria-label={`Preview of ${file.name}`} role="img" data-testid="beautify-canvas" data-animation={settings.animation.preset} className="beautify-motion block h-full w-full rounded-xs" style={motionStyle} />
            {(settings.watermarks ?? []).map((layer) => {
              const box = watermarkBoxes[layer.id];
              if (!box || (layer.kind === "image" && !resources.some((item) => item.id === layer.assetId))) return null;
              const chosen = selectedWatermark === layer.id;
              return <div key={layer.id} data-viewport-edit data-testid={`watermark-handle-${layer.id}`} role="button" tabIndex={0} aria-label={`${layer.kind === "text" ? layer.text : "Logo"} watermark. Drag to position; arrow keys to nudge.`} aria-pressed={chosen}
                onFocus={() => onSelectWatermark(layer.id)} onKeyDown={(event) => { if (event.key.startsWith("Arrow")) nudge(event); }}
                onPointerDown={(event) => beginMark(event, layer, "move")} onPointerMove={moveMark} onPointerUp={() => { drag.current = null; setAlignmentGuide(null); }} onPointerCancel={() => { drag.current = null; setAlignmentGuide(null); }}
                className={`absolute cursor-move touch-none rounded-sm border-2 ${chosen ? "border-accent shadow-[0_0_0_1px_white]" : "border-transparent hover:border-white/80"}`}
                style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: Math.max(24, box.width * cssWidth / layout.canvas.width), height: Math.max(24, box.height * cssHeight / layout.canvas.height), transform: `translate(-50%,-50%) rotate(${layer.rotation}deg)` }}>
                {chosen && <><span aria-hidden className="pointer-events-none absolute inset-0 border border-white/70" /><span aria-hidden className="absolute -left-2 -top-2 size-3 rounded-full border border-white bg-accent" /><span aria-hidden className="absolute -right-2 -top-2 size-3 rounded-full border border-white bg-accent" /><span aria-hidden className="absolute -bottom-2 -left-2 size-3 rounded-full border border-white bg-accent" /><span data-viewport-edit aria-label="Resize watermark" role="button" className="absolute -bottom-3 -right-3 size-6 cursor-nwse-resize rounded-full border-2 border-white bg-accent" onPointerDown={(event) => { event.stopPropagation(); beginMark(event as ReactPointerEvent<HTMLDivElement>, layer, "resize"); }} /><span data-viewport-edit aria-label="Rotate watermark" role="button" className="absolute -top-8 left-1/2 size-6 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-accent" onPointerDown={(event) => { event.stopPropagation(); beginMark(event as ReactPointerEvent<HTMLDivElement>, layer, "rotate"); }} /></>}
              </div>;
            })}
            {alignmentGuide === "x" && <span aria-hidden data-testid="beautify-guide-x" className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-accent shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" />}
            {alignmentGuide === "y" && <span aria-hidden data-testid="beautify-guide-y" className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-accent shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" />}
          </div>
        )}
      </div>
      <p className="t-body-sm mt-3 text-ink-2" data-testid="beautify-hint">
        The preview shows exactly what will be exported, at a smaller size. Your screenshot is drawn at its full resolution in the saved file.
      </p>
    </section>
  );
}
