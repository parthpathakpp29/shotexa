"use client";

/**
 * Annotation canvas. One composited canvas: the image (through the Screenshot Editor's own
 * transform, so any pending crop/rotate/flip/resize is shown) plus the annotations, drawn by
 * the SAME `drawAnnotations` the export uses — what you see is where it exports.
 *
 * Interaction happens in output pixels; objects are stored in source pixels. Every gesture
 * goes through a `DragSession`, so pointer-up commits the latest pointer position (never a
 * stale rendered frame), and each gesture is exactly one undo step.
 */
import { ArrowUpRight, Highlighter, ListOrdered, Maximize2, Minus, MousePointer2, Pencil, Plus, Redo2, Square, Type, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconButton, Mono, Toolbar, ToolbarDivider } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import {
  annotationFrame,
  bounds,
  boxFromPoints,
  clampMove,
  clampPoint,
  handlesFor,
  hitTest,
  isMeaningful,
  moveBy,
  resizeBox,
  setEndpoint,
  TEXT_LINE_HEIGHT,
  textLines,
  toOutput,
  toSource,
  type MeasureText,
} from "@/core/annotation/geometry";
import { addObject, autoSizes, DragSession, newAnnotationId, nextStepNumber, removeObject, simplifyPath, updateObject } from "@/core/annotation/objects";
import { ANNOTATION_FONT_FAMILY, canvasMeasure, drawAnnotations } from "@/core/annotation/render";
import type { AnnotationObject, AnnotationTool, Point, TextAnnotation } from "@/core/annotation/types";
import { drawTransformed } from "@/core/image-transform/matrix";
import { IDENTITY_TRANSFORM } from "@/core/image-transform/transform";
import type { CropHandle, Size } from "@/core/image-transform/types";
import { cn } from "@/lib/cn";
import { backingSize, displayWidth, zoomIn, zoomOut, type Zoom } from "@/lib/stage-size";
import { useElementWidth } from "@/lib/use-element-width";

const EMPTY: AnnotationObject[] = [];

export const ANNOTATION_TOOLS: { id: AnnotationTool; label: string; icon: ReactNode; hint: string }[] = [
  { id: "select", label: "Select", icon: <MousePointer2 />, hint: "Click an annotation to select it, then drag to move it. Double-click text to edit it." },
  { id: "arrow", label: "Arrow", icon: <ArrowUpRight />, hint: "Drag from where the arrow starts to where it points." },
  { id: "rectangle", label: "Rectangle", icon: <Square />, hint: "Drag to draw a box around something." },
  { id: "highlight", label: "Highlight", icon: <Highlighter />, hint: "Drag across text to highlight it like a marker pen." },
  { id: "text", label: "Text", icon: <Type />, hint: "Click where the text should start, then type. Enter to finish, Shift + Enter for a new line." },
  { id: "freehand", label: "Draw", icon: <Pencil />, hint: "Draw freely with a mouse, pen or finger." },
  { id: "step", label: "Step", icon: <ListOrdered />, hint: "Click to place numbered markers 1, 2, 3…" },
];

type Gesture =
  | { kind: "create"; start: Point; obj: AnnotationObject }
  | { kind: "move"; start: Point; base: AnnotationObject; obj: AnnotationObject }
  | { kind: "handle"; handle: string; base: AnnotationObject; obj: AnnotationObject };

interface TextEdit {
  /** null while creating a new text. */
  id: string | null;
  at: Point;
  value: string;
  size: number;
  color: string;
}

