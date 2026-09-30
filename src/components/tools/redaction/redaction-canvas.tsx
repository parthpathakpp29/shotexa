"use client";

import { Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Mono, Toolbar, ToolbarDivider } from "@/components/ui/primitives";
import { displayToImage, imageToDisplay, rectFromPoints, type ViewportTransform } from "@/core/redaction/geometry";
import type { ImageRect, Redaction } from "@/core/redaction/types";
import { useElementWidth } from "@/lib/use-element-width";
import { cn } from "@/lib/cn";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";

type Zoom = "fit" | "0.5" | "1" | "2";
const FIT_HEIGHT = 660;
const EMPTY_REDACTIONS: Redaction[] = [];

function drawPreview(canvas: HTMLCanvasElement, bitmap: ImageBitmap, file: { width: number; height: number }, operations: Redaction[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const sx = canvas.width / file.width;
  const sy = canvas.height / file.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const op of operations) {
    const r = { x: op.rect.x * sx, y: op.rect.y * sy, width: op.rect.width * sx, height: op.rect.height * sy };
    if (op.mode === "blackout") {
      ctx.fillStyle = "#000";
      ctx.fillRect(r.x, r.y, r.width, r.height);
    } else if (op.mode === "blur") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      ctx.clip();
      ctx.filter = `blur(${Math.max(1, op.intensity * sx)}px)`;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      const block = Math.max(2, op.intensity * sx);
      const w = Math.max(1, Math.ceil(r.width / block));
      const h = Math.max(1, Math.ceil(r.height / block));
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const t = tmp.getContext("2d");
      if (t) {
        t.drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, w, h);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, w, h, r.x, r.y, r.width, r.height);
        ctx.restore();
      }
      tmp.width = 0;
      tmp.height = 0;
    }
  }
}

