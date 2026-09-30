"use client";

/**
 * Screenshot Editor canvas. Two views of the same logical transform:
 *
 * - Crop:    the whole image as currently rotated/flipped, with the crop box on top.
 * - Result:  exactly what will be exported (cropped, oriented and resized).
 *
 * Both draw the downscaled workspace preview through the same matrix the full-resolution
 * export uses. While the crop box is dragged only the overlay re-renders — the bitmap is
 * redrawn when orientation, zoom or the preview itself changes.
 */
import { Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "@/components/ui/controls";
import { IconButton, Mono, Toolbar, ToolbarDivider } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { aspectRatio, moveCrop, resizeCrop } from "@/core/image-transform/crop";
import { drawTransformed } from "@/core/image-transform/matrix";
import { orientedSize } from "@/core/image-transform/orientation";
import { IDENTITY_TRANSFORM, outputSize, visibleCrop, visibleSize, withVisibleCrop } from "@/core/image-transform/transform";
import type { CropHandle, Point, Rect, Size } from "@/core/image-transform/types";
import { cn } from "@/lib/cn";
import { useElementWidth } from "@/lib/use-element-width";
import { backingSize, displayWidth, zoomIn as nextZoomIn, zoomOut as nextZoomOut, type Zoom } from "@/lib/stage-size";

export type EditorView = "crop" | "result";

/** Pointer travel (CSS px) before a press on the image starts a new crop. */
const DRAG_THRESHOLD = 4;
const HANDLES: CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POSITION: Record<CropHandle, string> = {
  nw: "left-0 top-0 cursor-nwse-resize",
  n: "left-1/2 top-0 cursor-ns-resize",
  ne: "left-full top-0 cursor-nesw-resize",
  e: "left-full top-1/2 cursor-ew-resize",
  se: "left-full top-full cursor-nwse-resize",
  s: "left-1/2 top-full cursor-ns-resize",
  sw: "left-0 top-full cursor-nesw-resize",
  w: "left-0 top-1/2 cursor-ew-resize",
};
const HANDLE_LABEL: Record<CropHandle, string> = { nw: "top-left", n: "top", ne: "top-right", e: "right", se: "bottom-right", s: "bottom", sw: "bottom-left", w: "left" };

type Interaction =
  | { kind: "create"; pointer: number; start: Point; startClient: Point; active: boolean }
  | { kind: "move"; pointer: number; start: Point; rect: Rect }
  | { kind: "resize"; pointer: number; handle: CropHandle; rect: Rect };

export function EditorCanvas({ assetId, view, onViewChange }: { assetId: string; view: EditorView; onViewChange: (view: EditorView) => void }) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
  const version = useWorkspace((s) => s.files[assetId]?.previewVersion ?? 0);
  const t = useWorkspace((s) => s.editor.byAsset[assetId] ?? IDENTITY_TRANSFORM);
  const setTransform = useWorkspace((s) => s.setEditTransform);
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const [draft, setDraftState] = useState<Rect | null>(null);
  // The latest drag rectangle, readable synchronously. Pointer-up must never commit the value
  // from the last *rendered* frame: on a slow device a fast drag outruns rendering, and the
  // box would jump back to an intermediate position on release.
  const latest = useRef<Rect | null>(null);
  const setDraft = (rect: Rect | null) => {
    latest.current = rect;
    setDraftState(rect);
  };

  const source = useMemo<Size | null>(() => (file ? { width: file.width, height: file.height } : null), [file]);
  const visible = source ? visibleSize(t, source) : null;
  const output = source ? outputSize(t, source) : null;
  // What the stage shows: the whole oriented image (crop view) or the final result.
  const shown = view === "crop" ? visible : output;
  const inner = Math.max(1, frameWidth - 32);
  const cssWidth = shown ? displayWidth(shown, inner, zoom) : 0;
  const cssHeight = shown ? (cssWidth * shown.height) / shown.width : 0;
  // CSS pixels per visible-image pixel (crop view only).
  const scale = visible ? cssWidth / visible.width : 1;
  const committedCrop = source ? visibleCrop(t, source) : null;
  const crop = draft ?? committedCrop;
  const ratio = visible ? aspectRatio(t.cropAspect, visible) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const bitmap = runtime.registry.preview(assetId);
    if (!canvas || !bitmap || !source || !cssWidth) return;
    const imageScale = bitmap.width / source.width;
    if (view === "crop") {
      // Whole image, oriented; the crop is an overlay so dragging it never redraws this.
      const detail = orientedSize({ width: bitmap.width, height: bitmap.height }, t.rotation).width;
      const size = backingSize({ width: cssWidth, height: cssHeight }, detail);
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size.width, size.height);
      drawTransformed(ctx, bitmap, imageScale, { ...t, crop: null, resize: null }, source, size);
    } else {
      // The result, drawn through the export's own matrix.
      const cropWidth = t.crop ? t.crop.width : source.width;
      const cropHeight = t.crop ? t.crop.height : source.height;
      const detail = orientedSize({ width: cropWidth * imageScale, height: cropHeight * imageScale }, t.rotation).width;
      const size = backingSize({ width: cssWidth, height: cssHeight }, Math.max(detail, 1));
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size.width, size.height);
      drawTransformed(ctx, bitmap, imageScale, t, source, size);
    }
    // `t` only changes when an edit is committed — a crop drag lives in local `draft` state —
    // so dragging never triggers this redraw; each finished gesture costs one.
  }, [runtime, assetId, version, source, view, cssWidth, cssHeight, t]);

  function toImage(e: { clientX: number; clientY: number }): Point {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  }

  function commit(rect: Rect) {
    if (!source) return;
    setTransform(assetId, withVisibleCrop(t, source, rect));
  }

  /** Keep receiving moves outside the stage. Best effort: capture can fail (e.g. a pointer the
   *  browser no longer tracks), and that must never lose the gesture itself. */
  function capture(pointerId: number) {
    try {
      stageRef.current?.setPointerCapture(pointerId);
    } catch {
      // Moves still arrive while the pointer stays over the stage.
    }
  }

  function onStageDown(e: React.PointerEvent<HTMLDivElement>) {
    if (view !== "crop" || e.button !== 0 || e.target !== e.currentTarget) return;
    interaction.current = { kind: "create", pointer: e.pointerId, start: toImage(e), startClient: { x: e.clientX, y: e.clientY }, active: false };
    capture(e.pointerId);
  }

  function begin(e: React.PointerEvent, next: Interaction) {
    e.preventDefault();
    e.stopPropagation();
    interaction.current = next;
    capture(e.pointerId);
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const active = interaction.current;
    if (!active || active.pointer !== e.pointerId || !visible || !committedCrop) return;
    const p = toImage(e);
    if (active.kind === "move") {
      setDraft(moveCrop(active.rect, p.x - active.start.x, p.y - active.start.y, visible));
    } else if (active.kind === "resize") {
      setDraft(resizeCrop(active.rect, active.handle, p, visible, ratio));
    } else {
      if (!active.active && Math.hypot(e.clientX - active.startClient.x, e.clientY - active.startClient.y) < DRAG_THRESHOLD) return;
      active.active = true;
      // A new box grows from where the press started, towards the pointer.
      const handle = `${p.y < active.start.y ? "n" : "s"}${p.x < active.start.x ? "w" : "e"}` as CropHandle;
      setDraft(resizeCrop({ x: active.start.x, y: active.start.y, width: 0, height: 0 }, handle, p, visible, ratio));
    }
  }

  function finish(e: React.PointerEvent<HTMLDivElement>) {
    const active = interaction.current;
    if (!active || active.pointer !== e.pointerId) return;
    interaction.current = null;
    const rect = latest.current;
    // One logical step per gesture: the whole drag becomes a single undo entry.
    if (rect && (active.kind !== "create" || active.active)) commit(rect);
    setDraft(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (view !== "crop" || !committedCrop || !visible || !source) return;
    const step = e.shiftKey ? 10 : 1;
    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
    if (!delta) return;
    e.preventDefault();
    setTransform(assetId, withVisibleCrop(t, source, moveCrop(committedCrop, delta[0], delta[1], visible)), { coalesce: true });
  }

  const zoomOut = () => setZoom(nextZoomOut(zoom));
  const zoomIn = () => setZoom(nextZoomIn(zoom));
  const dragging = !!draft;
  const box = crop ? { left: crop.x * scale, top: crop.y * scale, width: crop.width * scale, height: crop.height * scale } : null;

  return (
    <section aria-label="Screenshot editor" data-testid="editor-workspace">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Toolbar aria-label="Editor history and zoom">
          {/* On phones the sticky bottom bar owns Undo/Redo; one of each is enough. */}
          <span className="contents max-md:hidden">
            <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
              <Undo2 />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
              <Redo2 />
            </IconButton>
            <ToolbarDivider />
          </span>
          <IconButton label="Zoom out" onClick={zoomOut} disabled={zoom === "fit"}>
            <Minus />
          </IconButton>
          <Mono className="w-12 text-center text-[12px]">{zoom === "fit" ? "FIT" : `${zoom * 100}%`}</Mono>
          <IconButton label="Zoom in" onClick={zoomIn} disabled={zoom === 2}>
            <Plus />
          </IconButton>
          <IconButton label="Fit image" active={zoom === "fit"} onClick={() => setZoom("fit")}>
            <Maximize2 />
          </IconButton>
        </Toolbar>
        <SegmentedControl<EditorView>
          label="Editor view"
          size="sm"
          value={view}
          onChange={onViewChange}
          className="w-48"
          options={[
            { value: "crop", label: "Crop" },
            { value: "result", label: "Result" },
          ]}
        />
      </div>

      <div ref={frameRef} className="max-h-[calc(100dvh-12rem)] min-h-[420px] overflow-auto rounded-lg border border-line bg-surface-2 p-4 max-md:min-h-[55dvh] max-md:p-2">
        {source && shown && cssWidth > 0 && (
          <div
            ref={stageRef}
            tabIndex={0}
            role="application"
            aria-label={view === "crop" ? "Crop area. Drag the box or its handles, drag on the image to draw a new box, or use the arrow keys to move it." : "Result preview"}
            aria-roledescription="image editor"
            data-testid="editor-stage"
            data-view={view}
            className={cn(
              "relative mx-auto touch-none select-none bg-checker shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent",
              view === "crop" && "cursor-crosshair",
            )}
            style={{ width: cssWidth, height: cssHeight }}
            onPointerDown={onStageDown}
            onPointerMove={onMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onKeyDown={onKeyDown}
          >
            <canvas ref={canvasRef} aria-hidden data-testid="editor-canvas" className="pointer-events-none block h-full w-full" />
            {view === "crop" && box && (
              // Dimming lives in its own clipped layer so it never spills past the image,
              // while the handles below may overhang the image edge to stay grabbable.
              <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <span className="absolute shadow-[0_0_0_9999px_rgba(28,23,20,0.5)]" style={box} />
              </span>
            )}
            {view === "crop" && box && crop && (
              <div
                data-testid="editor-crop"
                data-x={crop.x}
                data-y={crop.y}
                data-width={crop.width}
                data-height={crop.height}
                onPointerDown={(e) => committedCrop && begin(e, { kind: "move", pointer: e.pointerId, start: toImage(e), rect: crop })}
                className="absolute cursor-move border-2 border-white outline outline-1 outline-dark/40"
                style={box}
              >
                {/* Rule-of-thirds guides while dragging. */}
                {dragging && (
                  <span aria-hidden className="pointer-events-none absolute inset-0">
                    <span className="absolute inset-y-0 left-1/3 w-px bg-white/60" />
                    <span className="absolute inset-y-0 left-2/3 w-px bg-white/60" />
                    <span className="absolute inset-x-0 top-1/3 h-px bg-white/60" />
                    <span className="absolute inset-x-0 top-2/3 h-px bg-white/60" />
                  </span>
                )}
                {HANDLES.map((handle) => (
                  <span
                    key={handle}
                    aria-hidden
                    data-testid={`crop-handle-${handle}`}
                    onPointerDown={(e) => committedCrop && begin(e, { kind: "resize", pointer: e.pointerId, handle, rect: crop })}
                    title={`Resize crop from the ${HANDLE_LABEL[handle]}`}
                    // A 44 px touch target around a small visible knob.
                    className={cn("absolute z-10 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center md:size-6", HANDLE_POSITION[handle])}
                  >
                    <span className={cn("block border-2 border-white bg-accent shadow-sm", handle.length === 2 ? "size-3.5 rounded-sm" : handle === "n" || handle === "s" ? "h-2 w-5 rounded-full" : "h-5 w-2 rounded-full")} />
                  </span>
                ))}
                <span className="t-mono pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-xs bg-dark/85 px-2 py-0.5 text-[11px] text-white">
                  {crop.width} × {crop.height}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="t-body-sm mt-3 text-ink-2">
        {view === "crop"
          ? "Drag the box or its handles to crop, or drag on the image to draw a new box. Arrow keys move the box (Shift moves 10 px)."
          : `This is the exported result: ${output?.width} × ${output?.height} px. Switch to Crop to adjust the framing.`}
      </p>
    </section>
  );
}
