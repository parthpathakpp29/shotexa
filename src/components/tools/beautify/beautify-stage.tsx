"use client";

/**
 * The composition preview. It draws the workspace's ≤ 4 MP preview bitmap through the SAME
 * layout and the SAME renderer as the export, at a display scale — so the only difference
 * between this canvas and the downloaded file is resolution.
 */
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Mono, Toolbar } from "@/components/ui/primitives";
import { ViewportToolbar } from "@/components/ui/viewport";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { drawBeautified } from "@/core/beautify/draw";
import { beautifyLayout } from "@/core/beautify/layout";
import { DEFAULT_BEAUTIFY } from "@/core/beautify/presets";
import type { ViewportZoom } from "@/core/viewport/viewport";
import { cn } from "@/lib/cn";
import { backingSize } from "@/lib/stage-size";
import { useReleasingCanvas } from "@/lib/use-canvas-ref";
import { useElementWidth } from "@/lib/use-element-width";
import { useViewportInteraction } from "@/lib/use-viewport";

const MAX_PREVIEW_HEIGHT = 560;

export function BeautifyStage({ assetId }: { assetId: string }) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
  const version = useWorkspace((s) => s.files[assetId]?.previewVersion ?? 0);
  const settings = useWorkspace((s) => s.beautify.byAsset[assetId]) ?? DEFAULT_BEAUTIFY;
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);
  const [zoom, setZoom] = useState<ViewportZoom>("fit");
  const [alignmentGuide, setAlignmentGuide] = useState<"x" | "y" | null>(null);
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attachCanvas = useReleasingCanvas(canvasRef);

  const source = useMemo(() => (file ? { width: file.width, height: file.height } : null), [file]);
  const layout = useMemo(() => (source ? beautifyLayout(settings, source) : null), [settings, source]);

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
    const size = backingSize({ width: cssWidth, height: cssHeight }, Infinity);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    // One renderer, one layout: the preview is the export at a smaller scale.
    drawBeautified(ctx, layout, bitmap ?? null, bitmap ? bitmap.width / source.width : 1, size.width / layout.canvas.width);
  }, [runtime, assetId, version, layout, source, cssWidth, cssHeight]);

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
            className="bg-checker relative mx-auto rounded-xs shadow-sm"
            style={{ width: cssWidth, height: cssHeight }}
          >
            <canvas ref={attachCanvas} aria-label={`Preview of ${file.name}`} role="img" data-testid="beautify-canvas" className="block h-full w-full rounded-xs" />
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
