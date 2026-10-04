export type ViewportZoom = "fit" | number;
export type ViewportShortcut = "fit" | "actual" | "zoom-in" | "zoom-out" | "cancel" | null;

export const MIN_VIEWPORT_SCALE = 0.1;
export const MAX_VIEWPORT_SCALE = 8;

export function clampScale(scale: number, min = MIN_VIEWPORT_SCALE, max = MAX_VIEWPORT_SCALE) {
  return Math.min(max, Math.max(min, Number.isFinite(scale) ? scale : 1));
}

export function effectiveScale(zoom: ViewportZoom, fitScale: number) {
  return zoom === "fit" ? Math.max(0.001, fitScale) : clampScale(zoom);
}

export function zoomStep(zoom: ViewportZoom, fitScale: number, direction: 1 | -1): ViewportZoom {
  const current = effectiveScale(zoom, fitScale);
  const next = clampScale(current * (direction > 0 ? 1.25 : 0.8));
  if (direction < 0 && next <= fitScale * 1.04) return "fit";
  return Math.round(next * 1000) / 1000;
}

export function zoomLabel(zoom: ViewportZoom, fitScale: number) {
  return zoom === "fit" ? "Fit" : `${Math.round(effectiveScale(zoom, fitScale) * 100)}%`;
}

/** Scroll offset that keeps the same world pixel under a viewport coordinate after scaling. */
export function pointerCentredScroll(scroll: number, pointer: number, oldScale: number, newScale: number) {
  if (oldScale <= 0 || newScale <= 0) return Math.max(0, scroll);
  return Math.max(0, (scroll + pointer) * (newScale / oldScale) - pointer);
}

export function clampPan(value: number, scrollSize: number, clientSize: number) {
  return Math.min(Math.max(0, scrollSize - clientSize), Math.max(0, value));
}

export function isTypingTarget(target: EventTarget | null) {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && (target as HTMLInputElement).type !== "range";
}

export function isNativeSpaceTarget(target: EventTarget | null) {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.closest("button,a,input,select,textarea,summary,[role=button],[role=slider],[role=checkbox],[role=menuitem],[contenteditable=true]") !== null;
}

export function shouldPanWithSpace(target: EventTarget | null) {
  return !isTypingTarget(target) && !isNativeSpaceTarget(target);
}

export function viewportShortcut(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "target">): ViewportShortcut {
  if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "0") return "fit";
  if (event.key === "1") return "actual";
  if (event.key === "+" || event.key === "=") return "zoom-in";
  if (event.key === "-" || event.key === "_") return "zoom-out";
  if (event.key === "Escape") return "cancel";
  return null;
}

export function ownsMobileGesture(touchCount: number, activeEdit: boolean, allowOneFingerPan: boolean) {
  if (touchCount >= 2) return "viewport" as const;
  if (activeEdit) return "editor" as const;
  return allowOneFingerPan ? "viewport" as const : "page" as const;
}
