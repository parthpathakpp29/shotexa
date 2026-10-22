"use client";

import { Eraser, Paintbrush, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Mono, Toolbar, ToolbarDivider } from "@/components/ui/primitives";
import { ViewportToolbar } from "@/components/ui/viewport";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { paintRemovedBackground, removalOutputPlan } from "@/core/background-removal/render";
import { applyStroke, refineMask } from "@/core/background-removal/mask";
import type { BackgroundRemovalSettings, MaskBrushMode, MaskPoint, MaskStroke, RemovalPreviewMode } from "@/core/background-removal/types";
import type { ViewportZoom } from "@/core/viewport/viewport";
import { cn } from "@/lib/cn";
import { useElementWidth } from "@/lib/use-element-width";
import { useViewportInteraction } from "@/lib/use-viewport";

export function BackgroundRemovalStage({ assetId, settings, mode, brushMode, brushSize, hardness, revision, customBackground, previewSurface, onBrushMode, onRevision }: {
  assetId: string; settings: BackgroundRemovalSettings; mode: RemovalPreviewMode; brushMode: MaskBrushMode; brushSize: number; hardness: number; revision: number; customBackground: ImageBitmap | null; previewSurface: "checkerboard" | "white" | "dark" | "transparent";
  onBrushMode(mode: MaskBrushMode): void; onRevision(): void;
}) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
  const format = useWorkspace((s) => s.exportSettings.format);
  const previewVersion = useWorkspace((s) => s.files[assetId]?.previewVersion ?? 0);
  const [zoom, setZoom] = useState<ViewportZoom>("fit");
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ id: number; points: MaskPoint[] } | null>(null);
  const frame = useRef<number | null>(null);
  const entry = runtime.backgroundMasks.get(assetId);
  const ready = !!entry;
  const visibleSettings = useMemo(() => mode === "original" || mode === "mask" || mode === "split" ? { ...settings, trim: false } : settings, [mode, settings]);
  const plan = useMemo(() => {
    // The registry is external state; revision changes when a mask or stroke changes.
    void revision;
    const current = runtime.backgroundMasks.get(assetId);
    const materialized = current ? runtime.backgroundMasks.materialize(assetId)! : null;
    return file && current && materialized ? removalOutputPlan(refineMask(materialized, current.result.width, current.result.height, visibleSettings.edge), current.result.width, current.result.height, file, visibleSettings) : { width: file?.width ?? 1, height: file?.height ?? 1, drawX: 0, drawY: 0 };
  }, [runtime, assetId, file, visibleSettings, revision]);
  const fitWidth = file && frameWidth ? Math.max(1, Math.floor(Math.min(frameWidth - 32, 900, (620 * plan.width) / plan.height))) : 0;
  const fitScale = file && fitWidth ? fitWidth / plan.width : 1;
  const cssWidth = file ? (zoom === "fit" ? fitWidth : Math.max(1, Math.round(plan.width * zoom))) : 0;
  const cssHeight = file && cssWidth ? Math.max(1, Math.round(cssWidth * plan.height / plan.width)) : 0;
  const viewport = useViewportInteraction({ scrollRef, contentRef: stageRef, zoom, setZoom, fitScale, allowDragPan: true, allowTouchPan: false });

  const draw = useMemo(() => () => {
    const canvas = canvasRef.current, bitmap = runtime.registry.preview(assetId), current = runtime.backgroundMasks.get(assetId);
    if (!canvas || !bitmap || !file || !cssWidth) return;
    const width = Math.min(bitmap.width, Math.max(1, Math.round(cssWidth * Math.min(2, devicePixelRatio || 1))));
    const height = Math.max(1, Math.round(width * plan.height / plan.width));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
    ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    if (!current || mode === "original") { ctx.drawImage(bitmap, 0, 0, width, height); return; }
    const materialized = runtime.backgroundMasks.materialize(assetId)!;
    if (active.current?.points.length) applyStroke(materialized, current.result.width, current.result.height, { id: "preview", mode: brushMode, size: brushSize, hardness, points: active.current.points });
    const mask = refineMask(materialized, current.result.width, current.result.height, settings.edge);
    if (mode === "mask") {
      const image = ctx.createImageData(current.result.width, current.result.height);
      for (let i = 0; i < mask.length; i++) image.data.set([mask[i], mask[i], mask[i], 255], i * 4);
      const temp = document.createElement("canvas"); temp.width = current.result.width; temp.height = current.result.height; temp.getContext("2d")?.putImageData(image, 0, 0); ctx.drawImage(temp, 0, 0, width, height); temp.width = temp.height = 0; return;
    }
    const painted = paintRemovedBackground(bitmap, { source: file, mask: { data: materialized, width: current.result.width, height: current.result.height, matte: current.result.matte }, settings: visibleSettings, format: settings.background.kind === "transparent" ? "png" : format, createCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }) }, customBackground, width / plan.width);
    ctx.drawImage(painted.canvas, 0, 0, width, height);
    painted.canvas.width = painted.canvas.height = 0;
    if (mode === "split") { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width / 2, height); ctx.clip(); ctx.drawImage(bitmap, 0, 0, width, height); ctx.restore(); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(width / 2 - 1, 0, 2, height); }

  }, [assetId, brushMode, brushSize, cssWidth, customBackground, file, format, hardness, mode, runtime, settings, plan.width, plan.height, visibleSettings]);

  useEffect(() => { draw(); }, [draw, previewVersion, revision]);

  const queueDraw = () => { if (frame.current !== null) return; frame.current = requestAnimationFrame(() => { frame.current = null; draw(); }); };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  function point(event: React.PointerEvent): MaskPoint {
    const box = stageRef.current!.getBoundingClientRect();
    if (mode === "original" || mode === "mask") return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
    const scale = settings.subject.scale;
    const dx = plan.drawX, dy = plan.drawY;
    return { x: Math.max(0, Math.min(1, ((event.clientX - box.left) / box.width * plan.width - dx) / (file!.width * scale))), y: Math.max(0, Math.min(1, ((event.clientY - box.top) / box.height * plan.height - dy) / (file!.height * scale))) };
  }
  function start(event: React.PointerEvent<HTMLDivElement>) {
    if (!ready || event.button !== 0 || event.pointerType === "touch" && !event.isPrimary) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); active.current = { id: event.pointerId, points: [point(event)] };
  }
  function move(event: React.PointerEvent<HTMLDivElement>) { const stroke = active.current; if (!stroke || stroke.id !== event.pointerId) return; stroke.points.push(point(event)); queueDraw(); }
  function finish(event: React.PointerEvent<HTMLDivElement>) {
    const value = active.current; if (!value || value.id !== event.pointerId) return; active.current = null;
    const stroke: MaskStroke = { id: crypto.randomUUID(), mode: brushMode, size: brushSize, hardness, points: value.points };
    runtime.backgroundMasks.commit(assetId, stroke); onRevision();
  }
  function undo() { if (runtime.backgroundMasks.undo(assetId)) onRevision(); }
  function redo() { if (runtime.backgroundMasks.redo(assetId)) onRevision(); }

  return (
    <section aria-label="Background removal preview" data-testid="background-removal-workspace">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Toolbar aria-label="Mask refinement">
          <IconButton label="Restore foreground" active={brushMode === "restore"} disabled={!ready} onClick={() => onBrushMode("restore")}><Paintbrush /></IconButton>
          <IconButton label="Erase foreground" active={brushMode === "erase"} disabled={!ready} onClick={() => onBrushMode("erase")}><Eraser /></IconButton>
          <ToolbarDivider />
          <IconButton label="Undo mask stroke" disabled={!runtime.backgroundMasks.canUndo(assetId)} onClick={undo}><Undo2 /></IconButton>
          <IconButton label="Redo mask stroke" disabled={!runtime.backgroundMasks.canRedo(assetId)} onClick={redo}><Redo2 /></IconButton>
        </Toolbar>
        <ViewportToolbar zoom={zoom} fitScale={fitScale} onFit={viewport.fit} onActual={viewport.actual} onZoomIn={viewport.zoomIn} onZoomOut={viewport.zoomOut} label="Removal view" />
      </div>
      <div ref={(element) => { frameRef(element); scrollRef.current = element; }} className={cn("min-h-[440px] overflow-auto rounded-lg border border-line bg-surface-2 p-4 max-md:min-h-[52dvh] max-md:p-2", viewport.spaceHeld && "cursor-grab", viewport.isPanning && "cursor-grabbing")}>
        {file && cssWidth > 0 && <div ref={stageRef} data-viewport-pan data-viewport-edit={ready ? "mask" : undefined} tabIndex={0} aria-label={ready ? `${brushMode === "restore" ? "Restore" : "Erase"} mask brush canvas. Use Control Z and Control Shift Z for mask history.` : "Original image preview"} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={(event) => { if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return; event.preventDefault(); if (event.shiftKey) redo(); else undo(); }} className={cn("relative mx-auto overflow-hidden rounded-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent", previewSurface === "checkerboard" && "bg-checker", ready && "touch-none cursor-crosshair")} style={{ width: cssWidth, height: cssHeight, backgroundColor: previewSurface === "white" ? "#fff" : previewSurface === "dark" ? "#18202c" : "transparent" }}>
          <canvas ref={canvasRef} role="img" aria-label={`${mode} preview of ${file.name}`} data-testid="background-removal-canvas" className="block h-full w-full" />
        </div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="t-body-sm text-ink-2">One-finger drawing refines the mask. Hold Space or use the middle button to pan; pinch or the toolbar changes zoom.</p>{ready && <Mono className="text-[11px]" data-testid="background-removal-diagnostics" data-model-load-ms={entry?.result.modelLoadMs} data-inference-ms={entry?.result.inferenceMs} data-session-reused={entry?.result.sessionReused}>{entry?.result.provider.toUpperCase()} · {entry?.result.model === "single-ink" ? "Single ink" : "U²-Net-P"} · {entry?.result.sessionReused ? "session cache" : "first load"}</Mono>}</div>
    </section>
  );
}
