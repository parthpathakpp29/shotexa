"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  clampScale,
  effectiveScale,
  shouldPanWithSpace,
  viewportShortcut,
  zoomStep,
  type ViewportZoom,
} from "@/core/viewport/viewport";

interface ViewportInteractionOptions {
  scrollRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  zoom: ViewportZoom;
  setZoom: Dispatch<SetStateAction<ViewportZoom>>;
  fitScale: number;
  minScale?: number;
  maxScale?: number;
  allowDragPan?: boolean;
  allowTouchPan?: boolean;
  onEscape?: () => void;
}

interface PendingAnchor {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
}

const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const midpoint = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

function canStartDirectPan(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[data-viewport-edit],button,input,textarea,select,a,[contenteditable=true]")) return false;
  return !!target.closest("[data-viewport-pan]");
}

export function useViewportInteraction({
  scrollRef,
  contentRef,
  zoom,
  setZoom,
  fitScale,
  minScale = MIN_VIEWPORT_SCALE,
  maxScale = MAX_VIEWPORT_SCALE,
  allowDragPan = false,
  allowTouchPan = false,
  onEscape,
}: ViewportInteractionOptions) {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const active = useRef(false);
  const zoomRef = useRef(zoom);
  const fitRef = useRef(fitScale);
  const pending = useRef<PendingAnchor | null>(null);
  const wheelFrame = useRef<number | null>(null);
  const queuedWheel = useRef<{ scale: number; x: number; y: number } | null>(null);
  const pan = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const pinch = useRef<{ distance: number; scale: number; midpoint: { x: number; y: number } } | null>(null);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    fitRef.current = fitScale;
  }, [fitScale, zoom]);

  const zoomAt = useCallback((nextScale: number, clientX?: number, clientY?: number) => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    const oldScale = effectiveScale(zoomRef.current, fitRef.current);
    const clamped = clampScale(nextScale, minScale, maxScale);
    if (scroller && content) {
      const viewport = scroller.getBoundingClientRect();
      const rect = content.getBoundingClientRect();
      const x = clientX ?? viewport.left + viewport.width / 2;
      const y = clientY ?? viewport.top + viewport.height / 2;
      pending.current = {
        clientX: x,
        clientY: y,
        worldX: (x - rect.left) / Math.max(0.001, oldScale),
        worldY: (y - rect.top) / Math.max(0.001, oldScale),
      };
    }
    const next: ViewportZoom = Math.abs(clamped - fitRef.current) <= 0.01 ? "fit" : Math.round(clamped * 1000) / 1000;
    zoomRef.current = next;
    setZoom(next);
  }, [contentRef, maxScale, minScale, scrollRef, setZoom]);

  const zoomIn = useCallback(() => {
    const next = zoomStep(zoomRef.current, fitRef.current, 1);
    zoomAt(effectiveScale(next, fitRef.current));
  }, [zoomAt]);
  const zoomOut = useCallback(() => {
    const next = zoomStep(zoomRef.current, fitRef.current, -1);
    if (next === "fit") {
      zoomRef.current = "fit";
      setZoom("fit");
    } else zoomAt(next);
  }, [setZoom, zoomAt]);
  const fit = useCallback(() => { zoomRef.current = "fit"; setZoom("fit"); }, [setZoom]);
  const actual = useCallback(() => zoomAt(1), [zoomAt]);

  useLayoutEffect(() => {
    const anchor = pending.current;
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!anchor || !scroller || !content) return;
    pending.current = null;
    const rect = content.getBoundingClientRect();
    const scale = effectiveScale(zoom, fitScale);
    scroller.scrollLeft += rect.left - (anchor.clientX - anchor.worldX * scale);
    scroller.scrollTop += rect.top - (anchor.clientY - anchor.worldY * scale);
  }, [contentRef, fitScale, scrollRef, zoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const activate = () => { active.current = true; };
    const deactivate = () => { if (!el.contains(document.activeElement)) active.current = false; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!active.current && !el.contains(document.activeElement)) return;
      if (event.code === "Space" && shouldPanWithSpace(event.target)) {
        event.preventDefault();
        if (!event.repeat) setSpaceHeld(true);
        return;
      }
      const action = viewportShortcut(event);
      if (!action) return;
      event.preventDefault();
      if (action === "fit") fit();
      else if (action === "actual") actual();
      else if (action === "zoom-in") zoomIn();
      else if (action === "zoom-out") zoomOut();
      else onEscape?.();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setSpaceHeld(false);
      pan.current = null;
      setIsPanning(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      active.current = true;
      const temporaryHand = event.button === 1 || spaceHeld;
      const direct = event.button === 0 && allowDragPan && canStartDirectPan(event.target) && (event.pointerType !== "touch" || allowTouchPan);
      if (!temporaryHand && !direct) return;
      event.preventDefault();
      event.stopPropagation();
      pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      setIsPanning(true);
      try { el.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    };
    const onPointerMove = (event: PointerEvent) => {
      const current = pan.current;
      if (!current || current.pointerId !== event.pointerId) return;
      event.preventDefault();
      el.scrollLeft -= event.clientX - current.x;
      el.scrollTop -= event.clientY - current.y;
      current.x = event.clientX;
      current.y = event.clientY;
    };
    const endPan = (event: PointerEvent) => {
      if (pan.current?.pointerId !== event.pointerId) return;
      pan.current = null;
      setIsPanning(false);
      try { el.releasePointerCapture(event.pointerId); } catch { /* best effort */ }
    };
    const onWheel = (event: WheelEvent) => {
      const isZoomGesture = event.ctrlKey || event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || Math.abs(event.deltaY) >= 40;
      if (!isZoomGesture) return;
      event.preventDefault();
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * el.clientHeight : event.deltaY;
      const base = queuedWheel.current?.scale ?? effectiveScale(zoomRef.current, fitRef.current);
      queuedWheel.current = { scale: clampScale(base * Math.pow(2, -delta / 420), minScale, maxScale), x: event.clientX, y: event.clientY };
      if (wheelFrame.current !== null) return;
      wheelFrame.current = requestAnimationFrame(() => {
        wheelFrame.current = null;
        const queued = queuedWheel.current;
        queuedWheel.current = null;
        if (queued) zoomAt(queued.scale, queued.x, queued.y);
      });
    };
    const onDoubleClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest("[data-viewport-edit],button,input,textarea,select,a")) return;
      event.preventDefault();
      if (zoomRef.current === "fit") zoomAt(1, event.clientX, event.clientY);
      else fit();
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const mid = midpoint(event.touches[0], event.touches[1]);
      pinch.current = { distance: Math.max(1, distance(event.touches[0], event.touches[1])), scale: effectiveScale(zoomRef.current, fitRef.current), midpoint: mid };
      setIsPinching(true);
    };
    const onTouchMove = (event: TouchEvent) => {
      const current = pinch.current;
      if (!current || event.touches.length !== 2) return;
      event.preventDefault();
      const mid = midpoint(event.touches[0], event.touches[1]);
      el.scrollLeft -= mid.x - current.midpoint.x;
      el.scrollTop -= mid.y - current.midpoint.y;
      current.midpoint = mid;
      zoomAt(current.scale * (distance(event.touches[0], event.touches[1]) / current.distance), mid.x, mid.y);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      pinch.current = null;
      setIsPinching(false);
    };

    el.addEventListener("pointerenter", activate);
    el.addEventListener("pointerleave", deactivate);
    el.addEventListener("focusin", activate);
    el.addEventListener("pointerdown", onPointerDown, true);
    el.addEventListener("pointermove", onPointerMove, true);
    el.addEventListener("pointerup", endPan, true);
    el.addEventListener("pointercancel", endPan, true);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDoubleClick);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current);
      el.removeEventListener("pointerenter", activate);
      el.removeEventListener("pointerleave", deactivate);
      el.removeEventListener("focusin", activate);
      el.removeEventListener("pointerdown", onPointerDown, true);
      el.removeEventListener("pointermove", onPointerMove, true);
      el.removeEventListener("pointerup", endPan, true);
      el.removeEventListener("pointercancel", endPan, true);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDoubleClick);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [actual, allowDragPan, allowTouchPan, fit, maxScale, minScale, onEscape, scrollRef, spaceHeld, zoomAt, zoomIn, zoomOut]);

  return { zoomIn, zoomOut, fit, actual, zoomAt, spaceHeld, isPanning, isPinching };
}
