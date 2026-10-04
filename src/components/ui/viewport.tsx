"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { IconButton, Mono, Toolbar } from "@/components/ui/primitives";
import { zoomLabel, type ViewportZoom } from "@/core/viewport/viewport";
import { cn } from "@/lib/cn";

export function ViewportToolbar({
  zoom,
  fitScale,
  onFit,
  onActual,
  onZoomIn,
  onZoomOut,
  label = "View",
}: {
  zoom: ViewportZoom;
  fitScale: number;
  onFit(): void;
  onActual(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  label?: string;
}) {
  return (
    <Toolbar aria-label={label}>
      <IconButton label="Zoom out" onClick={onZoomOut} disabled={zoom === "fit"}><Minus /></IconButton>
      <button type="button" onClick={onActual} aria-label="Actual size" title="Show at 100%" className={cn("inline-flex min-h-9 min-w-14 items-center justify-center rounded-sm px-1 hover:bg-surface-2 max-md:min-h-11", zoom === 1 && "bg-surface-2")}>
        <Mono className="text-center text-[12px]" data-testid="viewport-zoom">{zoomLabel(zoom, fitScale)}</Mono>
      </button>
      <IconButton label="Zoom in" onClick={onZoomIn} disabled={zoom !== "fit" && zoom >= 8}><Plus /></IconButton>
      <IconButton label="Fit" active={zoom === "fit"} onClick={onFit}><Maximize2 /></IconButton>
    </Toolbar>
  );
}
