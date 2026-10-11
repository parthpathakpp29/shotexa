"use client";

import { Eraser, Paintbrush, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Mono, Toolbar, ToolbarDivider } from "@/components/ui/primitives";
import { ViewportToolbar } from "@/components/ui/viewport";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { applyStroke, refineMask } from "@/core/background-removal/mask";
import type { BackgroundRemovalSettings, MaskBrushMode, MaskPoint, MaskStroke, RemovalPreviewMode } from "@/core/background-removal/types";
import type { ViewportZoom } from "@/core/viewport/viewport";
import { cn } from "@/lib/cn";
import { useElementWidth } from "@/lib/use-element-width";
import { useViewportInteraction } from "@/lib/use-viewport";

function checker(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = 16;
  ctx.fillStyle = "#f5f3ef"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e5e1da";
  for (let y = 0; y < height; y += size) for (let x = (y / size) % 2 ? size : 0; x < width; x += size * 2) ctx.fillRect(x, y, size, size);
}

function fillBackground(ctx: CanvasRenderingContext2D, settings: BackgroundRemovalSettings, bitmap: ImageBitmap, width: number, height: number, custom: ImageBitmap | null) {
  const bg = settings.background;
  if (bg.kind === "transparent") checker(ctx, width, height);
  else if (bg.kind === "solid") { ctx.fillStyle = bg.color; ctx.fillRect(0, 0, width, height); }
  else if (bg.kind === "gradient" || bg.kind === "derived") { const g = ctx.createLinearGradient(0, 0, width, height); g.addColorStop(0, bg.from); g.addColorStop(1, bg.to); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height); }
  else if (bg.kind === "blur-original") { ctx.save(); ctx.filter = `blur(${Math.max(1, bg.blur / 2)}px)`; ctx.drawImage(bitmap, -12, -12, width + 24, height + 24); ctx.restore(); }
  else if (custom) ctx.drawImage(custom, 0, 0, width, height);
  else { ctx.fillStyle = "#eeeae4"; ctx.fillRect(0, 0, width, height); }
}

export function BackgroundRemovalStage({ assetId, settings, mode, brushMode, brushSize, hardness, revision, customBackground, onBrushMode, onRevision }: {
  assetId: string; settings: BackgroundRemovalSettings; mode: RemovalPreviewMode; brushMode: MaskBrushMode; brushSize: number; hardness: number; revision: number; customBackground: ImageBitmap | null;
  onBrushMode(mode: MaskBrushMode): void; onRevision(): void;
}) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
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
  const fitWidth = file && frameWidth ? Math.max(1, Math.floor(Math.min(frameWidth - 32, 900, (620 * file.width) / file.height))) : 0;
  const fitScale = file && fitWidth ? fitWidth / file.width : 1;
  const cssWidth = file ? (zoom === "fit" ? fitWidth : Math.max(1, Math.round(file.width * zoom))) : 0;
  const cssHeight = file && cssWidth ? Math.max(1, Math.round(cssWidth * file.height / file.width)) : 0;
  const viewport = useViewportInteraction({ scrollRef, contentRef: stageRef, zoom, setZoom, fitScale, allowDragPan: true, allowTouchPan: false });

  const draw = useMemo(() => () => {
    const canvas = canvasRef.current, bitmap = runtime.registry.preview(assetId), current = runtime.backgroundMasks.get(assetId);
    if (!canvas || !bitmap || !file || !cssWidth) return;
    const width = Math.min(bitmap.width, Math.max(1, Math.round(cssWidth * Math.min(2, devicePixelRatio || 1))));
    const height = Math.max(1, Math.round(width * file.height / file.width));
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
    fillBackground(ctx, settings, bitmap, width, height, customBackground);
    const subject = document.createElement("canvas"); subject.width = width; subject.height = height;
    const sctx = subject.getContext("2d", { willReadFrequently: true })!; sctx.drawImage(bitmap, 0, 0, width, height); sctx.globalCompositeOperation = "destination-in";
    const maskCanvas = document.createElement("canvas"); maskCanvas.width = current.result.width; maskCanvas.height = current.result.height;
    const mctx = maskCanvas.getContext("2d")!; const image = mctx.createImageData(current.result.width, current.result.height);
    for (let i = 0; i < mask.length; i++) image.data.set([255, 255, 255, mask[i]], i * 4); mctx.putImageData(image, 0, 0); sctx.drawImage(maskCanvas, 0, 0, width, height); sctx.globalCompositeOperation = "source-over";
    const scale = settings.subject.scale, dw = width * scale, dh = height * scale, dx = (width - dw) / 2 + settings.subject.x * width / file.width, dy = (height - dh) / 2 + settings.subject.y * height / file.height;
    if (settings.subject.shadow && settings.background.kind !== "transparent") { ctx.save(); ctx.shadowColor = "rgba(15,23,42,.28)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 7; ctx.drawImage(subject, dx, dy, dw, dh); ctx.restore(); }
    ctx.drawImage(subject, dx, dy, dw, dh);
    if (mode === "split") { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width / 2, height); ctx.clip(); ctx.drawImage(bitmap, 0, 0, width, height); ctx.restore(); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(width / 2 - 1, 0, 2, height); }
    maskCanvas.width = maskCanvas.height = subject.width = subject.height = 0;
  }, [assetId, brushMode, brushSize, cssWidth, customBackground, file, hardness, mode, runtime, settings]);

  useEffect(() => { draw(); }, [draw, previewVersion, revision]);

  const queueDraw = () => { if (frame.current !== null) return; frame.current = requestAnimationFrame(() => { frame.current = null; draw(); }); };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  function point(event: React.PointerEvent): MaskPoint {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
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
        {file && cssWidth > 0 && <div ref={stageRef} data-viewport-pan data-viewport-edit={ready ? "mask" : undefined} tabIndex={0} aria-label={ready ? `${brushMode === "restore" ? "Restore" : "Erase"} mask brush canvas. Use Control Z and Control Shift Z for mask history.` : "Original image preview"} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={(event) => { if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return; event.preventDefault(); if (event.shiftKey) redo(); else undo(); }} className={cn("relative mx-auto overflow-hidden rounded-xs bg-checker shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent", ready && "touch-none cursor-crosshair")} style={{ width: cssWidth, height: cssHeight }}>
          <canvas ref={canvasRef} role="img" aria-label={`${mode} preview of ${file.name}`} data-testid="background-removal-canvas" className="block h-full w-full" />
        </div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="t-body-sm text-ink-2">One-finger drawing refines the mask. Hold Space or use the middle button to pan; pinch or the toolbar changes zoom.</p>{ready && <Mono className="text-[11px]" data-testid="background-removal-diagnostics" data-model-load-ms={entry?.result.modelLoadMs} data-inference-ms={entry?.result.inferenceMs} data-session-reused={entry?.result.sessionReused}>{entry?.result.provider.toUpperCase()} · U²-Net-P · {entry?.result.sessionReused ? "session cache" : "first load"}</Mono>}</div>
    </section>
  );
}