export function AnnotateCanvas({ assetId }: { assetId: string }) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
  const version = useWorkspace((s) => s.files[assetId]?.previewVersion ?? 0);
  const t = useWorkspace((s) => s.editor.byAsset[assetId] ?? IDENTITY_TRANSFORM);
  const objects = useWorkspace((s) => s.annotation.byAsset[assetId] ?? EMPTY);
  const selectedId = useWorkspace((s) => s.annotation.selectedId);
  const tool = useWorkspace((s) => s.annotation.tool);
  const style = useWorkspace((s) => s.annotation.style);
  const setTool = useWorkspace((s) => s.setAnnotationTool);
  const select = useWorkspace((s) => s.selectAnnotation);
  const setAnnotations = useWorkspace((s) => s.setAnnotations);
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);

  const [zoom, setZoom] = useState<Zoom>("fit");
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const drag = useRef(new DragSession<Gesture>());
  const pointerId = useRef<number | null>(null);
  const [draft, setDraft] = useState<AnnotationObject | null>(null);
  const [editing, setEditingState] = useState<TextEdit | null>(null);
  // Latest text edit, readable synchronously (blur and Enter can fire before a re-render).
  const editingRef = useRef<TextEdit | null>(null);
  const setEditing = (e: TextEdit | null) => {
    editingRef.current = e;
    setEditingState(e);
  };
  const measure = useMemo<MeasureText | undefined>(() => {
    if (typeof document === "undefined") return undefined;
    const ctx = document.createElement("canvas").getContext("2d");
    return ctx ? canvasMeasure(ctx) : undefined;
  }, []);

  const source = useMemo<Size | null>(() => (file ? { width: file.width, height: file.height } : null), [file]);
  const frame = useMemo(() => (source ? annotationFrame(t, source) : null), [t, source]);
  const out = frame?.out ?? null;
  const cssWidth = out ? displayWidth(out, Math.max(1, frameWidth - 32), zoom) : 0;
  const cssHeight = out ? (cssWidth * out.height) / out.width : 0;
  /** CSS pixels per output pixel. */
  const s = out ? cssWidth / out.width : 1;
  const projected = useMemo(() => (frame ? objects.map((o) => toOutput(o, frame)) : EMPTY), [objects, frame]);
  const editingId = editing?.id;
  const shown = useMemo(() => {
    let list = draft ? (projected.some((o) => o.id === draft.id) ? projected.map((o) => (o.id === draft.id ? draft : o)) : [...projected, draft]) : projected;
    // The text being edited is shown by the text box, not twice.
    if (editingId) list = list.filter((o) => o.id !== editingId);
    return list;
  }, [projected, draft, editingId]);
  const auto = out ? autoSizes(out) : null;
  const strokeOut = style.strokeWidth ?? auto?.stroke ?? 4;
  const fontOut = style.fontSize ?? auto?.font ?? 24;

  // 1) The transformed image, cached — rebuilt only when the image, its transform or zoom change.
  useEffect(() => {
    const bitmap = runtime.registry.preview(assetId);
    if (!bitmap || !source || !cssWidth) return;
    const size = backingSize({ width: cssWidth, height: cssHeight }, Infinity);
    const canvas = base.current ?? document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    drawTransformed(ctx, bitmap, bitmap.width / source.width, t, source, size);
    base.current = canvas;
    setBaseVersion((v) => v + 1);
  }, [runtime, assetId, version, source, t, cssWidth, cssHeight]);

  useEffect(
    () => () => {
      if (base.current) {
        base.current.width = 0;
        base.current.height = 0;
      }
    },
    [],
  );

  // 2) Composite: image + annotations, with the export's own renderer. Cheap enough per move.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = base.current;
    if (!canvas || !img || !out) return;
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width;
      canvas.height = img.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    drawAnnotations(ctx, shown, canvas.width / out.width);
  }, [baseVersion, shown, out]);

  useEffect(() => {
    if (editing) textRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const state = () => runtime.store.getState().annotation.byAsset[assetId] ?? EMPTY;
  const store = (o: AnnotationObject) => toSource(o, frame!);

  function toOut(e: { clientX: number; clientY: number }): Point {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / s, y: (e.clientY - box.top) / s };
  }

  /** Grab tolerance: generous for fingers, tight enough for precise mouse picks. */
  const tolerance = (pointerType: string) => (pointerType === "touch" ? 14 : 6) / s;

  function capture(id: number) {
    pointerId.current = id;
    try {
      stageRef.current?.setPointerCapture(id);
    } catch {
      // Best effort — moves still arrive while the pointer is over the stage.
    }
  }

  function begin(g: Gesture, id: number) {
    drag.current.begin(g);
    capture(id);
    setDraft(g.obj);
  }

  function startTextEdit(existing: TextAnnotation | null, at: Point) {
    setEditing(existing ? { id: existing.id, at: existing.at, value: existing.text, size: existing.size, color: existing.color } : { id: null, at, value: "", size: fontOut, color: style.color });
    if (existing) select(existing.id);
  }

  function commitText() {
    const e = editingRef.current;
    if (!e || !frame) return;
    setEditing(null);
    const value = e.value.replace(/\s+$/, "");
    const list = state();
    if (e.id === null) {
      if (!value.trim()) return;
      const obj: TextAnnotation = { id: newAnnotationId(), type: "text", color: e.color, at: e.at, text: value, size: e.size };
      const stored = store(obj);
      setAnnotations(assetId, addObject(list, stored), { select: stored.id });
      return;
    }
    const current = list.find((o) => o.id === e.id);
    if (!current || current.type !== "text") return;
    if (!value.trim()) setAnnotations(assetId, removeObject(list, e.id), { select: null });
    else if (value !== current.text) setAnnotations(assetId, updateObject(list, { ...current, text: value }));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!frame || !out || e.button !== 0) return;
    // The stage manages focus itself: the default mousedown focus would pull focus back from a
    // text box opened by this very press, blurring (and so discarding) it straight away.
    e.preventDefault();
    if (editingRef.current) {
      commitText();
      return;
    }
    // Without preventScroll, focusing a partly off-screen stage scrolls it mid-gesture, so the
    // image would jump under the pointer between press and release.
    stageRef.current?.focus({ preventScroll: true });
    const p = clampPoint(toOut(e), out);
    const id = newAnnotationId();
    switch (tool) {
      case "select": {
        const hit = hitTest(projected, p, tolerance(e.pointerType), measure);
        select(hit);
        const obj = hit ? projected.find((o) => o.id === hit)! : null;
        if (obj) begin({ kind: "move", start: p, base: obj, obj }, e.pointerId);
        return;
      }
      case "arrow":
        return begin({ kind: "create", start: p, obj: { id, type: "arrow", color: style.color, from: p, to: p, width: strokeOut } }, e.pointerId);
      case "rectangle":
        return begin({ kind: "create", start: p, obj: { id, type: "rectangle", color: style.color, rect: { x: p.x, y: p.y, width: 0, height: 0 }, width: strokeOut } }, e.pointerId);
      case "highlight":
        return begin({ kind: "create", start: p, obj: { id, type: "highlight", color: style.highlightColor, rect: { x: p.x, y: p.y, width: 0, height: 0 }, opacity: style.highlightOpacity } }, e.pointerId);
      case "freehand":
        return begin({ kind: "create", start: p, obj: { id, type: "freehand", color: style.color, points: [p], width: strokeOut } }, e.pointerId);
      case "text": {
        const hit = hitTest(projected.filter((o) => o.type === "text"), p, tolerance(e.pointerType), measure);
        startTextEdit(hit ? (projected.find((o) => o.id === hit) as TextAnnotation) : null, p);
        return;
      }
      case "step": {
        const radius = Math.round(fontOut * 0.7);
        const stored = store({ id, type: "step", color: style.color, at: p, n: nextStepNumber(state()), radius });
        setAnnotations(assetId, addObject(state(), stored), { select: stored.id });
        return;
      }
    }
  }

  function onHandleDown(e: React.PointerEvent, handle: string, obj: AnnotationObject) {
    e.preventDefault();
    e.stopPropagation();
    begin({ kind: "handle", handle, base: obj, obj }, e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = drag.current.latest;
    if (!drag.current.active || !g || pointerId.current !== e.pointerId || !out) return;
    const raw = toOut(e);
    const p = clampPoint(raw, out);
    let obj: AnnotationObject = g.obj;
    if (g.kind === "create") {
      if (obj.type === "arrow") obj = { ...obj, to: p };
      else if (obj.type === "rectangle" || obj.type === "highlight") obj = { ...obj, rect: boxFromPoints(g.start, p) };
      else if (obj.type === "freehand") {
        const last = obj.points[obj.points.length - 1];
        // Sample at most once per CSS pixel of travel; simplification happens on release.
        if (Math.hypot(p.x - last.x, p.y - last.y) >= 1 / s) obj = { ...obj, points: [...obj.points, p] };
      }
    } else if (g.kind === "move") {
      const d = clampMove(g.base, raw.x - g.start.x, raw.y - g.start.y, out, measure);
      obj = moveBy(g.base, d.x, d.y);
    } else if (g.base.type === "arrow") {
      obj = setEndpoint(g.base, g.handle as "from" | "to", p);
    } else if (g.base.type === "rectangle" || g.base.type === "highlight") {
      obj = { ...g.base, rect: resizeBox(g.base.rect, g.handle as CropHandle, raw, out) };
    }
    drag.current.update({ ...g, obj });
    setDraft(obj);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    // The latest pointer value, not the last rendered draft.
    const g = drag.current.commit();
    setDraft(null);
    if (!g || !frame) return;
    const list = state();
    if (g.kind === "create") {
      if (!isMeaningful(g.obj, 4 / s)) return; // a stray click, not a drawing
      const obj = g.obj.type === "freehand" ? { ...g.obj, points: simplifyPath(g.obj.points, Math.max(0.75, 0.5 / s)) } : g.obj;
      const stored = store(obj);
      setAnnotations(assetId, addObject(list, stored), { select: stored.id });
    } else if (JSON.stringify(g.obj) !== JSON.stringify(g.base)) {
      setAnnotations(assetId, updateObject(list, store(g.obj)));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editingRef.current || !frame || !out) return;
    const selected = projected.find((o) => o.id === selectedId);
    if (e.key === "Escape") {
      select(null);
      return;
    }
    if (!selected) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setAnnotations(assetId, removeObject(state(), selected.id), { select: null });
      return;
    }
    if (e.key === "Enter" && selected.type === "text") {
      e.preventDefault();
      startTextEdit(selected, selected.at);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
    if (!delta) return;
    e.preventDefault();
    const d = clampMove(selected, delta[0], delta[1], out, measure);
    setAnnotations(assetId, updateObject(state(), store(moveBy(selected, d.x, d.y))), { coalesce: `nudge:${selected.id}` });
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (tool !== "select" || !out) return;
    const p = toOut(e);
    const hit = hitTest(projected.filter((o) => o.type === "text"), p, 6 / s, measure);
    if (hit) startTextEdit(projected.find((o) => o.id === hit) as TextAnnotation, p);
  }

  // Selection chrome follows the live draft while it is being dragged.
  const selected = shown.find((o) => o.id === selectedId) ?? null;
  const selBounds = selected ? bounds(selected, measure) : null;
  const handles = selected && !editing ? handlesFor(selected) : [];
  const hint = ANNOTATION_TOOLS.find((x) => x.id === tool)!.hint;
  const editBox = editing
    ? (() => {
        const lines = textLines(editing.value || " ");
        const width = Math.max(editing.size * 4, ...lines.map((l) => (measure ? measure(l || " ", editing.size) : l.length * editing.size * 0.56))) * s + 24;
        return { left: editing.at.x * s, top: editing.at.y * s, width, height: lines.length * editing.size * TEXT_LINE_HEIGHT * s + 10, fontSize: editing.size * s };
      })()
    : null;

  return (
    <section aria-label="Annotation editor" data-testid="annotate-workspace">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Annotation tool" className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-line bg-surface p-1 shadow-xs" data-testid="annotate-tools">
          {ANNOTATION_TOOLS.map((x) => {
            const active = x.id === tool;
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={x.label}
                title={x.label}
                onClick={() => {
                  if (editingRef.current) commitText();
                  setTool(x.id);
                }}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-sm px-2 text-[13px] font-medium transition-colors max-md:size-11 max-md:justify-center max-md:px-0 [&_svg]:size-[18px]",
                  active ? "bg-accent text-white shadow-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {x.icon}
                <span className="max-2xl:sr-only">{x.label}</span>
              </button>
            );
          })}
        </div>
        <Toolbar aria-label="History and zoom">
          <span className="contents max-md:hidden">
            <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
              <Undo2 />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
              <Redo2 />
            </IconButton>
            <ToolbarDivider />
          </span>
          <IconButton label="Zoom out" onClick={() => setZoom(zoomOut(zoom))} disabled={zoom === "fit"}>
            <Minus />
          </IconButton>
          <Mono className="w-12 text-center text-[12px]">{zoom === "fit" ? "FIT" : `${zoom * 100}%`}</Mono>
          <IconButton label="Zoom in" onClick={() => setZoom(zoomIn(zoom))} disabled={zoom === 2}>
            <Plus />
          </IconButton>
          <IconButton label="Fit image" active={zoom === "fit"} onClick={() => setZoom("fit")}>
            <Maximize2 />
          </IconButton>
        </Toolbar>
      </div>

      <div ref={frameRef} className="max-h-[calc(100dvh-12rem)] min-h-[420px] overflow-auto rounded-lg border border-line bg-surface-2 p-4 max-md:min-h-[55dvh] max-md:p-2">
        {out && cssWidth > 0 && (
          <div
            ref={stageRef}
            tabIndex={0}
            role="application"
            aria-roledescription="annotation canvas"
            aria-label={`Screenshot annotation canvas. ${hint}`}
            data-testid="annotate-stage"
            data-out-width={out.width}
            data-out-height={out.height}
            data-count={objects.length}
            className={cn(
              "relative mx-auto touch-none select-none overflow-hidden bg-checker shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent",
              tool === "select" ? "cursor-default" : tool === "text" ? "cursor-text" : "cursor-crosshair",
            )}
            style={{ width: cssWidth, height: cssHeight }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            onDoubleClick={onDoubleClick}
          >
            <canvas ref={canvasRef} aria-hidden data-testid="annotate-canvas" className="pointer-events-none block h-full w-full" />
            {selBounds && !editing && (
              <span
                aria-hidden
                data-testid="annotation-selection"
                data-x={Math.round(selBounds.x)}
                data-y={Math.round(selBounds.y)}
                data-width={Math.round(selBounds.width)}
                data-height={Math.round(selBounds.height)}
                className="pointer-events-none absolute rounded-xs border border-dashed border-accent outline outline-1 outline-white/70"
                style={{ left: selBounds.x * s - 4, top: selBounds.y * s - 4, width: selBounds.width * s + 8, height: selBounds.height * s + 8 }}
              />
            )}
            {selected &&
              handles.map((h) => (
                <span
                  key={h.id}
                  data-testid={`annotation-handle-${h.id}`}
                  onPointerDown={(e) => onHandleDown(e, h.id, selected)}
                  // A 44 px touch target around a small visible knob.
                  className="absolute z-10 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center md:size-6"
                  style={{ left: h.at.x * s, top: h.at.y * s }}
                >
                  <span className="block size-3 rounded-full border-2 border-white bg-accent shadow-sm" />
                </span>
              ))}
            {editing && editBox && (
              <textarea
                ref={textRef}
                data-testid="annotation-text-input"
                aria-label="Annotation text"
                value={editing.value}
                placeholder="Type…"
                rows={1}
                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={commitText}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitText();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    editingRef.current = null;
                    setEditing(null);
                  } else return;
                  // Keep keyboard shortcuts (Delete, Escape, nudges) working on the canvas.
                  stageRef.current?.focus({ preventScroll: true });
                }}
                className="absolute z-20 resize-none overflow-hidden rounded-xs border border-dashed border-accent bg-white/85 p-0 leading-[1.25] outline-none"
                style={{ left: editBox.left, top: editBox.top, width: editBox.width, height: editBox.height, fontSize: editBox.fontSize, fontFamily: ANNOTATION_FONT_FAMILY, fontWeight: 600, color: editing.color }}
              />
            )}
          </div>
        )}
      </div>
      <p className="t-body-sm mt-3 text-ink-2" data-testid="annotate-hint">
        {hint}
      </p>
    </section>
  );
}
