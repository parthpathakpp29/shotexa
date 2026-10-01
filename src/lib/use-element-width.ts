"use client";

import { useCallback, useState } from "react";

/**
 * Content-box width of an element, kept current with a ResizeObserver (callback ref).
 *
 * It also measures as soon as the element attaches, and again on the next frame: a frame that
 * is mid-layout when the ref attaches would otherwise keep that first, wrong width until
 * something else resized it — and stages that wait for a measured width would stay hidden.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(measure) : null;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
  return [ref, width];
}
