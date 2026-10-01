"use client";

import { useCallback, type RefObject } from "react";

/**
 * Pass the result as a `<canvas>`'s `ref`: it keeps `ref` pointing at the element and frees
 * the canvas's pixel buffer when the element unmounts. iOS Safari counts every canvas against
 * one fixed total until garbage collection runs, so a large preview left for the GC can make
 * the next tool's canvas fail (Spike B: reset canvases).
 */
export function useReleasingCanvas(ref: RefObject<HTMLCanvasElement | null>) {
  return useCallback(
    (el: HTMLCanvasElement | null) => {
      ref.current = el;
      if (!el) return;
      return () => {
        el.width = 0;
        el.height = 0;
        if (ref.current === el) ref.current = null;
      };
    },
    [ref],
  );
}