export function RedactionCanvas({ assetId }: { assetId: string }) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
  const version = useWorkspace((s) => s.files[assetId]?.previewVersion ?? 0);
  const operations = useWorkspace((s) => s.redaction.byAsset[assetId] ?? EMPTY_REDACTIONS);
  const selectedId = useWorkspace((s) => s.redaction.selectedId);
  const add = useWorkspace((s) => s.addRedaction);
  const update = useWorkspace((s) => s.updateRedaction);
  const select = useWorkspace((s) => s.selectRedaction);
  const remove = useWorkspace((s) => s.deleteRedaction);
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [draft, setDraftState] = useState<ImageRect | null>(null);
  const [transient, setTransientState] = useState<{ id: string; rect: ImageRect } | null>(null);
  // Pointer-up commits the latest drag value, not the last rendered one: on a slow device a
  // fast drag can outrun rendering, which previously committed a stale (or no) rectangle.
  const latestDraft = useRef<ImageRect | null>(null);
  const latestTransient = useRef<{ id: string; rect: ImageRect } | null>(null);
  const setDraft = (value: ImageRect | null) => {
    latestDraft.current = value;
    setDraftState(value);
  };
  const setTransient = (value: { id: string; rect: ImageRect } | null) => {
    latestTransient.current = value;
    setTransientState(value);
  };
  const interaction = useRef<
    | { type: "create"; pointer: number; start: { x: number; y: number } }
    | { type: "move" | "resize"; pointer: number; start: { x: number; y: number }; operation: Redaction }
    | null
  >(null);

  const cssWidth = !file ? 0 : zoom === "fit" ? Math.floor(Math.min(Math.max(1, containerWidth - 32), file.width, (FIT_HEIGHT * file.width) / file.height)) : Math.round(file.width * Number(zoom));
  const cssHeight = file && cssWidth ? (cssWidth * file.height) / file.width : 0;
  const transform = useMemo<ViewportTransform | null>(() => (file && cssWidth ? { imageWidth: file.width, imageHeight: file.height, displayWidth: cssWidth, displayHeight: cssHeight } : null), [file, cssWidth, cssHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const bitmap = runtime.registry.preview(assetId);
    if (!canvas || !bitmap || !file || !cssWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.min(bitmap.width, Math.round(cssWidth * dpr)));
    canvas.height = Math.max(1, Math.round((file.height / file.width) * canvas.width));
    drawPreview(canvas, bitmap, file, transient ? operations.map((r) => (r.id === transient.id ? { ...r, rect: transient.rect } : r)) : operations);
  }, [runtime, assetId, file, version, cssWidth, operations, transient]);

  function point(e: React.PointerEvent) {
    const box = stageRef.current!.getBoundingClientRect();
    return displayToImage({ x: e.clientX - box.left, y: e.clientY - box.top }, transform!);
  }

  function onStageDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!transform || e.button !== 0 || e.target !== e.currentTarget) return;
    const p = point(e);
    interaction.current = { type: "create", pointer: e.pointerId, start: p };
    e.currentTarget.setPointerCapture(e.pointerId);
    select(null);
    setDraft({ x: p.x, y: p.y, width: 0, height: 0 });
  }

  function beginExisting(e: React.PointerEvent, op: Redaction, type: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    if (!transform) return;
    interaction.current = { type, pointer: e.pointerId, start: point(e), operation: op };
    stageRef.current?.setPointerCapture(e.pointerId);
    select(op.id);
    setTransient({ id: op.id, rect: op.rect });
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const active = interaction.current;
    if (!active || active.pointer !== e.pointerId || !transform) return;
    const p = point(e);
    if (active.type === "create") setDraft(rectFromPoints(active.start, p));
    else {
      const dx = p.x - active.start.x;
      const dy = p.y - active.start.y;
      const r = active.operation.rect;
      setTransient({
        id: active.operation.id,
        rect: active.type === "move" ? { ...r, x: r.x + dx, y: r.y + dy } : { ...r, width: Math.max(2, r.width + dx), height: Math.max(2, r.height + dy) },
      });
    }
  }

  function finish(e: React.PointerEvent<HTMLDivElement>) {
    const active = interaction.current;
    if (!active || active.pointer !== e.pointerId) return;
    const created = latestDraft.current;
    const moved = latestTransient.current;
    if (active.type === "create" && created && transform && created.width >= 4 / (transform.displayWidth / transform.imageWidth) && created.height >= 4 / (transform.displayHeight / transform.imageHeight)) add(assetId, created);
    else if (active.type !== "create" && moved) update(assetId, moved.id, { rect: moved.rect });
    interaction.current = null;
    setDraft(null);
    setTransient(null);
  }

  const shown = transient ? operations.map((r) => (r.id === transient.id ? { ...r, rect: transient.rect } : r)) : operations;
  return (
    <section aria-label="Redaction editor" data-testid="redaction-editor">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Toolbar aria-label="Editor history and zoom">
          <IconButton label="Undo" disabled={!canUndo} onClick={undo}><Undo2 /></IconButton>
          <IconButton label="Redo" disabled={!canRedo} onClick={redo}><Redo2 /></IconButton>
          <ToolbarDivider />
          <IconButton label="Zoom out" onClick={() => setZoom(zoom === "2" ? "1" : zoom === "1" ? "0.5" : "fit")}><Minus /></IconButton>
          <Mono className="w-12 text-center text-[12px]">{zoom === "fit" ? "FIT" : `${Number(zoom) * 100}%`}</Mono>
          <IconButton label="Zoom in" onClick={() => setZoom(zoom === "fit" ? "0.5" : zoom === "0.5" ? "1" : "2")}><Plus /></IconButton>
          <IconButton label="Fit image" onClick={() => setZoom("fit")}><Maximize2 /></IconButton>
        </Toolbar>
        {file && <Mono className="text-[12px]">{file.width} × {file.height} px · {operations.length} {operations.length === 1 ? "region" : "regions"}</Mono>}
      </div>
      <div ref={containerRef} className="max-h-[calc(100dvh-10rem)] min-h-[420px] overflow-auto rounded-lg border border-line bg-surface-2 p-4 max-md:min-h-[55dvh] max-md:p-2">
        {file && transform && (
          <div
            ref={stageRef}
            tabIndex={0}
            aria-label="Screenshot redaction canvas. Drag to create a rectangle."
            className="relative mx-auto touch-none cursor-crosshair overflow-hidden bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ width: cssWidth, height: cssHeight }}
            onPointerDown={onStageDown}
            onPointerMove={onMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onKeyDown={(e) => {
              const op = operations.find((r) => r.id === selectedId);
              if (!op) return;
              if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(assetId, op.id); return; }
              const step = e.shiftKey ? 10 : 1;
              const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
              if (delta) { e.preventDefault(); update(assetId, op.id, { rect: { ...op.rect, x: op.rect.x + delta[0], y: op.rect.y + delta[1] } }, { coalesce: true }); }
            }}
          >
            <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" aria-hidden />
            {shown.map((op) => {
              const r = imageToDisplay(op.rect, transform);
              const selected = op.id === selectedId;
              return (
                <div
                  key={op.id}
                  role="button"
                  tabIndex={selected ? 0 : -1}
                  aria-label={`${op.mode} redaction`}
                  data-testid="redaction-region"
                  data-source-x={op.rect.x}
                  data-source-y={op.rect.y}
                  data-source-width={op.rect.width}
                  data-source-height={op.rect.height}
                  onPointerDown={(e) => beginExisting(e, op, "move")}
                  onClick={(e) => { e.stopPropagation(); select(op.id); }}
                  className={cn("absolute cursor-move border-2", selected ? "border-accent ring-2 ring-white/80" : "border-white/90")}
                  style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
                >
                  {selected && <span aria-hidden onPointerDown={(e) => beginExisting(e, op, "resize")} className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-sm border-2 border-white bg-accent shadow-sm" />}
                </div>
              );
            })}
            {draft && (() => { const r = imageToDisplay(draft, transform); return <div aria-hidden className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/10" style={{ left: r.x, top: r.y, width: r.width, height: r.height }} />; })()}
          </div>
        )}
      </div>
      <p className="t-body-sm mt-3 text-ink-2">Drag on the screenshot to create a rectangle. Select a region to move it, resize from its corner, or use arrow keys for precise movement.</p>
    </section>
  );
}
