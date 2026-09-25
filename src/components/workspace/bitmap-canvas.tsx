"use client";

import { useEffect, useRef } from "react";
import type { FileId } from "@/core/runtime/types";
import { cn } from "@/lib/cn";
import { useWorkspace, useWorkspaceContext } from "./workspace-provider";

/**
 * Draws a file's downscaled preview bitmap (from the AssetRegistry) into a canvas sized for
 * the display. Never touches full-resolution pixels. Re-renders when the preview changes.
 */
export function BitmapCanvas({ id, width, className, label }: { id: FileId; width: number; className?: string; label: string }) {
  const { runtime } = useWorkspaceContext();
  const version = useWorkspace((s) => s.files[id]?.previewVersion ?? 0);
  const file = useWorkspace((s) => s.files[id]);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const bm = runtime.registry.preview(id);
    if (!c || !file) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Never allocate more than the preview holds (≤ 4 MP) — zooming past it adds no detail.
    const w = Math.max(1, Math.min(Math.round(width * dpr), bm?.width ?? Infinity));
    const h = Math.max(1, Math.round((file.height / file.width) * w));
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (bm) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bm, 0, 0, w, h);
    }
  }, [runtime, id, width, version, file]);

  if (!file) return null;
  return <canvas ref={ref} role="img" aria-label={label} className={cn("block h-auto w-full", !version && "animate-pulse bg-surface-2", className)} style={{ aspectRatio: `${file.width} / ${file.height}` }} />;
}
